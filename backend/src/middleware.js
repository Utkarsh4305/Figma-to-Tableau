// ---------------------------------------------------------------------------
// middleware.js — small, dependency-free hardening middleware:
//   securityHeaders  baseline response headers (clickjacking / sniffing / etc.)
//   rateLimit        in-memory fixed-window per-IP limiter for abuse control
//
// The rate limiter is intentionally simple (a Map keyed by client IP). It is
// per-process, so it protects a single instance; if you scale to multiple
// instances put a shared store (Redis) or an edge/WAF limiter in front.
// ---------------------------------------------------------------------------

/** Baseline security headers for every response. */
function securityHeaders(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  // The service is only ever reached over HTTPS (Render terminates TLS) — tell
  // browsers to never downgrade to http for this host.
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  next();
}

/**
 * Fixed-window rate limiter. Returns middleware that allows `max` requests per
 * `windowMs` per client IP; over that it responds 429. Stale buckets are swept
 * lazily so the Map can't grow unbounded.
 */
function rateLimit({ windowMs = 60_000, max = 60, name = "rl" } = {}) {
  const hits = new Map(); // ip -> { count, resetAt }
  let lastSweep = Date.now();

  return function (req, res, next) {
    const now = Date.now();
    // Periodic sweep of expired buckets (cheap, amortised).
    if (now - lastSweep > windowMs) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      lastSweep = now;
    }
    const ip = req.ip || req.connection?.remoteAddress || "unknown";
    const key = `${name}:${ip}`;
    let bucket = hits.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      hits.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      const retry = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retry));
      return res.status(429).json({ error: "Too many requests — slow down and try again." });
    }
    next();
  };
}

module.exports = { securityHeaders, rateLimit };
