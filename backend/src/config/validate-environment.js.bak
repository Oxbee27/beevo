const REQUIRED_PRODUCTION_VARIABLES = [
  "DB_HOST",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "JWT_SECRET",
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

  const jwtSecret = env.JWT_SECRET?.trim();

  if (jwtSecret && jwtSecret.length < 32) {
    issues.push("JWT_SECRET must contain at least 32 characters");
  }

  if (issues.length > 0) {
    throw new Error(
      `Production environment configuration is invalid: ${issues.join("; ")}.`,
    );
  }
}
