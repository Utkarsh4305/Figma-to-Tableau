// GET /api/license/:uid — what the plugin polls to unlock unlimited exports.

const express = require("express");
const { getLicense } = require("../services/licenseStore");

const router = express.Router();

/**
 * The plugin polls this to decide free vs Premium. This endpoint is
 * unauthenticated (the uid is the only "credential"), so it returns only what
 * the plugin needs to gate exports — premium flag, expiry and coarse status.
 * Internal identifiers like the Razorpay subscription id are deliberately NOT
 * exposed, so guessing a uid can't harvest another user's billing details.
 */
router.get("/api/license/:uid", (req, res) => {
  const rec = getLicense(req.params.uid);
  const premium = !!(rec && rec.validUntil && rec.validUntil > Date.now());
  res.json({
    premium,
    validUntil: rec ? rec.validUntil : undefined,
    status: rec ? rec.status : "none",
  });
});

module.exports = router;
