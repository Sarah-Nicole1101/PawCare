import { Router } from "express";
import { z } from "zod";
import { DateTime } from "luxon";
import { q, tx, id, fail, audit } from "./db.js";
import {
  requireFull,
  requireHousehold,
  admin,
  token,
  digest,
  rateLimit,
} from "./security.js";
import {
  petSchema,
  recordSchemas,
  tables,
  medicationSchema,
  reminderSchema,
  uuid,
} from "./validation.js";
import { sqlDate, asDate, nextOccurrence, materialize } from "./scheduler.js";
const router = Router();
const offset = (req) =>
  z.coerce
    .number()
    .int()
    .min(0)
    .max(1000000)
    .default(0)
    .parse(req.query.offset);
export async function petAccess(req, petId, db) {
  const [pet] = await q(
    "SELECT * FROM pets WHERE id=? AND household_id=? AND archived_at IS NULL",
    [uuid.parse(petId), req.member.household_id],
    db,
  );
  if (!pet) fail(404, "Pet not found.");
  return pet;
}
async function rowAccess(req, table, rowId, db) {
  const [row] = await q(
    `SELECT * FROM ${table} WHERE id=? AND household_id=?`,
    [uuid.parse(rowId), req.member.household_id],
    db,
  );
  if (!row) fail(404, "Record not found.");
  return row;
}
async function insert(table, data, db) {
  const keys = Object.keys(data);
  await q(
    `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
    Object.values(data),
    db,
  );
}
router.use(requireFull);
router.post("/household", async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(1).max(120),
      timezone: z
        .string()
        .default("Asia/Manila")
        .refine((x) => DateTime.now().setZone(x).isValid),
    })
    .parse(req.body);
  await tx(async (db) => {
    await q("SELECT id FROM users WHERE id=? FOR UPDATE", [req.user.id], db);
    const rows = await q(
      "SELECT user_id FROM household_members WHERE user_id=?",
      [req.user.id],
      db,
    );
    if (rows.length) fail(409, "You already belong to a household.");
    const hid = id();
    await insert("households", { id: hid, ...data }, db);
    await insert(
      "household_members",
      { user_id: req.user.id, household_id: hid, role: "admin" },
      db,
    );
  });
  res.status(201).json({ ok: true });
});
router.post("/household/join", async (req, res) => {
  const raw = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(req.body.token);
  await rateLimit("join", req.user.id, 15);
  await tx(async (db) => {
    await q("SELECT id FROM users WHERE id=? FOR UPDATE", [req.user.id], db);
    const [inv] = await q(
      "SELECT * FROM invitations WHERE token_hash=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE",
      [digest(raw)],
      db,
    );
    if (!inv || inv.email.toLowerCase() !== req.user.email.toLowerCase())
      fail(
        400,
        "This invitation is invalid, expired, or addressed to a different email.",
      );
    if (
      (
        await q(
          "SELECT user_id FROM household_members WHERE user_id=?",
          [req.user.id],
          db,
        )
      ).length
    )
      fail(409, "Your account already belongs to a household.");
    await insert(
      "household_members",
      { user_id: req.user.id, household_id: inv.household_id, role: "member" },
      db,
    );
    await q(
      "UPDATE invitations SET used_at=UTC_TIMESTAMP(3) WHERE id=?",
      [inv.id],
      db,
    );
  });
  res.json({ ok: true });
});
router.use(requireHousehold);
router.get("/family", async (req, res) => {
  const members = await q(
    "SELECT m.user_id,m.role,u.name,u.email,m.joined_at FROM household_members m JOIN users u ON u.id=m.user_id WHERE household_id=?",
    [req.member.household_id],
  );
  const invitations =
    req.member.role === "admin"
      ? await q(
          "SELECT id,email,expires_at,used_at,revoked_at FROM invitations WHERE household_id=? ORDER BY expires_at DESC LIMIT 100",
          [req.member.household_id],
        )
      : [];
  res.json({ members, invitations });
});
router.post("/family/invite", admin, async (req, res) => {
  const email = z
    .email()
    .transform((x) => x.toLowerCase().trim())
    .parse(req.body.email);
  await rateLimit("invite", req.user.id, 20);
  const raw = token();
  await insert("invitations", {
    id: id(),
    household_id: req.member.household_id,
    email,
    token_hash: digest(raw),
    created_by: req.user.id,
    expires_at: sqlDate(Date.now() + 7 * 86400000),
  });
  await audit(req, "Created a family invitation", "invitation");
  res.json({ link: `${process.env.APP_ORIGIN}/#invite=${raw}`, email });
});
router.delete("/family/invitations/:id", admin, async (req, res) => {
  await q(
    "UPDATE invitations SET revoked_at=UTC_TIMESTAMP(3) WHERE id=? AND household_id=?",
    [uuid.parse(req.params.id), req.member.household_id],
  );
  res.json({ ok: true });
});
router.patch("/family/:id", admin, async (req, res) => {
  const target = uuid.parse(req.params.id),
    role = z.enum(["admin", "member", "remove"]).parse(req.body.role);
  await tx(async (db) => {
    await q(
      "SELECT id FROM households WHERE id=? FOR UPDATE",
      [req.member.household_id],
      db,
    );
    const [m] = await q(
      "SELECT * FROM household_members WHERE user_id=? AND household_id=?",
      [target, req.member.household_id],
      db,
    );
    if (!m) fail(404, "Family member not found.");
    if (m.role === "admin" && role !== "admin") {
      const [c] = await q(
        "SELECT COUNT(*) AS n FROM household_members WHERE household_id=? AND role='admin'",
        [req.member.household_id],
        db,
      );
      if (c.n <= 1) fail(409, "Keep at least one household admin.");
    }
    if (role === "remove") {
      await q("DELETE FROM household_members WHERE user_id=?", [target], db);
      await q("DELETE FROM sessions WHERE user_id=?", [target], db);
    } else
      await q(
        "UPDATE household_members SET role=? WHERE user_id=?",
        [role, target],
        db,
      );
    await audit(
      req,
      role === "remove" ? "Removed a family member" : "Changed a family role",
      "member",
      target,
      db,
    );
  });
  res.json({ ok: true });
});
router.get("/pets", async (req, res) =>
  res.json(
    await q(
      "SELECT p.*,(SELECT id FROM files f WHERE f.pet_id=p.id AND f.kind='photo' AND f.deleted_at IS NULL ORDER BY f.created_at DESC LIMIT 1) AS photo_id,(SELECT weight_kg FROM weight_logs w WHERE w.pet_id=p.id AND w.archived_at IS NULL ORDER BY event_date DESC,created_at DESC LIMIT 1) AS weight_kg FROM pets p WHERE p.household_id=? AND p.archived_at IS NULL ORDER BY p.name",
      [req.member.household_id],
    ),
  ),
);
router.post("/pets", admin, async (req, res) => {
  const data = petSchema.parse(req.body);
  const pid = id();
  await tx(async (db) => {
    await insert(
      "pets",
      { id: pid, household_id: req.member.household_id, ...data },
      db,
    );
    await audit(req, `Added ${data.name}`, "pet", pid, db);
  });
  res.status(201).json({ id: pid });
});
router.patch("/pets/:id", admin, async (req, res) => {
  await petAccess(req, req.params.id);
  const data = petSchema.parse(req.body);
  await tx(async (db) => {
    await q(
      `UPDATE pets SET ${Object.keys(data)
        .map((k) => k + "=?")
        .join(",")},updated_at=UTC_TIMESTAMP(3) WHERE id=? AND household_id=?`,
      [...Object.values(data), req.params.id, req.member.household_id],
      db,
    );
    await audit(req, `Updated ${data.name}`, "pet", req.params.id, db);
  });
  res.json({ ok: true });
});
router.delete("/pets/:id", admin, async (req, res) => {
  const p = await petAccess(req, req.params.id);
  await tx(async (db) => {
    await q(
      "UPDATE pets SET archived_at=UTC_TIMESTAMP(3) WHERE id=?",
      [p.id],
      db,
    );
    await q("UPDATE schedules SET active=FALSE WHERE pet_id=?", [p.id], db);
    await q(
      "UPDATE occurrences SET status='cancelled' WHERE pet_id=? AND status='pending' AND due_at>UTC_TIMESTAMP(3)",
      [p.id],
      db,
    );
    await audit(req, `Archived ${p.name}`, "pet", p.id, db);
  });
  res.json({ ok: true });
});
router.get("/records/:kind", async (req, res) => {
  const table = tables[req.params.kind];
  if (!table) fail(404, "Record type not found.");
  const params = [req.member.household_id];
  let filter = "";
  if (req.query.pet) {
    params.push(uuid.parse(req.query.pet));
    filter = " AND r.pet_id=?";
  }
  res.json(
    await q(
      `SELECT r.*,p.name AS pet_name FROM ${table} r JOIN pets p ON p.id=r.pet_id WHERE r.household_id=? AND r.archived_at IS NULL AND p.archived_at IS NULL${filter} ORDER BY r.created_at DESC LIMIT 500` +
        " OFFSET " +
        offset(req),
      params,
    ),
  );
});
router.post("/records/:kind", async (req, res) => {
  const schema = recordSchemas[req.params.kind],
    table = tables[req.params.kind];
  if (!schema) fail(404, "Record type not found.");
  const data = schema.parse(req.body);
  await petAccess(req, data.pet_id);
  if (data.starts_at) data.starts_at = sqlDate(data.starts_at);
  const rid = id();
  await tx(async (db) => {
    await insert(
      table,
      {
        id: rid,
        household_id: req.member.household_id,
        created_by: req.user.id,
        ...data,
      },
      db,
    );
    await audit(req, `Added ${req.params.kind} record`, "record", rid, db);
  });
  res.status(201).json({ id: rid });
});
router.patch("/records/:kind/:id", async (req, res) => {
  const table = tables[req.params.kind],
    schema = recordSchemas[req.params.kind];
  if (!table) fail(404, "Record type not found.");
  const row = await rowAccess(req, table, req.params.id);
  if (req.member.role !== "admin" && row.created_by !== req.user.id)
    fail(403, "Only the author or an admin can edit this record.");
  const data = schema.parse(req.body);
  await petAccess(req, data.pet_id);
  if (data.pet_id !== row.pet_id)
    fail(400, "A record cannot be moved to another pet.");
  if (data.starts_at) data.starts_at = sqlDate(data.starts_at);
  await tx(async (db) => {
    await q(
      `UPDATE ${table} SET ${Object.keys(data)
        .map((k) => k + "=?")
        .join(",")} WHERE id=? AND household_id=?`,
      [...Object.values(data), row.id, req.member.household_id],
      db,
    );
    await audit(req, `Updated ${req.params.kind} record`, "record", row.id, db);
  });
  res.json({ ok: true });
});
router.delete("/records/:kind/:id", admin, async (req, res) => {
  const table = tables[req.params.kind];
  if (!table) fail(404, "Record type not found.");
  const row = await rowAccess(req, table, req.params.id);
  await tx(async (db) => {
    await q(
      `UPDATE ${table} SET archived_at=UTC_TIMESTAMP(3) WHERE id=?`,
      [row.id],
      db,
    );
    await audit(
      req,
      `Archived ${req.params.kind} record`,
      "record",
      row.id,
      db,
    );
  });
  res.json({ ok: true });
});
async function createSchedules(req, data, entityId, medication, db) {
  const config = data.schedule,
    zone = req.member.timezone;
  const start = DateTime.fromISO(config.start_local, { zone });
  if (!start.isValid) fail(400, "Enter a valid start date and time.");
  if (config.recurrence === "once" && start.toMillis() < Date.now() - 60000)
    fail(400, "A one-time reminder must be in the future.");
  if (config.recurrence === "weekdays" && !config.weekdays?.length)
    fail(400, "Choose at least one weekday.");
  if (config.recurrence === "interval" && !config.interval_hours)
    fail(400, "Enter the interval in hours.");
  const endString = medication ? data.end_date : config.end_date;
  const end = endString
    ? DateTime.fromISO(endString, { zone }).endOf("day")
    : null;
  if (end && end < start) fail(400, "End date must follow the start date.");
  if (
    medication &&
    DateTime.fromISO(data.start_date, { zone }).startOf("day") > start
  )
    fail(400, "The first reminder cannot be before the medication start date.");
  const times =
    config.recurrence === "interval" || config.recurrence === "once"
      ? [start.toFormat("HH:mm")]
      : [
          ...new Set(
            config.times?.length ? config.times : [start.toFormat("HH:mm")],
          ),
        ];
  for (const time of times) {
    const [hour, minute] = time.split(":").map(Number);
    const anchor = start.set({ hour, minute });
    const s = {
      id: id(),
      household_id: req.member.household_id,
      pet_id: data.pet_id,
      medication_id: medication ? entityId : null,
      reminder_id: medication ? null : entityId,
      title: data.title,
      detail: medication
        ? `${data.dosage} · ${data.route}${data.instructions ? " · " + data.instructions : ""}`
        : data.notes,
      recurrence: config.recurrence,
      interval_hours: config.interval_hours || null,
      weekdays: JSON.stringify(config.weekdays || []),
      local_time: time,
      timezone: zone,
      start_at: sqlDate(anchor.toJSDate()),
      end_at: end ? sqlDate(end.toJSDate()) : null,
    };
    // Never invent historic doses. Start with the first future occurrence.
    const next = nextOccurrence(
      s,
      new Date(Math.max(Date.now() - 1000, anchor.toMillis() - 1)),
    );
    if (!next)
      fail(400, "This schedule has no future occurrence before its end date.");
    s.next_due_at = sqlDate(next);
    await insert("schedules", s, db);
  }
}
for (const kind of ["medications", "reminders"]) {
  const medication = kind === "medications";
  router.get("/" + kind, async (req, res) => {
    const rows = await q(
      `SELECT r.*,p.name AS pet_name FROM ${kind} r JOIN pets p ON p.id=r.pet_id WHERE r.household_id=? AND p.archived_at IS NULL ${medication ? "" : "AND r.archived_at IS NULL"} ORDER BY r.created_at DESC LIMIT 500` +
        " OFFSET " +
        offset(req),
      [req.member.household_id],
    );
    const schedules = await q(
      "SELECT * FROM schedules WHERE household_id=? AND active=TRUE",
      [req.member.household_id],
    );
    res.json(
      rows.map((r) => ({
        ...r,
        schedules: schedules.filter(
          (s) => (medication ? s.medication_id : s.reminder_id) === r.id,
        ),
      })),
    );
  });
  router.post("/" + kind, admin, async (req, res) => {
    const data = (medication ? medicationSchema : reminderSchema).parse(
      req.body,
    );
    await petAccess(req, data.pet_id);
    if (medication && data.end_date && data.end_date < data.start_date)
      fail(400, "Medication end date cannot precede its start.");
    const rid = id();
    const { schedule, ...record } = data;
    await tx(async (db) => {
      await insert(
        kind,
        {
          id: rid,
          household_id: req.member.household_id,
          created_by: req.user.id,
          ...record,
        },
        db,
      );
      await createSchedules(req, data, rid, medication, db);
      await audit(
        req,
        `Added ${medication ? "medication" : "reminder"}: ${data.title}`,
        kind,
        rid,
        db,
      );
    });
    await materialize(req.member.household_id);
    res.status(201).json({ id: rid });
  });
  router.patch("/" + kind + "/:id", admin, async (req, res) => {
    const row = await rowAccess(req, kind, req.params.id);
    if ((medication && row.status !== "active") || row.archived_at)
      fail(
        400,
        "Stopped schedules cannot be edited. Create a new schedule instead.",
      );
    const data = (medication ? medicationSchema : reminderSchema).parse(
      req.body,
    );
    if (row.pet_id !== data.pet_id)
      fail(400, "A schedule cannot be moved to another pet.");
    await petAccess(req, data.pet_id);
    const { schedule, ...record } = data;
    await tx(async (db) => {
      await q(
        `UPDATE ${kind} SET ${Object.keys(record)
          .map((k) => k + "=?")
          .join(",")} WHERE id=?`,
        [...Object.values(record), row.id],
        db,
      );
      const field = medication ? "medication_id" : "reminder_id";
      await q(
        `UPDATE schedules SET active=FALSE WHERE ${field}=?`,
        [row.id],
        db,
      );
      await q(
        `UPDATE occurrences o JOIN schedules s ON s.id=o.schedule_id SET o.status='cancelled' WHERE s.${field}=? AND o.status='pending' AND o.due_at>UTC_TIMESTAMP(3)`,
        [row.id],
        db,
      );
      await createSchedules(req, data, row.id, medication, db);
      await audit(req, `Updated ${kind} schedule`, kind, row.id, db);
    });
    await materialize(req.member.household_id);
    res.json({ ok: true });
  });
  router.delete("/" + kind + "/:id", admin, async (req, res) => {
    const row = await rowAccess(req, kind, req.params.id);
    await tx(async (db) => {
      await q(
        medication
          ? "UPDATE medications SET status='stopped' WHERE id=?"
          : "UPDATE reminders SET archived_at=UTC_TIMESTAMP(3) WHERE id=?",
        [row.id],
        db,
      );
      const field = medication ? "medication_id" : "reminder_id";
      await q(
        `UPDATE schedules SET active=FALSE WHERE ${field}=?`,
        [row.id],
        db,
      );
      await q(
        `UPDATE occurrences o JOIN schedules s ON s.id=o.schedule_id SET o.status='cancelled' WHERE s.${field}=? AND o.status='pending' AND o.due_at>UTC_TIMESTAMP(3)`,
        [row.id],
        db,
      );
      await audit(req, `Stopped ${kind} schedule`, kind, row.id, db);
    });
    res.json({ ok: true });
  });
}
router.get("/care", async (req, res) => {
  await materialize(req.member.household_id);
  res.json(
    await q(
      "SELECT o.*,p.name AS pet_name,s.medication_id,s.timezone,a.snoozed_until,a.dismissed_at,u.name AS completed_by_name FROM occurrences o JOIN schedules s ON s.id=o.schedule_id JOIN pets p ON p.id=o.pet_id LEFT JOIN alert_states a ON a.occurrence_id=o.id AND a.user_id=? LEFT JOIN users u ON u.id=o.completed_by WHERE o.household_id=? AND p.archived_at IS NULL AND o.status<>'cancelled' AND (o.status='pending' OR o.due_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 30 DAY)) AND o.due_at<=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 7 DAY) ORDER BY o.due_at LIMIT 1000",
      [req.user.id, req.member.household_id],
    ),
  );
});
router.post("/care/:id/action", async (req, res) => {
  const { action, minutes, notes } = z
    .object({
      action: z.enum(["done", "skip", "snooze", "dismiss"]),
      minutes: z.coerce.number().int().min(1).max(120).optional(),
      notes: z.string().max(300).optional().default(""),
    })
    .parse(req.body);
  await tx(async (db) => {
    const o = await rowAccess(req, "occurrences", req.params.id, db);
    const [locked] = await q(
      "SELECT * FROM occurrences WHERE id=? FOR UPDATE",
      [o.id],
      db,
    );
    if (locked.status !== "pending")
      fail(409, "This care task has already been recorded by a family member.");
    const [s] = await q(
      "SELECT medication_id FROM schedules WHERE id=?",
      [o.schedule_id],
      db,
    );
    if (action === "done" || action === "skip") {
      if (asDate(o.due_at).getTime() > Date.now())
        fail(400, "This task is not due yet.");
      if (action === "skip" && !notes.trim())
        fail(400, "Add a reason for skipping this task.");
      await q(
        "UPDATE occurrences SET status=?,completed_at=UTC_TIMESTAMP(3),completed_by=? WHERE id=?",
        [action === "done" ? "done" : "skipped", req.user.id, o.id],
        db,
      );
      if (s.medication_id)
        await insert(
          "medication_logs",
          {
            id: id(),
            occurrence_id: o.id,
            user_id: req.user.id,
            outcome: action === "done" ? "given" : "skipped",
            notes,
          },
          db,
        );
      await audit(
        req,
        `${action === "done" ? "Completed" : "Skipped"} ${o.title}`,
        "occurrence",
        o.id,
        db,
      );
    } else {
      await q(
        "INSERT INTO alert_states(occurrence_id,user_id,snoozed_until,dismissed_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE snoozed_until=VALUES(snoozed_until),dismissed_at=VALUES(dismissed_at)",
        [
          o.id,
          req.user.id,
          action === "snooze"
            ? sqlDate(Date.now() + (minutes || 5) * 60000)
            : null,
          action === "dismiss" ? sqlDate(Date.now()) : null,
        ],
        db,
      );
      await audit(
        req,
        `${action === "snooze" ? "Snoozed" : "Dismissed alert for"} ${o.title}`,
        "occurrence",
        o.id,
        db,
      );
    }
  });
  res.json({ ok: true });
});
router.get("/history", async (req, res) =>
  res.json(
    await q(
      "SELECT l.*,o.title,o.detail,o.due_at,p.name AS pet_name,u.name AS completed_by_name FROM medication_logs l JOIN occurrences o ON o.id=l.occurrence_id JOIN pets p ON p.id=o.pet_id JOIN users u ON u.id=l.user_id WHERE o.household_id=? ORDER BY l.recorded_at DESC LIMIT 500" +
        " OFFSET " +
        offset(req),
      [req.member.household_id],
    ),
  ),
);
router.get("/activity", async (req, res) =>
  res.json(
    await q(
      "SELECT a.*,u.name FROM activity_log a JOIN users u ON u.id=a.user_id WHERE household_id=? ORDER BY created_at DESC LIMIT 100",
      [req.member.household_id],
    ),
  ),
);
export default router;
