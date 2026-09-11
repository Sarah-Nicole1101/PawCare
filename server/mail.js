import nodemailer from "nodemailer";
import fs from "node:fs/promises";
import path from "node:path";
import { id } from "./db.js";
export async function sendMail(to, subject, text) {
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
  } else {
    if (process.env.NODE_ENV === "production")
      throw new Error("SMTP is required in production.");
    await fs.mkdir(".mail", { recursive: true });
    await fs.writeFile(
      path.join(".mail", `${Date.now()}-${id()}.txt`),
      `To: ${to}\nSubject: ${subject}\n\n${text}`,
      { mode: 0o600 },
    );
  }
}
