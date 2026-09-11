import { Router } from "express";
import QRCode from "qrcode";
import { z } from "zod";
import { q, tx, id, fail } from "./db.js";
import * as S from "./security.js";
import { sendMail } from "./mail.js";
const router = Router();
const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((x) => x.toLowerCase().trim()),
  password: z.string().min(12).max(128),
});
const origin = () => process.env.APP_ORIGIN || "http://localhost:5173";
async function sendToken(userId, email, purpose) {
  const raw = S.token();
  await q(
    "INSERT INTO account_tokens(token_hash,user_id,purpose,expires_at) VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? MINUTE))",
    [S.digest(raw), userId, purpose, purpose === "reset" ? 30 : 1440],
  );
  await sendMail(
    email,
    purpose === "verify"
      ? "Verify your PawCare email"
      : "Reset your PawCare password",
    `${origin()}/#${purpose}=${raw}\n\nThis link is single use. Ignore this message if you did not request it.`,
  );
}
router.get("/status", async (req, res) => {
  let csrf = req.session?.csrf_token;
  if (!csrf) csrf = await S.setSession(req, res, null, "anonymous", 30);
  let member = null;
  if (req.user && req.session?.level === "full") {
    [member] = await q(
      "SELECT m.*,h.name,h.timezone FROM household_members m JOIN households h ON h.id=m.household_id WHERE user_id=?",
      [req.user.id],
    );
  }
  res.json({
    csrf,
    user: req.user || null,
    level: req.session?.level || "anonymous",
    household: member || null,
    expiresAt: req.session?.expires_at || null,
  });
});
router.post("/register", async (req, res) => {
  const data = credentials
    .extend({ name: z.string().trim().min(1).max(100) })
    .parse(req.body);
  await S.rateLimit("register-ip", req.ip, 20);
  await S.rateLimit("register-email", data.email, 3);
  const userId = id(),
    encoded = await S.passwordHash(data.password);
  try {
    await q("INSERT INTO users(id,name,email,password_hash) VALUES(?,?,?,?)", [
      userId,
      data.name,
      data.email,
      encoded,
    ]);
    await sendToken(userId, data.email, "verify");
  } catch (e) {
    if (e.code !== "ER_DUP_ENTRY") throw e;
  }
  res.json({
    message:
      "If this address can be registered, a verification link has been sent. Check your email, then sign in.",
  });
});
router.post("/verify", async (req, res) => {
  const raw = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(req.body.token);
  await tx(async (db) => {
    const [t] = await q(
      "SELECT * FROM account_tokens WHERE token_hash=? AND purpose='verify' AND used_at IS NULL AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE",
      [S.digest(raw)],
      db,
    );
    if (!t)
      fail(400, "This verification link has expired or was already used.");
    await q(
      "UPDATE users SET email_verified_at=UTC_TIMESTAMP(3) WHERE id=?",
      [t.user_id],
      db,
    );
    await q(
      "UPDATE account_tokens SET used_at=UTC_TIMESTAMP(3) WHERE token_hash=?",
      [t.token_hash],
      db,
    );
  });
  res.json({ message: "Email verified. You can now sign in." });
});
router.post("/resend-verification", async (req, res) => {
  const email = z
    .email()
    .transform((x) => x.toLowerCase().trim())
    .parse(req.body.email);
  await S.rateLimit("verify-ip", req.ip, 20);
  await S.rateLimit("verify-email", email, 3);
  const [u] = await q("SELECT * FROM users WHERE email=?", [email]);
  if (u && !u.email_verified_at) await sendToken(u.id, email, "verify");
  res.json({
    message: "If this account needs verification, a fresh link has been sent.",
  });
});
router.post("/login", async (req, res) => {
  const { email, password } = credentials.parse(req.body);
  await S.rateLimit("login-ip", req.ip, 50);
  await S.rateLimit("login-email", email, 10);
  const [u] = await q("SELECT * FROM users WHERE email=?", [email]);
  // A real Argon2 operation on unknown users avoids a fast enumeration path.
  const valid = u
    ? await S.passwordMatches(u.password_hash, password)
    : (await S.passwordHash(password), false);
  if (!valid) {
    await S.securityEvent(u?.id || null, "login_failed");
    fail(401, "Email or password is incorrect.");
  }
  if (!u.email_verified_at)
    fail(
      403,
      "Verify your email first. You can request a new verification link below.",
    );
  const [a] = await q("SELECT enabled_at FROM authenticators WHERE user_id=?", [
    u.id,
  ]);
  const level = a?.enabled_at ? "password" : "enrollment";
  const csrf = await S.setSession(req, res, u.id, level, 5);
  res.json({ csrf, level });
});
router.post("/mfa/setup", async (req, res) => {
  if (req.session?.level !== "enrollment")
    fail(403, "Sign in before setting up your authenticator.");
  await S.rateLimit("setup", req.user.id, 10);
  const secret = S.newSecret(),
    cipher = S.seal(secret);
  await q(
    "INSERT INTO authenticators(user_id,secret_cipher,pending_cipher,pending_until) VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE)) ON DUPLICATE KEY UPDATE pending_cipher=VALUES(pending_cipher),pending_until=VALUES(pending_until)",
    [req.user.id, "", cipher],
  );
  res.json({
    secret,
    qr: await QRCode.toDataURL(S.makeTotp(secret, req.user.email).toString()),
  });
});
router.post("/mfa/confirm", async (req, res) => {
  if (req.session?.level !== "enrollment")
    fail(403, "Your setup session expired. Sign in again.");
  await S.rateLimit("mfa-account", req.user.id, 10);
  const codes = await tx(async (db) => {
    const [a] = await q(
      "SELECT * FROM authenticators WHERE user_id=? AND pending_until>UTC_TIMESTAMP(3) FOR UPDATE",
      [req.user.id],
      db,
    );
    if (!a?.pending_cipher || a.enabled_at)
      fail(400, "Start authenticator setup again.");
    const step = S.totpStep(S.unseal(a.pending_cipher), req.body.code);
    if (step === null)
      fail(
        400,
        "The code is invalid or expired. Check the time on your phone.",
      );
    await q(
      "UPDATE authenticators SET secret_cipher=pending_cipher,pending_cipher=NULL,pending_until=NULL,enabled_at=UTC_TIMESTAMP(3),last_step=? WHERE user_id=?",
      [step, req.user.id],
      db,
    );
    return S.createRecovery(req.user.id, db);
  });
  await S.securityEvent(req.user.id, "mfa_enrolled");
  const csrf = await S.setSession(req, res, req.user.id, "full", 720);
  res.json({ csrf, codes });
});
router.post("/mfa/verify", async (req, res) => {
  if (req.session?.level !== "password")
    fail(401, "Sign in again to request a new verification session.");
  await S.rateLimit("mfa-account", req.user.id, 10);
  await S.rateLimit("mfa-ip", req.ip, 50);
  await q("UPDATE sessions SET attempts=attempts+1 WHERE token_hash=?", [
    req.session.token_hash,
  ]);
  const [session] = await q(
    "SELECT attempts FROM sessions WHERE token_hash=?",
    [req.session.token_hash],
  );
  if (!session || session.attempts > 5) {
    await q("DELETE FROM sessions WHERE token_hash=?", [
      req.session.token_hash,
    ]);
    fail(
      429,
      "Verification attempts exceeded. Sign in again after the cooldown.",
    );
  }
  const valid = await tx((db) =>
    S.consumeFactor(req.user.id, req.body.code, req.body.recovery === true, db),
  );
  if (!valid) {
    await S.securityEvent(req.user.id, "mfa_failed");
    if (session.attempts >= 5) {
      await q("DELETE FROM sessions WHERE token_hash=?", [
        req.session.token_hash,
      ]);
      fail(
        401,
        "Five verification attempts failed. Sign in again to continue.",
      );
    }
    fail(401, "That code is invalid, expired, or already used.");
  }
  const csrf = await S.setSession(req, res, req.user.id, "full", 720);
  await S.securityEvent(
    req.user.id,
    req.body.recovery ? "recovery_code_used" : "login_succeeded",
  );
  res.json({ csrf, recoveryUsed: !!req.body.recovery });
});
router.post("/forgot", async (req, res) => {
  const email = z
    .email()
    .transform((x) => x.toLowerCase().trim())
    .parse(req.body.email);
  await S.rateLimit("reset-ip", req.ip, 20);
  await S.rateLimit("reset-email", email, 3);
  const [u] = await q("SELECT id FROM users WHERE email=?", [email]);
  if (u) await sendToken(u.id, email, "reset");
  res.json({
    message: "If an account exists, a password-reset link has been sent.",
  });
});
router.post("/reset", async (req, res) => {
  const { token, password } = z
    .object({
      token: z.string().regex(/^[a-f0-9]{64}$/),
      password: z.string().min(12).max(128),
    })
    .parse(req.body);
  await S.rateLimit("reset-use", req.ip, 20);
  const encoded = await S.passwordHash(password);
  await tx(async (db) => {
    const [t] = await q(
      "SELECT * FROM account_tokens WHERE token_hash=? AND purpose='reset' AND used_at IS NULL AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE",
      [S.digest(token)],
      db,
    );
    if (!t) fail(400, "This reset link has expired or was already used.");
    await q(
      "UPDATE users SET password_hash=? WHERE id=?",
      [encoded, t.user_id],
      db,
    );
    await q(
      "UPDATE account_tokens SET used_at=UTC_TIMESTAMP(3) WHERE user_id=? AND purpose='reset'",
      [t.user_id],
      db,
    );
    await q("DELETE FROM sessions WHERE user_id=?", [t.user_id], db);
  });
  res.json({
    message:
      "Password updated. Sign in with the new password and your authenticator.",
  });
});
router.post("/logout", async (req, res) => {
  if (req.session)
    await q("DELETE FROM sessions WHERE token_hash=?", [
      req.session.token_hash,
    ]);
  res.clearCookie("pawcare_session", S.cookieOptions);
  res.json({ ok: true });
});
router.get("/security", S.requireFull, async (req, res) => {
  const [r] = await q(
    "SELECT COUNT(*) AS remaining FROM recovery_codes WHERE user_id=? AND used_at IS NULL",
    [req.user.id],
  );
  const events = await q(
    "SELECT action,created_at FROM security_events WHERE user_id=? ORDER BY created_at DESC LIMIT 20",
    [req.user.id],
  );
  res.json({ remaining: r.remaining, events });
});
async function stepUp(req) {
  await S.rateLimit("step-up", req.user.id, 10);
  const [u] = await q("SELECT password_hash FROM users WHERE id=?", [
    req.user.id,
  ]);
  if (
    !(await S.passwordMatches(u.password_hash, String(req.body.password || "")))
  )
    fail(401, "Your password or verification code is incorrect.");
  const valid = await tx((db) =>
    S.consumeFactor(req.user.id, req.body.code, req.body.recovery === true, db),
  );
  if (!valid) fail(401, "Your password or verification code is incorrect.");
}
router.post("/recovery/regenerate", S.requireFull, async (req, res) => {
  await stepUp(req);
  const codes = await tx((db) => S.createRecovery(req.user.id, db));
  await S.securityEvent(req.user.id, "recovery_codes_regenerated");
  res.json({ codes });
});
router.post("/mfa/replace/start", S.requireFull, async (req, res) => {
  await stepUp(req);
  const secret = S.newSecret();
  await q(
    "UPDATE authenticators SET pending_cipher=?,pending_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE) WHERE user_id=?",
    [S.seal(secret), req.user.id],
  );
  res.json({
    secret,
    qr: await QRCode.toDataURL(S.makeTotp(secret, req.user.email).toString()),
  });
});
router.post("/mfa/replace/confirm", S.requireFull, async (req, res) => {
  await S.rateLimit("replace-confirm", req.user.id, 10);
  const codes = await tx(async (db) => {
    const [a] = await q(
      "SELECT * FROM authenticators WHERE user_id=? AND pending_until>UTC_TIMESTAMP(3) FOR UPDATE",
      [req.user.id],
      db,
    );
    if (!a?.pending_cipher) fail(400, "Start authenticator replacement again.");
    const step = S.totpStep(S.unseal(a.pending_cipher), req.body.code);
    if (step === null) fail(400, "Enter the code from your new authenticator.");
    await q(
      "UPDATE authenticators SET secret_cipher=pending_cipher,pending_cipher=NULL,pending_until=NULL,last_step=? WHERE user_id=?",
      [step, req.user.id],
      db,
    );
    await q("DELETE FROM sessions WHERE user_id=?", [req.user.id], db);
    return S.createRecovery(req.user.id, db);
  });
  const csrf = await S.setSession(req, res, req.user.id, "full", 720);
  await S.securityEvent(req.user.id, "authenticator_replaced");
  res.json({ csrf, codes });
});
export default router;
