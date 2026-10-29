import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/app.js";

describe("Beevo API", () => {
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
});
