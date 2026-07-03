// ---------------------------------------------------------------------------
// config.js — env parsing + validation for the billing backend.
//
// Billing mode: with RAZORPAY_PLAN_ID set, checkout runs Razorpay
// SUBSCRIPTIONS (monthly auto-renew). Without one, it runs STANDARD CHECKOUT
// one-time ORDERS — each successful payment grants PREMIUM_DAYS of Premium.
// ---------------------------------------------------------------------------

require("dotenv").config();

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

const SUBSCRIPTION_MODE = !!RAZORPAY_PLAN_ID;
const orderAmount = Math.round(Number(ORDER_AMOUNT_PAISE));
const premiumDays = Math.max(1, Number(PREMIUM_DAYS) || 31);
if (!SUBSCRIPTION_MODE && (!Number.isFinite(orderAmount) || orderAmount < 100)) {
  console.error("ORDER_AMOUNT_PAISE must be a number >= 100 (paise).");
  process.exit(1);
}

module.exports = {
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  RAZORPAY_PLAN_ID,
  RAZORPAY_WEBHOOK_SECRET,
  PORT,
  PRICE_LABEL,
  ORDER_CURRENCY,
  SUBSCRIPTION_MODE,
  orderAmount,
  premiumDays,
};
