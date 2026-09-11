import { DateTime } from "luxon";
export const dt = (value, zone = "Asia/Manila") => {
  if (!value) return null;
  return DateTime.fromISO(String(value).replace(" ", "T"), {
    zone: "utc",
  }).setZone(zone);
};
export const day = (zone = "Asia/Manila") =>
  DateTime.now().setZone(zone).toISODate();
export const localNow = (zone = "Asia/Manila") =>
  DateTime.now()
    .setZone(zone)
    .plus({ minutes: 5 })
    .toFormat("yyyy-MM-dd'T'HH:mm");
export const dateLabel = (value, zone) =>
  value
    ? (String(value).length === 10
        ? DateTime.fromISO(value)
        : dt(value, zone)
      ).toFormat("MMM d, yyyy")
    : "—";
export const timeLabel = (value, zone) =>
  value ? dt(value, zone).toFormat("h:mm a") : "—";
export const money = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number(value || 0),
  );
const F = (name, label, type = "text", required = false, options) => ({
  name,
  label,
  type,
  required,
  options,
});
export const models = {
  health: {
    title: "Health records",
    singular: "health record",
    description: "Your pet’s medical history, together in one place.",
    fields: [
      F("title", "Record title", "text", true),
      F("record_type", "Record type", "text", true, [
        "General Checkup",
        "Illness",
        "Diagnosis",
        "Injury",
        "Surgery",
        "Laboratory Result",
        "Follow-up Visit",
        "Dental",
        "Skin Condition",
        "Other",
      ]),
      F("event_date", "Visit date", "date", true),
      F("veterinarian", "Veterinarian"),
      F("clinic", "Clinic"),
      F("follow_up_date", "Follow-up date", "date"),
      F("symptoms", "Symptoms", "textarea"),
      F("diagnosis", "Diagnosis", "textarea"),
      F("procedure_notes", "Procedure", "textarea"),
    ],
  },
  vaccinations: {
    title: "Vaccinations",
    singular: "vaccination",
    description: "Keep vaccination records and next due dates close by.",
    fields: [
      F("title", "Vaccine name", "text", true),
      F("dose", "Dose"),
      F("event_date", "Date administered", "date", true),
      F("next_due_date", "Next due date", "date"),
      F("veterinarian", "Veterinarian"),
      F("clinic", "Clinic"),
      F("batch_number", "Batch / lot number"),
    ],
  },
  appointments: {
    title: "Appointments",
    singular: "appointment",
    description: "Plan vet visits and follow-up care.",
    fields: [
      F("title", "Reason for visit", "text", true),
      F("starts_at", "Date and time", "datetime-local", true),
      F("clinic", "Clinic"),
      F("veterinarian", "Veterinarian"),
      F("status", "Status", "text", true, [
        "upcoming",
        "completed",
        "cancelled",
        "rescheduled",
      ]),
    ],
  },
  weight: {
    title: "Weight tracker",
    singular: "weight entry",
    description: "A simple record of how your pet’s weight changes.",
    fields: [
      F("weight_kg", "Weight (kg)", "number", true),
      F("event_date", "Date measured", "date", true),
    ],
  },
  feeding: {
    title: "Feeding",
    singular: "feeding plan",
    description: "Food, portions, and dietary instructions for the family.",
    fields: [
      F("title", "Food name", "text", true),
      F("food_type", "Food type"),
      F("portion_text", "Portion and unit", "text", true),
    ],
  },
  grooming: {
    title: "Grooming",
    singular: "grooming record",
    description:
      "Baths, trims, and the little routines that keep pets comfortable.",
    fields: [
      F("title", "Activity", "text", true, [
        "Bath",
        "Haircut",
        "Nail trimming",
        "Ear cleaning",
        "Teeth cleaning",
        "Grooming appointment",
        "Other",
      ]),
      F("event_date", "Date", "date", true),
      F("next_due_date", "Next due date", "date"),
      F("groomer", "Groomer"),
      F("cost", "Cost (₱)", "number"),
    ],
  },
  expenses: {
    title: "Expenses",
    singular: "expense",
    description: "Keep track of what your family spends on pet care.",
    fields: [
      F("title", "Description", "text", true),
      F("category", "Category", "text", true, [
        "Veterinary",
        "Medication",
        "Food",
        "Grooming",
        "Vaccination",
        "Supplies",
        "Surgery",
        "Laboratory",
        "Transportation",
        "Other",
      ]),
      F("amount", "Amount (₱)", "number", true),
      F("event_date", "Date paid", "date", true),
      F("paid_by", "Paid by"),
    ],
  },
};
