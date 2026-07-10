// ---------------------------------------------------------------------------
// checkout.js — GET /checkout?uid=&name= : the hosted checkout page. Opened
// in the browser from the plugin's Upgrade button (via the website's /upgrade
// page). Creates the subscription/order and runs Razorpay Checkout.
// ---------------------------------------------------------------------------

const express = require("express");
const {
  RAZORPAY_KEY_ID,
  PRICE_LABEL,
  DEFAULT_CURRENCY,
  SUBSCRIPTION_MODE,
  PRICING,
  premiumDays,
} = require("../config");

const router = express.Router();

/** Format a smallest-unit amount as a display string, e.g. "$10" / "₹850". */
function money(amount, currency) {
  const sym = currency === "INR" ? "₹" : "$";
  return sym + (amount / 100).toLocaleString("en-US");
}

router.get("/checkout", (req, res) => {
  const uid = String(req.query.uid || "").trim();
  const name = String(req.query.name || "").trim();
  if (!uid) return res.status(400).send("Missing uid — open this page from the plugin's Upgrade button.");
  res.type("html").send(checkoutPage(uid, name));
});

/** Minimal hosted page that runs Razorpay Checkout (subscription or one-time order). */
function checkoutPage(uid, name) {
  // Per-currency monthly labels; the page picks one from the visitor's region.
  const orderLabels = {
    INR: `${money(PRICING.INR.monthly.amount, "INR")} — ${premiumDays} days`,
    USD: `${money(PRICING.USD.monthly.amount, "USD")} — ${premiumDays} days`,
  };
  // Values are embedded as JSON to keep them safely escaped inside the script.
  const boot = JSON.stringify({
    uid,
    name,
    subLabel: PRICE_LABEL,
    orderLabels,
    defaultCurrency: DEFAULT_CURRENCY,
    mode: SUBSCRIPTION_MODE ? "subscription" : "order",
    keyId: RAZORPAY_KEY_ID,
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pixelmentis — Premium</title>
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
  <h1>Pixelmentis — Premium</h1>
  <p id="blurb"></p>
  <div class="price" id="price"></div>
  <button id="pay"></button>
  <div class="status" id="status"></div>
</div>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
  var BOOT = ${boot};
  var isSub = BOOT.mode === "subscription";
  // Bill Indian visitors in INR (unlocks UPI/netbanking); everyone else in USD.
  function detectCurrency() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      if (/Asia\\/(Kolkata|Calcutta)/i.test(tz)) return "INR";
    } catch (e) {}
    return BOOT.defaultCurrency || "USD";
  }
  var CURRENCY = detectCurrency();
  var priceLabel = isSub ? BOOT.subLabel : (BOOT.orderLabels[CURRENCY] || BOOT.orderLabels.USD);
  document.getElementById("price").textContent = priceLabel;
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
      name: "Pixelmentis",
      description: "Premium — unlimited exports (" + priceLabel + ")",
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
        body: JSON.stringify({ uid: BOOT.uid, currency: CURRENCY }),
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

module.exports = router;
