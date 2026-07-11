// ---------------------------------------------------------------------------
// licenseStore.js — the license store (uid -> record), persisted as a JSON
// file at backend/licenses.json.
//
// Licenses are keyed by figma.currentUser.id. The JSON-file store is
// deliberate (zero-dependency deploy); swap loadStore/saveStore for a real
// database when you outgrow a single instance.
// ---------------------------------------------------------------------------

const fs = require("fs");
const path = require("path");

// Kept at the backend root (next to server.js) so existing deployments and
// the pre-refactor licenses.json keep working unchanged.
const STORE_FILE = path.join(__dirname, "..", "..", "licenses.json");
// Ledger of Razorpay order ids that have already granted a license. Keeps
// verify-payment idempotent: a valid (order_id, payment_id, signature) tuple
// can only be redeemed once, so a payment can't be replayed to stack duration.
const REDEEMED_FILE = path.join(__dirname, "..", "..", "redeemed-orders.json");

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function saveJson(file, data) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

const store = loadJson(STORE_FILE);
const redeemed = loadJson(REDEEMED_FILE);

function saveStore(s) {
  saveJson(STORE_FILE, s);
}

/** Has this Razorpay order id already granted a license? */
function isOrderRedeemed(orderId) {
  return !!(orderId && redeemed[orderId]);
}

/** Record that an order id has been redeemed (by uid), so it can't be reused. */
function markOrderRedeemed(orderId, uid) {
  if (!orderId) return;
  redeemed[orderId] = { uid: String(uid || ""), at: Date.now() };
  saveJson(REDEEMED_FILE, redeemed);
}

// Reject keys that would touch Object.prototype (prototype pollution) or return
// inherited junk. uids come from Figma but the license GET is unauthenticated,
// so a caller can pass any string as the key.
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
function safeKey(uid) {
  const k = String(uid == null ? "" : uid);
  return UNSAFE_KEYS.has(k) ? null : k;
}

/** Upsert a license record for a Figma user id. */
function setLicense(uid, patch) {
  const key = safeKey(uid);
  if (!key) return {};
  store[key] = { ...(store[key] || {}), ...patch, updatedAt: Date.now() };
  saveStore(store);
  return store[key];
}

/** Read a license record (or undefined). */
function getLicense(uid) {
  const key = safeKey(uid);
  if (!key) return undefined;
  return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : undefined;
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

module.exports = { setLicense, getLicense, paidThrough, isOrderRedeemed, markOrderRedeemed };
