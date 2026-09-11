import "dotenv/config";
import fs from "node:fs";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
const name = process.env.DB_NAME || "pawcare";
if (!/^[a-zA-Z0-9_]+$/.test(name))
  throw new Error("DB_NAME may contain letters, numbers and underscores only.");
const conn = await mysql.createConnection({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  multipleStatements: true,
  ssl:
    process.env.DB_SSL === "true"
      ? {
          rejectUnauthorized: true,
          ...(process.env.DB_SSL_CA_FILE
            ? { ca: fs.readFileSync(process.env.DB_SSL_CA_FILE) }
            : {}),
        }
      : undefined,
});
try {
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await conn.query(`USE \`${name}\``);
  await conn.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INT PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
  );
  const sql = fs.readFileSync(
    new URL("../database/schema.sql", import.meta.url),
    "utf8",
  );
  const checksum = crypto.createHash("sha256").update(sql).digest("hex");
  const [rows] = await conn.query(
    "SELECT * FROM schema_migrations WHERE version=1",
  );
  if (rows.length) {
    if (rows[0].checksum !== checksum)
      throw new Error(
        "Applied migration differs from schema.sql. Create a new migration; do not overwrite existing schema.",
      );
    console.log("Schema version 1 is already applied.");
  } else {
    await conn.query(sql);
    await conn.execute(
      "INSERT INTO schema_migrations(version,checksum) VALUES (1,?)",
      [checksum],
    );
    console.log("PawCare database created. No default accounts were added.");
  }
} finally {
  await conn.end();
}
