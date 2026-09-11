import { DateTime } from "luxon";
import { q, tx, id } from "./db.js";
export const sqlDate = (date) =>
  new Date(date).toISOString().slice(0, 23).replace("T", " ");
export const asDate = (value) =>
  new Date(
    typeof value === "string" && !value.endsWith("Z") && !value.includes("+")
      ? value.replace(" ", "T") + "Z"
      : value,
  );
export function nextOccurrence(s, after) {
  const start = DateTime.fromJSDate(asDate(s.start_at), { zone: s.timezone });
  const boundary = DateTime.fromJSDate(asDate(after), { zone: s.timezone });
  if (!start.isValid || !boundary.isValid)
    throw new Error("Invalid schedule timestamp or timezone.");
  let candidate = start;
  if (s.recurrence === "once") candidate = start > boundary ? start : null;
  else if (s.recurrence === "interval") {
    const step = Number(s.interval_hours) * 3600000;
    if (!(step > 0)) throw new Error("Interval must be positive.");
    const n = Math.max(
      0,
      Math.floor((boundary.toMillis() - start.toMillis()) / step) + 1,
    );
    candidate = start.plus({ milliseconds: n * step });
  } else {
    const [hour, minute] = (s.local_time || start.toFormat("HH:mm"))
      .split(":")
      .map(Number);
    let day = (boundary > start ? boundary : start).startOf("day");
    const weekdays =
      typeof s.weekdays === "string" ? JSON.parse(s.weekdays) : s.weekdays;
    candidate = null;
    for (let i = 0; i < 370; i++) {
      const d = day.plus({ days: i });
      let allowed = true;
      if (s.recurrence === "weekly") allowed = d.weekday === start.weekday;
      if (s.recurrence === "weekdays")
        allowed = (weekdays || []).includes(d.weekday);
      if (s.recurrence === "monthly")
        allowed = d.day === Math.min(start.day, d.daysInMonth);
      const test = d.set({ hour, minute, second: 0, millisecond: 0 });
      if (allowed && test >= start && test > boundary) {
        candidate = test;
        break;
      }
    }
  }
  if (!candidate) return null;
  if (s.end_at && candidate.toMillis() > asDate(s.end_at).getTime())
    return null;
  return candidate.toUTC().toJSDate();
}
export async function materialize(householdId) {
  const schedules = await q(
    "SELECT id FROM schedules WHERE household_id=? AND active=TRUE AND next_due_at<=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 7 DAY) LIMIT 250",
    [householdId],
  );
  for (const row of schedules)
    await tx(async (db) => {
      const [s] = await q(
        "SELECT * FROM schedules WHERE id=? AND active=TRUE FOR UPDATE",
        [row.id],
        db,
      );
      if (!s) return;
      let due = s.next_due_at ? asDate(s.next_due_at) : null;
      const horizon = Date.now() + 7 * 86400000;
      for (let i = 0; due && due.getTime() <= horizon && i < 200; i++) {
        await q(
          "INSERT IGNORE INTO occurrences(id,household_id,pet_id,schedule_id,due_at,title,detail) VALUES(?,?,?,?,?,?,?)",
          [
            id(),
            s.household_id,
            s.pet_id,
            s.id,
            sqlDate(due),
            s.title,
            s.detail,
          ],
          db,
        );
        due = nextOccurrence(s, due);
      }
      await q(
        "UPDATE schedules SET next_due_at=? WHERE id=?",
        [due ? sqlDate(due) : null, s.id],
        db,
      );
    });
}
