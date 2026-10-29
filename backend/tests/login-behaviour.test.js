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

  it("should return a token when login succeeds", async () => {
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
        password: "ExamplePass123",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe("test@example.com");
    expect(response.body.data.user).not.toHaveProperty("password_hash");
    expect(typeof response.body.data.token).toBe("string");
  });

  it.each([
    ["incorrect password", "test@example.com"],
    ["unknown email", "unknown@example.com"],
  ])("should reject login for %s", async (_scenario, email) => {
    const error = new Error("Invalid email or password.");
    error.status = 401;
    mockLoginUser.mockRejectedValue(error);

    const response = await request(app)
      .post("/auth/login")
      .send({
        email,
        password: "ExamplePass123",
      });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Invalid email or password.");
  });
});
