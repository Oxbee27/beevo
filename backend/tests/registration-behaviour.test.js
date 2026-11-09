import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRegisterBusiness } = vi.hoisted(() => ({
  mockRegisterBusiness: vi.fn(),
}));

vi.mock("../src/services/register.service.js", () => ({
  registerBusiness: mockRegisterBusiness,
}));

import request from "supertest";
import app from "../src/app.js";

describe("Beevo registration behaviour", () => {
  beforeEach(() => {
    mockRegisterBusiness.mockReset();
  });

  it("should create a business account without returning a JWT", async () => {
    mockRegisterBusiness.mockResolvedValue({
      business: {
        id: 7,
        name: "New Business",
        email: "owner@example.com",
        phone: null,
        created_at: "2026-11-05T15:00:00.000Z",
      },
      user: {
        id: 7,
        business_id: 7,
        name: "Business Owner",
        email: "owner@example.com",
        role: "owner",
        created_at: "2026-11-05T15:00:00.000Z",
      },
    });

    const response = await request(app)
      .post("/auth/register")
      .send({
        businessName: "New Business",
        name: "Business Owner",
        email: "owner@example.com",
        password: "BeevoOwner@2026",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe(
      "Business registered successfully."
    );

    expect(response.body.data.business.name).toBe("New Business");
    expect(response.body.data.user.email).toBe("owner@example.com");
    expect(response.body.data.user.role).toBe("owner");

    expect(response.body.data).not.toHaveProperty("token");
    expect(response.body).not.toHaveProperty("token");

    expect(mockRegisterBusiness).toHaveBeenCalledTimes(1);
  });
});
