import React, { useState } from "react";
import { DateTime } from "luxon";
import { api } from "./api";
import { Button, Field, ErrorMessage, Modal } from "./components";
import { models, day, dt, localNow } from "./models";
export function FormShell({ title, onClose, onSave, children }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title={title} onClose={onClose} wide>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            await onSave(data);
            onClose();
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">{children}</div>
        <ErrorMessage message={error} />
        <footer className="form-footer">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        </footer>
      </form>
    </Modal>
  );
}
function PetSelect({ pets, selected, disabled = false }) {
  return (
    <Field
      label="Pet"
      name="pet_id"
      required
      defaultValue={selected || pets[0]?.id || ""}
      options={[
        { value: "", label: "Choose a pet" },
        ...pets.map((p) => ({ value: p.id, label: p.name })),
      ]}
      disabled={disabled}
    />
  );
}
export function PetForm({ pet, onClose, onSaved }) {
  return (
    <FormShell
      title={pet ? "Edit pet profile" : "Add your pet"}
      onClose={onClose}
      onSave={async (fd) => {
        const body = Object.fromEntries(fd);
        body.neutered = fd.has("neutered");
        await api("/pets" + (pet ? "/" + pet.id : ""), {
          method: pet ? "PATCH" : "POST",
          body,
        });
        await onSaved();
      }}
    >
      <Field
        name="name"
        label="Pet name"
        defaultValue={pet?.name}
        required
        maxLength={100}
      />
      <Field
        name="species"
        label="Species"
        defaultValue={pet?.species || "Dog"}
        options={["Dog", "Cat", "Bird", "Rabbit", "Other"]}
        required
      />
      <Field
        name="breed"
        label="Breed"
        defaultValue={pet?.breed}
        maxLength={100}
      />
      <Field
        name="sex"
        label="Sex"
        defaultValue={pet?.sex || "unknown"}
        options={["female", "male", "unknown"]}
      />
      <Field
        name="birth_date"
        label="Date of birth"
        type="date"
        defaultValue={pet?.birth_date}
      />
      <Field
        name="estimated_age"
        label="Estimated age (if birth date unknown)"
        defaultValue={pet?.estimated_age}
        maxLength={80}
      />
      <Field
        name="markings"
        label="Color / markings"
        defaultValue={pet?.markings}
        maxLength={160}
      />
      <Field
        name="microchip"
        label="Microchip number (optional)"
        defaultValue={pet?.microchip}
        maxLength={60}
      />
      <label className="check">
        <input
          type="checkbox"
          name="neutered"
          defaultChecked={!!pet?.neutered}
        />
        Spayed / neutered
      </label>
      <Field
        name="notes"
        label="Notes"
        type="textarea"
        defaultValue={pet?.notes}
        maxLength={5000}
      />
    </FormShell>
  );
}
export function RecordForm({
  kind,
  row,
  pets,
  selectedPet,
  zone,
  onClose,
  onSaved,
  preset,
}) {
  const model = models[kind];
  return (
    <FormShell
      title={`${row ? "Edit" : "Add"} ${model.singular}`}
      onClose={onClose}
      onSave={async (fd) => {
        const body = Object.fromEntries(fd);
        if (body.starts_at)
          body.starts_at = DateTime.fromISO(body.starts_at, { zone })
            .toUTC()
            .toISO();
        await api("/records/" + kind + (row ? "/" + row.id : ""), {
          method: row ? "PATCH" : "POST",
          body,
        });
        await onSaved();
      }}
    >
      <PetSelect
        pets={row ? pets.filter((p) => p.id === row.pet_id) : pets}
        selected={row?.pet_id || preset?.pet_id || selectedPet}
      />
      {model.fields.map((f) => (
        <Field
          key={f.name}
          {...f}
          defaultValue={
            row?.[f.name] != null
              ? f.type === "datetime-local"
                ? dt(row[f.name], zone).toFormat("yyyy-MM-dd'T'HH:mm")
                : row[f.name]
              : (preset?.[f.name] ??
                (f.type === "date" && f.required
                  ? day(zone)
                  : f.type === "datetime-local"
                    ? localNow(zone)
                    : undefined))
          }
          step={f.type === "number" ? "0.001" : undefined}
          min={
            f.type === "number"
              ? kind === "weight"
                ? "0.001"
                : "0"
              : undefined
          }
        />
      ))}
      <Field
        name="notes"
        label="Notes"
        type="textarea"
        defaultValue={row?.notes || preset?.notes}
        maxLength={5000}
      />
    </FormShell>
  );
}
function ScheduleFields({ schedule, zone, endDate }) {
  const [repeat, setRepeat] = useState(schedule?.recurrence || "daily");
  const days = schedule?.weekdays
    ? typeof schedule.weekdays === "string"
      ? JSON.parse(schedule.weekdays)
      : schedule.weekdays
    : [];
  return (
    <>
      <div className="form-section">
        <h3>Reminder schedule</h3>
        <p className="muted">
          Times use {zone}. Fixed-hour intervals use elapsed time.
        </p>
      </div>
      <Field
        label="First date and time"
        type="datetime-local"
        name="start_local"
        required
        defaultValue={
          schedule?.start_at
            ? dt(schedule.start_at, zone).toFormat("yyyy-MM-dd'T'HH:mm")
            : localNow(zone)
        }
      />
      <Field
        label="Repeat"
        name="recurrence"
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
        options={[
          { value: "once", label: "Once" },
          { value: "daily", label: "Daily" },
          { value: "interval", label: "Every X hours" },
          { value: "weekly", label: "Weekly" },
          { value: "weekdays", label: "Selected weekdays" },
          { value: "monthly", label: "Monthly" },
        ]}
      />
      {repeat === "interval" && (
        <Field
          name="interval_hours"
          label="Hours between reminders"
          type="number"
          min={1}
          max={8760}
          required
          defaultValue={schedule?.interval_hours || 8}
        />
      )}
      {!["interval", "once"].includes(repeat) && (
        <Field
          name="times"
          label="Reminder times (24-hour, comma separated)"
          placeholder="08:00, 20:00"
          defaultValue={schedule?.allTimes || schedule?.local_time || ""}
        >
          <small>Leave blank to use the first reminder’s time.</small>
        </Field>
      )}
      {repeat === "weekdays" && (
        <fieldset className="weekdays">
          <legend>Days of the week</legend>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
            <label key={d}>
              <input
                type="checkbox"
                name="weekdays"
                value={i + 1}
                defaultChecked={days.includes(i + 1)}
              />
              {d}
            </label>
          ))}
        </fieldset>
      )}
      {repeat === "monthly" && (
        <p className="notice">
          If the selected day doesn’t exist in a month, the reminder uses that
          month’s last day.
        </p>
      )}
      <Field
        label="End date (optional)"
        name="end_date"
        type="date"
        defaultValue={endDate || ""}
      />
    </>
  );
}
export function CareForm({
  kind,
  row,
  preset,
  pets,
  selectedPet,
  zone,
  onClose,
  onSaved,
}) {
  const med = kind === "medications";
  const first = row?.schedules?.[0];
  const schedule = first
    ? { ...first, allTimes: row.schedules.map((x) => x.local_time).join(", ") }
    : preset?.schedule;
  return (
    <FormShell
      title={`${row ? "Edit" : "Add"} ${med ? "medication" : "reminder"}`}
      onClose={onClose}
      onSave={async (fd) => {
        const raw = Object.fromEntries(fd),
          {
            start_local,
            recurrence,
            interval_hours,
            times,
            weekdays,
            ...body
          } = raw;
        body.schedule = {
          start_local,
          recurrence,
          end_date: raw.end_date || null,
          ...(interval_hours ? { interval_hours: Number(interval_hours) } : {}),
          ...(times?.trim()
            ? { times: times.split(",").map((x) => x.trim()) }
            : {}),
          weekdays: fd.getAll("weekdays").map(Number),
        };
        if (!med) delete body.end_date;
        await api("/" + kind + (row ? "/" + row.id : ""), {
          method: row ? "PATCH" : "POST",
          body,
        });
        await onSaved();
      }}
    >
      <PetSelect
        pets={row ? pets.filter((p) => p.id === row.pet_id) : pets}
        selected={row?.pet_id || preset?.pet_id || selectedPet}
      />
      <Field
        label={med ? "Medicine name" : "Reminder title"}
        name="title"
        defaultValue={row?.title || preset?.title}
        maxLength={160}
        required
      />
      {med ? (
        <>
          <Field
            label="Dosage and unit"
            name="dosage"
            defaultValue={row?.dosage}
            placeholder="Enter the prescribed dose"
            required
            maxLength={80}
          />
          <Field
            label="Route"
            name="route"
            defaultValue={row?.route || "Oral"}
            options={[
              "Oral",
              "Topical",
              "Eye drops",
              "Ear drops",
              "Injection",
              "Other",
            ]}
          />
          <Field
            label="Purpose"
            name="purpose"
            defaultValue={row?.purpose}
            maxLength={200}
          />
          <Field
            label="Prescribing veterinarian"
            name="veterinarian"
            defaultValue={row?.veterinarian}
            maxLength={120}
          />
          <Field
            label="Medication start date"
            name="start_date"
            type="date"
            defaultValue={row?.start_date || day(zone)}
            required
          />
          <Field
            label="Instructions, including food requirements"
            name="instructions"
            type="textarea"
            defaultValue={row?.instructions}
            maxLength={5000}
          />
        </>
      ) : (
        <>
          <Field
            label="Care type"
            name="category"
            defaultValue={row?.category || preset?.category || "Custom"}
            options={[
              "Feeding",
              "Water",
              "Wound cleaning",
              "Vaccination",
              "Deworming",
              "Flea / tick prevention",
              "Grooming",
              "Vet appointment",
              "Exercise / walking",
              "Supplements",
              "Custom",
            ]}
          />
          <Field
            label="Instructions"
            name="notes"
            type="textarea"
            defaultValue={row?.notes || preset?.notes}
            maxLength={5000}
          />
        </>
      )}
      <ScheduleFields
        schedule={schedule}
        zone={zone}
        endDate={
          row?.end_date ||
          (first?.end_at ? dt(first.end_at, zone).toISODate() : null)
        }
      />
    </FormShell>
  );
}
export function UploadForm({ pet, pets, selectedPet, onClose, onSaved }) {
  const [preview, setPreview] = useState(""),
    [clientError, setClientError] = useState("");
  return (
    <FormShell
      title={pet ? "Upload pet photo" : "Upload document"}
      onClose={() => {
        if (preview) URL.revokeObjectURL(preview);
        onClose();
      }}
      onSave={async (fd) => {
        if (clientError) throw new Error(clientError);
        fd.set("kind", pet ? "photo" : "document");
        if (pet) {
          fd.set("pet_id", pet.id);
          fd.set("title", pet.name + " profile photo");
        }
        await api("/files", { method: "POST", body: fd });
        await onSaved();
      }}
    >
      {!pet && (
        <>
          <PetSelect pets={pets} selected={selectedPet} />
          <Field label="Document title" name="title" required maxLength={160} />
          <Field
            label="Document type"
            name="document_type"
            options={[
              "Vaccination card",
              "Prescription",
              "Laboratory result",
              "Veterinary report",
              "Surgery document",
              "Receipt",
              "Identification",
              "Other",
            ]}
          />
        </>
      )}
      <Field
        label={pet ? "Pet photo" : "File"}
        type="file"
        name="file"
        accept={
          pet
            ? "image/jpeg,image/png,image/webp"
            : ".pdf,image/jpeg,image/png,image/webp"
        }
        required
        onChange={(e) => {
          if (preview) URL.revokeObjectURL(preview);
          const f = e.target.files[0];
          setClientError(
            f?.size > 5 * 1024 * 1024 ? "Choose a file smaller than 5 MB." : "",
          );
          setPreview(
            f?.type.startsWith("image/") ? URL.createObjectURL(f) : "",
          );
        }}
      >
        <small>JPG, PNG, WEBP{!pet ? " or PDF" : ""}. Maximum 5 MB.</small>
      </Field>
      {preview && (
        <img
          className="upload-preview"
          src={preview}
          alt="Selected photo preview"
        />
      )}
      {clientError && <ErrorMessage message={clientError} />}
      {!pet && (
        <Field label="Notes" name="notes" type="textarea" maxLength={5000} />
      )}
    </FormShell>
  );
}
