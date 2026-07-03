// ---------------------------------------------------------------------------
// server.js — Razorpay billing server for the Figma to Tableau plugin.
//
// The plugin gives every Figma user FREE_EXPORT_LIMIT (15) free .twbx exports,
// then gates the export button until they subscribe to Premium ($10/month,
// unlimited). This server owns everything Razorpay:
//
//   GET  /checkout?uid=&name=   Hosted checkout page (opened from the plugin
//                               via window.open). Creates the subscription and
//                               runs Razorpay Checkout.
//   POST /api/subscription      { uid } -> { subscriptionId, keyId } — creates
//                               a Razorpay subscription on RAZORPAY_PLAN_ID,
//                               tagged with the Figma user id in notes.
//   POST /api/verify            Checkout success callback — verifies the
//                               payment signature and activates the license.
//   POST /api/webhook           Razorpay webhooks (renewals, cancellations) —
//                               keeps licenses honest after the first charge.
//   GET  /api/license/:uid      { premium, validUntil, ... } — what the plugin
//                               polls to unlock unlimited exports.
//
// Licenses are keyed by figma.currentUser.id and stored in licenses.json next
// to this file. That is deliberate (zero-dependency deploy); swap saveStore/
// loadStore for a real database when you outgrow a single instance.
// ---------------------------------------------------------------------------

require("dotenv").config();
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const Razorpay = require("razorpay");

const {
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  RAZORPAY_PLAN_ID,
  RAZORPAY_WEBHOOK_SECRET,
  PORT = 3000,
  PRICE_LABEL = "$10/month",
  // One-time order mode (Standard Checkout): price of one Premium period in
  // the currency's smallest unit (paise for INR). Used when no plan id is set.
  ORDER_AMOUNT_PAISE = "85000",
  ORDER_CURRENCY = "INR",
  PREMIUM_DAYS = "31",
} = process.env;

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.error(
    "Missing env vars. Copy .env.example to .env and fill in RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
  );
  process.exit(1);
}

// Billing mode: with a plan id, checkout runs Razorpay SUBSCRIPTIONS (monthly
// auto-renew). Without one, it runs STANDARD CHECKOUT one-time ORDERS — each
// successful payment grants PREMIUM_DAYS of Premium.
const SUBSCRIPTION_MODE = !!RAZORPAY_PLAN_ID;
const orderAmount = Math.round(Number(ORDER_AMOUNT_PAISE));
const premiumDays = Math.max(1, Number(PREMIUM_DAYS) || 31);
if (!SUBSCRIPTION_MODE && (!Number.isFinite(orderAmount) || orderAmount < 100)) {
  console.error("ORDER_AMOUNT_PAISE must be a number >= 100 (paise).");
  process.exit(1);
}

const razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });

// --- License store (uid -> record), persisted as a JSON file -----------------

const STORE_FILE = path.join(__dirname, "licenses.json");

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveStore(store) {
  const tmp = STORE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, STORE_FILE);
}

const store = loadStore();

/** Upsert a license record for a Figma user id. */
function setLicense(uid, patch) {
  store[uid] = { ...(store[uid] || {}), ...patch, updatedAt: Date.now() };
  saveStore(store);
  return store[uid];
}

/** ms epoch the subscription is paid through, from a Razorpay sub entity. */
function paidThrough(sub) {
  // current_end is the unix-seconds end of the currently-paid billing cycle.
  if (sub && typeof sub.current_end === "number" && sub.current_end > 0) {
    return sub.current_end * 1000;
  }
  // First charge can land before the cycle bounds are set — cover one month.
  return Date.now() + 35 * 24 * 3600 * 1000;
}

// --- App ----------------------------------------------------------------------

const app = express();
// The plugin iframe has a null origin — allow all origins on the JSON API.
app.use(cors());
// Keep the raw body: Razorpay webhook signatures are HMACs of the exact bytes.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.get("/healthz", (_req, res) => res.json({ ok: true }));

/** The plugin polls this to decide free vs Premium. */
app.get("/api/license/:uid", (req, res) => {
  const rec = store[req.params.uid];
  const premium = !!(rec && rec.validUntil && rec.validUntil > Date.now());
  res.json({
    premium,
    validUntil: rec ? rec.validUntil : undefined,
    subscriptionId: rec ? rec.subscriptionId : undefined,
    status: rec ? rec.status : "none",
  });
});

/** Create a Razorpay subscription for a Figma user (called by the checkout page). */
app.post("/api/subscription", async (req, res) => {
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
    setLicense(uid, { subscriptionId: sub.id, status: "created" });
    res.json({ subscriptionId: sub.id, keyId: RAZORPAY_KEY_ID });
  } catch (e) {
    console.error("subscription create failed:", e && e.error ? e.error : e);
    res.status(502).json({ error: "Couldn't create the subscription. Try again." });
  }
});

// --- Standard Checkout (one-time orders) ---------------------------------------

/**
 * Create a Razorpay ORDER (Standard Checkout). Body: { amount (paise),
 * currency, receipt, uid } — amount/currency default to the configured
 * Premium price. Returns { order_id, amount, currency }.
 */
app.post("/api/create-order", async (req, res) => {
  const body = req.body || {};
  const uid = String(body.uid || "").trim();
  const amount = body.amount === undefined ? orderAmount : Math.round(Number(body.amount));
  const currency = String(body.currency || ORDER_CURRENCY).toUpperCase();
  const receipt = String(body.receipt || `ftt_${Date.now()}`).slice(0, 40);
  if (!Number.isFinite(amount) || amount < 100) {
    return res.status(400).json({ error: "amount must be an integer >= 100 (paise)." });
  }
  try {
    const order = await razorpay.orders.create({
      amount,
      currency,
      receipt,
      notes: uid ? { figma_uid: uid } : undefined,
    });
    if (uid) setLicense(uid, { lastOrderId: order.id, status: store[uid] && store[uid].status ? store[uid].status : "created" });
    res.json({ order_id: order.id, amount: order.amount, currency: order.currency });
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
app.post("/api/verify-payment", async (req, res) => {
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

  // Signature alone proves the payment, not the price — /api/create-order
  // accepts a caller-supplied amount, so confirm the order actually covers the
  // configured Premium price before granting the license.
  if (uid) {
    let order = null;
    try {
      order = await razorpay.orders.fetch(razorpay_order_id);
    } catch (e) {
      console.error("order fetch after verify failed:", e && e.error ? e.error : e);
      return res.status(502).json({ error: "Payment verified but the order couldn't be confirmed — refresh your status in a minute." });
    }
    if (!order || Number(order.amount) < orderAmount) {
      return res.status(400).json({ error: "Order amount doesn't cover the Premium price." });
    }
    const prev = store[uid];
    const base = prev && prev.validUntil && prev.validUntil > Date.now() ? prev.validUntil : Date.now();
    const rec = setLicense(String(uid), {
      status: "paid",
      validUntil: base + premiumDays * 24 * 3600 * 1000,
      lastOrderId: razorpay_order_id,
      lastPaymentId: razorpay_payment_id,
    });
    return res.json({ success: true, premium: true, validUntil: rec.validUntil });
  }
  res.json({ success: true });
});

/**
 * Checkout success callback. Razorpay's subscription signature is
 * HMAC-SHA256(payment_id + "|" + subscription_id, key_secret).
 */
app.post("/api/verify", async (req, res) => {
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
  const rec = setLicense(String(uid), {
    subscriptionId: razorpay_subscription_id,
    status: sub ? sub.status : "active",
    validUntil: paidThrough(sub),
    lastPaymentId: razorpay_payment_id,
  });
  res.json({ premium: true, validUntil: rec.validUntil });
});

/**
 * Razorpay webhooks — configure the URL <server>/api/webhook in the Razorpay
 * dashboard with events: subscription.activated, subscription.charged,
 * subscription.cancelled, subscription.halted, subscription.completed.
 */
app.post("/api/webhook", (req, res) => {
  if (!RAZORPAY_WEBHOOK_SECRET) return res.status(503).json({ error: "Webhook secret not configured." });
  const signature = req.get("x-razorpay-signature") || "";
  const expected = crypto.createHmac("sha256", RAZORPAY_WEBHOOK_SECRET).update(req.rawBody).digest("hex");
  const ok =
    expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  if (!ok) return res.status(400).json({ error: "Bad webhook signature." });

  const event = req.body.event;
  const sub = req.body.payload && req.body.payload.subscription && req.body.payload.subscription.entity;
  const uid = sub && sub.notes && sub.notes.figma_uid;
  if (!sub || !uid) return res.json({ ok: true }); // not one of ours — ack anyway

  switch (event) {
    case "subscription.activated":
    case "subscription.charged":
    case "subscription.resumed":
      // New/renewed cycle: extend the license to the paid-through date.
      setLicense(uid, { subscriptionId: sub.id, status: sub.status, validUntil: paidThrough(sub) });
      break;
    case "subscription.cancelled":
    case "subscription.halted":
    case "subscription.completed":
    case "subscription.expired":
      // Keep what was paid for: the license simply stops extending. Clamp the
      // expiry to the current cycle end so a halted card can't stay premium
      // past what was actually charged.
      setLicense(uid, {
        subscriptionId: sub.id,
        status: sub.status,
        validUntil: Math.min(store[uid] && store[uid].validUntil ? store[uid].validUntil : paidThrough(sub), paidThrough(sub)),
      });
      break;
    default:
      break;
  }
  res.json({ ok: true });
});

// --- Hosted checkout page -------------------------------------------------------

app.get("/checkout", (req, res) => {
  const uid = String(req.query.uid || "").trim();
  const name = String(req.query.name || "").trim();
  if (!uid) return res.status(400).send("Missing uid — open this page from the plugin's Upgrade button.");
  res.type("html").send(checkoutPage(uid, name));
});

/** Minimal hosted page that runs Razorpay Checkout (subscription or one-time order). */
function checkoutPage(uid, name) {
  // Values are embedded as JSON to keep them safely escaped inside the script.
  const priceLabel = SUBSCRIPTION_MODE
    ? PRICE_LABEL
    : `${(orderAmount / 100).toLocaleString()} ${ORDER_CURRENCY} — ${premiumDays} days`;
  const boot = JSON.stringify({
    uid,
    name,
    priceLabel,
    mode: SUBSCRIPTION_MODE ? "subscription" : "order",
    keyId: RAZORPAY_KEY_ID,
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Figma to Tableau — Premium</title>
<style>
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #0f1117; color: #e5e7eb;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .card { width: 340px; background: #171a23; border: 1px solid #2a2f3d; border-radius: 12px; padding: 28px; text-align: center; }
  h1 { font-size: 18px; margin: 0 0 6px; }
  p  { font-size: 13px; line-height: 1.6; color: #9ca3af; margin: 0 0 18px; }
  .price { font-size: 26px; font-weight: 700; color: #fff; margin: 10px 0 16px; }
  button { width: 100%; padding: 11px; font-size: 14px; font-weight: 600; color: #fff; background: #2563eb;
           border: 0; border-radius: 8px; cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: default; }
  .status { margin-top: 14px; font-size: 12px; line-height: 1.5; color: #9ca3af; min-height: 18px; }
  .ok  { color: #34d399; }
  .err { color: #f87171; }
</style>
</head>
<body>
<div class="card">
  <h1>Figma to Tableau — Premium</h1>
  <p id="blurb"></p>
  <div class="price" id="price"></div>
  <button id="pay"></button>
  <div class="status" id="status"></div>
</div>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
  var BOOT = ${boot};
  var isSub = BOOT.mode === "subscription";
  document.getElementById("price").textContent = BOOT.priceLabel;
  document.getElementById("blurb").textContent = isSub
    ? "Unlimited .twbx exports, billed monthly. Cancel anytime."
    : "Unlimited .twbx exports. One payment covers the period below.";
  var btn = document.getElementById("pay");
  btn.textContent = isSub ? "Subscribe with Razorpay" : "Pay with Razorpay";
  var statusEl = document.getElementById("status");
  function setStatus(text, cls) { statusEl.textContent = text; statusEl.className = "status " + (cls || ""); }

  // Shared Razorpay modal plumbing: on success POST the ids+signature to the
  // matching verify endpoint; handle dismiss + payment.failed.
  function openModal(opts, verifyUrl, verifyBody) {
    var rzp = new Razorpay(Object.assign({
      key: BOOT.keyId,
      name: "Figma to Tableau",
      description: "Premium — unlimited exports (" + BOOT.priceLabel + ")",
      prefill: { name: BOOT.name || undefined },
      notes: { figma_uid: BOOT.uid },
      handler: function (resp) {
        setStatus("Verifying payment…");
        fetch(verifyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.assign(verifyBody(resp), { uid: BOOT.uid })),
        })
          .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
          .then(function () {
            btn.style.display = "none";
            setStatus("✓ Premium is active. Go back to Figma and click “Refresh status” in the plugin's Account tab.", "ok");
          })
          .catch(function () {
            setStatus("Payment went through but verification failed — go back to Figma and refresh your status in a minute; contact support if it doesn't activate.", "err");
          });
      },
      modal: { ondismiss: function () { btn.disabled = false; setStatus("Checkout cancelled."); } },
    }, opts));
    rzp.on("payment.failed", function (resp) {
      btn.disabled = false;
      setStatus("Payment failed: " + (resp.error && resp.error.description ? resp.error.description : "try again."), "err");
    });
    rzp.open();
  }

  btn.addEventListener("click", function () {
    btn.disabled = true;
    if (isSub) {
      setStatus("Creating your subscription…");
      fetch("/api/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: BOOT.uid }),
      })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (data) {
          openModal({ subscription_id: data.subscriptionId }, "/api/verify", function (resp) {
            return {
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_subscription_id: resp.razorpay_subscription_id,
              razorpay_signature: resp.razorpay_signature,
            };
          });
        })
        .catch(function () {
          btn.disabled = false;
          setStatus("Couldn't start checkout — try again in a moment.", "err");
        });
    } else {
      setStatus("Creating your order…");
      fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: BOOT.uid }),
      })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (data) {
          openModal(
            { order_id: data.order_id, amount: data.amount, currency: data.currency },
            "/api/verify-payment",
            function (resp) {
              return {
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_order_id: resp.razorpay_order_id,
                razorpay_signature: resp.razorpay_signature,
              };
            }
          );
        })
        .catch(function () {
          btn.disabled = false;
          setStatus("Couldn't start checkout — try again in a moment.", "err");
        });
    }
  });
</script>
</body>
</html>`;
}

app.listen(Number(PORT), () => {
  console.log(`Figma-to-Tableau billing server listening on :${PORT}`);
});
