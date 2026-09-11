import React, { useState } from "react";
import {
  PawPrint,
  ShieldCheck,
  ArrowRight,
  Download,
  KeyRound,
} from "lucide-react";
import { api } from "./api";
import { Button, Field, ErrorMessage } from "./components";
export function RecoveryCodes({ codes, onDone }) {
  const [saved, setSaved] = useState(false);
  function download() {
    const blob = new Blob(
      [
        "PawCare recovery codes\nKeep these private. Each code works once with your password.\n\n" +
          codes.join("\n"),
      ],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "PawCare_Recovery_Codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="stack">
      <div className="notice">
        <KeyRound size={20} />
        <span>
          Save these codes somewhere private. You’ll need one if you lose access
          to your authenticator.
        </span>
      </div>
      <div className="recovery-grid">
        {codes.map((c) => (
          <code key={c}>{c}</code>
        ))}
      </div>
      <Button variant="secondary" onClick={download}>
        <Download size={16} />
        Download recovery codes
      </Button>
      <label className="check">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        I have saved my recovery codes.
      </label>
      <Button disabled={!saved} onClick={onDone}>
        Continue <ArrowRight size={16} />
      </Button>
    </div>
  );
}
export default function Auth({ status, refresh, hashAction }) {
  const [mode, setMode] = useState(
      hashAction?.type === "reset"
        ? "reset"
        : hashAction?.type === "verify"
          ? "verify"
          : "login",
    ),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [setup, setSetup] = useState(null),
    [codes, setCodes] = useState(null),
    [recovery, setRecovery] = useState(false);
  const enrollment = status.level === "enrollment",
    challenge = status.level === "password";
  async function action(fn) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    await action(async () => {
      if (enrollment) {
        const result = await api("/auth/mfa/confirm", {
          method: "POST",
          body: { code: data.code },
        });
        setCodes(result.codes);
        return;
      }
      if (challenge) {
        await api("/auth/mfa/verify", {
          method: "POST",
          body: { code: data.code, recovery },
        });
        await refresh();
        return;
      }
      if (mode === "verify") {
        const r = await api("/auth/verify", {
          method: "POST",
          body: { token: hashAction.token },
        });
        setMessage(r.message);
        window.history.replaceState(null, "", window.location.pathname);
        setMode("login");
        return;
      }
      if (mode === "reset") {
        const r = await api("/auth/reset", {
          method: "POST",
          body: { token: hashAction.token, password: data.password },
        });
        setMessage(r.message);
        window.history.replaceState(null, "", window.location.pathname);
        await refresh();
        setMode("login");
        return;
      }
      const r = await api("/auth/" + mode, { method: "POST", body: data });
      if (mode === "login") await refresh();
      else {
        setMessage(r.message);
        setMode("login");
      }
    });
  }
  const title = codes
    ? "Save your recovery codes"
    : enrollment
      ? "Secure your account"
      : challenge
        ? "Verify it’s you"
        : {
            login: "Welcome to PawCare",
            register: "Create your account",
            forgot: "Reset your password",
            reset: "Choose a new password",
            verify: "Verify your email",
            "resend-verification": "Request a new link",
          }[mode];
  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <div className="wordmark">
          <PawPrint size={28} /> pawcare<span>™</span>
        </div>
        <div className="auth-story">
          <div className="eyebrow">FOR THE ONES YOU LOVE</div>
          <h1>
            A little care.
            <br />
            Every day.
          </h1>
          <p>
            One place for your pet’s health, daily routines, and the family who
            takes care of them.
          </p>
          <div className="auth-check">
            <ShieldCheck size={24} />
            <span>
              Your family’s records.
              <br />
              <strong>Protected with two-step verification.</strong>
            </span>
          </div>
        </div>
        <span className="brand-foot">Family pet care, made simple.</span>
      </div>
      <main className="auth-main">
        <div className="auth-card">
          <div className="eyebrow">
            PAWCARE /{" "}
            {challenge || enrollment
              ? "ACCOUNT SECURITY"
              : "YOUR FAMILY’S CARE SPACE"}
          </div>
          <h2>{title}</h2>
          <p className="muted">
            {enrollment
              ? "Add PawCare to your authenticator app to finish setup."
              : challenge
                ? "Enter the code from your authenticator app."
                : mode === "login"
                  ? "Sign in to take care of what matters."
                  : ""}
          </p>
          <ErrorMessage message={error} />
          {message && (
            <div className="notice" role="status">
              {message}
            </div>
          )}
          {codes ? (
            <RecoveryCodes codes={codes} onDone={refresh} />
          ) : (
            <form onSubmit={submit} className="stack">
              {enrollment && !setup ? (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    action(async () =>
                      setSetup(
                        await api("/auth/mfa/setup", {
                          method: "POST",
                          body: {},
                        }),
                      ),
                    )
                  }
                >
                  Set up authenticator <ArrowRight size={16} />
                </Button>
              ) : enrollment ? (
                <>
                  <img
                    className="qr"
                    src={setup.qr}
                    alt="Scan this QR code with your authenticator app"
                  />
                  <label className="field">
                    <span>Can’t scan? Enter this key in your app.</span>
                    <code className="setup-key">{setup.secret}</code>
                  </label>
                  <Field
                    label="Six-digit code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    minLength={6}
                    maxLength={6}
                    pattern="[0-9]{6}"
                    required
                  />
                </>
              ) : challenge ? (
                <>
                  <Field
                    label={recovery ? "Recovery code" : "Six-digit code"}
                    name="code"
                    autoComplete="one-time-code"
                    inputMode={recovery ? "text" : "numeric"}
                    required
                    maxLength={recovery ? 50 : 6}
                  />
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => setRecovery(!recovery)}
                  >
                    {recovery
                      ? "Use an authenticator code"
                      : "Use a recovery code instead"}
                  </button>
                </>
              ) : (
                <>
                  {mode === "register" && (
                    <Field
                      label="Your name"
                      name="name"
                      autoComplete="name"
                      maxLength={100}
                      required
                    />
                  )}
                  {[
                    "login",
                    "register",
                    "forgot",
                    "resend-verification",
                  ].includes(mode) && (
                    <Field
                      label="Email address"
                      type="email"
                      name="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                    />
                  )}
                  {["login", "register", "reset"].includes(mode) && (
                    <Field
                      label={mode === "reset" ? "New password" : "Password"}
                      type="password"
                      name="password"
                      minLength={12}
                      maxLength={128}
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      required
                    >
                      <small>Use at least 12 characters.</small>
                    </Field>
                  )}
                  {mode === "verify" && (
                    <p>
                      Confirm that this is the email address you want to use for
                      PawCare.
                    </p>
                  )}
                </>
              )}
              {(!enrollment || setup) && (
                <Button disabled={busy}>
                  {busy
                    ? "Please wait…"
                    : challenge
                      ? "Verify and sign in"
                      : enrollment
                        ? "Confirm authenticator"
                        : mode === "login"
                          ? "Sign in"
                          : mode === "register"
                            ? "Create account"
                            : mode === "verify"
                              ? "Verify email"
                              : mode === "reset"
                                ? "Save password"
                                : "Send link"}
                  <ArrowRight size={16} />
                </Button>
              )}
            </form>
          )}
          {!codes && !enrollment && !challenge && (
            <div className="auth-links">
              {mode === "login" ? (
                <>
                  <button
                    onClick={() => {
                      setMode("register");
                      setError("");
                    }}
                  >
                    Create an account
                  </button>
                  <button
                    onClick={() => {
                      setMode("forgot");
                      setError("");
                    }}
                  >
                    Forgot password?
                  </button>
                  <button
                    onClick={() => {
                      setMode("resend-verification");
                      setError("");
                    }}
                  >
                    Resend verification email
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setMode("login");
                    setError("");
                  }}
                >
                  Back to sign in
                </button>
              )}
            </div>
          )}
          {!codes && (enrollment || challenge) && (
            <button
              className="text-btn"
              onClick={() =>
                action(async () => {
                  await api("/auth/logout", { method: "POST", body: {} });
                  await refresh();
                  setSetup(null);
                })
              }
            >
              Back to sign in
            </button>
          )}
        </div>
        <p className="auth-footer">
          A shared space. A separate account for every caregiver.
        </p>
      </main>
    </div>
  );
}
