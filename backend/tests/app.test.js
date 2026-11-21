import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../src/config/database.js", () => ({
  default: {
    query: vi.fn(),
  },
}));

import pool from "../src/config/database.js";
import app from "../src/app.js";

describe("Beevo API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET / should return the welcome message", async () => {
    const response = await request(app).get("/");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Welcome to Beevo API",
    });
  });

  it("GET /health should return a healthy status", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      status: "healthy",
      service: "beevo-backend",
    });
  });

  it("GET /health/ready should return ready when the database responds", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

    const response = await request(app).get("/health/ready");

    expect(pool.query).toHaveBeenCalledWith("SELECT 1");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      status: "ready",
      service: "beevo-backend",
    });
  });

  it("GET /health/ready should return 503 when the database is unavailable", async () => {
    pool.query.mockRejectedValueOnce(new Error("Database unavailable"));

    const response = await request(app).get("/health/ready");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      status: "not_ready",
      service: "beevo-backend",
    });
    expect(response.body.message).toBeUndefined();
  });

  it("should return 404 for an unknown route", async () => {
    const response = await request(app).get("/this-route-does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      message: "Route not found.",
    });
  });

  it("should reject requests to follow-ups without authentication", async () => {
    const response = await request(app).get("/follow-ups");

    expect(response.status).toBe(401);
  });

  it("should reject logout without authentication", async () => {
    const response = await request(app).post("/auth/logout");

    expect(response.status).toBe(401);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("should revoke existing sessions when logout succeeds", async () => {
    const secret = process.env.JWT_SECRET || "beevo-test-auth-secret";
    process.env.JWT_SECRET = secret;

    const token = jwt.sign(
      {
        businessId: "41",
        role: "owner",
        tokenVersion: 0,
      },
      secret,
      {
        subject: "41",
        expiresIn: "5m",
        algorithm: "HS256",
      }
    );

    pool.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 41,
          business_id: 41,
          role: "owner",
          is_active: true,
          token_version: 0,
        }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 41 }],
      });

    const response = await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query.mock.calls[1][0]).toContain(
      "token_version = token_version + 1"
    );

    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: 41,
        business_id: 41,
        role: "owner",
        is_active: true,
        token_version: 1,
      }],
    });

    const staleSession = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(staleSession.status).toBe(401);
    expect(staleSession.body.message).toBe(
      "Your session has expired. Please log in again."
    );
  });
});
