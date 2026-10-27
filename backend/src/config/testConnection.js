
import pool from "./database.js";

try {
  const result = await pool.query(
    "SELECT current_database() AS database, current_user AS username"
  );

  console.log("PostgreSQL connection successful.");
  console.log("Database:", result.rows[0].database);
  console.log("User:", result.rows[0].username);
} catch (error) {
  console.error("PostgreSQL connection failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
