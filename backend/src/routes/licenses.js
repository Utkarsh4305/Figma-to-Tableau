// GET /api/license/:uid — what the plugin polls to unlock unlimited exports.

const express = require("express");
const { getLicense } = require("../services/licenseStore");

const router = express.Router();

/** The plugin polls this to decide free vs Premium. */
router.get("/api/license/:uid", (req, res) => {
  const rec = getLicense(req.params.uid);
  const premium = !!(rec && rec.validUntil && rec.validUntil > Date.now());
  res.json({
    premium,
    validUntil: rec ? rec.validUntil : undefined,
    subscriptionId: rec ? rec.subscriptionId : undefined,
    status: rec ? rec.status : "none",
  });
});

module.exports = router;
