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

/** Read a license record (or undefined). */
function getLicense(uid) {
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

module.exports = { setLicense, getLicense, paidThrough };
