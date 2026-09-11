import { z } from "zod";
import { DateTime } from "luxon";
const text = (n = 160) => z.string().trim().max(n).optional().default("");
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => DateTime.fromISO(v).isValid, "Enter a valid date.");
const optionalDate = z
  .union([date, z.literal(""), z.null()])
  .optional()
  .transform((v) => v || null);
export const uuid = z.uuid();
const common = { pet_id: uuid, notes: text(5000) };
export const petSchema = z.object({
  name: z.string().trim().min(1).max(100),
  species: z.string().trim().min(1).max(40),
  breed: text(100),
  sex: z.enum(["female", "male", "unknown"]),
  birth_date: optionalDate,
  estimated_age: text(80),
  markings: text(160),
  neutered: z.boolean().default(false),
  microchip: text(60),
  notes: text(5000),
});
export const recordSchemas = {
  health: z.object({
    ...common,
    title: z.string().trim().min(1).max(160),
    record_type: z.string().min(1).max(60),
    event_date: date,
    symptoms: text(5000),
    diagnosis: text(5000),
    procedure_notes: text(5000),
    veterinarian: text(120),
    clinic: text(160),
    follow_up_date: optionalDate,
  }),
  vaccinations: z.object({
    ...common,
    title: z.string().min(1).max(160),
    dose: text(80),
    event_date: date,
    next_due_date: optionalDate,
    veterinarian: text(120),
    clinic: text(160),
    batch_number: text(80),
  }),
  appointments: z.object({
    ...common,
    title: z.string().min(1).max(160),
    starts_at: z.iso.datetime({ offset: true }),
    clinic: text(160),
    veterinarian: text(120),
    status: z.enum(["upcoming", "completed", "cancelled", "rescheduled"]),
  }),
  weight: z.object({
    ...common,
    weight_kg: z.coerce.number().positive().max(1000),
    event_date: date,
  }),
  feeding: z.object({
    ...common,
    title: z.string().min(1).max(160),
    food_type: text(80),
    portion_text: z.string().min(1).max(80),
  }),
  grooming: z.object({
    ...common,
    title: z.string().min(1).max(160),
    event_date: date,
    next_due_date: optionalDate,
    groomer: text(120),
    cost: z
      .union([
        z.literal(""),
        z.null(),
        z.coerce.number().nonnegative().max(9999999999),
      ])
      .optional()
      .transform((v) => (v === "" || v == null ? null : Number(v))),
  }),
  expenses: z.object({
    ...common,
    title: z.string().min(1).max(160),
    category: z.string().min(1).max(60),
    amount: z.coerce.number().nonnegative().max(9999999999),
    event_date: date,
    paid_by: text(100),
  }),
};
export const tables = {
  health: "health_records",
  vaccinations: "vaccinations",
  appointments: "appointments",
  weight: "weight_logs",
  feeding: "feeding_schedules",
  grooming: "grooming_records",
  expenses: "expenses",
};
export const scheduleSchema = z.object({
  recurrence: z.enum([
    "once",
    "daily",
    "weekly",
    "weekdays",
    "monthly",
    "interval",
  ]),
  start_local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  end_date: optionalDate,
  interval_hours: z.coerce.number().int().min(1).max(8760).optional(),
  weekdays: z.array(z.number().int().min(1).max(7)).optional(),
  times: z
    .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/))
    .min(1)
    .max(12)
    .optional(),
});
export const medicationSchema = z.object({
  pet_id: uuid,
  title: z.string().trim().min(1).max(160),
  purpose: text(200),
  dosage: z.string().trim().min(1).max(80),
  route: z.string().min(1).max(60),
  instructions: text(5000),
  veterinarian: text(120),
  start_date: date,
  end_date: optionalDate,
  schedule: scheduleSchema,
});
export const reminderSchema = z.object({
  ...common,
  title: z.string().trim().min(1).max(160),
  category: z.string().min(1).max(60),
  schedule: scheduleSchema,
});
