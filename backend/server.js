// ---------------------------------------------------------------------------
// server.js — entry point for the Figma to Tableau backend.
//
// The plugin gives every Figma user FREE_EXPORT_LIMIT (15) free .twbx exports,
// then gates the export button until they buy Premium ($10/month, unlimited).
// This backend owns everything server-side: Razorpay billing, license lookups,
// and (in future modules) auth, analytics, and subscription management.
//
// Structure (see src/app.js for the route map):
//   src/config.js                env parsing + validation
//   src/services/razorpayClient  the Razorpay SDK client
//   src/services/licenseStore    uid -> license records (licenses.json)
//   src/routes/*                 one router per feature area
// ---------------------------------------------------------------------------

const { PORT } = require("./src/config");
const app = require("./src/app");

app.listen(Number(PORT), () => {
  console.log(`Figma-to-Tableau backend listening on :${PORT}`);
});
