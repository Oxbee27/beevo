import { createHmac, timingSafeEqual } from "node:crypto";
import { verifyWalletFunding } from "../services/verify-wallet-funding.service.js";

function verifyPaystackSignature(rawBody, signature, secret) {
  if (
    !Buffer.isBuffer(rawBody) ||
    typeof signature !== "string" ||
    !/^[a-fA-F0-9]{128}$/.test(signature) ||
    typeof secret !== "string" ||
    !secret
  ) {
    return false;
  }

  const expected = createHmac("sha512", secret)
    .update(rawBody)
    .digest();

  const supplied = Buffer.from(signature, "hex");

  return (
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected)
  );
}

export async function handlePaystackWebhook(req, res, next) {
  const secret = process.env.PAYSTACK_SECRET_KEY;

  if (!secret) {
    return res.status(503).json({
      success: false,
      message: "Payment webhook verification is not configured.",
    });
  }

  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({
      success: false,
      message: "Invalid webhook request body.",
    });
  }

  const signature = req.get("x-paystack-signature");

  if (!verifyPaystackSignature(req.body, signature, secret)) {
    return res.status(400).json({
      success: false,
      message: "Webhook signature verification failed.",
    });
  }

  let event;

  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).json({
      success: false,
      message: "Invalid webhook event payload.",
    });
  }

  // Paystack sends other event types too. Acknowledge events that do
  // not concern successful Beevo wallet funding.
  if (event?.event !== "charge.success") {
    return res.status(200).json({
      success: true,
      data: { status: "ignored" },
    });
  }

  const reference = event?.data?.reference;
  const metadata = event?.data?.metadata;
  const businessId = metadata?.business_id;

  // Only process events explicitly created for Beevo wallet funding.
  // The verification service independently checks these details against
  // the stored attempt and Paystack's transaction verification endpoint.
  if (
    metadata?.purpose !== "beevo_wallet_funding" ||
    typeof reference !== "string" ||
    !/^[A-Za-z0-9._=-]{8,150}$/.test(reference) ||
    !/^[1-9]\d{0,18}$/.test(String(businessId ?? "")) ||
    BigInt(String(businessId)) > 9223372036854775807n
  ) {
    return res.status(200).json({
      success: true,
      data: { status: "ignored" },
    });
  }

  try {
    const result = await verifyWalletFunding(
      String(businessId),
      reference,
    );

    return res.status(200).json({
      success: true,
      data: {
        status: result.alreadyCredited ? "already_processed" : "processed",
        reference: result.reference,
      },
    });
  } catch (error) {
    return next(error);
  }
}
