import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  query: vi.fn(),
}));

vi.mock("../src/middleware/login-rate-limit.middleware.js", () => ({
  loginRateLimit: (req, res, next) => next(),
}));

vi.mock("../src/config/database.js", () => ({
  default: { query: mocks.query },
}));

vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn(function OAuth2ClientMock() {
    return {
      verifyIdToken: mocks.verifyIdToken,
    };
  }),
}));
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
    expect(response.body.message).toBe("Please enter your email address.");
  });

  it("should reject login when password is missing", async () => {
    const response = await request(app)
      .post("/auth/login")
      .send({ email: "test@example.com" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Please enter your password.");
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
      "Please log in to continue."
    );
  });

  it("should reject /auth/me when the token is invalid", async () => {
    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer invalid-token");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe(
      "Your session is invalid or has expired. Please log in again."
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
      "Your session is invalid or has expired. Please log in again."
    );
  });
});


describe("Beevo Google authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reject Google login when the credential is missing", async () => {
    const response = await request(app)
      .post("/auth/google")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe(
      "Please complete Google sign-in and try again."
    );
    expect(mocks.verifyIdToken).not.toHaveBeenCalled();
  });

  it("should return 503 when Google sign-in is not configured", async () => {
    const previousClientId = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;

    try {
      const response = await request(app)
        .post("/auth/google")
        .send({ credential: "test-google-credential" });

      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/not configured/i);
      expect(mocks.verifyIdToken).not.toHaveBeenCalled();
    } finally {
      if (previousClientId === undefined) {
        delete process.env.GOOGLE_CLIENT_ID;
      } else {
        process.env.GOOGLE_CLIENT_ID = previousClientId;
      }
    }
  });

  it("should authenticate an existing Beevo account with a verified Google email", async () => {
    const previousClientId = process.env.GOOGLE_CLIENT_ID;
    const previousSecret = process.env.JWT_SECRET;

    process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
    process.env.JWT_SECRET = previousSecret || "beevo-test-auth-secret";

    mocks.verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: "google-user-123",
        email: "owner@example.com",
        email_verified: true,
      }),
    });

    mocks.query.mockResolvedValue({
      rows: [{
        id: 41,
        business_id: 41,
        name: "Test Owner",
        email: "owner@example.com",
        role: "owner",
        is_active: true,
        token_version: 0,
        business_name: "Test Business",
      }],
    });

    try {
      const response = await request(app)
        .post("/auth/google")
        .send({ credential: "valid-test-google-credential" });

      expect(mocks.verifyIdToken).toHaveBeenCalledWith({
        idToken: "valid-test-google-credential",
        audience: "test-google-client-id",
      });

      expect(mocks.query).toHaveBeenCalled();
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe("owner@example.com");
      expect(response.body.data.user.business_id).toBe(41);
      expect(response.headers["set-cookie"]).toBeDefined();
      expect(response.body.data.user.token_version).toBeUndefined();
    } finally {
      if (previousClientId === undefined) {
        delete process.env.GOOGLE_CLIENT_ID;
      } else {
        process.env.GOOGLE_CLIENT_ID = previousClientId;
      }

      if (previousSecret === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = previousSecret;
      }
    }
  });

  it("should reject a Google identity whose email is not verified", async () => {
    const previousClientId = process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id";

    mocks.verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: "google-user-123",
        email: "owner@example.com",
        email_verified: false,
      }),
    });

    try {
      const response = await request(app)
        .post("/auth/google")
        .send({ credential: "unverified-test-credential" });

      expect(response.status).toBe(401);
      expect(response.body.message).toMatch(/email could not be verified/i);
      expect(mocks.query).not.toHaveBeenCalled();
    } finally {
      if (previousClientId === undefined) {
        delete process.env.GOOGLE_CLIENT_ID;
      } else {
        process.env.GOOGLE_CLIENT_ID = previousClientId;
      }
    }
  });
});
