// ---------------------------------------------------------------------------
// webhooks.js — Razorpay webhooks (renewals, cancellations) keep licenses
// honest after the first charge. Configure <server>/api/webhook in the
// Razorpay dashboard with events: subscription.activated,
// subscription.charged, subscription.cancelled, subscription.halted,
// subscription.completed.
// ---------------------------------------------------------------------------

const crypto = require("crypto");
const express = require("express");
const { setLicense, getLicense, paidThrough } = require("../services/licenseStore");
const { RAZORPAY_WEBHOOK_SECRET } = require("../config");

const router = express.Router();

router.post("/api/webhook", (req, res) => {
  if (!RAZORPAY_WEBHOOK_SECRET) return res.status(503).json({ error: "Webhook secret not configured." });
  const signature = req.get("x-razorpay-signature") || "";
  // Signatures are HMACs of the exact request bytes (req.rawBody, kept by app.js).
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
    case "subscription.expired": {
      // Keep what was paid for: the license simply stops extending. Clamp the
      // expiry to the current cycle end so a halted card can't stay premium
      // past what was actually charged.
      const rec = getLicense(uid);
      setLicense(uid, {
        subscriptionId: sub.id,
        status: sub.status,
        validUntil: Math.min(rec && rec.validUntil ? rec.validUntil : paidThrough(sub), paidThrough(sub)),
      });
      break;
    }
    default:
      break;
  }
  res.json({ ok: true });
});

module.exports = router;
