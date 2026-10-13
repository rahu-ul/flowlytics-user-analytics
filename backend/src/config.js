'use strict';

const toInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Reads configuration from an env-like object. Pure so it is easy to test. */
function loadConfig(env = process.env) {
  return {
    port: toInt(env.PORT, 4000),
    mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
    dbName: env.MONGODB_DB || 'causalfunnel_analytics',
    // Origins allowed to call the read APIs from a browser (dashboard dev server, etc.).
    // The ingest endpoint is intentionally open to any origin: the tracker runs on third-party sites.
    dashboardOrigins: (env.DASHBOARD_ORIGINS || 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    ingestRateLimitPerMin: toInt(env.INGEST_RATE_LIMIT_PER_MIN, 600),
    trustProxy: env.TRUST_PROXY ? toInt(env.TRUST_PROXY, 1) : false,
  };
}

module.exports = { loadConfig };
