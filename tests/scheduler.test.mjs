import test from "node:test";
import assert from "node:assert/strict";
import { nextOccurrence } from "../server/scheduler.js";
const base = {
  start_at: "2026-09-11 00:00:00.000",
  local_time: "08:00",
  timezone: "Asia/Manila",
  recurrence: "daily",
};
test("Manila daily schedule stays at 08:00 local and advances once", () => {
  assert.equal(
    nextOccurrence(base, "2026-09-11T00:00:00Z").toISOString(),
    "2026-09-12T00:00:00.000Z",
  );
});
test("One-time schedule ends after the occurrence", () => {
  assert.equal(
    nextOccurrence({ ...base, recurrence: "once" }, "2026-09-11T00:00:00Z"),
    null,
  );
});
test("Fixed intervals use elapsed hours", () => {
  assert.equal(
    nextOccurrence(
      { ...base, recurrence: "interval", interval_hours: 8 },
      "2026-09-11T00:00:00Z",
    ).toISOString(),
    "2026-09-11T08:00:00.000Z",
  );
});
test("Selected weekdays skip unselected days", () => {
  assert.equal(
    nextOccurrence(
      { ...base, recurrence: "weekdays", weekdays: [1] },
      "2026-09-11T00:00:00Z",
    ).toISOString(),
    "2026-09-14T00:00:00.000Z",
  );
});
test("Monthly day 31 clamps February but retains the March anchor", () => {
  const s = {
    ...base,
    recurrence: "monthly",
    start_at: "2027-01-31 00:00:00.000",
  };
  const feb = nextOccurrence(s, "2027-01-31T00:00:00Z");
  assert.equal(feb.toISOString(), "2027-02-28T00:00:00.000Z");
  assert.equal(
    nextOccurrence(s, feb).toISOString(),
    "2027-03-31T00:00:00.000Z",
  );
});
test("An end date prevents further generation", () => {
  assert.equal(
    nextOccurrence(
      { ...base, end_at: "2026-09-11 15:59:59.999" },
      "2026-09-11T00:00:00Z",
    ),
    null,
  );
});
test("Daily local time stays 08:00 across a daylight-saving transition", () => {
  const s = {
    ...base,
    timezone: "America/New_York",
    start_at: "2026-03-07 13:00:00.000",
  };
  assert.equal(
    nextOccurrence(s, "2026-03-07T13:00:00Z").toISOString(),
    "2026-03-08T12:00:00.000Z",
  );
});
test("A future start is not scheduled earlier", () => {
  assert.equal(
    nextOccurrence(base, "2026-09-10T00:00:00Z").toISOString(),
    "2026-09-11T00:00:00.000Z",
  );
});
