import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockLoginUser } = vi.hoisted(() => ({
  mockLoginUser: vi.fn(),
}));

vi.mock("../src/services/login.service.js", () => ({
  loginUser: mockLoginUser,
}));

import request from "supertest";
import app from "../src/app.js";

describe("Beevo login behaviour", () => {
  beforeEach(() => {
    mockLoginUser.mockReset();
  });

  it("should issue an HTTP-only authentication cookie when login succeeds", async () => {
    mockLoginUser.mockResolvedValue({
      id: 1,
      business_id: 10,
      name: "Test User",
      email: "test@example.com",
      role: "user",
      business_name: "Test Business",
    });

    const response = await request(app)
      .post("/auth/login")
      .send({
        email: "test@example.com",
        password: "ExamplePass@123",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe("test@example.com");
    expect(response.body.data.user).not.toHaveProperty("password_hash");
    expect(response.body.data).not.toHaveProperty("token");
    expect(response.headers["set-cookie"]).toBeDefined();
    expect(response.headers["set-cookie"].join(";")).toContain("beevo_session=");
    expect(response.headers["set-cookie"].join(";")).toContain("HttpOnly");
  });

  it.each([
    [
      "unknown email",
      "unknown@example.com",
      "This email address is not registered. Please check the email and try again.",
    ],
    [
      "incorrect password",
      "test@example.com",
      "The password you entered is incorrect. Please try again.",
    ],
  ])("should return the correct message for %s", async (_scenario, email, message) => {
    const error = new Error(message);
    error.status = 401;
    error.publicMessage = message;
    mockLoginUser.mockRejectedValue(error);

    const response = await request(app)
      .post("/auth/login")
      .send({
        email,
        password: "ExamplePass@123",
      });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe(message);
  });

  it("should return a separate message for inactive accounts", async () => {
    const message =
      "This account is currently inactive. Please contact your business administrator.";
    const error = new Error("User account is inactive.");
    error.status = 403;
    error.publicMessage = message;
    mockLoginUser.mockRejectedValue(error);

    const response = await request(app)
      .post("/auth/login")
      .send({
        email: "test@example.com",
        password: "ExamplePass@123",
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe(message);
  });
});
