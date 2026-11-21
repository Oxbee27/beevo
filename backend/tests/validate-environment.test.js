import { describe, it, expect } from "vitest";
import { validateProductionEnvironment } from "../src/config/validate-environment.js";

const VALID_CA_BASE64 = Buffer.from(
  "-----BEGIN CERTIFICATE-----\nTEST-CERTIFICATE\n-----END CERTIFICATE-----",
).toString("base64");

const VALID_PRODUCTION_ENV = {
  NODE_ENV: "production",
  DB_HOST: "database-host",
  DB_NAME: "beevo",
  DB_USER: "beevo_app",
  DB_PASSWORD: "database-password",
  DB_SSL: "true",
  DB_SSL_CA_BASE64: VALID_CA_BASE64,
  JWT_SECRET: "a-valid-production-secret-with-32-chars",
};

describe("Production environment validation", () => {
  it("does not enforce production settings in development", () => {
    expect(() =>
      validateProductionEnvironment({ NODE_ENV: "development" }),
    ).not.toThrow();
  });

  it("does not enforce production settings in test", () => {
    expect(() =>
      validateProductionEnvironment({ NODE_ENV: "test" }),
    ).not.toThrow();
  });

  it("rejects missing required production variables", () => {
    expect(() =>
      validateProductionEnvironment({ NODE_ENV: "production" }),
    ).toThrow(
      "DB_HOST is required; DB_NAME is required; DB_USER is required; DB_PASSWORD is required; JWT_SECRET is required; DB_SSL_CA_BASE64 is required; DB_SSL must be true in production",
    );
  });

  it("rejects a JWT secret shorter than 32 characters", () => {
    expect(() =>
      validateProductionEnvironment({
        ...VALID_PRODUCTION_ENV,
        JWT_SECRET: "short-secret",
      }),
    ).toThrow("JWT_SECRET must contain at least 32 characters");
  });

  it("accepts valid production configuration", () => {
    expect(() =>
      validateProductionEnvironment(VALID_PRODUCTION_ENV),
    ).not.toThrow();
  });

  it("does not expose configured secret values in validation errors", () => {
    const secret = "short-secret-value";

    try {
      validateProductionEnvironment({
        ...VALID_PRODUCTION_ENV,
        JWT_SECRET: secret,
      });
      throw new Error("Expected validation to fail");
    } catch (error) {
      expect(error.message).toContain("JWT_SECRET");
      expect(error.message).not.toContain(secret);
    }
  });

  it("rejects production when PostgreSQL SSL is disabled", () => {
    expect(() =>
      validateProductionEnvironment({
        ...VALID_PRODUCTION_ENV,
        DB_SSL: "false",
      }),
    ).toThrow("DB_SSL must be true in production");
  });

  it("rejects an invalid CA certificate", () => {
    expect(() =>
      validateProductionEnvironment({
        ...VALID_PRODUCTION_ENV,
        DB_SSL_CA_BASE64: Buffer.from("not-a-certificate").toString("base64"),
      }),
    ).toThrow("DB_SSL_CA_BASE64 must contain a valid PEM certificate");
  });

  it("rejects an invalid JWT expiration format", () => {
    expect(() =>
      validateProductionEnvironment({
        ...VALID_PRODUCTION_ENV,
        JWT_EXPIRES_IN: "forever",
      }),
    ).toThrow("JWT_EXPIRES_IN must be a positive duration");
  });

  it("rejects a non-positive cookie lifetime", () => {
    expect(() =>
      validateProductionEnvironment({
        ...VALID_PRODUCTION_ENV,
        JWT_COOKIE_MAX_AGE_MS: "0",
      }),
    ).toThrow("JWT_COOKIE_MAX_AGE_MS must be a positive integer");
  });

  it("rejects a cookie lifetime longer than the JWT lifetime", () => {
    expect(() =>
      validateProductionEnvironment({
        ...VALID_PRODUCTION_ENV,
        JWT_EXPIRES_IN: "15m",
        JWT_COOKIE_MAX_AGE_MS: "3600000",
      }),
    ).toThrow("JWT_COOKIE_MAX_AGE_MS must not exceed the JWT lifetime");
  });

  it("rejects an unsupported cookie SameSite setting", () => {
    expect(() =>
      validateProductionEnvironment({
        ...VALID_PRODUCTION_ENV,
        AUTH_COOKIE_SAME_SITE: "invalid",
      }),
    ).toThrow("AUTH_COOKIE_SAME_SITE must be lax, strict, or none");
  });

  it("accepts matching custom JWT and cookie lifetimes", () => {
    expect(() =>
      validateProductionEnvironment({
        ...VALID_PRODUCTION_ENV,
        JWT_EXPIRES_IN: "15m",
        JWT_COOKIE_MAX_AGE_MS: "900000",
        AUTH_COOKIE_SAME_SITE: "none",
      }),
    ).not.toThrow();
  });
});
