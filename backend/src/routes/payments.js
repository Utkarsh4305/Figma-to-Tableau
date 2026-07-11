// ---------------------------------------------------------------------------
// payments.js — everything that creates or verifies a Razorpay payment:
//
//   POST /api/subscription    { uid } -> { subscriptionId, keyId } — creates a
//                             Razorpay subscription on RAZORPAY_PLAN_ID,
//                             tagged with the Figma user id in notes.
//   POST /api/create-order    Standard Checkout one-time order.
//   POST /api/verify          Subscription checkout success callback.
//   POST /api/verify-payment  Order checkout success callback.
// ---------------------------------------------------------------------------

const crypto = require("crypto");
const express = require("express");
const razorpay = require("../services/razorpayClient");
const {
  setLicense,
  getLicense,
  paidThrough,
  isOrderRedeemed,
  markOrderRedeemed,
} = require("../services/licenseStore");
const {
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  RAZORPAY_PLAN_ID,
  ORDER_CURRENCY,
  SUBSCRIPTION_MODE,
  planFor,
} = require("../config");

const router = express.Router();

/** Create a Razorpay subscription for a Figma user (called by the checkout page). */
router.post("/api/subscription", async (req, res) => {
  if (!SUBSCRIPTION_MODE) return res.status(503).json({ error: "Subscription mode is not configured (no RAZORPAY_PLAN_ID) — use /api/create-order." });
  const uid = String(req.body.uid || "").trim();
  if (!uid) return res.status(400).json({ error: "uid is required" });
  try {
    const sub = await razorpay.subscriptions.create({
      plan_id: RAZORPAY_PLAN_ID,
      total_count: 120, // Razorpay needs a finite count — 120 monthly cycles ≈ 10 years
      quantity: 1,
      customer_notify: 0,
      notes: { figma_uid: uid }, // how webhooks map a subscription back to the user
    });
    // Deliberately DON'T persist a record here: this endpoint is unauthenticated
    // and takes an attacker-chosen uid, so writing on creation would let anyone
    // flood the (fully-rewritten-on-every-write) license store with junk records.
    // The uid lives in the Razorpay subscription's notes; the webhook + /api/verify
    // are what actually create the license, and both are signature-gated.
    res.json({ subscriptionId: sub.id, keyId: RAZORPAY_KEY_ID });
  } catch (e) {
    console.error("subscription create failed:", e && e.error ? e.error : e);
    res.status(502).json({ error: "Couldn't create the subscription. Try again." });
  }
});

/**
 * Create a Razorpay ORDER (Standard Checkout). Body: { plan ("monthly" |
 * "annual"), currency ("INR" | "USD"), uid, receipt }. The PLAN + CURRENCY pick
 * the price server-side (the client never sends an amount); the plan name is
 * stored in the order notes so verification can grant the right duration.
 * Returns { order_id, amount, currency, plan }.
 */
router.post("/api/create-order", async (req, res) => {
  const body = req.body || {};
  const uid = String(body.uid || "").trim();
  const planName = String(body.plan || "monthly").toLowerCase().trim() === "annual" ? "annual" : "monthly";
  // Plan + currency are authoritative — the amount and the settlement currency
  // both come from the server-side table (planFor validates/normalises both).
  const plan = planFor(planName, body.currency);
  const amount = plan.amount;
  const currency = plan.currency;
  const receipt = String(body.receipt || `ftt_${Date.now()}`).slice(0, 40);
  if (!Number.isFinite(amount) || amount < 100) {
    return res.status(400).json({ error: "amount must be an integer >= 100 (smallest currency unit)." });
  }
  const notes = { plan: planName };
  if (uid) notes.figma_uid = uid;
  try {
    const order = await razorpay.orders.create({ amount, currency, receipt, notes });
    // Deliberately DON'T persist anything here. create-order is unauthenticated
    // and the uid is attacker-supplied, so a write on order creation is an
    // unauthenticated, free (only rate-limited) way to grow/pollute the license
    // store, which is fully rewritten on every write. The uid is stamped into the
    // order's notes (authoritative); /api/verify-payment is the signature-gated
    // step that actually grants/extends the license.
    res.json({ order_id: order.id, amount: order.amount, currency: order.currency, plan: planName });
  } catch (e) {
    const status = e && e.statusCode === 401 ? 401 : 500;
    console.error("order create failed:", e && e.error ? e.error : e);
    res.status(status).json({ error: status === 401 ? "Razorpay authentication failed — check the API keys." : "Couldn't create the order. Try again." });
  }
});

/**
 * Verify a Standard Checkout payment. Razorpay's order signature is
 * HMAC-SHA256(order_id + "|" + payment_id, key_secret). On success, grants
 * PREMIUM_DAYS of Premium to the Figma user (extends an unexpired license).
 */
router.post("/api/verify-payment", async (req, res) => {
  const { uid, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body || {};
  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing verification fields." });
  }
  const expected = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");
  const ok =
    expected.length === String(razorpay_signature).length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(razorpay_signature)));
  if (!ok) return res.status(400).json({ error: "Signature verification failed." });

  // Signature alone proves the payment, not the price or the plan — the order
  // is the source of truth. Fetch it, read the plan we stored in its notes at
  // creation, and confirm the amount actually covers that plan before granting
  // the matching duration (monthly ≈ 31 days, annual ≈ 365).
  if (uid) {
    let order = null;
    try {
      order = await razorpay.orders.fetch(razorpay_order_id);
    } catch (e) {
      console.error("order fetch after verify failed:", e && e.error ? e.error : e);
      return res.status(502).json({ error: "Payment verified but the order couldn't be confirmed — refresh your status in a minute." });
    }
    // Bind the payment to the account that created the order. create-order
    // stamps notes.figma_uid; if it's set it MUST match the uid claiming the
    // license, so a valid (order_id, payment_id, signature) tuple can't be
    // replayed against a different account to mint free Premium.
    const orderUid = order && order.notes ? order.notes.figma_uid : undefined;
    if (orderUid && orderUid !== String(uid)) {
      return res.status(403).json({ error: "This payment belongs to a different account." });
    }
    // The order's own currency + stored plan name decide the expected price, so
    // an INR order is checked against the INR price and a USD order the USD one.
    const plan = planFor(order && order.notes ? order.notes.plan : "monthly", order && order.currency);
    if (!order || Number(order.amount) < plan.amount) {
      return res.status(400).json({ error: "Order amount doesn't cover the plan price." });
    }
    // A paid order grants Premium exactly once — refuse to re-verify an order
    // that already extended a license (guards replay of the same order to stack
    // duration, and reuse of a uid-less order across accounts).
    if (isOrderRedeemed(razorpay_order_id)) {
      return res.status(409).json({ error: "This order has already been redeemed." });
    }
    const prev = getLicense(uid);
    const base = prev && prev.validUntil && prev.validUntil > Date.now() ? prev.validUntil : Date.now();
    const rec = setLicense(String(uid), {
      status: "paid",
      plan: order.notes ? order.notes.plan : "monthly",
      validUntil: base + plan.days * 24 * 3600 * 1000,
      lastOrderId: razorpay_order_id,
      lastPaymentId: razorpay_payment_id,
    });
    markOrderRedeemed(razorpay_order_id, uid);
    return res.json({ success: true, premium: true, validUntil: rec.validUntil });
  }
  res.json({ success: true });
});

/**
 * Checkout success callback. Razorpay's subscription signature is
 * HMAC-SHA256(payment_id + "|" + subscription_id, key_secret).
 */
router.post("/api/verify", async (req, res) => {
  const { uid, razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body || {};
  if (!uid || !razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing verification fields." });
  }
  const expected = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
    .digest("hex");
  const ok =
    expected.length === String(razorpay_signature).length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(razorpay_signature)));
  if (!ok) return res.status(400).json({ error: "Signature verification failed." });

  // Pull the subscription to read the paid-through date (best-effort).
  let sub = null;
  try {
    sub = await razorpay.subscriptions.fetch(razorpay_subscription_id);
  } catch (e) {
    console.warn("subscription fetch after verify failed (using fallback expiry):", e);
  }
  // Bind the subscription to the account that created it. /api/subscription
  // stamps notes.figma_uid; if it's set it MUST match the uid claiming the
  // license, so a valid (payment_id, subscription_id, signature) tuple can't be
  // replayed against a different account to mint free Premium (mirrors the
  // order-verify uid check).
  const subUid = sub && sub.notes ? sub.notes.figma_uid : undefined;
  if (subUid && subUid !== String(uid)) {
    return res.status(403).json({ error: "This payment belongs to a different account." });
  }
  const rec = setLicense(String(uid), {
    subscriptionId: razorpay_subscription_id,
    status: sub ? sub.status : "active",
    validUntil: paidThrough(sub),
    lastPaymentId: razorpay_payment_id,
  });
  res.json({ premium: true, validUntil: rec.validUntil });
});

module.exports = router;
