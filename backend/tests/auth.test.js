import { describe, it, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../src/app.js";

describe("Beevo authentication", () => {
  it("should reject login when email is missing", async () => {
    const response = await request(app)
      .post("/auth/login")
      .send({ password: "ExamplePass123" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Invalid login data.");
  });

  it("should reject login when password is missing", async () => {
    const response = await request(app)
      .post("/auth/login")
      .send({ email: "test@example.com" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Invalid login data.");
  });

  it("should reject an invalid email format", async () => {
    const response = await request(app)
      .post("/auth/login")
      .send({
        email: "not-an-email",
        password: "ExamplePass123",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("should reject extra fields in the login request", async () => {
    const response = await request(app)
      .post("/auth/login")
      .send({
        email: "test@example.com",
        password: "ExamplePass123",
        role: "admin",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("should reject /auth/me when the token is missing", async () => {
    const response = await request(app).get("/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe(
      "Authentication token required."
    );
  });

  it("should reject /auth/me when the token is invalid", async () => {
    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer invalid-token");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe(
      "Invalid or expired authentication token."
    );
  });

  it("should reject /auth/me when the token is expired", async () => {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new Error("JWT_SECRET must be configured for this test.");
    }

    const expiredToken = jwt.sign(
      {
        sub: "1",
        businessId: "1",
        role: "user",
      },
      secret,
      { expiresIn: -1 }
    );

    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${expiredToken}`);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe(
      "Invalid or expired authentication token."
    );
  });
});
