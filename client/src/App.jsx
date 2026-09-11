import React, { useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import {
  PawPrint,
  LayoutDashboard,
  Pill,
  Bell,
  HeartPulse,
  Syringe,
  CalendarDays,
  Scale,
  FolderOpen,
  Utensils,
  Scissors,
  Wallet,
  Users,
  History,
  Settings as SettingsIcon,
  LogOut,
  Plus,
  Search,
  Menu,
  X,
  Volume2,
  Check,
  Clock,
  ChevronRight,
  Camera,
  ArrowUpRight,
  Trash2,
  FileText,
  Link as LinkIcon,
  ShieldCheck,
} from "lucide-react";
import { api } from "./api";
import Auth from "./Auth";
import Settings from "./Settings";
import {
  Button,
  Field,
  Modal,
  Empty,
  ErrorMessage,
  PetPhoto,
} from "./components";
import { PetForm, RecordForm, CareForm, UploadForm } from "./Forms";
import {
  models,
  dt,
  day,
  dateLabel,
  timeLabel,
  money,
  localNow,
} from "./models";
const navigation = [
  ["dashboard", "Today", LayoutDashboard],
  ["pets", "My pets", PawPrint],
  ["medications", "Medications", Pill],
  ["reminders", "Reminders", Bell],
  ["health", "Health records", HeartPulse],
  ["vaccinations", "Vaccinations", Syringe],
  ["appointments", "Appointments", CalendarDays],
  ["weight", "Weight tracker", Scale],
  ["documents", "Documents", FolderOpen],
  ["feeding", "Feeding", Utensils],
  ["grooming", "Grooming", Scissors],
  ["expenses", "Expenses", Wallet],
  ["family", "Family", Users],
  ["history", "Medication history", History],
];
const initialHash = () => {
  const p = new URLSearchParams(window.location.hash.slice(1));
  for (const type of ["verify", "reset", "invite"])
    if (p.get(type)) return { type, token: p.get(type) };
  return null;
};
const initialView = () => {
  const page = new URLSearchParams(window.location.hash.slice(1)).get("page");
  return page === "settings" || navigation.some(([key]) => key === page)
    ? page
    : "dashboard";
};
function CareRow({ item, zone, onAction, compact = false }) {
  const due = dt(item.due_at, zone).toMillis() <= Date.now(),
    done = item.status === "done",
    skipped = item.status === "skipped";
  return (
    <div className={`care-row ${done || skipped ? "resolved" : ""}`}>
      <div className="care-time">
        <strong>{timeLabel(item.due_at, zone)}</strong>
        <small>{dateLabel(item.due_at, zone)}</small>
      </div>
      <div className="task-symbol">
        {item.medication_id ? <Pill size={20} /> : <Bell size={20} />}
      </div>
      <div className="care-info">
        <strong>{item.title}</strong>
        <p>
          {item.pet_name}
          {item.detail ? " · " + item.detail : ""}
        </p>
        {done && (
          <small>
            Recorded by {item.completed_by_name} ·{" "}
            {timeLabel(item.completed_at, zone)}
          </small>
        )}
      </div>
      <span className={`badge ${due && !done && !skipped ? "dark" : ""}`}>
        {done
          ? "Done"
          : skipped
            ? "Skipped"
            : due
              ? Date.now() - dt(item.due_at, zone).toMillis() > 15 * 60000
                ? "Overdue"
                : "Due"
              : "Upcoming"}
      </span>
      {!done && !skipped && due && !compact && (
        <div className="care-actions">
          <Button variant="small-btn" onClick={() => onAction(item, "done")}>
            <Check size={16} />
            {item.medication_id ? "Given" : "Done"}
          </Button>
          <button
            className="icon-btn"
            aria-label={`More actions for ${item.title}`}
            onClick={() => onAction(item, "options")}
          >
            <Clock size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
function WeightChart({ rows }) {
  const points = [...rows].sort((a, b) =>
    a.event_date.localeCompare(b.event_date),
  );
  if (points.length < 2) return null;
  const values = points.map((p) => Number(p.weight_kg)),
    min = Math.min(...values),
    max = Math.max(...values),
    range = max - min || 1;
  const first = Date.parse(points[0].event_date),
    last = Date.parse(points.at(-1).event_date),
    width = last - first || 1;
  return (
    <figure className="weight-chart">
      <figcaption>Weight over time · kg</figcaption>
      <svg
        viewBox="0 0 660 180"
        role="img"
        aria-label={`Weight trend from ${values[0]} to ${values.at(-1)} kilograms`}
      >
        <line x1="38" x2="640" y1="148" y2="148" stroke="#ddd" />
        <text x="0" y="26">
          {max.toFixed(2)}
        </text>
        <text x="0" y="148">
          {min.toFixed(2)}
        </text>
        <polyline
          fill="none"
          stroke="#111"
          strokeWidth="2.5"
          points={points
            .map(
              (p) =>
                `${45 + ((Date.parse(p.event_date) - first) / width) * 570},${135 - ((Number(p.weight_kg) - min) / range) * 110}`,
            )
            .join(" ")}
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={45 + ((Date.parse(p.event_date) - first) / width) * 570}
            cy={135 - ((Number(p.weight_kg) - min) / range) * 110}
            r="4"
            fill="#111"
          />
        ))}
        <text x="45" y="175">
          {points[0].event_date}
        </text>
        <text x="615" y="175" textAnchor="end">
          {points.at(-1).event_date}
        </text>
      </svg>
    </figure>
  );
}
export default function App() {
  const [status, setStatus] = useState(null),
    [bootError, setBootError] = useState(""),
    [hashAction] = useState(initialHash),
    [view, setView] = useState(initialView),
    [pets, setPets] = useState([]),
    [care, setCare] = useState([]),
    [rows, setRows] = useState([]),
    [extras, setExtras] = useState({}),
    [selectedPet, setSelectedPet] = useState(""),
    [search, setSearch] = useState(""),
    [fromDate, setFromDate] = useState(""),
    [toDate, setToDate] = useState(""),
    [filterStatus, setFilterStatus] = useState(""),
    [modal, setModal] = useState(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false),
    [sounds, setSounds] = useState(false),
    [notifyEnabled, setNotifyEnabled] = useState(
      typeof Notification !== "undefined" &&
        Notification.permission === "granted",
    ),
    [volume, setVolumeState] = useState(() =>
      Number(localStorage.getItem("pawcare-volume") || 0.5),
    ),
    [alarm, setAlarm] = useState(null),
    [connection, setConnection] = useState(true),
    [noMoreRows, setNoMoreRows] = useState(false);
  const audio = useRef(null),
    alarmed = useRef(new Set()),
    inFlight = useRef(false),
    loadVersion = useRef(0),
    currentView = useRef(view);
  const zone = status?.household?.timezone || "Asia/Manila",
    isAdmin = status?.household?.role === "admin";
  async function refresh() {
    try {
      const s = await api("/auth/status");
      setStatus(s);
      setBootError("");
      return s;
    } catch (e) {
      setBootError(e.message);
    }
  }
  useEffect(() => {
    refresh();
    const expired = () => {
      audio.current?.pause();
      setAlarm(null);
      setSounds(false);
      setStatus(null);
      setPets([]);
      setCare([]);
      setRows([]);
      refresh();
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  async function load() {
    if (currentView.current !== view) return;
    const generation = ++loadVersion.current;
    setBusy(true);
    setError("");
    try {
      const [p, c] = await Promise.all([api("/pets"), api("/care")]);
      if (generation !== loadVersion.current) return;
      setPets(p);
      setCare(c);
      setConnection(true);
      let data = [],
        extra = {};
      if (models[view]) data = await api("/records/" + view);
      else if (["medications", "reminders", "history"].includes(view))
        data = await api("/" + view);
      else if (view === "documents") data = await api("/files");
      else if (view === "family") extra = await api("/family");
      else if (view === "dashboard") {
        const [appointments, expenses, activity, vaccinations, health] =
          await Promise.all([
            api("/records/appointments"),
            api("/records/expenses"),
            api("/activity"),
            api("/records/vaccinations"),
            api("/records/health"),
          ]);
        extra = { appointments, expenses, activity, vaccinations, health };
      }
      if (generation === loadVersion.current) {
        setRows(data);
        setNoMoreRows(data.length < 500);
        setExtras(extra);
      }
    } catch (e) {
      if (generation === loadVersion.current) {
        setError(e.message);
        setConnection(false);
      }
    } finally {
      if (generation === loadVersion.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (status?.level === "full" && status.household) load();
    return () => {
      ++loadVersion.current;
    };
  }, [status?.level, status?.household?.household_id, view]);
  useEffect(() => {
    const restorePage = () => navigate(initialView(), false);
    window.addEventListener("popstate", restorePage);
    window.addEventListener("hashchange", restorePage);
    return () => {
      window.removeEventListener("popstate", restorePage);
      window.removeEventListener("hashchange", restorePage);
    };
  }, []);
  useEffect(() => {
    setSearch("");
    setFromDate("");
    setToDate("");
    setFilterStatus("");
  }, [view]);
  useEffect(() => {
    if (status?.level !== "full" || !status.household) return;
    let stopped = false;
    const poll = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const c = await api("/care");
        if (!stopped) {
          setCare(c);
          setConnection(true);
        }
      } catch (e) {
        if (!stopped) {
          setConnection(false);
          setError(e.message);
        }
      } finally {
        inFlight.current = false;
      }
    };
    const timer = setInterval(poll, 15000);
    const visible = () => {
      if (!document.hidden) poll();
    };
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [status?.level, status?.household?.household_id]);
  useEffect(() => {
    audio.current = new Audio("/alarm.wav");
    audio.current.loop = true;
    return () => audio.current?.pause();
  }, []);
  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);
  useEffect(() => {
    if (
      alarm &&
      !care.some((c) => c.id === alarm.id && c.status === "pending")
    ) {
      audio.current?.pause();
      setAlarm(null);
    }
  }, [care]);
  useEffect(() => {
    if (status?.level !== "full" || !status.household || !connection) return;
    const check = () => {
      if (document.hidden || alarm) return;
      const now = Date.now();
      const next = care.find(
        (c) =>
          c.status === "pending" &&
          dt(c.due_at, zone).toMillis() <= now &&
          now - dt(c.snoozed_until || c.due_at, zone).toMillis() <=
            15 * 60000 &&
          !c.dismissed_at &&
          (!c.snoozed_until || dt(c.snoozed_until, zone).toMillis() <= now) &&
          !alarmed.current.has(c.id + ":" + (c.snoozed_until || "")),
      );
      if (next) {
        const key = next.id + ":" + (next.snoozed_until || "");
        alarmed.current.add(key);
        setAlarm(next);
        if (sounds)
          audio.current?.play().catch(() => {
            setSounds(false);
            setToast("Sound was blocked. Use Enable sounds to allow playback.");
          });
        if (notifyEnabled)
          try {
            new Notification("PawCare: care reminder", {
              body: `${next.pet_name} · ${next.title}`,
              tag: next.id,
            });
          } catch {}
      }
    };
    const timer = setInterval(check, 1000);
    check();
    return () => clearInterval(timer);
  }, [care, sounds, notifyEnabled, alarm, status?.level, connection, zone]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function enableSounds() {
    try {
      audio.current.volume = volume;
      await audio.current.play();
      setSounds(true);
      setToast("Reminder sounds enabled for this tab.");
      setTimeout(() => {
        if (!alarm) {
          audio.current.pause();
          audio.current.currentTime = 0;
        }
      }, 1500);
    } catch {
      setToast(
        "Your browser blocked audio. Try again after interacting with this page.",
      );
    }
  }
  const disableSounds = () => {
    audio.current?.pause();
    setSounds(false);
  };
  async function enableNotifications() {
    if (typeof Notification === "undefined") {
      setToast("This browser does not support these notifications.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotifyEnabled(permission === "granted");
      if (permission !== "granted")
        setToast(
          "Notifications are blocked. You can enable them in your browser’s site settings.",
        );
    } catch {
      setToast(
        "Notifications are unavailable on this browser. In-app alerts are still available.",
      );
    }
  }
  function navigate(v, updateHistory = true) {
    setMobile(false);
    setModal(null);
    if (v === currentView.current) return;
    // Invalidate old requests and clear page-specific data in the same render.
    // Otherwise the next page tries to render records from the previous one.
    ++loadVersion.current;
    currentView.current = v;
    setRows([]);
    setExtras({});
    setNoMoreRows(false);
    setError("");
    setView(v);
    if (updateHistory) {
      const url = new URL(window.location.href);
      url.hash = new URLSearchParams({ page: v }).toString();
      window.history.pushState(null, "", url);
    }
  }
  const saved = async () => {
    await load();
    setToast("Saved. Your family’s records are up to date.");
  };
  async function perform(fn) {
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  function careAction(item, action) {
    if (action === "options") setModal({ type: "care-options", item });
    else
      perform(async () => {
        await api("/care/" + item.id + "/action", {
          method: "POST",
          body: { action },
        });
        if (alarm?.id === item.id) {
          audio.current.pause();
          setAlarm(null);
        }
        setToast(
          item.medication_id
            ? "Medication marked as given."
            : "Care task completed.",
        );
      });
  }
  async function alarmAction(action, minutes = 5, notes = "") {
    await api("/care/" + alarm.id + "/action", {
      method: "POST",
      body: { action, minutes, notes },
    });
    audio.current.pause();
    setAlarm(null);
    await load();
  }
  function openAdd() {
    if (view === "pets") setModal({ type: "pet" });
    else if (models[view]) setModal({ type: "record", kind: view });
    else if (view === "documents") setModal({ type: "upload" });
    else
      setModal({
        type: "care",
        kind: view === "medications" ? "medications" : "reminders",
      });
  }
  const petFilter = (r) => !selectedPet || r.pet_id === selectedPet;
  const filtered = rows.filter(
    (r) =>
      petFilter(r) &&
      JSON.stringify(r).toLowerCase().includes(search.toLowerCase()) &&
      (!filterStatus ||
        (r.status || r.category || r.outcome) === filterStatus) &&
      (!fromDate ||
        String(r.event_date || r.starts_at || r.due_at || r.created_at) >=
          fromDate) &&
      (!toDate ||
        String(r.event_date || r.starts_at || r.due_at || r.created_at).slice(
          0,
          10,
        ) <= toDate),
  );
  const todaysCare = care.filter(
      (c) =>
        petFilter(c) &&
        (dt(c.due_at, zone).toISODate() === day(zone) ||
          (c.status === "pending" &&
            dt(c.due_at, zone).toMillis() < Date.now())),
    ),
    pending = todaysCare.filter((c) => c.status === "pending"),
    doneToday = todaysCare.filter((c) => c.status === "done");
  const canAdd = isAdmin || models[view] || view === "documents";
  function makeReminder(r) {
    let category =
      {
        feeding: "Feeding",
        vaccinations: "Vaccination",
        grooming: "Grooming",
        appointments: "Vet appointment",
      }[view] || "Custom";
    let date = r.next_due_date || r.follow_up_date;
    const start = r.starts_at
      ? dt(r.starts_at, zone).toUTC().toISO()
      : date
        ? DateTime.fromISO(date + "T09:00", { zone })
            .toUTC()
            .toISO()
        : null;
    setModal({
      type: "care",
      kind: "reminders",
      preset: {
        pet_id: r.pet_id,
        title: r.title || "Follow-up care",
        category,
        notes: r.notes || "",
        schedule: start ? { recurrence: "once", start_at: start } : undefined,
      },
    });
  }
  if (!status)
    return (
      <div className="boot">
        <PawPrint size={35} />
        <h1>PawCare</h1>
        {bootError ? (
          <>
            <ErrorMessage message={bootError} />
            <Button onClick={refresh}>Try again</Button>
          </>
        ) : (
          <p>Opening your care space…</p>
        )}
      </div>
    );
  if (status.level !== "full")
    return (
      <Auth
        key={status.level}
        status={status}
        refresh={refresh}
        hashAction={hashAction}
      />
    );
  if (!status.household)
    return (
      <div className="onboarding">
        <div className="wordmark">
          <PawPrint /> pawcare
        </div>
        <section className="panel">
          <ShieldCheck size={32} />
          <h1>Your account is ready.</h1>
          <p className="muted">
            Create your family’s care space, or join using an invitation.
          </p>
          <ErrorMessage message={error} />
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const body = Object.fromEntries(new FormData(e.currentTarget));
              try {
                await api("/household", { method: "POST", body });
                await refresh();
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            <Field
              label="Household name"
              name="name"
              placeholder="Our family"
              required
              maxLength={120}
            />
            <Field
              label="Timezone"
              name="timezone"
              defaultValue="Asia/Manila"
              options={[
                "Asia/Manila",
                "Asia/Singapore",
                "Asia/Tokyo",
                "Australia/Sydney",
                "America/New_York",
                "America/Los_Angeles",
                "Europe/London",
                "UTC",
              ]}
            />
            <Button>
              Create household <ChevronRight size={16} />
            </Button>
          </form>
          <div className="divider">or join a household</div>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const input = new FormData(e.currentTarget).get("token");
                let raw = input;
                try {
                  raw =
                    new URLSearchParams(new URL(input).hash.slice(1)).get(
                      "invite",
                    ) || input;
                } catch {}
                await api("/household/join", {
                  method: "POST",
                  body: { token: raw },
                });
                window.history.replaceState(null, "", window.location.pathname);
                await refresh();
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            <Field
              label="Invitation link or code"
              name="token"
              required
              defaultValue={
                hashAction?.type === "invite" ? hashAction.token : ""
              }
            />
            <Button variant="secondary">Join family</Button>
          </form>
          <button
            className="text-btn"
            onClick={async () => {
              await api("/auth/logout", { method: "POST", body: {} });
              await refresh();
            }}
          >
            Sign out
          </button>
        </section>
      </div>
    );
  const currentTitle =
    view === "dashboard"
      ? "Your care, at a glance."
      : view === "pets"
        ? "My pets"
        : models[view]?.title ||
          navigation.find((n) => n[0] === view)?.[1] ||
          "Settings";
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a
          className="wordmark"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("dashboard");
          }}
        >
          <PawPrint size={27} /> pawcare<span>™</span>
        </a>
        <button
          className="mobile-close icon-btn"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        >
          <X />
        </button>
        <div className="household-label">
          <span className="eyebrow">CARE SPACE</span>
          <strong>{status.household.name}</strong>
        </div>
        <nav aria-label="Main navigation">
          {navigation.map(([key, label, Icon], i) => (
            <React.Fragment key={key}>
              {[2, 11].includes(i) && <div className="nav-rule" />}
              <button
                className={view === key ? "active" : ""}
                onClick={() => navigate(key)}
              >
                <Icon size={18} strokeWidth={1.65} />
                {label}
                {key === "dashboard" && pending.length > 0 && (
                  <span className="nav-count">{pending.length}</span>
                )}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={view === "settings" ? "active" : ""}
            onClick={() => navigate("settings")}
          >
            <SettingsIcon size={18} />
            Settings
          </button>
          <div className="user-row">
            <div className="avatar">
              {status.user.name.slice(0, 1).toUpperCase()}
            </div>
            <span>
              <strong>{status.user.name}</strong>
              <small>{isAdmin ? "Household admin" : "Family member"}</small>
            </span>
            <button
              className="icon-btn"
              aria-label="Sign out"
              onClick={async () => {
                audio.current.pause();
                setSounds(false);
                setAlarm(null);
                await api("/auth/logout", { method: "POST", body: {} });
                navigate("dashboard");
                await refresh();
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="nav-backdrop"
          aria-label="Close menu"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-btn mobile-toggle"
            aria-label="Open navigation"
            onClick={() => setMobile(true)}
          >
            <Menu />
          </button>
          <span>
            {status.household.name} <span className="muted">/</span>{" "}
            {view === "dashboard" ? "Overview" : currentTitle}
          </span>
          <div className="topbar-right">
            <span className="date-top">
              {DateTime.now().setZone(zone).toFormat("ccc, LLL d")}
            </span>
            <button
              className="icon-btn"
              aria-label="Open reminder settings"
              onClick={() => navigate("settings")}
            >
              <Bell size={19} />
            </button>
            <div className="avatar small">
              {status.user.name.slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              {view === "dashboard" && (
                <div className="eyebrow">A LITTLE CARE, EVERY DAY</div>
              )}
              <h1>{currentTitle}</h1>
              <p>
                {view === "dashboard"
                  ? `Hello, ${status.user.name.split(" ")[0]}. Here’s what your pets need today.`
                  : models[view]?.description ||
                    {
                      pets: "Every pet has a place here.",
                      medications:
                        "Prescribed care, clear schedules, and a shared history.",
                      reminders: "The everyday things you want to remember.",
                      documents:
                        "Keep prescriptions, reports, and receipts within reach.",
                      family: "Care works better together.",
                      history:
                        "A shared record of scheduled medication outcomes.",
                      settings:
                        "Your account, security, and reminder preferences.",
                    }[view]}
              </p>
            </div>
            {!["settings", "family", "history"].includes(view) && canAdd && (
              <Button
                onClick={openAdd}
                disabled={view !== "pets" && !pets.length}
              >
                <Plus size={18} />
                {view === "dashboard"
                  ? "Add reminder"
                  : view === "pets"
                    ? "Add pet"
                    : view === "documents"
                      ? "Upload document"
                      : models[view]
                        ? "Add " + models[view].singular
                        : view === "medications"
                          ? "Add medication"
                          : "Add reminder"}
              </Button>
            )}
          </div>
          <ErrorMessage message={error} />
          {!connection && (
            <div className="notice">
              Connection lost. Reminder updates are paused until PawCare
              reconnects.{" "}
              <button className="text-btn" onClick={load}>
                Retry
              </button>
            </div>
          )}
          {status.expiresAt &&
            dt(status.expiresAt, zone).toMillis() - Date.now() < 30 * 60000 && (
              <div className="notice">
                Your sign-in expires soon. Sign out and back in to keep
                receiving in-app reminders.
              </div>
            )}
          {!["family", "settings", "pets"].includes(view) &&
            pets.length > 0 && (
              <div className="filters">
                <label className="pet-filter">
                  <PawPrint size={17} />
                  <select
                    aria-label="Filter by pet"
                    value={selectedPet}
                    onChange={(e) => setSelectedPet(e.target.value)}
                  >
                    <option value="">All pets</option>
                    {pets.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                {view !== "dashboard" && (
                  <>
                    <label className="search">
                      <Search size={17} />
                      <input
                        placeholder="Search records…"
                        aria-label="Search records"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <input
                      type="date"
                      aria-label="From date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                    />
                    <input
                      type="date"
                      aria-label="To date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                    />
                    {[
                      "medications",
                      "appointments",
                      "expenses",
                      "history",
                    ].includes(view) && (
                      <select
                        aria-label="Filter by status or category"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                      >
                        <option value="">
                          All {view === "expenses" ? "categories" : "statuses"}
                        </option>
                        {[
                          ...new Set(
                            rows
                              .map((r) => r.status || r.category || r.outcome)
                              .filter(Boolean),
                          ),
                        ].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    )}
                  </>
                )}
              </div>
            )}
          {busy && (
            <p className="loading" role="status">
              Updating care records…
            </p>
          )}
          {view === "dashboard" && (
            <>
              <div className="stat-grid">
                <div className="stat">
                  <span>Care tasks today</span>
                  <strong>
                    {todaysCare.length.toString().padStart(2, "0")}
                  </strong>
                  <small>{pending.length} still need attention</small>
                </div>
                <div className="stat">
                  <span>Completed today</span>
                  <strong>
                    {doneToday.length.toString().padStart(2, "0")}
                  </strong>
                  <small>Recorded by your family</small>
                </div>
                <div className="stat">
                  <span>Upcoming appointments</span>
                  <strong>
                    {(extras.appointments || [])
                      .filter(
                        (r) =>
                          petFilter(r) &&
                          ["upcoming", "rescheduled"].includes(r.status) &&
                          dt(r.starts_at, zone).toMillis() >= Date.now(),
                      )
                      .length.toString()
                      .padStart(2, "0")}
                  </strong>
                  <small>Make room for their care</small>
                </div>
                <div className="stat">
                  <span>This month’s expenses</span>
                  <strong className="money">
                    {money(
                      (extras.expenses || [])
                        .filter(
                          (r) =>
                            petFilter(r) &&
                            r.event_date.startsWith(day(zone).slice(0, 7)),
                        )
                        .reduce((s, r) => s + Number(r.amount), 0),
                    )}
                  </strong>
                  <small>Across selected pets</small>
                </div>
              </div>
              <div className="dashboard-grid">
                <div className="stack">
                  <section className="panel care-panel">
                    <div className="section-heading">
                      <div>
                        <h2>Today’s care</h2>
                        <p className="small muted">
                          {DateTime.now()
                            .setZone(zone)
                            .toFormat("EEEE, MMMM d")}
                        </p>
                      </div>
                      <span className="badge">
                        {doneToday.length}/{todaysCare.length} done
                      </span>
                    </div>
                    {todaysCare.length ? (
                      todaysCare.map((c) => (
                        <CareRow
                          key={c.id}
                          item={c}
                          zone={zone}
                          onAction={careAction}
                        />
                      ))
                    ) : (
                      <Empty
                        title={
                          pets.length
                            ? "A clear day ahead"
                            : "Start with your first pet"
                        }
                        text={
                          pets.length
                            ? "Add a medication or reminder to plan their daily care."
                            : "Create a profile, then add a photo and their care schedule."
                        }
                        action={
                          isAdmin
                            ? pets.length
                              ? "Add reminder"
                              : "Add pet"
                            : null
                        }
                        onAction={() =>
                          setModal({
                            type: pets.length ? "care" : "pet",
                            kind: "reminders",
                          })
                        }
                      />
                    )}
                  </section>
                  <section className="panel">
                    <div className="section-heading">
                      <h2>Coming up</h2>
                      <button
                        className="text-btn"
                        onClick={() => navigate("reminders")}
                      >
                        View reminders <ArrowUpRight size={15} />
                      </button>
                    </div>
                    {care
                      .filter(
                        (c) =>
                          petFilter(c) &&
                          c.status === "pending" &&
                          dt(c.due_at, zone).toISODate() > day(zone),
                      )
                      .slice(0, 5)
                      .map((c) => (
                        <CareRow key={c.id} item={c} zone={zone} compact />
                      ))}
                    {!care.some(
                      (c) =>
                        petFilter(c) &&
                        c.status === "pending" &&
                        dt(c.due_at, zone).toISODate() > day(zone),
                    ) && (
                      <p className="muted">
                        No care tasks scheduled for the next seven days.
                      </p>
                    )}
                  </section>
                  <section className="panel">
                    <h2>Recent health notes</h2>
                    {(extras.health || [])
                      .filter(petFilter)
                      .slice(0, 3)
                      .map((r) => (
                        <button
                          className="summary-row"
                          key={r.id}
                          onClick={() => {
                            navigate("health");
                            setSelectedPet(r.pet_id);
                          }}
                        >
                          <HeartPulse size={18} />
                          <span>
                            <strong>{r.title}</strong>
                            <small>
                              {r.pet_name} · {dateLabel(r.event_date, zone)}
                            </small>
                          </span>
                          <ChevronRight size={18} />
                        </button>
                      ))}
                    {!(extras.health || []).filter(petFilter).length && (
                      <p className="muted">
                        Health records will appear here after you add them.
                      </p>
                    )}
                  </section>
                </div>
                <div className="stack">
                  <section className="sound-panel">
                    <Volume2 size={25} />
                    <h2>
                      {sounds
                        ? "You’re ready for reminders."
                        : "A gentle nudge, right on time."}
                    </h2>
                    <p>
                      {sounds
                        ? "Keep this page open and active for medication and care sounds."
                        : "Turn on sound to hear when a care task is due."}
                    </p>
                    <Button variant="light" onClick={enableSounds}>
                      {sounds
                        ? "Test reminder sound"
                        : "Enable reminder sounds"}
                      <ArrowUpRight size={16} />
                    </Button>
                  </section>
                  <section className="panel">
                    <div className="section-heading">
                      <h2>Your pets</h2>
                      <button
                        className="icon-btn"
                        aria-label="View pets"
                        onClick={() => navigate("pets")}
                      >
                        <ArrowUpRight size={18} />
                      </button>
                    </div>
                    {pets.length ? (
                      pets
                        .filter((p) => !selectedPet || p.id === selectedPet)
                        .map((p) => (
                          <button
                            className="summary-row pet-summary"
                            onClick={() => {
                              setSelectedPet(p.id);
                              navigate("pets");
                            }}
                            key={p.id}
                          >
                            <PetPhoto pet={p} />
                            <span>
                              <strong>{p.name}</strong>
                              <small>
                                {p.breed || p.species}
                                {p.weight_kg ? " · " + p.weight_kg + " kg" : ""}
                              </small>
                            </span>
                            <ChevronRight size={18} />
                          </button>
                        ))
                    ) : (
                      <p className="muted">
                        Your family’s pets will appear here.
                      </p>
                    )}
                  </section>
                  <section className="panel">
                    <h2>Vaccines due soon</h2>
                    {(extras.vaccinations || [])
                      .filter(
                        (r) =>
                          petFilter(r) &&
                          r.next_due_date &&
                          r.next_due_date <=
                            DateTime.now()
                              .setZone(zone)
                              .plus({ days: 30 })
                              .toISODate(),
                      )
                      .slice(0, 4)
                      .map((r) => (
                        <div className="mini-row" key={r.id}>
                          <strong>{r.title}</strong>
                          <small>
                            {r.pet_name} · {dateLabel(r.next_due_date, zone)}
                          </small>
                        </div>
                      ))}
                    {!(extras.vaccinations || []).some(
                      (r) =>
                        petFilter(r) &&
                        r.next_due_date &&
                        r.next_due_date <=
                          DateTime.now()
                            .setZone(zone)
                            .plus({ days: 30 })
                            .toISODate(),
                    ) && (
                      <p className="muted">
                        No recorded vaccinations due in the next 30 days.
                      </p>
                    )}
                  </section>
                  <section className="panel">
                    <h2>Family activity</h2>
                    {(extras.activity || []).slice(0, 4).map((a) => (
                      <div className="activity-item" key={a.id}>
                        <div className="avatar small">{a.name.slice(0, 1)}</div>
                        <p>
                          <strong>{a.name}</strong>{" "}
                          {a.action.charAt(0).toLowerCase() + a.action.slice(1)}
                          <small>
                            {dateLabel(a.created_at, zone)} ·{" "}
                            {timeLabel(a.created_at, zone)}
                          </small>
                        </p>
                      </div>
                    ))}
                    {!(extras.activity || []).length && (
                      <p className="muted">
                        Updates from your family will appear here.
                      </p>
                    )}
                  </section>
                </div>
              </div>
            </>
          )}
          {view === "pets" &&
            (pets.length ? (
              <div className="pet-grid">
                {pets.map((p) => (
                  <article className="pet-card" key={p.id}>
                    <div className="pet-card-image">
                      <PetPhoto pet={p} large />
                      {isAdmin && (
                        <button
                          className="photo-control"
                          aria-label={`Upload photo for ${p.name}`}
                          onClick={() => setModal({ type: "upload", pet: p })}
                        >
                          <Camera size={18} />
                        </button>
                      )}
                    </div>
                    <div className="pet-card-body">
                      <div className="section-heading">
                        <h2>{p.name}</h2>
                        <span className="badge">{p.species}</span>
                      </div>
                      <p className="muted">
                        {p.breed || "Breed not specified"} · {p.sex}
                      </p>
                      <dl className="pet-facts">
                        <div>
                          <dt>Age</dt>
                          <dd>
                            {p.birth_date
                              ? `${Math.floor(DateTime.now().diff(DateTime.fromISO(p.birth_date), "months").months)} months`
                              : p.estimated_age || "Not recorded"}
                          </dd>
                        </div>
                        <div>
                          <dt>Latest weight</dt>
                          <dd>
                            {p.weight_kg ? p.weight_kg + " kg" : "Not recorded"}
                          </dd>
                        </div>
                        <div>
                          <dt>Spayed / neutered</dt>
                          <dd>{p.neutered ? "Yes" : "No"}</dd>
                        </div>
                        <div>
                          <dt>Microchip</dt>
                          <dd>{p.microchip || "Not recorded"}</dd>
                        </div>
                      </dl>
                      {p.notes && <p className="pet-notes">{p.notes}</p>}
                      <div className="card-actions">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setSelectedPet(p.id);
                            navigate("health");
                          }}
                        >
                          Health records <ArrowUpRight size={16} />
                        </Button>
                        {isAdmin && (
                          <>
                            <button
                              className="text-btn"
                              onClick={() => setModal({ type: "pet", pet: p })}
                            >
                              Edit
                            </button>
                            <button
                              className="icon-btn"
                              aria-label={`Archive ${p.name}`}
                              onClick={() =>
                                setModal({
                                  type: "confirm",
                                  title: "Archive pet?",
                                  message:
                                    "This hides the profile and stops future reminders. Existing history is preserved.",
                                  endpoint: "/pets/" + p.id,
                                })
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                            {p.photo_id && (
                              <button
                                className="text-btn"
                                onClick={() =>
                                  setModal({
                                    type: "confirm",
                                    title: "Remove photo?",
                                    message:
                                      "You can upload a new profile photo at any time.",
                                    endpoint: "/files/" + p.photo_id,
                                  })
                                }
                              >
                                Remove photo
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <section className="panel">
                <Empty
                  title="Make room for your first pet"
                  text="Add a profile to start organizing their care."
                  action={isAdmin ? "Add pet" : null}
                  onAction={openAdd}
                />
              </section>
            ))}
          {models[view] && (
            <>
              <section className="panel">
                {view === "expenses" && (
                  <div className="expense-total">
                    <span>Total for this view</span>
                    <strong>
                      {money(
                        filtered.reduce((s, r) => s + Number(r.amount), 0),
                      )}
                    </strong>
                  </div>
                )}
                {view === "weight" && selectedPet && (
                  <WeightChart rows={filtered} />
                )}
                {view === "weight" && !selectedPet && pets.length > 1 && (
                  <p className="notice">
                    Choose one pet to see their weight trend.
                  </p>
                )}
                {filtered.length ? (
                  <div className="record-list">
                    {filtered.map((r) => (
                      <article className="record" key={r.id}>
                        <div className="record-main">
                          <span className="eyebrow">{r.pet_name}</span>
                          <h3>{r.title || r.weight_kg + " kg"}</h3>
                          <div className="record-meta">
                            <span>
                              {dateLabel(
                                r.event_date || r.starts_at || r.created_at,
                                zone,
                              )}
                              {r.starts_at
                                ? " · " + timeLabel(r.starts_at, zone)
                                : ""}
                            </span>
                            {r.status && (
                              <span className="badge">{r.status}</span>
                            )}
                            {r.category && (
                              <span className="badge">{r.category}</span>
                            )}
                            {r.amount != null && (
                              <strong>{money(r.amount)}</strong>
                            )}
                          </div>
                          <dl className="record-detail">
                            {models[view].fields
                              .filter(
                                (f) =>
                                  ![
                                    "title",
                                    "weight_kg",
                                    "event_date",
                                    "starts_at",
                                    "status",
                                    "amount",
                                    "category",
                                  ].includes(f.name) && r[f.name],
                              )
                              .map((f) => (
                                <div key={f.name}>
                                  <dt>{f.label}</dt>
                                  <dd>
                                    {f.type === "date"
                                      ? dateLabel(r[f.name], zone)
                                      : String(r[f.name])}
                                  </dd>
                                </div>
                              ))}
                          </dl>
                          {r.notes && <p className="record-notes">{r.notes}</p>}
                        </div>
                        <div className="record-actions">
                          {(isAdmin || r.created_by === status.user.id) && (
                            <Button
                              variant="secondary small-btn"
                              onClick={() =>
                                setModal({ type: "record", kind: view, row: r })
                              }
                            >
                              Edit
                            </Button>
                          )}
                          {isAdmin &&
                            [
                              "feeding",
                              "grooming",
                              "vaccinations",
                              "appointments",
                              "health",
                            ].includes(view) && (
                              <button
                                className="text-btn"
                                onClick={() => makeReminder(r)}
                              >
                                <Bell size={15} />
                                Set reminder
                              </button>
                            )}
                          {["health", "vaccinations", "expenses"].includes(
                            view,
                          ) && (
                            <button
                              className="text-btn"
                              onClick={() =>
                                setModal({
                                  type: "attachments",
                                  kind: view,
                                  row: r,
                                })
                              }
                            >
                              <LinkIcon size={15} />
                              Attachments
                            </button>
                          )}
                          {view === "appointments" &&
                            r.status === "completed" && (
                              <button
                                className="text-btn"
                                onClick={() =>
                                  setModal({
                                    type: "record",
                                    kind: "health",
                                    preset: {
                                      pet_id: r.pet_id,
                                      title: r.title,
                                      clinic: r.clinic,
                                      veterinarian: r.veterinarian,
                                      event_date: dt(
                                        r.starts_at,
                                        zone,
                                      ).toISODate(),
                                      notes: r.notes,
                                    },
                                  })
                                }
                              >
                                Add health record
                              </button>
                            )}
                          {isAdmin && (
                            <button
                              className="icon-btn"
                              aria-label="Archive record"
                              onClick={() =>
                                setModal({
                                  type: "confirm",
                                  title: "Archive this record?",
                                  message:
                                    "It will be hidden from active records. Its history is preserved in the database.",
                                  endpoint: "/records/" + view + "/" + r.id,
                                })
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title={`No ${models[view].title.toLowerCase()} to show`}
                    text={
                      search || selectedPet
                        ? "Try another filter or add a record."
                        : "Add the first record when you’re ready."
                    }
                  />
                )}
              </section>
            </>
          )}
          {["medications", "reminders"].includes(view) && (
            <section className="panel">
              {filtered.length ? (
                filtered.map((r) => (
                  <article className="record" key={r.id}>
                    <div className="record-main">
                      <span className="eyebrow">{r.pet_name}</span>
                      <h3>{r.title}</h3>
                      <p>
                        {r.dosage ? `${r.dosage} · ${r.route}` : r.category}
                      </p>
                      <p className="muted">{r.instructions || r.notes}</p>
                      {r.purpose && (
                        <p className="small">Purpose: {r.purpose}</p>
                      )}
                      {(r.schedules || []).map((s) => (
                        <div className="schedule-line" key={s.id}>
                          <Clock size={15} />
                          <span>
                            {s.recurrence === "interval"
                              ? `Every ${s.interval_hours} hours`
                              : s.recurrence === "once"
                                ? dateLabel(s.start_at, zone)
                                : s.recurrence === "weekdays"
                                  ? `Days: ${(typeof s.weekdays === "string" ? JSON.parse(s.weekdays) : s.weekdays).map((d) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d - 1]).join(", ")}`
                                  : s.recurrence}{" "}
                            · {s.local_time} · {s.timezone}
                            {s.end_at
                              ? " · Until " + dateLabel(s.end_at, zone)
                              : ""}
                          </span>
                        </div>
                      ))}
                      {r.status && <span className="badge">{r.status}</span>}
                    </div>
                    <div className="record-actions">
                      {isAdmin && (!r.status || r.status === "active") && (
                        <>
                          <Button
                            variant="secondary small-btn"
                            onClick={() =>
                              setModal({ type: "care", kind: view, row: r })
                            }
                          >
                            Edit schedule
                          </Button>
                          <button
                            className="text-btn"
                            onClick={() =>
                              setModal({
                                type: "confirm",
                                title: "Stop this schedule?",
                                message:
                                  "Future reminders will be cancelled. Past records and unresolved doses remain in history.",
                                endpoint: "/" + view + "/" + r.id,
                              })
                            }
                          >
                            Stop
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <Empty
                  title={`No ${view} to show`}
                  text="Add a schedule to include it in Today’s Care."
                />
              )}
            </section>
          )}
          {view === "documents" && (
            <section className="panel">
              {filtered.length ? (
                filtered.map((f) => (
                  <div className="record" key={f.id}>
                    <FileText size={24} />
                    <div className="record-main">
                      <span className="eyebrow">
                        {f.pet_name} / {f.document_type}
                      </span>
                      <h3>{f.title}</h3>
                      <p className="muted">
                        {dateLabel(f.created_at, zone)} ·{" "}
                        {(f.size_bytes / 1024).toFixed(0)} KB
                      </p>
                      {f.notes && <p>{f.notes}</p>}
                    </div>
                    <a
                      className="btn secondary small-btn"
                      href={`/api/files/${f.id}/content`}
                    >
                      Download <ArrowUpRight size={15} />
                    </a>
                    {isAdmin && (
                      <button
                        className="icon-btn"
                        aria-label={`Archive ${f.title}`}
                        onClick={() =>
                          setModal({
                            type: "confirm",
                            title: "Archive this document?",
                            message:
                              "It will no longer be accessible from the app.",
                            endpoint: "/files/" + f.id,
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <Empty
                  title="Their important papers, all together"
                  text="Upload a prescription, vaccination card, or vet report."
                />
              )}
            </section>
          )}
          {view === "history" && (
            <section className="panel">
              {filtered.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Medication / pet</th>
                        <th>Scheduled</th>
                        <th>Recorded</th>
                        <th>Outcome</th>
                        <th>Caregiver</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <strong>{r.title}</strong>
                            <small>
                              {r.pet_name} · {r.detail}
                            </small>
                          </td>
                          <td>
                            {dateLabel(r.due_at, zone)}
                            <small>{timeLabel(r.due_at, zone)}</small>
                          </td>
                          <td>
                            {dateLabel(r.recorded_at, zone)}
                            <small>{timeLabel(r.recorded_at, zone)}</small>
                          </td>
                          <td>
                            <span className="badge">{r.outcome}</span>
                            {r.outcome === "given" &&
                              dt(r.recorded_at, zone).toMillis() >
                                dt(r.due_at, zone).toMillis() + 60000 && (
                                <small>After scheduled time</small>
                              )}
                            {r.notes && <small>{r.notes}</small>}
                          </td>
                          <td>{r.completed_by_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="No medication outcomes recorded yet"
                  text="Given and skipped doses appear here with the person who recorded them."
                />
              )}
            </section>
          )}
          {view === "family" && (
            <Family
              extras={extras}
              status={status}
              admin={isAdmin}
              onSaved={saved}
              onError={setError}
            />
          )}
          {view === "settings" && (
            <Settings
              zone={zone}
              sounds={sounds}
              enableSounds={enableSounds}
              disableSounds={disableSounds}
              notifyEnabled={notifyEnabled}
              enableNotifications={enableNotifications}
              volume={volume}
              setVolume={(v) => {
                localStorage.setItem("pawcare-volume", v);
                setVolumeState(v);
              }}
            />
          )}
          {!noMoreRows &&
            rows.length >= 500 &&
            !["dashboard", "family", "settings", "pets"].includes(view) && (
              <div className="load-more">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={async () => {
                    const version = loadVersion.current;
                    setBusy(true);
                    try {
                      const path = models[view]
                        ? "/records/" + view
                        : view === "documents"
                          ? "/files"
                          : "/" + view;
                      const older = await api(path + "?offset=" + rows.length);
                      if (version === loadVersion.current) {
                        setRows((previous) => [...previous, ...older]);
                        setNoMoreRows(older.length < 500);
                      }
                    } catch (e) {
                      if (version === loadVersion.current) setError(e.message);
                    } finally {
                      if (version === loadVersion.current) setBusy(false);
                    }
                  }}
                >
                  Load older records
                </Button>
              </div>
            )}
          <footer className="page-footer">
            <span>
              <PawPrint size={14} /> PawCare
            </span>
            <span>
              {zone} · {connection ? "Connected" : "Reconnecting"}
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div role="status" className="toast">
          <Check size={18} />
          {toast}
        </div>
      )}
      {modal?.type === "pet" && (
        <PetForm
          pet={modal.pet}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      )}
      {modal?.type === "record" && (
        <RecordForm
          kind={modal.kind}
          row={modal.row}
          preset={modal.preset}
          pets={pets}
          selectedPet={selectedPet}
          zone={zone}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      )}
      {modal?.type === "care" && (
        <CareForm
          kind={modal.kind}
          row={modal.row}
          preset={modal.preset}
          pets={pets}
          selectedPet={selectedPet}
          zone={zone}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      )}
      {modal?.type === "upload" && (
        <UploadForm
          pet={modal.pet}
          pets={pets}
          selectedPet={selectedPet}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      )}
      {modal?.type === "confirm" && (
        <Confirm
          modal={modal}
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await api(modal.endpoint, { method: "DELETE", body: {} });
            await saved();
          }}
        />
      )}
      {modal?.type === "care-options" && (
        <CareOptions
          item={modal.item}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      )}
      {modal?.type === "attachments" && (
        <Attachments {...modal} onClose={() => setModal(null)} />
      )}
      {alarm && (
        <Alarm
          item={alarm}
          zone={zone}
          sound={sounds}
          onAction={alarmAction}
          enableSounds={enableSounds}
        />
      )}
    </div>
  );
}
function Confirm({ modal, onClose, onConfirm }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title={modal.title} onClose={onClose}>
      <p>{modal.message}</p>
      <ErrorMessage message={error} />
      <div className="form-footer">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onClose();
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Confirm
        </Button>
      </div>
    </Modal>
  );
}
function CareOptions({ item, onClose, onSaved }) {
  const [error, setError] = useState(""),
    [minutes, setMinutes] = useState(5),
    [reason, setReason] = useState("");
  async function act(action) {
    try {
      await api("/care/" + item.id + "/action", {
        method: "POST",
        body: { action, minutes: Number(minutes), notes: reason },
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <Modal title={item.title} onClose={onClose}>
      <div className="stack">
        <ErrorMessage message={error} />
        <Field
          label="Snooze for (minutes)"
          type="number"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          min={1}
          max={120}
        />
        <Button onClick={() => act("snooze")}>Snooze this alert</Button>
        <Button variant="secondary" onClick={() => act("dismiss")}>
          Dismiss alert
        </Button>
        <p className="small muted">
          Snooze and dismiss leave the task unconfirmed. They do not change the
          next scheduled dose.
        </p>
        <Field
          label="Reason for skipping"
          type="textarea"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
        />
        <Button
          variant="secondary"
          disabled={!reason.trim()}
          onClick={() => act("skip")}
        >
          Record as skipped
        </Button>
      </div>
    </Modal>
  );
}
function Alarm({ item, zone, sound, onAction, enableSounds }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function act(a, m) {
    setBusy(true);
    try {
      await onAction(a, m);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={item.medication_id ? "Medication time" : "Time for a little care"}
      onClose={() => act("dismiss")}
    >
      <div className="alarm-content">
        <div className="alarm-symbol">
          {item.medication_id ? <Pill size={34} /> : <Bell size={34} />}
        </div>
        <span className="eyebrow">{item.pet_name}</span>
        <h2>{item.title}</h2>
        <p>{item.detail}</p>
        <p className="muted">
          Scheduled {dateLabel(item.due_at, zone)} ·{" "}
          {timeLabel(item.due_at, zone)}
        </p>
        <ErrorMessage message={error} />
        {!sound && (
          <button className="text-btn" onClick={enableSounds}>
            Enable reminder sounds
          </button>
        )}
        <Button disabled={busy} onClick={() => act("done")}>
          <Check size={18} />
          {item.medication_id ? "Mark as given" : "Mark as completed"}
        </Button>
        <div className="alarm-snooze">
          {[5, 10, 15, 30].map((m) => (
            <Button
              key={m}
              variant="secondary"
              disabled={busy}
              onClick={() => act("snooze", m)}
            >
              {m} min
            </Button>
          ))}
        </div>
        <button
          className="text-btn"
          disabled={busy}
          onClick={() => act("dismiss")}
        >
          Dismiss alert
        </button>
        <small>Dismiss keeps this task unconfirmed in Today’s Care.</small>
      </div>
    </Modal>
  );
}
function Family({ extras, status, admin, onSaved, onError }) {
  const [invite, setInvite] = useState(null),
    [busy, setBusy] = useState(false);
  return (
    <div className="family-grid">
      <section className="panel">
        <h2>Family members</h2>
        {extras.members?.map((m) => (
          <div className="member" key={m.user_id}>
            <div className="avatar">{m.name.slice(0, 1)}</div>
            <div className="member-info">
              <strong>
                {m.name}
                {m.user_id === status.user.id ? " (you)" : ""}
              </strong>
              <small>{m.email}</small>
            </div>
            {admin ? (
              <select
                aria-label={`Role for ${m.name}`}
                value={m.role}
                onChange={async (e) => {
                  try {
                    await api("/family/" + m.user_id, {
                      method: "PATCH",
                      body: { role: e.target.value },
                    });
                    await onSaved();
                  } catch (e) {
                    onError(e.message);
                  }
                }}
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>
            ) : (
              <span className="badge">{m.role}</span>
            )}
            {admin && m.user_id !== status.user.id && (
              <button
                className="icon-btn"
                aria-label={`Remove ${m.name}`}
                onClick={async () => {
                  if (!window.confirm(`Remove ${m.name} from the household?`))
                    return;
                  try {
                    await api("/family/" + m.user_id, {
                      method: "PATCH",
                      body: { role: "remove" },
                    });
                    await onSaved();
                  } catch (e) {
                    onError(e.message);
                  }
                }}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
      </section>
      {admin && (
        <section className="panel">
          <h2>Invite a family member</h2>
          <p className="muted">
            They’ll create their own account and set up an authenticator before
            joining.
          </p>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const email = new FormData(e.currentTarget).get("email");
              try {
                setInvite(
                  await api("/family/invite", {
                    method: "POST",
                    body: { email },
                  }),
                );
                await onSaved();
              } catch (e) {
                onError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              label="Their email address"
              type="email"
              name="email"
              required
            />
            <Button disabled={busy}>
              {busy ? "Creating…" : "Create invitation link"}
            </Button>
          </form>
          {invite && (
            <div className="invitation-link">
              <p>
                Share this private link with {invite.email}. It expires in 7
                days.
              </p>
              <textarea
                aria-label="Invitation link"
                readOnly
                value={invite.link}
              />
              <Button
                variant="secondary"
                onClick={() =>
                  navigator.clipboard
                    .writeText(invite.link)
                    .catch(() =>
                      onError("Select and copy the invitation link manually."),
                    )
                }
              >
                Copy link
              </Button>
            </div>
          )}
          <h3 className="mt">Recent invitations</h3>
          {extras.invitations?.map((i) => (
            <div className="invitation-row" key={i.id}>
              <span>
                {i.email}
                <small>
                  {i.used_at
                    ? "Accepted"
                    : i.revoked_at
                      ? "Revoked"
                      : "Expires " + dateLabel(i.expires_at)}
                </small>
              </span>
              {!i.used_at && !i.revoked_at && (
                <button
                  className="text-btn"
                  onClick={async () => {
                    try {
                      await api("/family/invitations/" + i.id, {
                        method: "DELETE",
                        body: {},
                      });
                      await onSaved();
                    } catch (e) {
                      onError(e.message);
                    }
                  }}
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
function Attachments({ kind, row, onClose }) {
  const [files, setFiles] = useState([]),
    [linked, setLinked] = useState([]),
    [error, setError] = useState("");
  async function load() {
    try {
      const [all, links] = await Promise.all([
        api("/files"),
        api("/files/links/" + kind + "/" + row.id),
      ]);
      setFiles(all.filter((f) => f.pet_id === row.pet_id));
      setLinked(links);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <Modal title={"Attachments · " + row.title} onClose={onClose}>
      <div className="stack">
        <ErrorMessage message={error} />
        {linked.map((f) => (
          <a
            className="attachment"
            key={f.id}
            href={`/api/files/${f.id}/content`}
          >
            <FileText size={18} />
            {f.title}
            <ArrowUpRight size={15} />
          </a>
        ))}
        {!linked.length && <p className="muted">No documents linked yet.</p>}
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const fid = new FormData(e.currentTarget).get("file_id");
            try {
              await api("/files/" + fid + "/link", {
                method: "POST",
                body: { kind, record_id: row.id },
              });
              await load();
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          <Field
            label="Link an uploaded document"
            name="file_id"
            required
            options={[
              { value: "", label: "Choose document" },
              ...files
                .filter((f) => !linked.some((l) => l.id === f.id))
                .map((f) => ({ value: f.id, label: f.title })),
            ]}
          />
          <Button disabled={!files.length}>Link document</Button>
        </form>
        <p className="small muted">
          Upload new documents from the Documents page first.
        </p>
      </div>
    </Modal>
  );
}
