import { beforeEach, describe, expect, it, vi } from "vitest";

const { getBusinessWallet, listWalletTransactions } = vi.hoisted(() => ({
  getBusinessWallet: vi.fn(),
  listWalletTransactions: vi.fn(),
}));

vi.mock("../src/services/get-business-wallet.service.js", () => ({
  getBusinessWallet,
}));

vi.mock("../src/services/list-wallet-transactions.service.js", () => ({
  listWalletTransactions,
}));

import { getBusinessWalletController } from "../src/controllers/get-business-wallet.controller.js";
import { listWalletTransactionsController } from "../src/controllers/list-wallet-transactions.controller.js";

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe("Beevo wallet controllers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the authenticated business wallet", async () => {
    getBusinessWallet.mockResolvedValue({
      id: "10",
      businessId: "7",
      currency: "NGN",
      balanceKobo: "250000",
    });

    const req = { user: { businessId: "7" } };
    const res = createResponse();

    await getBusinessWalletController(req, res);

    expect(getBusinessWallet).toHaveBeenCalledWith("7");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        wallet: expect.objectContaining({
          businessId: "7",
          balanceKobo: "250000",
        }),
      },
    });
  });

  it("passes wallet retrieval errors to the error handler", async () => {
    const error = new Error("Database unavailable");
    getBusinessWallet.mockRejectedValue(error);

    const req = { user: { businessId: "7" } };
    const res = createResponse();
    const next = vi.fn();

    await getBusinessWalletController(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it("returns transaction history with default pagination", async () => {
    listWalletTransactions.mockResolvedValue({
      transactions: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    const req = {
      user: { businessId: "7" },
      query: {},
    };
    const res = createResponse();

    await listWalletTransactionsController(req, res);

    expect(listWalletTransactions).toHaveBeenCalledWith("7", {
      page: 1,
      limit: 20,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("accepts valid custom pagination", async () => {
    listWalletTransactions.mockResolvedValue({
      transactions: [],
      pagination: { page: 3, limit: 10, total: 25, totalPages: 3 },
    });

    const req = {
      user: { businessId: "7" },
      query: { page: "3", limit: "10" },
    };
    const res = createResponse();

    await listWalletTransactionsController(req, res);

    expect(listWalletTransactions).toHaveBeenCalledWith("7", {
      page: 3,
      limit: 10,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("caps the requested transaction limit at 100", async () => {
    listWalletTransactions.mockResolvedValue({
      transactions: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });

    const req = {
      user: { businessId: "7" },
      query: { limit: "500" },
    };
    const res = createResponse();

    await listWalletTransactionsController(req, res);

    expect(listWalletTransactions).toHaveBeenCalledWith("7", {
      page: 1,
      limit: 100,
    });
  });

  it.each([
    { page: "0", limit: "20" },
    { page: "-1", limit: "20" },
    { page: "abc", limit: "20" },
    { page: "1.5", limit: "20" },
    { page: "1", limit: "0" },
    { page: "1", limit: "invalid" },
    { page: "9007199254740992", limit: "20" },
  ])("rejects invalid pagination: %o", async (query) => {
    const req = { user: { businessId: "7" }, query };
    const res = createResponse();

    await listWalletTransactionsController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(listWalletTransactions).not.toHaveBeenCalled();
  });

  it("rejects a page that would produce an unsafe SQL offset", async () => {
    const req = {
      user: { businessId: "7" },
      query: {
        page: "90071992547411",
        limit: "100",
      },
    };
    const res = createResponse();

    await listWalletTransactionsController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Please provide valid pagination details.",
    });
    expect(listWalletTransactions).not.toHaveBeenCalled();
  });

  it("passes transaction retrieval errors to the error handler", async () => {
    const error = new Error("Database unavailable");
    listWalletTransactions.mockRejectedValue(error);

    const req = {
      user: { businessId: "7" },
      query: {},
    };
    const res = createResponse();
    const next = vi.fn();

    await listWalletTransactionsController(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
