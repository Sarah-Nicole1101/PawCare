import "dotenv/config";
import mysql from "mysql2/promise";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
export const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "pawcare",
  timezone: "Z",
  dateStrings: true,
  connectionLimit: 10,
  decimalNumbers: true,
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
pool.on("connection", (connection) =>
  connection.query("SET time_zone = '+00:00'"),
);
export const id = () => randomUUID();
export async function q(sql, params = [], db = pool) {
  const [result] = await db.execute(sql, params);
  return result;
}
export async function tx(fn) {
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const result = await fn(c);
    await c.commit();
    return result;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
export const audit = (req, action, type = null, entity = null, db = pool) =>
  q(
    "INSERT INTO activity_log(id,household_id,user_id,action,entity_type,entity_id) VALUES(?,?,?,?,?,?)",
    [id(), req.member.household_id, req.user.id, action, type, entity],
    db,
  );
export function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
