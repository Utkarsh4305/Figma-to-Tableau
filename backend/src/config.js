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
  // Annual one-time order: a single ~$100 payment granting ANNUAL_DAYS of
  // Premium. Amount is in the currency's smallest unit (paise for INR):
  // 850000 = ₹8,500 ≈ $100.
  ANNUAL_AMOUNT_PAISE = "850000",
  ANNUAL_DAYS = "365",
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
const annualAmount = Math.round(Number(ANNUAL_AMOUNT_PAISE));
const annualDays = Math.max(1, Number(ANNUAL_DAYS) || 365);
if (!SUBSCRIPTION_MODE && (!Number.isFinite(orderAmount) || orderAmount < 100)) {
  console.error("ORDER_AMOUNT_PAISE must be a number >= 100 (paise).");
  process.exit(1);
}

// Server-authoritative one-time-order plans. The client sends a plan NAME only
// (never an amount or a day count), and the backend maps it to the price and
// the Premium duration — so a cheap order can never claim a long license.
const PLANS = {
  monthly: { amount: orderAmount, days: premiumDays },
  annual: { amount: annualAmount, days: annualDays },
};
/** Resolve a plan name to its { amount, days }; unknown names fall back to monthly. */
function planFor(name) {
  return PLANS[String(name || "").toLowerCase().trim()] || PLANS.monthly;
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
  annualAmount,
  annualDays,
  PLANS,
  planFor,
};
