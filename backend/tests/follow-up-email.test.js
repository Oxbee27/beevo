import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    constructor() {
      this.emails = {
        send: sendMock,
      };
    }
  },
}));

import { sendFollowUpEmail } from "../src/utils/send-follow-up-email.js";

describe("Beevo follow-up email adapter", () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFromEmail = process.env.RESEND_FROM_EMAIL;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "Beevo <test@example.com>";
    sendMock.mockReset();
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalApiKey;
    }

    if (originalFromEmail === undefined) {
      delete process.env.RESEND_FROM_EMAIL;
    } else {
      process.env.RESEND_FROM_EMAIL = originalFromEmail;
    }
  });

  it("sends a follow-up email and returns the provider message ID", async () => {
    sendMock.mockResolvedValue({
      data: { id: "re_test_123" },
      error: null,
    });

    const result = await sendFollowUpEmail({
      to: "customer@example.com",
      subject: "Your enquiry follow-up",
      body: "Hello customer,\nWe are following up.",
    });

    expect(result).toEqual({
      provider: "resend",
      providerMessageId: "re_test_123",
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Beevo <test@example.com>",
        to: ["customer@example.com"],
        subject: "Your enquiry follow-up",
        text: "Hello customer,\nWe are following up.",
      }),
    );
  });

  it("escapes HTML in the email body", async () => {
    sendMock.mockResolvedValue({
      data: { id: "re_test_456" },
      error: null,
    });

    await sendFollowUpEmail({
      to: "customer@example.com",
      subject: "Test",
      body: "<script>alert('test')</script>",
    });

    const html = sendMock.mock.calls[0][0].html;

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("reports provider errors without exposing provider details to the caller", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: "Provider failure" },
    });

    await expect(
      sendFollowUpEmail({
        to: "customer@example.com",
        subject: "Test",
        body: "Test body",
      }),
    ).rejects.toThrow("Beevo could not deliver the email.");
  });

  it("rejects when the Resend configuration is missing", async () => {
    delete process.env.RESEND_API_KEY;

    await expect(
      sendFollowUpEmail({
        to: "customer@example.com",
        subject: "Test",
        body: "Test body",
      }),
    ).rejects.toThrow("The email delivery service is not configured.");

    expect(sendMock).not.toHaveBeenCalled();
  });
});
