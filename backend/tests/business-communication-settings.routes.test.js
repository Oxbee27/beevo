import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

const { databaseQuery } = vi.hoisted(() => ({
  databaseQuery: vi.fn(),
}));

vi.mock("../src/config/database.js", () => ({
  default: { query: databaseQuery },
}));

import app from "../src/app.js";

const testSecret = "beevo-business-settings-test-secret";

function createToken(userId = "7", businessId = "7") {
  return jwt.sign(
    {
      sub: userId,
      businessId,
      role: "owner",
      tokenVersion: 0,
    },
    testSecret,
    { expiresIn: "5m", algorithm: "HS256" },
  );
}

const defaultProfile = {
  email_sender_name: "Beevo Store",
  email_sender_address: "hello@example.com",
  email_reply_to: "support@example.com",
  email_status: "pending",
  sms_sender_id: "STORE123",
  sms_status: "pending",
  whatsapp_business_account_id: null,
  whatsapp_phone_number_id: null,
  whatsapp_display_number: null,
  whatsapp_status: "not_configured",
};

describe("Beevo business communication settings", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = testSecret;
    vi.clearAllMocks();

    databaseQuery.mockImplementation(async (sql) => {
      if (sql.includes("token_version")) {
        return {
          rowCount: 1,
          rows: [{
            id: "7",
            business_id: "7",
            role: "owner",
            is_active: true,
            token_version: 0,
          }],
        };
      }

      if (sql.includes("SELECT role")) {
        return {
          rowCount: 1,
          rows: [{ role: "owner" }],
        };
      }

      if (sql.includes("business_communication_profiles")) {
        return { rowCount: 0, rows: [] };
      }

      throw new Error("Unexpected database query in business settings test.");
    });
  });

  it.each(["GET", "PATCH"])(
    "requires authentication for %s business settings",
    async (method) => {
      const response = await request(app)
        [method.toLowerCase()]("/communications/business-settings")
        .send({});

      expect(response.status).toBe(401);
    },
  );

  it.each(["GET", "PATCH"])(
    "blocks staff from %s business settings",
    async (method) => {
      databaseQuery.mockImplementation(async (sql) => {
        if (sql.includes("token_version")) {
          return {
            rowCount: 1,
            rows: [{
              id: "8",
              business_id: "7",
              role: "staff",
              is_active: true,
              token_version: 0,
            }],
          };
        }

        if (sql.includes("SELECT role")) {
          return {
            rowCount: 1,
            rows: [{ role: "staff" }],
          };
        }

        throw new Error("Staff should not reach the settings controller.");
      });

      const response = await request(app)
        [method.toLowerCase()]("/communications/business-settings")
        .set("Authorization", `Bearer ${createToken("8", "7")}`)
        .send({});

      expect(response.status).toBe(403);
      expect(response.body.message).toBe(
        "Only the business owner can perform this action.",
      );
    },
  );

  it("returns settings scoped to the authenticated business", async () => {
    databaseQuery.mockImplementation(async (sql, values) => {
      if (sql.includes("token_version")) {
        return {
          rowCount: 1,
          rows: [{
            id: "7",
            business_id: "7",
            role: "owner",
            is_active: true,
            token_version: 0,
          }],
        };
      }

      if (sql.includes("SELECT role")) {
        return { rowCount: 1, rows: [{ role: "owner" }] };
      }

      if (sql.includes("FROM business_communication_profiles")) {
        expect(values).toEqual(["7"]);
        return { rowCount: 1, rows: [defaultProfile] };
      }

      throw new Error("Unexpected database query.");
    });

    const response = await request(app)
      .get("/communications/business-settings")
      .set("Authorization", `Bearer ${createToken("7", "7")}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject(defaultProfile);
  });

  it.each( [
    "email_status",
    "sms_status",
    "whatsapp_status",
  ])("does not allow owners to change %s", async (field) => {
    const response = await request(app)
      .patch("/communications/business-settings")
      .set("Authorization", `Bearer ${createToken()}`)
      .send({ [field]: "approved" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(databaseQuery).toHaveBeenCalledTimes(2);
  });

  it("rejects an invalid sender email address", async () => {
    const response = await request(app)
      .patch("/communications/business-settings")
      .set("Authorization", `Bearer ${createToken()}`)
      .send({ email_sender_address: "not-an-email" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Enter a valid email address.");
    expect(databaseQuery).toHaveBeenCalledTimes(2);
  });

  it("rejects unknown settings fields", async () => {
    const response = await request(app)
      .patch("/communications/business-settings")
      .set("Authorization", `Bearer ${createToken()}`)
      .send({ termii_api_key: "secret-value" });

    expect(response.status).toBe(400);
    expect(databaseQuery).toHaveBeenCalledTimes(2);
  });

  it("updates editable settings without changing approval statuses", async () => {
    databaseQuery.mockImplementation(async (sql, values) => {
      if (sql.includes("token_version")) {
        return {
          rowCount: 1,
          rows: [{
            id: "7",
            business_id: "7",
            role: "owner",
            is_active: true,
            token_version: 0,
          }],
        };
      }

      if (sql.includes("SELECT role")) {
        return { rowCount: 1, rows: [{ role: "owner" }] };
      }

      if (sql.includes("FROM business_communication_profiles")) {
        expect(values).toEqual(["7"]);
        return { rowCount: 1, rows: [defaultProfile] };
      }

      if (sql.includes("INSERT INTO business_communication_profiles")) {
        expect(values[0]).toBe("7");
        expect(values).toContain("New Store Name");

        return {
          rowCount: 1,
          rows: [{
            ...defaultProfile,
            email_sender_name: "New Store Name",
          }],
        };
      }

      throw new Error("Unexpected database query.");
    });

    const response = await request(app)
      .patch("/communications/business-settings")
      .set("Authorization", `Bearer ${createToken()}`)
      .send({ email_sender_name: "New Store Name" });

    expect(response.status).toBe(200);
    expect(response.body.data.email_sender_name).toBe("New Store Name");
    expect(response.body.data.email_status).toBe("pending");
    expect(response.body.data.sms_status).toBe("pending");
  });
});
