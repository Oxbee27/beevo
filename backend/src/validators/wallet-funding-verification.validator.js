import { z } from "zod";

export const verifyWalletFundingSchema = z
  .object({
    reference: z
      .string()
      .trim()
      .min(8)
      .max(150)
      .regex(/^[A-Za-z0-9._=-]+$/, "Enter a valid payment reference."),
  })
  .strict();
