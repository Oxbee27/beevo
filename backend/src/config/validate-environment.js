const REQUIRED_PRODUCTION_VARIABLES = [
  "DB_HOST",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "JWT_SECRET",
  "DB_SSL_CA_BASE64",
];

export function validateProductionEnvironment(env = process.env) {
  if (env.NODE_ENV !== "production") {
    return;
  }

  const issues = [];

  for (const variable of REQUIRED_PRODUCTION_VARIABLES) {
    if (!env[variable]?.trim()) {
      issues.push(`${variable} is required`);
    }
  }

  if (env.DB_SSL !== "true") {
    issues.push("DB_SSL must be true in production");
  }

  const jwtSecret = env.JWT_SECRET?.trim();

  if (jwtSecret && jwtSecret.length < 32) {
    issues.push("JWT_SECRET must contain at least 32 characters");
  }

  const expiry = env.JWT_EXPIRES_IN || "1h";
  const durationMatch = expiry.match(/^([1-9][0-9]*)(s|m|h|d)$/);

  if (!durationMatch) {
    issues.push("JWT_EXPIRES_IN must be a positive duration such as 15m, 1h, or 7d");
  }

  let tokenLifetimeMs = 0;

  if (durationMatch) {
    const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    tokenLifetimeMs = Number(durationMatch[1]) * units[durationMatch[2]];

    if (!Number.isSafeInteger(tokenLifetimeMs)) {
      issues.push("JWT_EXPIRES_IN exceeds the supported duration");
    }
  }

  const cookieMaxAge = env.JWT_COOKIE_MAX_AGE_MS;

  if (cookieMaxAge !== undefined && cookieMaxAge.trim() !== "") {
    const maxAge = Number(cookieMaxAge);

    if (!Number.isSafeInteger(maxAge) || maxAge <= 0) {
      issues.push("JWT_COOKIE_MAX_AGE_MS must be a positive integer");
    } else if (tokenLifetimeMs > 0 && maxAge > tokenLifetimeMs) {
      issues.push("JWT_COOKIE_MAX_AGE_MS must not exceed the JWT lifetime");
    }
  }

  const sameSite = env.AUTH_COOKIE_SAME_SITE;

  if (
    sameSite !== undefined &&
    !["lax", "strict", "none"].includes(sameSite.toLowerCase())
  ) {
    issues.push("AUTH_COOKIE_SAME_SITE must be lax, strict, or none");
  }

  const caBase64 = env.DB_SSL_CA_BASE64?.trim();

  if (caBase64) {
    const ca = Buffer.from(caBase64, "base64").toString("utf8");

    if (
      !ca.includes("-----BEGIN CERTIFICATE-----") ||
      !ca.includes("-----END CERTIFICATE-----")
    ) {
      issues.push("DB_SSL_CA_BASE64 must contain a valid PEM certificate");
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `Production environment configuration is invalid: ${issues.join("; ")}.`,
    );
  }
}
