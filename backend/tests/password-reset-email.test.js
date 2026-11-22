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
      this.emails = { send: sendMock };
    }
  },
}));

import { sendPasswordResetEmail } from "../src/utils/send-password-reset-email.js";

describe("Beevo password-reset email adapter", () => {
  const keys = [
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "FRONTEND_URL",
  ];
  const original = {};

  beforeEach(() => {
    for (const key of keys) {
      original[key] = process.env[key];
    }

    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "Beevo <test@example.com>";
    process.env.FRONTEND_URL = "https://beevo.example.com";

    sendMock.mockReset();
  });

  afterEach(() => {
    for (const key of keys) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  });

  it("sends a password-reset email with the correct reset link", async () => {
    sendMock.mockResolvedValue({
      data: { id: "re_password_reset_101" },
      error: null,
    });

    const result = await sendPasswordResetEmail(
      "owner@example.com",
      "secure-reset-token",
    );

    expect(result).toEqual({ id: "re_password_reset_101" });

    const payload = sendMock.mock.calls[0][0];
    expect(payload.from).toBe("Beevo <test@example.com>");
    expect(payload.to).toEqual(["owner@example.com"]);
    expect(payload.subject).toBe("Reset your Beevo password");
    expect(payload.text).toContain(
      "https://beevo.example.com/reset-password?token=secure-reset-token",
    );
    expect(payload.html).toContain(
      "https://beevo.example.com/reset-password?token=secure-reset-token",
    );
  });

  it("does not send when required configuration is missing", async () => {
    delete process.env.RESEND_API_KEY;

    await expect(
      sendPasswordResetEmail("owner@example.com", "reset-token"),
    ).rejects.toThrow("Password reset email service is not configured.");

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("reports provider errors without exposing provider details", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: "Provider internal failure" },
    });

    await expect(
      sendPasswordResetEmail("owner@example.com", "reset-token"),
    ).rejects.toThrow("Beevo could not send the password reset email.");
  });
});
