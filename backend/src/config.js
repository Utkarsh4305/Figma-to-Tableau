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
  // Default currency when the client doesn't specify one. Indian visitors are
  // billed in INR (unlocks UPI/netbanking); everyone else in USD (card-only,
  // the only rail that carries a foreign currency).
  ORDER_CURRENCY = "USD",
  // Per-currency, per-plan prices in the currency's smallest unit (cents for
  // USD, paise for INR). Used in one-time-order mode (no RAZORPAY_PLAN_ID).
  USD_MONTHLY_CENTS = "1000",
  USD_ANNUAL_CENTS = "10000",
  INR_MONTHLY_PAISE = "85000",
  INR_ANNUAL_PAISE = "850000",
  PREMIUM_DAYS = "31",
  ANNUAL_DAYS = "365",
} = process.env;

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.error(
    "Missing env vars. Copy .env.example to .env and fill in RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
  );
  process.exit(1);
}

const SUBSCRIPTION_MODE = !!RAZORPAY_PLAN_ID;
const premiumDays = Math.max(1, Number(PREMIUM_DAYS) || 31);
const annualDays = Math.max(1, Number(ANNUAL_DAYS) || 365);
const num = (v) => Math.round(Number(v));

// Currencies we can take a payment in. INR keeps the full method list (UPI,
// netbanking, wallets, cards); other currencies are card-only at Razorpay.
const SUPPORTED_CURRENCIES = ["INR", "USD"];
const DEFAULT_CURRENCY = SUPPORTED_CURRENCIES.includes(String(ORDER_CURRENCY).toUpperCase())
  ? String(ORDER_CURRENCY).toUpperCase()
  : "USD";

// Server-authoritative one-time-order pricing. The client sends a plan NAME and
// (optionally) a CURRENCY — never an amount or a day count — and the backend
// maps them to the price and the Premium duration, so a cheap order can never
// claim a long license or an undervalued currency.
const PRICING = {
  USD: {
    monthly: { amount: num(USD_MONTHLY_CENTS), days: premiumDays },
    annual: { amount: num(USD_ANNUAL_CENTS), days: annualDays },
  },
  INR: {
    monthly: { amount: num(INR_MONTHLY_PAISE), days: premiumDays },
    annual: { amount: num(INR_ANNUAL_PAISE), days: annualDays },
  },
};

if (!SUBSCRIPTION_MODE) {
  for (const cur of SUPPORTED_CURRENCIES) {
    for (const plan of ["monthly", "annual"]) {
      const a = PRICING[cur][plan].amount;
      if (!Number.isFinite(a) || a < 100) {
        console.error(`${cur} ${plan} price must be a number >= 100 (smallest currency unit).`);
        process.exit(1);
      }
    }
  }
}

/** Normalise a requested currency to a supported one (defaults to DEFAULT_CURRENCY). */
function currencyFor(currency) {
  const c = String(currency || "").toUpperCase();
  return SUPPORTED_CURRENCIES.includes(c) ? c : DEFAULT_CURRENCY;
}

/**
 * Resolve a plan name + currency to { amount, days, currency }. Unknown plan
 * names fall back to monthly; unknown currencies to DEFAULT_CURRENCY.
 */
function planFor(name, currency) {
  const cur = currencyFor(currency);
  const key = String(name || "").toLowerCase().trim() === "annual" ? "annual" : "monthly";
  return { ...PRICING[cur][key], currency: cur };
}

module.exports = {
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  RAZORPAY_PLAN_ID,
  RAZORPAY_WEBHOOK_SECRET,
  PORT,
  PRICE_LABEL,
  ORDER_CURRENCY: DEFAULT_CURRENCY,
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  SUBSCRIPTION_MODE,
  premiumDays,
  annualDays,
  PRICING,
  currencyFor,
  planFor,
};
