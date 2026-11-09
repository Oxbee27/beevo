import { z } from "zod";

export const updateCustomerCommunicationPreferenceSchema = z
  .object({
    channel: z.enum(["email", "sms", "whatsapp"]),
    consentStatus: z.enum(["unknown", "granted", "denied"]),
    consentSource: z.string().trim().min(2).max(100).optional(),
  })
  .strict()
  .superRefine((data, context) => {
    if (data.consentStatus === "granted" && !data.consentSource) {
      context.addIssue({
        code: "custom",
        path: ["consentSource"],
        message: "Please provide the source of the customer's consent.",
      });
    }
  });
