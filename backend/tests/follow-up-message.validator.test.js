import { describe, it, expect } from "vitest";
import {
  followUpMessageIdSchema,
  scheduleFollowUpMessageSchema,
} from "../src/validators/follow-up-message.validator.js";

describe("Follow-up message validation", () => {
  it("accepts a valid scheduled email", () => {
    const result = scheduleFollowUpMessageSchema.safeParse({
      channel: "email",
      subject: "Following up on your enquiry",
      body: "Hello, we are following up.",
      scheduledFor: "2030-01-01T10:00:00.000Z",
      idempotencyKey: "email-follow-up-001",
    });

    expect(result.success).toBe(true);
  });

  it("accepts valid SMS and WhatsApp messages without a subject", () => {
    for (const channel of ["sms", "whatsapp"]) {
      const result = scheduleFollowUpMessageSchema.safeParse({
        channel,
        body: "Hello, we are following up.",
        scheduledFor: "2030-01-01T10:00:00.000Z",
      });

      expect(result.success).toBe(true);
    }
  });

  it("requires a subject for email", () => {
    const result = scheduleFollowUpMessageSchema.safeParse({
      channel: "email",
      body: "Hello",
      scheduledFor: "2030-01-01T10:00:00.000Z",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a subject for SMS or WhatsApp", () => {
    const result = scheduleFollowUpMessageSchema.safeParse({
      channel: "sms",
      subject: "Not supported",
      body: "Hello",
      scheduledFor: "2030-01-01T10:00:00.000Z",
    });

    expect(result.success).toBe(false);
  });

  it("rejects unsupported channels and unexpected fields", () => {
    expect(
      scheduleFollowUpMessageSchema.safeParse({
        channel: "telegram",
        body: "Hello",
        scheduledFor: "2030-01-01T10:00:00.000Z",
      }).success,
    ).toBe(false);

    expect(
      scheduleFollowUpMessageSchema.safeParse({
        channel: "email",
        subject: "Hello",
        body: "Hello",
        scheduledFor: "2030-01-01T10:00:00.000Z",
        customerId: 5,
      }).success,
    ).toBe(false);
  });

  it("rejects invalid scheduled dates and short idempotency keys", () => {
    expect(
      scheduleFollowUpMessageSchema.safeParse({
        channel: "sms",
        body: "Hello",
        scheduledFor: "not-a-date",
      }).success,
    ).toBe(false);

    expect(
      scheduleFollowUpMessageSchema.safeParse({
        channel: "sms",
        body: "Hello",
        scheduledFor: "2030-01-01T10:00:00.000Z",
        idempotencyKey: "short",
      }).success,
    ).toBe(false);
  });

  it("accepts only positive integer message IDs", () => {
    expect(followUpMessageIdSchema.safeParse("12").success).toBe(true);
    expect(followUpMessageIdSchema.safeParse("0").success).toBe(false);
    expect(followUpMessageIdSchema.safeParse("abc").success).toBe(false);
  });
});
