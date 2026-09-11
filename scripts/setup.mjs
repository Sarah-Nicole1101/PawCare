import fs from "node:fs";
import crypto from "node:crypto";
if (fs.existsSync(".env")) {
  console.log(".env already exists. Your configuration was preserved.");
} else {
  const env = fs
    .readFileSync(".env.example", "utf8")
    .replace(
      "MFA_ENCRYPTION_KEY=",
      "MFA_ENCRYPTION_KEY=" + crypto.randomBytes(32).toString("hex"),
    )
    .replace(
      "TOKEN_HASH_KEY=",
      "TOKEN_HASH_KEY=" + crypto.randomBytes(32).toString("hex"),
    );
  fs.writeFileSync(".env", env, { mode: 0o600 });
  console.log(
    "Created .env. Set your MySQL connection, then run npm run db:init.",
  );
}
fs.mkdirSync("uploads", { recursive: true });
fs.mkdirSync(".mail", { recursive: true });
