import nodemailer from "nodemailer";
import fs from "node:fs/promises";
import path from "node:path";
import { id } from "./db.js";

function parseSender(value = "") {
  const match = value.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  if (match) return { name: match[1] || "PawCare", email: match[2] };
  return { name: "PawCare", email: value.trim() };
}

async function sendBrevo(to, subject, text) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: parseSender(process.env.MAIL_FROM),
      to: [{ email: to }],
      subject,
      textContent: text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Brevo email failed (${response.status}): ${detail}`);
  }
}

export async function sendMail(to, subject, text) {
  if (process.env.MAIL_MODE === "brevo") {
    await sendBrevo(to, subject, text);
    return;
  }

  if (process.env.MAIL_MODE === "smtp") {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      requireTLS:
        process.env.NODE_ENV === "production" &&
        process.env.SMTP_SECURE !== "true",
      disableFileAccess: true,
      disableUrlAccess: true,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject,
      text,
    });
    return;
  }

  if (process.env.NODE_ENV === "production")
    throw new Error("Transactional email is required in production.");
  await fs.mkdir(".mail", { recursive: true });
  await fs.writeFile(
    path.join(".mail", `${Date.now()}-${id()}.txt`),
    `To: ${to}\nSubject: ${subject}\n\n${text}`,
    { mode: 0o600 },
  );
}
