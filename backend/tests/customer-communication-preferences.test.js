import { describe, it, expect } from "vitest";
import {
  updateCustomerCommunicationPreferenceSchema,
} from "../src/validators/customer-communication-preference.validator.js";

describe("Customer communication preference validation", () => {
  it("accepts email consent when a source is provided", () => {
    const result = updateCustomerCommunicationPreferenceSchema.safeParse({
      channel: "email",
      consentStatus: "granted",
      consentSource: "website opt-in form",
    });

    expect(result.success).toBe(true);
  });

  it("accepts SMS and WhatsApp preferences", () => {
    for (const channel of ["sms", "whatsapp"]) {
      const result = updateCustomerCommunicationPreferenceSchema.safeParse({
        channel,
        consentStatus: "denied",
      });

      expect(result.success).toBe(true);
    }
  });

  it("rejects granted consent without a source", () => {
    const result = updateCustomerCommunicationPreferenceSchema.safeParse({
      channel: "email",
      consentStatus: "granted",
    });

    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toEqual(["consentSource"]);
  });

  it("rejects unsupported communication channels", () => {
    const result = updateCustomerCommunicationPreferenceSchema.safeParse({
      channel: "telegram",
      consentStatus: "granted",
      consentSource: "website opt-in form",
    });

    expect(result.success).toBe(false);
  });

  it("rejects unsupported consent statuses", () => {
    const result = updateCustomerCommunicationPreferenceSchema.safeParse({
      channel: "email",
      consentStatus: "approved",
    });

    expect(result.success).toBe(false);
  });

  it("rejects unexpected request fields", () => {
    const result = updateCustomerCommunicationPreferenceSchema.safeParse({
      channel: "email",
      consentStatus: "denied",
      customerId: 10,
    });

    expect(result.success).toBe(false);
  });
});
