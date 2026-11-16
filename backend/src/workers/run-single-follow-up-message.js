import "dotenv/config";
import pool from "../config/database.js";
import { processDueFollowUpMessages } from "./follow-up-message.worker.js";

const messageId = Number(process.env.MESSAGE_ID);
const expectedMessageId = 1;
const expectedRecipient = "ugbamoses7@gmail.com";

let exitCode = 0;

try {
  if (messageId !== expectedMessageId) {
    throw new Error("This test worker only accepts the approved message ID.");
  }

  const result = await pool.query(
    `SELECT id, channel, recipient, status, scheduled_for
     FROM follow_up_messages
     WHERE id = $1`,
    [messageId],
  );

  const message = result.rows[0];

  if (!message) {
    throw new Error("The approved test message was not found.");
  }

  if (
    message.channel !== "email" ||
    message.recipient.toLowerCase() !== expectedRecipient ||
    message.status !== "pending"
  ) {
    throw new Error("The message does not match the approved email test.");
  }

  if (new Date(message.scheduled_for) > new Date()) {
    throw new Error("The scheduled email is not due yet. No message was processed.");
  }

  console.log(`Processing approved email message ${messageId}.`);

  const processingResult = await processDueFollowUpMessages({
    messageId,
    batchSize: 1,
  });

  console.log("Single-message processing result:");
  console.log(JSON.stringify(processingResult, null, 2));
} catch (error) {
  console.error("Single-message test stopped:", error.message);
  exitCode = 1;
} finally {
  try {
    await pool.end();
  } catch (error) {
    console.error("Could not close database connection:", error.message);
    exitCode = 1;
  }
}

process.exitCode = exitCode;
