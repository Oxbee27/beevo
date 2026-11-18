import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { query, connect, clientQuery, release, fetchMock } = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  clientQuery: vi.fn(),
  release: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("../src/config/database.js", () => ({
  default: { query, connect },
}));

import { verifyWalletFunding } from "../src/services/verify-wallet-funding.service.js";

const businessId = "7";
const reference = "BEEVO-12345678-1234-1234-1234-123456789abc";

const attempt = {
  id: "31",
  business_id: businessId,
  reference,
  amount_kobo: "250000",
  currency: "NGN",
  provider: "paystack",
  status: "pending",
  credited_at: null,
};

const payment = {
  status: "success",
  reference,
  amount: 250000,
  currency: "NGN",
  channel: "card",
  paid_at: "2026-11-13T00:00:00.000Z",
  metadata: {
    business_id: businessId,
    purpose: "beevo_wallet_funding",
  },
};

function mockProvider(data = payment) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ status: true, data }),
  });
  vi.stubGlobal("fetch", fetchMock);
}

function mockSuccessfulTransaction(commitError = null) {
  clientQuery
    .mockResolvedValueOnce({ rowCount: null, rows: [] })
    .mockResolvedValueOnce({ rowCount: 1, rows: [attempt] })
    .mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: "12", balance_kobo: "50000", currency: "NGN" }],
    })
    .mockResolvedValueOnce({ rowCount: 1, rows: [] })
    .mockResolvedValueOnce({ rowCount: 1, rows: [] })
    .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "31" }] });

  if (commitError) {
    clientQuery.mockRejectedValueOnce(commitError);
  } else {
    clientQuery.mockResolvedValueOnce({ rowCount: null, rows: [] });
  }
}

describe("Beevo Paystack wallet funding verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PAYSTACK_SECRET_KEY = "sk_test_mock_only";
    connect.mockResolvedValue({ query: clientQuery, release });
    query.mockResolvedValue({ rowCount: 1, rows: [attempt] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PAYSTACK_SECRET_KEY;
  });

  it("credits a verified payment and records its ledger entry", async () => {
    mockProvider();
    mockSuccessfulTransaction();

    const result = await verifyWalletFunding(businessId, reference);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/transaction/verify/"),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer sk_test_mock_only",
        }),
      }),
    );

    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO wallet_transactions"),
      expect.arrayContaining([
        "12", businessId, "31", "250000", "300000", reference,
      ]),
    );

    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();

    expect(result).toEqual({
      reference,
      amountKobo: "250000",
      balanceAfterKobo: "300000",
      currency: "NGN",
      alreadyCredited: false,
    });
  });

  it("rejects an unsafe numeric amount returned by Paystack", async () => {
    query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        ...attempt,
        amount_kobo: "9007199254740992",
      }],
    });

    mockProvider({
      ...payment,
      amount: 9007199254740992,
    });

    await expect(
      verifyWalletFunding(businessId, reference),
    ).rejects.toMatchObject({ status: 409 });

    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects a payment that Paystack has not marked successful", async () => {
    mockProvider({ ...payment, status: "pending" });

    await expect(
      verifyWalletFunding(businessId, reference),
    ).rejects.toMatchObject({ status: 409 });

    expect(connect).not.toHaveBeenCalled();
  });

  it.each([
    ["amount", { ...payment, amount: 250001 }],
    ["currency", { ...payment, currency: "USD" }],
    ["reference", { ...payment, reference: "OTHER-REFERENCE" }],
    ["business", {
      ...payment,
      metadata: { ...payment.metadata, business_id: "999" },
    }],
    ["purpose", {
      ...payment,
      metadata: { ...payment.metadata, purpose: "another_product" },
    }],
  ])("rejects a mismatched provider %s", async (_field, providerPayment) => {
    mockProvider(providerPayment);

    await expect(
      verifyWalletFunding(businessId, reference),
    ).rejects.toMatchObject({ status: 409 });

    expect(connect).not.toHaveBeenCalled();
  });

  it("does not verify a reference belonging to another business", async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(
      verifyWalletFunding("999", reference),
    ).rejects.toMatchObject({ status: 404 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("returns the existing ledger result without crediting twice", async () => {
    query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          ...attempt,
          status: "successful",
          credited_at: new Date(),
        }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          amount_kobo: "250000",
          balance_after_kobo: "300000",
          transaction_type: "credit",
          reference,
        }],
      });

    const result = await verifyWalletFunding(businessId, reference);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(result.alreadyCredited).toBe(true);
    expect(result.balanceAfterKobo).toBe("300000");
  });

  it("returns the existing credit when another verification wins the row lock", async () => {
    mockProvider();

    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          ...attempt,
          status: "successful",
          credited_at: new Date(),
        }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          amount_kobo: "250000",
          balance_after_kobo: "300000",
          transaction_type: "credit",
          reference,
        }],
      })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });

    const result = await verifyWalletFunding(businessId, reference);

    expect(result).toEqual({
      reference,
      amountKobo: "250000",
      balanceAfterKobo: "300000",
      currency: "NGN",
      alreadyCredited: true,
    });

    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
    expect(clientQuery).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO wallet_transactions"),
      expect.anything(),
    );
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back and releases the connection when BEGIN fails", async () => {
    mockProvider();

    const beginError = new Error("Simulated BEGIN failure");

    clientQuery
      .mockRejectedValueOnce(beginError)
      .mockResolvedValueOnce({ rowCount: null, rows: [] });

    await expect(
      verifyWalletFunding(businessId, reference),
    ).rejects.toBe(beginError);

    expect(clientQuery).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(clientQuery).toHaveBeenNthCalledWith(2, "ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("rolls back and releases the connection when COMMIT fails", async () => {
    mockProvider();

    const commitError = new Error("Simulated COMMIT failure");
    mockSuccessfulTransaction(commitError);
    clientQuery.mockResolvedValueOnce({ rowCount: null, rows: [] });

    await expect(
      verifyWalletFunding(businessId, reference),
    ).rejects.toBe(commitError);

    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("rolls back when ledger insertion fails", async () => {
    mockProvider();

    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [attempt] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "12", balance_kobo: "50000", currency: "NGN" }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockRejectedValueOnce(new Error("Simulated ledger insert failure"))
      .mockResolvedValueOnce({ rowCount: null, rows: [] });

    await expect(
      verifyWalletFunding(businessId, reference),
    ).rejects.toThrow("Simulated ledger insert failure");

    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(clientQuery).not.toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });


  it("discards the database connection when rollback fails", async () => {
    mockProvider();

    const ledgerError = new Error("Simulated ledger insert failure");
    const rollbackError = new Error("Simulated rollback failure");

    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [attempt] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "12", balance_kobo: "50000", currency: "NGN" }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockRejectedValueOnce(ledgerError)
      .mockRejectedValueOnce(rollbackError);

    await expect(
      verifyWalletFunding(businessId, reference),
    ).rejects.toBe(ledgerError);

    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledWith(rollbackError);
  });

  it("rejects a locked attempt whose currency changed before crediting", async () => {
    mockProvider();

    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ ...attempt, currency: "USD" }],
      })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });

    await expect(
      verifyWalletFunding(businessId, reference),
    ).rejects.toMatchObject({
      status: 409,
      message: "Wallet funding attempt changed during verification.",
    });

    expect(clientQuery).not.toHaveBeenCalledWith(
      expect.stringContaining("FROM business_wallets"),
      expect.anything(),
    );
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rejects a locked attempt from an unexpected provider", async () => {
    mockProvider();

    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ ...attempt, provider: "other" }],
      })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });

    await expect(
      verifyWalletFunding(businessId, reference),
    ).rejects.toMatchObject({ status: 409 });

    expect(clientQuery).not.toHaveBeenCalledWith(
      expect.stringContaining("FROM business_wallets"),
      expect.anything(),
    );
  });

  it("rejects a credit that would exceed the PostgreSQL BIGINT balance limit", async () => {
    mockProvider();

    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [attempt] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: "12",
          balance_kobo: "9223372036854775807",
          currency: "NGN",
        }],
      })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });

    await expect(
      verifyWalletFunding(businessId, reference),
    ).rejects.toMatchObject({
      status: 409,
      message: "Wallet balance exceeds the supported limit.",
    });

    expect(
      clientQuery.mock.calls.some(([sql]) =>
        sql.includes("UPDATE business_wallets"),
      ),
    ).toBe(false);

    expect(
      clientQuery.mock.calls.some(([sql]) =>
        sql.includes("INSERT INTO wallet_transactions"),
      ),
    ).toBe(false);

    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("does not insert a ledger entry if the wallet update affects no row", async () => {
    mockProvider();

    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [attempt] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "12", balance_kobo: "50000", currency: "NGN" }],
      })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });

    await expect(
      verifyWalletFunding(businessId, reference),
    ).rejects.toMatchObject({
      status: 409,
      message: "Wallet balance could not be updated.",
    });

    expect(
      clientQuery.mock.calls.some(([sql]) =>
        sql.includes("INSERT INTO wallet_transactions"),
      ),
    ).toBe(false);

    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rejects an already-credited attempt with an inconsistent ledger amount", async () => {
    query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          ...attempt,
          status: "successful",
          credited_at: new Date(),
        }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          amount_kobo: "100000",
          balance_after_kobo: "150000",
          transaction_type: "credit",
          reference,
        }],
      });

    await expect(
      verifyWalletFunding(businessId, reference),
    ).rejects.toMatchObject({
      status: 500,
      message: "Credited payment ledger record is inconsistent.",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects an already-credited attempt with a non-credit ledger entry", async () => {
    query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          ...attempt,
          status: "successful",
          credited_at: new Date(),
        }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          amount_kobo: "250000",
          balance_after_kobo: "300000",
          transaction_type: "debit",
          reference,
        }],
      });

    await expect(
      verifyWalletFunding(businessId, reference),
    ).rejects.toMatchObject({ status: 500 });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not query the database when Paystack is not configured", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;

    await expect(
      verifyWalletFunding(businessId, reference),
    ).rejects.toMatchObject({ status: 503 });

    expect(query).not.toHaveBeenCalled();
  });
});
