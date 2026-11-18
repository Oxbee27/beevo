import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("../src/config/database.js", () => ({
  default: { query },
}));

import { getBusinessWallet } from "../src/services/get-business-wallet.service.js";
import { listWalletTransactions } from "../src/services/list-wallet-transactions.service.js";

describe("Beevo wallet services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retrieves a wallet using the supplied business ID", async () => {
    query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: "10",
        business_id: "7",
        currency: "NGN ",
        balance_kobo: "9007199254740991",
        created_at: new Date("2026-01-01T00:00:00Z"),
        updated_at: new Date("2026-01-02T00:00:00Z"),
      }],
    });

    const wallet = await getBusinessWallet("7");

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE business_id = $1"),
      ["7"]
    );
    expect(wallet).toEqual({
      id: "10",
      businessId: "7",
      currency: "NGN",
      balanceKobo: "9007199254740991",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    });
  });

  it("returns 404 when the business wallet does not exist", async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(getBusinessWallet("999")).rejects.toMatchObject({
      message: "Business wallet not found.",
      status: 404,
    });
  });

  it("lists transactions and counts only the requested business records", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: "50",
          transaction_type: "credit",
          amount_kobo: "50000",
          balance_after_kobo: "75000",
          reference: "WALLET-REF-50",
          description: "Wallet funding",
          metadata: { provider: "paystack" },
          created_at: new Date("2026-01-03T00:00:00Z"),
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ total: "21" }],
      });

    const result = await listWalletTransactions("7", {
      page: 2,
      limit: 10,
    });

    expect(query).toHaveBeenCalledTimes(2);

    expect(query.mock.calls[0][0]).toContain(
      "WHERE business_id = $1"
    );
    expect(query.mock.calls[0][1]).toEqual(["7", 10, 10]);

    expect(query.mock.calls[1][0]).toContain(
      "WHERE business_id = $1"
    );
    expect(query.mock.calls[1][1]).toEqual(["7"]);

    expect(result).toEqual({
      transactions: [{
        id: "50",
        type: "credit",
        amountKobo: "50000",
        balanceAfterKobo: "75000",
        reference: "WALLET-REF-50",
        description: "Wallet funding",
        metadata: { provider: "paystack" },
        createdAt: new Date("2026-01-03T00:00:00Z"),
      }],
      pagination: {
        page: 2,
        limit: 10,
        total: 21,
        totalPages: 3,
      },
    });
  });

  it("rejects transaction counts that cannot be represented safely", async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ total: "9007199254740992" }],
      });

    await expect(listWalletTransactions("7")).rejects.toMatchObject({
      status: 503,
      publicMessage:
        "Wallet transaction history is temporarily unavailable. Please try again later.",
    });
  });

  it("calculates pagination using an exact integer count", async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ total: "9007199254740991" }],
      });

    const result = await listWalletTransactions("7", {
      page: 1,
      limit: 100,
    });

    expect(result.pagination).toEqual({
      page: 1,
      limit: 100,
      total: 9007199254740991,
      totalPages: 90071992547410,
    });
  });

  it("returns an empty transaction list when no records exist", async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: "0" }] });

    const result = await listWalletTransactions("7");

    expect(result.transactions).toEqual([]);
    expect(result.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });
  });
});
