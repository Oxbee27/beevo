import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

const {
  databaseQuery,
  getBusinessWallet,
} = vi.hoisted(() => ({
  databaseQuery: vi.fn(),
  getBusinessWallet: vi.fn(),
}));

vi.mock("../src/config/database.js", () => ({
  default: {
    query: databaseQuery,
  },
}));

vi.mock("../src/services/get-business-wallet.service.js", () => ({
  getBusinessWallet,
}));

import app from "../src/app.js";

const testSecret = "beevo-wallet-authorization-test-secret";

function createToken(userId = "7", businessId = "7") {
  return jwt.sign(
    {
      sub: userId,
      businessId,
      role: "staff",
      tokenVersion: 0,
    },
    testSecret,
    { expiresIn: "5m", algorithm: "HS256" },
  );
}

describe("Beevo wallet route authorization", () => {
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

      throw new Error("Unexpected database query in wallet authorization test.");
    });

    getBusinessWallet.mockResolvedValue({
      id: "10",
      businessId: "7",
      currency: "NGN",
      balanceKobo: "0",
    });
  });

  it.each([
    ["GET", "/wallet"],
    ["GET", "/wallet/transactions"],
    ["POST", "/wallet/funding/initialize"],
    ["POST", "/wallet/funding/verify"],
  ])("blocks staff from %s %s", async (method, path) => {
    const response = await request(app)
      [method.toLowerCase()](path)
      .set("Authorization", `Bearer ${createToken()}`)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      message: "Only the business owner can perform this action.",
    });

    expect(databaseQuery).toHaveBeenCalledTimes(2);
    expect(getBusinessWallet).not.toHaveBeenCalled();
  });

  it("allows an authenticated business owner through wallet authorization", async () => {
    databaseQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: "7",
          business_id: "7",
          role: "owner",
          is_active: true,
          token_version: 0,
        }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ role: "owner" }],
      });

    const response = await request(app)
      .get("/wallet")
      .set("Authorization", `Bearer ${createToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.wallet.businessId).toBe("7");
    expect(getBusinessWallet).toHaveBeenCalledWith("7");
  });
});
