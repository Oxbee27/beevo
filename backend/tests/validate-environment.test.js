import { describe, it, expect } from "vitest";
import { validateProductionEnvironment } from "../src/config/validate-environment.js";

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
      "DB_HOST is required; DB_NAME is required; DB_USER is required; DB_PASSWORD is required; JWT_SECRET is required",
    );
  });

  it("rejects a JWT secret shorter than 32 characters", () => {
    expect(() =>
      validateProductionEnvironment({
        NODE_ENV: "production",
        DB_HOST: "database-host",
        DB_NAME: "beevo",
        DB_USER: "beevo_app",
        DB_PASSWORD: "database-password",
        JWT_SECRET: "short-secret",
      }),
    ).toThrow("JWT_SECRET must contain at least 32 characters");
  });

  it("accepts valid production configuration", () => {
    expect(() =>
      validateProductionEnvironment({
        NODE_ENV: "production",
        DB_HOST: "database-host",
        DB_NAME: "beevo",
        DB_USER: "beevo_app",
        DB_PASSWORD: "database-password",
        JWT_SECRET: "a-valid-production-secret-with-32-chars",
      }),
    ).not.toThrow();
  });

  it("does not expose configured secret values in validation errors", () => {
    const secret = "short-secret-value";

    try {
      validateProductionEnvironment({
        NODE_ENV: "production",
        DB_HOST: "database-host",
        DB_NAME: "beevo",
        DB_USER: "beevo_app",
        DB_PASSWORD: "database-password",
        JWT_SECRET: secret,
      });
      throw new Error("Expected validation to fail");
    } catch (error) {
      expect(error.message).toContain("JWT_SECRET");
      expect(error.message).not.toContain(secret);
    }
  });
});
