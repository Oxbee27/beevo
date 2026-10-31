import { describe, it, expect } from "vitest";

import { passwordSchema } from "../src/validators/password.schema.js";
import { changePasswordSchema } from "../src/validators/change-password.validator.js";
import { forgotPasswordSchema } from "../src/validators/forgot-password.validator.js";
import { resetPasswordSchema } from "../src/validators/reset-password.validator.js";

const strongPassword = "BeevoSecure@2026";

describe("Beevo password management validation", () => {
  describe("Password strength", () => {
    it("accepts a strong password", () => {
      expect(passwordSchema.safeParse(strongPassword).success).toBe(true);
    });

    it.each([
      "short",
      "lowercase123@",
      "UPPERCASE123@",
      "NoNumbers@",
      "NoSpecial123",
      "Beevo123",
    ])("rejects a weak password: %s", (password) => {
      expect(passwordSchema.safeParse(password).success).toBe(false);
    });
  });

  describe("Change password", () => {
    it("accepts valid password-change data", () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: "OldPassword@123",
        newPassword: strongPassword,
      });

      expect(result.success).toBe(true);
    });

    it("rejects the same current and new password", () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: strongPassword,
        newPassword: strongPassword,
      });

      expect(result.success).toBe(false);
    });

    it("rejects missing current password", () => {
      const result = changePasswordSchema.safeParse({
        newPassword: strongPassword,
      });

      expect(result.success).toBe(false);
    });
  });

  describe("Forgot password", () => {
    it("accepts a valid email address", () => {
      expect(
        forgotPasswordSchema.safeParse({
          email: "user@example.com",
        }).success
      ).toBe(true);
    });

    it("normalizes email addresses", () => {
      const result = forgotPasswordSchema.safeParse({
        email: " USER@EXAMPLE.COM ",
      });

      expect(result.success).toBe(true);
      expect(result.data.email).toBe("user@example.com");
    });

    it("rejects an invalid email address", () => {
      expect(
        forgotPasswordSchema.safeParse({
          email: "not-an-email",
        }).success
      ).toBe(false);
    });
  });

  describe("Reset password", () => {
    it("accepts a valid reset request", () => {
      const result = resetPasswordSchema.safeParse({
        token: "a".repeat(64),
        newPassword: strongPassword,
      });

      expect(result.success).toBe(true);
    });

    it("rejects a missing reset token", () => {
      expect(
        resetPasswordSchema.safeParse({
          token: "",
          newPassword: strongPassword,
        }).success
      ).toBe(false);
    });

    it("rejects a weak new password", () => {
      expect(
        resetPasswordSchema.safeParse({
          token: "a".repeat(64),
          newPassword: "weak",
        }).success
      ).toBe(false);
    });
  });
});
