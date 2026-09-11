import test from "node:test";
import assert from "node:assert/strict";
process.env.MFA_ENCRYPTION_KEY = "1".repeat(64);
process.env.TOKEN_HASH_KEY = "2".repeat(64);
const S = await import("../server/security.js");
test("Argon2 verifies the correct password and rejects a different password", async () => {
  const hash = await S.passwordHash("a sufficiently long test passphrase");
  assert(!hash.includes("sufficiently"));
  assert(await S.passwordMatches(hash, "a sufficiently long test passphrase"));
  assert.equal(await S.passwordMatches(hash, "another passphrase"), false);
});
test("Authenticator secrets are authenticated ciphertext; tampering fails", () => {
  const secret = S.newSecret(),
    sealed = S.seal(secret);
  assert(!sealed.includes(secret));
  assert.equal(S.unseal(sealed), secret);
  const parts = sealed.split(".");
  parts[1] = Buffer.from("tampered").toString("base64");
  assert.throws(() => S.unseal(parts.join(".")));
});
test("TOTP matches RFC 6238 SHA-1 vectors at six digits and rejects old codes", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(S.makeTotp(secret).generate({ timestamp: 59000 }), "287082");
  assert.equal(S.totpStep(secret, "287082", 59000), 1);
  assert.equal(S.totpStep(secret, "287082", 300000), null);
  assert.equal(S.totpStep(secret, "12345", 59000), null);
});
test("Recovery codes normalize formatting consistently", () => {
  assert.equal(S.normalizeRecovery("abcd-1234 efgh"), "ABCD1234EFGH");
});
