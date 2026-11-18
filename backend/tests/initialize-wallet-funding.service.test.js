import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { query } = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("../src/config/database.js", () => ({
  default: { query },
}));

import { initializeWalletFunding } from "../src/services/initialize-wallet-funding.service.js";

const BUSINESS_ID = "7";
const USER_ID = "12";
const AMOUNT = "50000";
const IDEMPOTENCY_KEY = "funding-request-123";
const REFERENCE = "BEEVO-test-reference-123";
const CHECKOUT_URL = "https://checkout.paystack.com/test-session";
const ACCESS_CODE = "access-test-123";

const input = {
  amountKobo: AMOUNT,
  idempotencyKey: IDEMPOTENCY_KEY,
};

const successfulProviderResponse = () => ({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue({
    status: true,
    message: "Authorization URL created",
    data: {
      authorization_url: CHECKOUT_URL,
      access_code: ACCESS_CODE,
      reference: REFERENCE,
    },
  }),
});

function prepareNewAttempt() {
  query
    .mockResolvedValueOnce({
      rows: [{ email: "owner@example.com" }],
    })
    .mockResolvedValueOnce({
      rows: [],
    })
    .mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: "45",
        reference: REFERENCE,
        amount_kobo: AMOUNT,
        status: "pending",
        gateway_response: null,
      }],
    })
    .mockResolvedValueOnce({
      rowCount: 1,
      rows: [],
    });
}

describe("Beevo wallet funding initialization service", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_fake_key");
    vi.stubEnv("PAYSTACK_CALLBACK_URL", "");

    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("initializes a Paystack checkout and persists its safe response", async () => {
    prepareNewAttempt();
    fetch.mockResolvedValueOnce(successfulProviderResponse());

    const result = await initializeWalletFunding(
      BUSINESS_ID,
      USER_ID,
      input,
    );

    expect(result).toEqual({
      reference: REFERENCE,
      amountKobo: AMOUNT,
      currency: "NGN",
      authorizationUrl: CHECKOUT_URL,
      accessCode: ACCESS_CODE,
      alreadyInitialized: false,
    });

    expect(query).toHaveBeenCalledTimes(4);

    expect(query.mock.calls[0][0]).toContain(
      "role = 'owner'",
    );
    expect(query.mock.calls[0][1]).toEqual([
      USER_ID,
      BUSINESS_ID,
    ]);

    expect(query.mock.calls[1][0]).toContain(
      "idempotency_key = $2",
    );

    expect(query.mock.calls[2][0]).toContain(
      "ON CONFLICT (business_id, idempotency_key)",
    );
    expect(query.mock.calls[2][1]).toEqual([
      BUSINESS_ID,
      expect.stringMatching(/^BEEVO-/),
      IDEMPOTENCY_KEY,
      AMOUNT,
    ]);

    const [url, options] = fetch.mock.calls[0];

    expect(url).toBe(
      "https://api.paystack.co/transaction/initialize",
    );
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe(
      "Bearer sk_test_fake_key",
    );

    const payload = JSON.parse(options.body);

    expect(payload).toMatchObject({
      email: "owner@example.com",
      amount: AMOUNT,
      currency: "NGN",
      reference: REFERENCE,
      metadata: {
        business_id: BUSINESS_ID,
        purpose: "beevo_wallet_funding",
      },
    });

    expect(query.mock.calls[3][0]).toContain(
      "provider_reference = $2",
    );

    const savedResponse = JSON.parse(
      query.mock.calls[3][1][2],
    );

    expect(savedResponse).toEqual({
      authorization_url: CHECKOUT_URL,
      access_code: ACCESS_CODE,
      reference: REFERENCE,
    });
  });

  it("includes the configured callback URL in the Paystack request", async () => {
    vi.stubEnv(
      "PAYSTACK_CALLBACK_URL",
      "https://beevo.example.com/wallet/callback",
    );

    prepareNewAttempt();
    fetch.mockResolvedValueOnce(successfulProviderResponse());

    await initializeWalletFunding(BUSINESS_ID, USER_ID, input);

    const payload = JSON.parse(fetch.mock.calls[0][1].body);

    expect(payload.callback_url).toBe(
      "https://beevo.example.com/wallet/callback",
    );
  });

  it("returns an existing checkout for an identical idempotent request", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ email: "owner@example.com" }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "45",
          business_id: BUSINESS_ID,
          reference: REFERENCE,
          amount_kobo: AMOUNT,
          status: "pending",
          gateway_response: {
            authorization_url: CHECKOUT_URL,
            access_code: ACCESS_CODE,
          },
        }],
      });

    const result = await initializeWalletFunding(
      BUSINESS_ID,
      USER_ID,
      input,
    );

    expect(result).toEqual({
      reference: REFERENCE,
      amountKobo: AMOUNT,
      currency: "NGN",
      authorizationUrl: CHECKOUT_URL,
      accessCode: ACCESS_CODE,
      alreadyInitialized: true,
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("rejects reuse of an idempotency key with a different amount", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ email: "owner@example.com" }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "45",
          reference: REFERENCE,
          amount_kobo: "75000",
          status: "pending",
          gateway_response: null,
        }],
      });

    await expect(
      initializeWalletFunding(BUSINESS_ID, USER_ID, input),
    ).rejects.toMatchObject({
      status: 409,
      message: "Idempotency key reused with a different amount.",
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("rejects an existing pending attempt without confirmed checkout details", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ email: "owner@example.com" }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "45",
          reference: REFERENCE,
          amount_kobo: AMOUNT,
          status: "pending",
          gateway_response: null,
        }],
      });

    await expect(
      initializeWalletFunding(BUSINESS_ID, USER_ID, input),
    ).rejects.toMatchObject({
      status: 409,
      message: "The existing funding request is still being processed.",
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects requests when Paystack is not configured", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "");

    await expect(
      initializeWalletFunding(BUSINESS_ID, USER_ID, input),
    ).rejects.toMatchObject({
      status: 503,
      message: "Paystack is not configured.",
    });

    expect(query).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["missing owner", []],
    ["invalid owner email", [{ email: "invalid-email" }]],
    ["empty owner email", [{ email: "" }]],
  ])("rejects a request with %s details", async (_label, rows) => {
    query.mockResolvedValueOnce({ rows });

    await expect(
      initializeWalletFunding(BUSINESS_ID, USER_ID, input),
    ).rejects.toMatchObject({
      status: 422,
      message: "The business owner email is unavailable.",
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("marks an attempt failed when Paystack explicitly rejects initialization", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ email: "owner@example.com" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: "45",
          reference: REFERENCE,
          amount_kobo: AMOUNT,
          status: "pending",
        }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({
        status: false,
        message: "Invalid request",
      }),
    });

    await expect(
      initializeWalletFunding(BUSINESS_ID, USER_ID, input),
    ).rejects.toMatchObject({
      status: 502,
      message: "Paystack rejected the funding request.",
    });

    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[3][0]).toContain(
      "status = 'failed'",
    );

    const savedFailure = JSON.parse(
      query.mock.calls[3][1][1],
    );

    expect(savedFailure).toMatchObject({
      message: "Invalid request",
      http_status: 400,
    });
  });

  it("keeps the attempt pending when the provider request cannot be confirmed", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ email: "owner@example.com" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: "45",
          reference: REFERENCE,
          amount_kobo: AMOUNT,
          status: "pending",
        }],
      });

    fetch.mockRejectedValueOnce(new Error("Network timeout"));

    await expect(
      initializeWalletFunding(BUSINESS_ID, USER_ID, input),
    ).rejects.toMatchObject({
      status: 503,
      message: "Paystack initialization could not be confirmed.",
    });

    // No failure update: the provider may have received the request.
    expect(query).toHaveBeenCalledTimes(3);
  });

  it.each([
    [
      "an untrusted checkout host",
      {
        authorization_url: "https://malicious.example.com/pay",
        access_code: ACCESS_CODE,
        reference: REFERENCE,
      },
    ],
    [
      "an HTTP checkout URL",
      {
        authorization_url: "http://checkout.paystack.com/session",
        access_code: ACCESS_CODE,
        reference: REFERENCE,
      },
    ],
    [
      "a mismatched reference",
      {
        authorization_url: CHECKOUT_URL,
        access_code: ACCESS_CODE,
        reference: "BEEVO-different-reference",
      },
    ],
    [
      "a missing access code",
      {
        authorization_url: CHECKOUT_URL,
        reference: REFERENCE,
      },
    ],
  ])("rejects provider responses containing %s", async (_label, data) => {
    query
      .mockResolvedValueOnce({
        rows: [{ email: "owner@example.com" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: "45",
          reference: REFERENCE,
          amount_kobo: AMOUNT,
          status: "pending",
        }],
      });

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        status: true,
        data,
      }),
    });

    await expect(
      initializeWalletFunding(BUSINESS_ID, USER_ID, input),
    ).rejects.toMatchObject({
      status: 502,
      message: "Paystack returned an unexpected checkout response.",
    });

    // Preserve the pending attempt for reconciliation.
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("preserves the pending attempt if checkout details cannot be saved", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ email: "owner@example.com" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: "45",
          reference: REFERENCE,
          amount_kobo: AMOUNT,
          status: "pending",
        }],
      })
      .mockRejectedValueOnce(new Error("Database unavailable"));

    fetch.mockResolvedValueOnce(successfulProviderResponse());

    await expect(
      initializeWalletFunding(BUSINESS_ID, USER_ID, input),
    ).rejects.toMatchObject({
      status: 503,
      message: "Checkout persistence failed.",
    });

    expect(query).toHaveBeenCalledTimes(4);
  });

  it("rejects checkout initialization when persistence updates zero rows", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ email: "owner@example.com" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: "45",
          reference: REFERENCE,
          amount_kobo: AMOUNT,
          status: "pending",
        }],
      })
      .mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      });

    fetch.mockResolvedValueOnce(successfulProviderResponse());

    await expect(
      initializeWalletFunding(BUSINESS_ID, USER_ID, input),
    ).rejects.toMatchObject({
      status: 503,
      message: "Checkout persistence failed.",
    });

    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[3][0]).toContain("RETURNING id");
  });

  it("returns a controlled error when failure-status persistence throws", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ email: "owner@example.com" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: "45",
          reference: REFERENCE,
          amount_kobo: AMOUNT,
          status: "pending",
        }],
      })
      .mockRejectedValueOnce(new Error("Simulated database failure"));

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({
        status: false,
        message: "Invalid request",
      }),
    });

    await expect(
      initializeWalletFunding(BUSINESS_ID, USER_ID, input),
    ).rejects.toMatchObject({
      status: 503,
      message: "Funding attempt failure could not be persisted.",
    });

    expect(query).toHaveBeenCalledTimes(4);
  });

  it("does not report a normal provider rejection when failure persistence affects no row", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ email: "owner@example.com" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: "45",
          reference: REFERENCE,
          amount_kobo: AMOUNT,
          status: "pending",
        }],
      })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({
        status: false,
        message: "Invalid request",
      }),
    });

    await expect(
      initializeWalletFunding(BUSINESS_ID, USER_ID, input),
    ).rejects.toMatchObject({
      status: 503,
      message: "Funding attempt failure could not be persisted.",
    });

    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[3][0]).toContain("RETURNING id");
  });

  it("returns the concurrent request's existing checkout when another request inserted the key", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ email: "owner@example.com" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "45",
          business_id: BUSINESS_ID,
          reference: REFERENCE,
          amount_kobo: AMOUNT,
          status: "pending",
          gateway_response: {
            authorization_url: CHECKOUT_URL,
            access_code: ACCESS_CODE,
          },
        }],
      });

    const result = await initializeWalletFunding(
      BUSINESS_ID,
      USER_ID,
      input,
    );

    expect(result).toMatchObject({
      reference: REFERENCE,
      amountKobo: AMOUNT,
      authorizationUrl: CHECKOUT_URL,
      alreadyInitialized: true,
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(4);
  });

  it("rejects a concurrent request when the existing key has a different amount", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ email: "owner@example.com" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "45",
          reference: REFERENCE,
          amount_kobo: "75000",
          status: "pending",
          gateway_response: null,
        }],
      });

    await expect(
      initializeWalletFunding(BUSINESS_ID, USER_ID, input),
    ).rejects.toMatchObject({
      status: 409,
      message: "Funding request conflict.",
    });

    expect(fetch).not.toHaveBeenCalled();
  });
});
