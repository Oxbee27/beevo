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
