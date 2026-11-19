import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const sslCa = process.env.DB_SSL_CA_BASE64
  ? Buffer.from(process.env.DB_SSL_CA_BASE64, "base64").toString("utf8")
  : undefined;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:
    process.env.DB_SSL === "true"
      ? {
          ca: sslCa,
          rejectUnauthorized: true,
        }
      : false,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error.message);
});

export default pool;
