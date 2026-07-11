// ---------------------------------------------------------------------------
// app.js — assembles the Express app from the route modules.
//
// Current modules:
//   routes/licenses.js  GET  /api/license/:uid
//   routes/payments.js  POST /api/subscription | /api/create-order |
//                            /api/verify | /api/verify-payment
//   routes/webhooks.js  POST /api/webhook
//   routes/checkout.js  GET  /checkout
//
// Future modules mount the same way — add a router file and app.use() it here:
//   routes/auth.js       user accounts / sessions for the website dashboard
//   routes/analytics.js  product analytics + usage tracking events
//   routes/accounts.js   subscription management (cancel, invoices, seats)
// ---------------------------------------------------------------------------

const express = require("express");
const cors = require("cors");

const { securityHeaders, rateLimit } = require("./middleware");
const licenses = require("./routes/licenses");
const payments = require("./routes/payments");
const webhooks = require("./routes/webhooks");
const checkout = require("./routes/checkout");

const app = express();

// Running behind Render's proxy: trust the first hop so req.ip reflects the
// real client (X-Forwarded-For) for rate limiting. Kept at 1 (not `true`) so a
// client can't spoof its IP by prepending its own XFF header.
app.set("trust proxy", 1);

app.disable("x-powered-by");
app.use(securityHeaders);

// The plugin iframe has a null origin — allow all origins on the JSON API.
app.use(cors());
// Keep the raw body: Razorpay webhook signatures are HMACs of the exact bytes.
// Cap the body size: these endpoints only ever take small JSON payloads, so a
// tight limit blunts memory-exhaustion attempts.
app.use(
  express.json({
    limit: "16kb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Global safety net, then a stricter cap on the endpoints that create Razorpay
// orders/subscriptions or verify payments (the abuse- and cost-sensitive ones).
app.use(rateLimit({ windowMs: 60_000, max: 120, name: "global" }));
const payLimiter = rateLimit({ windowMs: 60_000, max: 15, name: "pay" });

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.use(["/api/subscription", "/api/create-order", "/api/verify", "/api/verify-payment"], payLimiter);

app.use(licenses);
app.use(payments);
app.use(webhooks);
app.use(checkout);

module.exports = app;
