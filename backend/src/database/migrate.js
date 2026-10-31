import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import pool from "../config/database.js";

const MIGRATIONS_DIR = new URL("./migrations/", import.meta.url);
const LOCK_ID = 741852963;

let client;
let lockAcquired = false;

try {
  client = await pool.connect();

  // Prevent concurrent migration processes.
  await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
  lockAcquired = true;

  // Verify and create the existing base schema if necessary.
  const schema = await readFile(
    new URL("./schema.sql", import.meta.url),
    "utf8"
  );

  await client.query("BEGIN");

  try {
    await client.query(schema);
    await client.query("COMMIT");
    console.log("Base database schema verified.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  // Create migration history.
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      migration_name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Discover SQL migrations in alphabetical order.
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const existing = await client.query(
      "SELECT id FROM schema_migrations WHERE migration_name = $1",
      [file]
    );

    if (existing.rowCount > 0) {
      console.log(`Already applied: ${file}`);
      continue;
    }

    const migration = await readFile(
      new URL(file, MIGRATIONS_DIR),
      "utf8"
    );

    console.log(`Applying migration: ${file}`);

    await client.query("BEGIN");

    try {
      await client.query(migration);

      await client.query(
        "INSERT INTO schema_migrations (migration_name) VALUES ($1)",
        [file]
      );

      await client.query("COMMIT");
      console.log(`Successfully applied: ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${error.message}`);
    }
  }

  console.log("Database migrations completed successfully.");
} catch (error) {
  console.error("Database migration failed:", error.message);
  process.exitCode = 1;
} finally {
  if (client) {
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]);
      } catch (error) {
        console.error("Could not release migration lock:", error.message);
      }
    }

    client.release();
  }

  await pool.end();
}
