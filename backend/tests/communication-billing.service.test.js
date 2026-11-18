import { describe, it, expect, vi } from "vitest";

import {
  calculateSmsSegments,
  reserveCommunicationFunds,
  captureCommunicationReservation,
  releaseCommunicationReservation,
} from "../src/services/communication-billing.service.js";

const message = {
  id: "101",
  business_id: "7",
  attempt_count: 1,
  channel: "email",
  body: "Thank you for your enquiry.",
};

function createReservationHarness({
  rate = { channel: "email", unit_name: "message", rate_kobo: "10" },
  wallet = { id: "wallet-7", balance_kobo: "1000", currency: "NGN" },
  reserved = "0",
  inserted = {
    id: "reservation-101",
    amount_kobo: "10",
    status: "reserved",
  },
  existing = null,
} = {}) {
  const queries = [];

  const client = {
    release: vi.fn(),
    query: vi.fn(async (sql) => {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push(normalized);

      if (normalized === "BEGIN" || normalized === "COMMIT" || normalized === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }

      if (normalized.startsWith("SELECT channel, unit_name")) {
        return { rows: rate ? [rate] : [], rowCount: rate ? 1 : 0 };
      }

      if (normalized.startsWith("SELECT id, balance_kobo, currency")) {
        return { rows: wallet ? [wallet] : [], rowCount: wallet ? 1 : 0 };
      }

      if (normalized.includes("SUM(amount_kobo)")) {
        return { rows: [{ reserved_kobo: reserved }], rowCount: 1 };
      }

      if (normalized.startsWith("INSERT INTO wallet_reservations")) {
        return {
          rows: inserted ? [inserted] : [],
          rowCount: inserted ? 1 : 0,
        };
      }

      if (normalized.startsWith("SELECT id, amount_kobo, status, channel")) {
        return {
          rows: existing ? [existing] : [],
          rowCount: existing ? 1 : 0,
        };
      }

      throw new Error(`Unexpected reservation SQL: ${normalized}`);
    }),
  };

  return {
    client,
    queries,
    db: { connect: vi.fn(async () => client) },
  };
}

function createCaptureHarness({
  reservation = {
    id: "reservation-101",
    wallet_id: "wallet-7",
    business_id: "7",
    message_id: "101",
    attempt_number: 1,
    channel: "email",
    unit_count: 1,
    unit_rate_kobo: "10",
    amount_kobo: "10",
    status: "reserved",
  },
  wallet = { id: "wallet-7", balance_kobo: "1000" },
  ledger = { id: "ledger-101" },
  reservationUpdate = true,
} = {}) {
  const queries = [];

  const client = {
    query: vi.fn(async (sql) => {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push(normalized);

      if (normalized.startsWith("SELECT * FROM wallet_reservations")) {
        return {
          rows: reservation ? [reservation] : [],
          rowCount: reservation ? 1 : 0,
        };
      }

      if (normalized.startsWith("SELECT id FROM wallet_transactions")) {
        return { rows: ledger ? [ledger] : [], rowCount: ledger ? 1 : 0 };
      }

      if (normalized.startsWith("SELECT id, balance_kobo")) {
        return { rows: wallet ? [wallet] : [], rowCount: wallet ? 1 : 0 };
      }

      if (normalized.startsWith("UPDATE business_wallets")) {
        return { rows: [{ id: "wallet-7" }], rowCount: 1 };
      }

      if (normalized.startsWith("INSERT INTO wallet_transactions")) {
        return { rows: [{ id: "ledger-101" }], rowCount: 1 };
      }

      if (normalized.startsWith("UPDATE wallet_reservations")) {
        return {
          rows: reservationUpdate ? [{ id: reservation.id }] : [],
          rowCount: reservationUpdate ? 1 : 0,
        };
      }

      throw new Error(`Unexpected capture SQL: ${normalized}`);
    }),
  };

  return { client, queries };
}

describe("Communication billing service", () => {
  describe("calculateSmsSegments", () => {
    it("counts GSM messages up to 160 septets as one segment", () => {
      expect(calculateSmsSegments("A".repeat(160))).toBe(1);
    });

    it("uses 153 septets per concatenated GSM segment", () => {
      expect(calculateSmsSegments("A".repeat(161))).toBe(2);
      expect(calculateSmsSegments("A".repeat(306))).toBe(2);
      expect(calculateSmsSegments("A".repeat(307))).toBe(3);
    });

    it("counts GSM extended characters as two septets", () => {
      expect(calculateSmsSegments("^".repeat(80))).toBe(1);
      expect(calculateSmsSegments("^".repeat(81))).toBe(2);
    });

    it("uses Unicode limits when a message contains non-GSM characters", () => {
      expect(calculateSmsSegments("界".repeat(70))).toBe(1);
      expect(calculateSmsSegments("界".repeat(71))).toBe(2);
    });

    it("counts supplementary Unicode characters as two UTF-16 code units", () => {
      expect(calculateSmsSegments("😀".repeat(35))).toBe(1);
      expect(calculateSmsSegments("😀".repeat(36))).toBe(2);
    });

    it("rejects empty and non-string message bodies", () => {
      for (const body of ["", null, undefined, 123]) {
        expect(() => calculateSmsSegments(body)).toThrow(
          "The SMS message must contain text.",
        );
      }
    });
  });

  describe("reserveCommunicationFunds", () => {
    it("reserves funds and returns the reservation details", async () => {
      const harness = createReservationHarness();

      const result = await reserveCommunicationFunds(harness.db, message);

      expect(result).toEqual({
        reservationId: "reservation-101",
        amountKobo: "10",
        unitCount: 1,
        unitRateKobo: "10",
      });
      expect(harness.queries).toContain("BEGIN");
      expect(harness.queries).toContain("COMMIT");
      expect(harness.client.release).toHaveBeenCalledOnce();
    });

    it("calculates SMS reservation cost from the number of segments", async () => {
      const smsMessage = {
        ...message,
        channel: "sms",
        body: "A".repeat(161),
      };

      const harness = createReservationHarness({
        rate: { channel: "sms", unit_name: "segment", rate_kobo: "5" },
        inserted: {
          id: "reservation-sms",
          amount_kobo: "10",
          status: "reserved",
        },
      });

      const result = await reserveCommunicationFunds(harness.db, smsMessage);

      expect(result.unitCount).toBe(2);
      expect(result.amountKobo).toBe("10");
    });

    it("rejects an unavailable channel rate and rolls back", async () => {
      const harness = createReservationHarness({ rate: null });

      await expect(
        reserveCommunicationFunds(harness.db, message),
      ).rejects.toMatchObject({
        code: "COMMUNICATION_RATE_UNAVAILABLE",
        status: 503,
      });

      expect(harness.queries).toContain("ROLLBACK");
      expect(harness.client.release).toHaveBeenCalledOnce();
    });

    it("rejects insufficient available wallet balance", async () => {
      const harness = createReservationHarness({
        wallet: { id: "wallet-7", balance_kobo: "100", currency: "NGN" },
        reserved: "95",
      });

      await expect(
        reserveCommunicationFunds(harness.db, message),
      ).rejects.toMatchObject({
        code: "INSUFFICIENT_COMMUNICATION_BALANCE",
        status: 402,
      });

      expect(harness.queries).toContain("ROLLBACK");
      expect(
        harness.queries.some((query) =>
          query.startsWith("INSERT INTO wallet_reservations"),
        ),
      ).toBe(false);
    });

    it("rejects a non-NGN wallet", async () => {
      const harness = createReservationHarness({
        wallet: { id: "wallet-7", balance_kobo: "1000", currency: "USD" },
      });

      await expect(
        reserveCommunicationFunds(harness.db, message),
      ).rejects.toMatchObject({
        code: "UNSUPPORTED_WALLET_CURRENCY",
      });
    });

    it("rejects a rate configured with the wrong billing unit", async () => {
      const harness = createReservationHarness({
        rate: { channel: "email", unit_name: "segment", rate_kobo: "10" },
      });

      await expect(
        reserveCommunicationFunds(harness.db, message),
      ).rejects.toMatchObject({
        code: "INVALID_COMMUNICATION_RATE",
      });
    });

    it("returns an existing matching reservation idempotently", async () => {
      const harness = createReservationHarness({
        inserted: null,
        existing: {
          id: "reservation-existing",
          amount_kobo: "10",
          status: "reserved",
          channel: "email",
          unit_count: 1,
          unit_rate_kobo: "10",
        },
      });

      const result = await reserveCommunicationFunds(harness.db, message);

      expect(result.reservationId).toBe("reservation-existing");
      expect(result.amountKobo).toBe("10");
      expect(harness.queries).toContain("COMMIT");
    });

    it("rejects a conflicting existing reservation", async () => {
      const harness = createReservationHarness({
        inserted: null,
        existing: {
          id: "reservation-existing",
          amount_kobo: "10",
          status: "released",
          channel: "email",
          unit_count: 1,
          unit_rate_kobo: "10",
        },
      });

      await expect(
        reserveCommunicationFunds(harness.db, message),
      ).rejects.toMatchObject({
        code: "COMMUNICATION_RESERVATION_CONFLICT",
        status: 409,
      });

      expect(harness.queries).toContain("ROLLBACK");
    });
  });

  describe("captureCommunicationReservation", () => {
    it("debits the wallet, writes a ledger entry and captures the reservation", async () => {
      const harness = createCaptureHarness();

      const result = await captureCommunicationReservation(
        harness.client,
        message,
      );

      expect(result).toEqual({
        reservationId: "reservation-101",
        ledgerId: "ledger-101",
        alreadyCaptured: false,
      });
      expect(
        harness.queries.some((query) =>
          query.startsWith("UPDATE business_wallets"),
        ),
      ).toBe(true);
      expect(
        harness.queries.some((query) =>
          query.startsWith("INSERT INTO wallet_transactions"),
        ),
      ).toBe(true);
      expect(
        harness.queries.some((query) =>
          query.includes("SET status = 'captured'"),
        ),
      ).toBe(true);
    });

    it("does not debit twice when the reservation is already captured", async () => {
      const harness = createCaptureHarness({
        reservation: {
          id: "reservation-101",
          status: "captured",
        },
        ledger: { id: "ledger-existing" },
      });

      const result = await captureCommunicationReservation(
        harness.client,
        message,
      );

      expect(result).toEqual({
        reservationId: "reservation-101",
        ledgerId: "ledger-existing",
        alreadyCaptured: true,
      });
      expect(
        harness.queries.some((query) =>
          query.startsWith("UPDATE business_wallets"),
        ),
      ).toBe(false);
      expect(
        harness.queries.some((query) =>
          query.startsWith("INSERT INTO wallet_transactions"),
        ),
      ).toBe(false);
    });

    it("rejects a released reservation", async () => {
      const harness = createCaptureHarness({
        reservation: {
          id: "reservation-101",
          status: "released",
        },
      });

      await expect(
        captureCommunicationReservation(harness.client, message),
      ).rejects.toMatchObject({
        code: "COMMUNICATION_RESERVATION_RELEASED",
      });
    });

    it("rejects capture when the wallet balance is insufficient", async () => {
      const harness = createCaptureHarness({
        wallet: { id: "wallet-7", balance_kobo: "5" },
      });

      await expect(
        captureCommunicationReservation(harness.client, message),
      ).rejects.toMatchObject({
        code: "COMMUNICATION_CAPTURE_INSUFFICIENT_BALANCE",
      });

      expect(
        harness.queries.some((query) =>
          query.startsWith("INSERT INTO wallet_transactions"),
        ),
      ).toBe(false);
    });
  });

  describe("releaseCommunicationReservation", () => {
    it("releases a reserved attempt", async () => {
      const client = {
        query: vi.fn().mockResolvedValue({
          rows: [{ id: "reservation-101" }],
          rowCount: 1,
        }),
      };

      await expect(
        releaseCommunicationReservation(client, message),
      ).resolves.toBe(true);

      expect(client.query).toHaveBeenCalledOnce();
      expect(client.query.mock.calls[0][0]).toContain(
        "AND status = 'reserved'",
      );
    });

    it("returns false when no active reservation can be released", async () => {
      const client = {
        query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      };

      await expect(
        releaseCommunicationReservation(client, message),
      ).resolves.toBe(false);
    });
  });
});
