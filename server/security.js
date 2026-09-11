import crypto from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import * as OTPAuth from "otpauth";
import { q, id, fail } from "./db.js";
export function checkConfig() {
  for (const name of ["MFA_ENCRYPTION_KEY", "TOKEN_HASH_KEY"])
    if (!/^[a-f0-9]{64}$/i.test(process.env[name] || ""))
      throw new Error(
        `${name} is missing. Run npm run setup and preserve the generated keys.`,
      );
  if (process.env.NODE_ENV === "production") {
    const hasHttpsOrigin = process.env.APP_ORIGIN?.startsWith("https://");
    const hasSmtp =
      process.env.MAIL_MODE === "smtp" && Boolean(process.env.SMTP_HOST);
    const hasBrevo =
      process.env.MAIL_MODE === "brevo" && Boolean(process.env.BREVO_API_KEY);
    if (!hasHttpsOrigin || (!hasSmtp && !hasBrevo))
      throw new Error(
        "Production requires an HTTPS APP_ORIGIN and configured transactional email.",
      );
  }
}
export const token = () => crypto.randomBytes(32).toString("hex");
export const digest = (value) =>
  crypto
    .createHmac("sha256", Buffer.from(process.env.TOKEN_HASH_KEY, "hex"))
    .update(value)
    .digest("hex");
export const passwordHash = (password) =>
  hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
export const passwordMatches = async (encoded, password) => {
  try {
    return await verify(encoded, password);
  } catch {
    return false;
  }
};
export function seal(plain) {
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv(
      "aes-256-gcm",
      Buffer.from(process.env.MFA_ENCRYPTION_KEY, "hex"),
      iv,
    );
  return [iv, cipher.update(plain, "utf8"), cipher.final(), cipher.getAuthTag()]
    .map((x) => x.toString("base64"))
    .join(".");
}
export function unseal(value) {
  const [iv, body, last, tag] = value
    .split(".")
    .map((x) => Buffer.from(x, "base64"));
  const cipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(process.env.MFA_ENCRYPTION_KEY, "hex"),
    iv,
  );
  cipher.setAuthTag(tag);
  return Buffer.concat([
    cipher.update(body),
    cipher.update(last),
    cipher.final(),
  ]).toString("utf8");
}
export const makeTotp = (secret, label = "PawCare") =>
  new OTPAuth.TOTP({
    issuer: "PawCare",
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
export function totpStep(secret, code, now = Date.now()) {
  if (!/^\d{6}$/.test(String(code))) return null;
  const delta = makeTotp(secret).validate({
    token: String(code),
    window: 1,
    timestamp: now,
  });
  return delta === null ? null : Math.floor(now / 30000) + delta;
}
export const newSecret = () => new OTPAuth.Secret({ size: 20 }).base32;
export const normalizeRecovery = (code) =>
  String(code).replace(/[ -]/g, "").toUpperCase();
export async function createRecovery(userId, db) {
  await q("DELETE FROM recovery_codes WHERE user_id=?", [userId], db);
  const codes = Array.from({ length: 10 }, () =>
    crypto
      .randomBytes(16)
      .toString("hex")
      .toUpperCase()
      .match(/.{1,4}/g)
      .join("-"),
  );
  for (const code of codes)
    await q(
      "INSERT INTO recovery_codes(id,user_id,code_hash) VALUES(?,?,?)",
      [id(), userId, digest(normalizeRecovery(code))],
      db,
    );
  return codes;
}
export async function consumeFactor(userId, code, recovery, db) {
  if (recovery) {
    const result = await q(
      "UPDATE recovery_codes SET used_at=UTC_TIMESTAMP(3) WHERE user_id=? AND code_hash=? AND used_at IS NULL",
      [userId, digest(normalizeRecovery(code))],
      db,
    );
    return result.affectedRows === 1;
  }
  const rows = await q(
    "SELECT * FROM authenticators WHERE user_id=? AND enabled_at IS NOT NULL FOR UPDATE",
    [userId],
    db,
  );
  if (!rows.length) return false;
  const step = totpStep(unseal(rows[0].secret_cipher), code);
  if (step === null || step <= Number(rows[0].last_step)) return false;
  const result = await q(
    "UPDATE authenticators SET last_step=? WHERE user_id=? AND last_step<?",
    [step, userId, step],
    db,
  );
  return result.affectedRows === 1;
}
export async function rateLimit(scope, key, limit = 10, seconds = 900) {
  const bucket = digest(scope + ":" + key);
  await q(
    "INSERT INTO rate_limits(bucket,hits,expires_at) VALUES(?,1,DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? SECOND)) ON DUPLICATE KEY UPDATE hits=IF(expires_at<=UTC_TIMESTAMP(3),1,hits+1), expires_at=IF(expires_at<=UTC_TIMESTAMP(3),VALUES(expires_at),expires_at)",
    [bucket, seconds],
  );
  const [row] = await q("SELECT hits FROM rate_limits WHERE bucket=?", [
    bucket,
  ]);
  if (row.hits > limit)
    fail(429, "Too many attempts. Please wait 15 minutes before trying again.");
}
export const securityEvent = (userId, action) =>
  q("INSERT INTO security_events(id,user_id,action) VALUES(?,?,?)", [
    id(),
    userId,
    action,
  ]);
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/",
};
export async function setSession(req, res, userId, level, minutes) {
  if (req.session)
    await q("DELETE FROM sessions WHERE token_hash=?", [
      req.session.token_hash,
    ]);
  const raw = token(),
    csrf = token();
  await q(
    "INSERT INTO sessions(token_hash,user_id,level,csrf_token,expires_at) VALUES(?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? MINUTE))",
    [digest(raw), userId, level, csrf, minutes],
  );
  res.cookie("pawcare_session", raw, {
    ...cookieOptions,
    maxAge: minutes * 60000,
  });
  return csrf;
}
export async function sessionMiddleware(req, res, next) {
  const raw = req.cookies.pawcare_session;
  if (raw && /^[a-f0-9]{64}$/.test(raw)) {
    const [s] = await q(
      "SELECT * FROM sessions WHERE token_hash=? AND expires_at>UTC_TIMESTAMP(3)",
      [digest(raw)],
    );
    req.session = s;
    if (s?.user_id) {
      const [u] = await q(
        "SELECT id,name,email,email_verified_at FROM users WHERE id=?",
        [s.user_id],
      );
      req.user = u;
    }
  }
  next();
}
export function csrfMiddleware(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("origin") && req.get("origin") !== process.env.APP_ORIGIN)
    fail(403, "This request came from an unrecognized site.");
  const expected = req.session?.csrf_token,
    provided = req.get("X-CSRF-Token");
  if (
    !expected ||
    !provided ||
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  )
    fail(403, "Your session changed. Refresh the page and try again.");
  next();
}
export function requireFull(req, res, next) {
  if (!req.user || req.session?.level !== "full")
    fail(401, "Please sign in and verify your authenticator code.");
  next();
}
export async function requireHousehold(req, res, next) {
  requireFull(req, res, () => {});
  const [m] = await q(
    "SELECT m.*,h.name,h.timezone FROM household_members m JOIN households h ON h.id=m.household_id WHERE m.user_id=?",
    [req.user.id],
  );
  if (!m) fail(403, "Create or join a household first.");
  req.member = m;
  next();
}
export function admin(req, res, next) {
  if (req.member?.role !== "admin")
    fail(403, "Only a household admin can do that.");
  next();
}
