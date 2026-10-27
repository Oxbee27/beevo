
import { readFile } from "node:fs/promises";
import pool from "../config/database.js";

try {
  const schema = await readFile(
    new URL("./schema.sql", import.meta.url),
    "utf8"
  );

  await pool.query("BEGIN");

  try {
    await pool.query(schema);
    await pool.query("COMMIT");
    console.log("Beevo database schema created successfully.");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
} catch (error) {
  console.error("Database migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
