import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  disconnectBusinessWhatsApp,
  getWhatsAppConnectionStatus,
} from "../src/services/whatsapp-connection.service.js";

describe("WhatsApp connection lifecycle service", () => {
  let db;

  beforeEach(() => {
    db = { query: vi.fn() };
  });

  describe("getWhatsAppConnectionStatus", () => {
    it("rejects an invalid business ID", async () => {
      await expect(getWhatsAppConnectionStatus(null, db))
        .rejects.toThrow("A valid business ID is required.");

      expect(db.query).not.toHaveBeenCalled();
    });

    it("returns not_connected when no Meta WhatsApp channel exists", async () => {
      db.query.mockResolvedValue({ rows: [] });

      const result = await getWhatsAppConnectionStatus(12, db);

      expect(result).toEqual({
        status: "not_connected",
        connected: false,
        connection: null,
      });
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("business_id = $1"),
        ["12"],
      );
    });

    it("returns the active connected WhatsApp channel", async () => {
      db.query.mockResolvedValue({
        rows: [{
          id: "31",
          display_name: "Beevo Store",
          address: "+2348012345678",
          connection_mode: "dedicated",
          connection_status: "connected",
          is_active: true,
          verified_at: "2026-11-22T10:00:00.000Z",
        }],
      });

      const result = await getWhatsAppConnectionStatus(12, db);

      expect(result.status).toBe("connected");
      expect(result.connected).toBe(true);
      expect(result.connection).toMatchObject({
        id: "31",
        displayName: "Beevo Store",
        displayNumber: "+2348012345678",
        connectionMode: "dedicated",
      });
    });

    it("reports an ambiguous state when multiple channels are active", async () => {
      db.query.mockResolvedValue({
        rows: [
          { id: "31", is_active: true, connection_status: "connected" },
          { id: "32", is_active: true, connection_status: "connected" },
        ],
      });

      const result = await getWhatsAppConnectionStatus(12, db);

      expect(result.status).toBe("ambiguous");
      expect(result.connected).toBe(false);
      expect(result.connection).toBeNull();
    });

    it("reports a pending connection when the latest channel is pending", async () => {
      db.query.mockResolvedValue({
        rows: [{
          id: "33",
          display_name: "Beevo Store",
          address: "+2348012345678",
          connection_mode: "dedicated",
          connection_status: "pending",
          is_active: false,
          verified_at: null,
        }],
      });

      const result = await getWhatsAppConnectionStatus(12, db);

      expect(result.status).toBe("pending");
      expect(result.connected).toBe(false);
      expect(result.connection.id).toBe("33");
    });
  });

  describe("disconnectBusinessWhatsApp", () => {
    function createTransactionalDb({ channelIds = [], failOnDelete = false } = {}) {
      const client = {
        query: vi.fn(async (sql) => {
          if (/SELECT\s+id\s+FROM business_communication_channels/.test(sql)) {
            return { rows: channelIds.map((id) => ({ id })) };
          }

          if (failOnDelete && sql.includes("DELETE FROM business_communication_channel_credentials")) {
            throw new Error("Credential deletion failed");
          }

          return { rows: [] };
        }),
        release: vi.fn(),
      };

      return {
        client,
        db: { connect: vi.fn().mockResolvedValue(client) },
      };
    }

    it("rejects an invalid business ID", async () => {
      const invalidDb = { connect: vi.fn() };

      await expect(disconnectBusinessWhatsApp("0", invalidDb))
        .rejects.toThrow("A valid business ID is required.");

      expect(invalidDb.connect).not.toHaveBeenCalled();
    });

    it("returns without modifying records when no connection exists", async () => {
      const { db: transactionalDb, client } = createTransactionalDb();

      const result = await disconnectBusinessWhatsApp(12, transactionalDb);

      expect(result).toEqual({ disconnected: false });
      expect(client.query).toHaveBeenCalledWith("BEGIN");
      expect(client.query).toHaveBeenCalledWith("COMMIT");
      expect(client.release).toHaveBeenCalledOnce();
      expect(client.query.mock.calls.some(([sql]) => sql.includes("DELETE FROM"))).toBe(false);
    });

    it("deactivates channels and deletes their encrypted credentials in one transaction", async () => {
      const { db: transactionalDb, client } = createTransactionalDb({
        channelIds: ["31", "32"],
      });

      const result = await disconnectBusinessWhatsApp(12, transactionalDb);

      expect(result).toEqual({
        disconnected: true,
        connectionsUpdated: 2,
      });

      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining("connection_status = 'disconnected'"),
        ["12", ["31", "32"]],
      );

      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM business_communication_channel_credentials"),
        ["12", ["31", "32"]],
      );

      expect(client.query).toHaveBeenCalledWith("COMMIT");
      expect(client.release).toHaveBeenCalledOnce();
    });

    it("rolls back if encrypted credential deletion fails", async () => {
      const { db: transactionalDb, client } = createTransactionalDb({
        channelIds: ["31"],
        failOnDelete: true,
      });

      await expect(disconnectBusinessWhatsApp(12, transactionalDb))
        .rejects.toThrow("Credential deletion failed");

      expect(client.query).toHaveBeenCalledWith("ROLLBACK");
      expect(client.release).toHaveBeenCalledOnce();
      expect(client.query).not.toHaveBeenCalledWith("COMMIT");
    });
  });
});
