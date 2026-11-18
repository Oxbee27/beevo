import { z } from "zod";

const MAX_BIGINT = 9223372036854775807n;

export const initializeWalletFundingSchema = z
  .object({
    amountKobo: z
      .string()
      .refine(
        (value) =>
          /^[1-9]\d{0,18}$/.test(value) &&
          BigInt(value) <= MAX_BIGINT,
        {
          message: "Enter a valid funding amount.",
        },
      ),
    idempotencyKey: z.string().trim().min(8).max(150),
  })
  .strict();
