import "dotenv/config";
import app from "./app.js";
import pool from "./config/database.js";
import { validateProductionEnvironment } from "./config/validate-environment.js";
import { startBeevoAutomationWorker } from "./workers/start-beevo-automation-worker.js";

validateProductionEnvironment();

const PORT = Number(process.env.PORT) || 3000;

let embeddedWorker = null;
let shuttingDown = false;

const server = app.listen(PORT, () => {
  console.log(`Beevo API running on port ${PORT}`);

  if (process.env.ENABLE_EMBEDDED_WORKER === "true") {
    embeddedWorker = startBeevoAutomationWorker();
    embeddedWorker.done.catch((error) => {
      console.error("Beevo embedded worker stopped unexpectedly:", error.message);
      process.exitCode = 1;
    });
  }
});

function shutdown(signal) {
  if (shuttingDown) return;

  shuttingDown = true;
  console.log(`${signal} received. Shutting down Beevo API...`);

  embeddedWorker?.stop();

  server.close(async (error) => {
    if (error) {
      console.error("HTTP server shutdown error:", error.message);
      process.exitCode = 1;
    }

    try {
      if (embeddedWorker) {
        await embeddedWorker.done;
      }

      await pool.end();
      console.log("Beevo PostgreSQL pool closed.");
    } catch (shutdownError) {
      console.error("Beevo shutdown error:", shutdownError.message);
      process.exitCode = 1;
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
