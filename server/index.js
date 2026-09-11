import "dotenv/config";
import { checkConfig } from "./security.js";
import { app } from "./app.js";
import { q, pool } from "./db.js";
checkConfig();
await q("SELECT version FROM schema_migrations WHERE version=1");
const server = app.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
  console.log(`PawCare API is ready on port ${process.env.PORT || 3001}.`),
);
const cleanup = setInterval(async () => {
  try {
    await q("DELETE FROM sessions WHERE expires_at<UTC_TIMESTAMP(3)");
    await q("DELETE FROM rate_limits WHERE expires_at<UTC_TIMESTAMP(3)");
    await q(
      "DELETE FROM account_tokens WHERE expires_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 7 DAY)",
    );
  } catch {
    console.error("Session cleanup could not run.");
  }
}, 3600000);
cleanup.unref();
async function stop() {
  clearInterval(cleanup);
  server.close();
  await pool.end();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
