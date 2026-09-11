import React, { useEffect, useState } from "react";
import { ShieldCheck, KeyRound, RefreshCw, Volume2, Bell } from "lucide-react";
import { api } from "./api";
import { Button, Field, Modal, ErrorMessage } from "./components";
import { RecoveryCodes } from "./Auth";
import { dateLabel, timeLabel } from "./models";
export default function Settings({
  zone,
  sounds,
  enableSounds,
  disableSounds,
  notifyEnabled,
  enableNotifications,
  volume,
  setVolume,
}) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [mode, setMode] = useState(null),
    [setup, setSetup] = useState(null),
    [codes, setCodes] = useState(null),
    [busy, setBusy] = useState(false);
  const load = () =>
    api("/auth/security")
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const raw = Object.fromEntries(new FormData(e.currentTarget));
      raw.recovery = raw.recovery === "on";
      if (setup) {
        const r = await api("/auth/mfa/replace/confirm", {
          method: "POST",
          body: { code: raw.code },
        });
        setCodes(r.codes);
        setSetup(null);
      } else if (mode === "replace") {
        setSetup(
          await api("/auth/mfa/replace/start", { method: "POST", body: raw }),
        );
      } else {
        const r = await api("/auth/recovery/regenerate", {
          method: "POST",
          body: raw,
        });
        setCodes(r.codes);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-grid">
      <section className="panel">
        <div className="section-title">
          <ShieldCheck />
          <h2>Account security</h2>
        </div>
        <p>
          <strong>Multi-factor authentication is on.</strong>
        </p>
        <p className="muted">
          Your password and authenticator protect access to your household.
        </p>
        <div className="setting-row">
          <span>Unused recovery codes</span>
          <strong>{data?.remaining ?? "…"} of 10</strong>
        </div>
        <div className="stack">
          <Button
            variant="secondary"
            onClick={() => {
              setMode("regenerate");
              setError("");
            }}
          >
            <KeyRound size={17} />
            Generate new recovery codes
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setMode("replace");
              setError("");
            }}
          >
            <RefreshCw size={17} />
            Replace authenticator
          </Button>
        </div>
        <p className="small muted">
          Replacement keeps the old authenticator active until you verify the
          new one. Keep your recovery codes private.
        </p>
      </section>
      <section className="panel">
        <div className="section-title">
          <Volume2 />
          <h2>Reminder settings</h2>
        </div>
        <div className="setting-row">
          <div>
            <strong>In-app sound</strong>
            <p className="small muted">
              {sounds ? "Enabled for this tab" : "Enable after opening PawCare"}
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={sounds ? disableSounds : enableSounds}
          >
            {sounds ? "Turn off" : "Enable & test"}
          </Button>
        </div>
        <Field
          label="Alarm volume"
          type="range"
          min="0.1"
          max="1"
          step="0.1"
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
        <div className="setting-row">
          <div>
            <strong>Browser notifications</strong>
            <p className="small muted">
              {notifyEnabled ? "Allowed" : "Permission required"}
            </p>
          </div>
          <Button variant="secondary" onClick={enableNotifications}>
            <Bell size={16} />
            Enable
          </Button>
        </div>
        <p className="notice">
          Keep PawCare open and active for audible reminders. Closed tabs,
          sleeping devices, and expired sign-ins can stop alerts.
        </p>
        <p className="small muted">
          Household timezone: {zone}. Your device’s volume and notification
          settings also apply.
        </p>
      </section>
      <section className="panel span-all">
        <h2>Recent account activity</h2>
        {data?.events.map((e, i) => (
          <div className="log-row" key={i}>
            <span>{e.action.replaceAll("_", " ")}</span>
            <time>
              {dateLabel(e.created_at, zone)} · {timeLabel(e.created_at, zone)}
            </time>
          </div>
        ))}
      </section>
      {mode && (
        <Modal
          title={
            codes
              ? "Save your new recovery codes"
              : mode === "replace"
                ? "Replace authenticator"
                : "Generate recovery codes"
          }
          onClose={() => {
            setMode(null);
            setSetup(null);
            setCodes(null);
            setError("");
            load();
          }}
        >
          <ErrorMessage message={error} />
          {codes ? (
            <RecoveryCodes
              codes={codes}
              onDone={() => {
                setMode(null);
                setCodes(null);
                load();
              }}
            />
          ) : (
            <form className="stack" onSubmit={submit}>
              {setup ? (
                <>
                  <img
                    className="qr"
                    src={setup.qr}
                    alt="New authenticator QR code"
                  />
                  <code className="setup-key">{setup.secret}</code>
                  <Field
                    label="Code from the NEW authenticator"
                    name="code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    required
                  />
                </>
              ) : (
                <>
                  <p className="muted">
                    Verify your password and current authenticator to continue.
                  </p>
                  <Field
                    label="Password"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                  />
                  <Field
                    label="Authenticator or recovery code"
                    name="code"
                    required
                    autoComplete="one-time-code"
                  />
                  <label className="check">
                    <input name="recovery" type="checkbox" />I am using a
                    recovery code
                  </label>
                </>
              )}
              <Button disabled={busy}>
                {busy
                  ? "Verifying…"
                  : setup
                    ? "Confirm new authenticator"
                    : "Continue"}
              </Button>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
