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

const licenses = require("./routes/licenses");
const payments = require("./routes/payments");
const webhooks = require("./routes/webhooks");
const checkout = require("./routes/checkout");

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

app.use(licenses);
app.use(payments);
app.use(webhooks);
app.use(checkout);

module.exports = app;
