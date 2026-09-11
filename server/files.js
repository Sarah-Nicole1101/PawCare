import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { q, tx, id, fail, audit } from "./db.js";
import { requireHousehold, admin } from "./security.js";
import { petAccess } from "./care.js";
const router = Router();
const offset = (req) =>
  z.coerce
    .number()
    .int()
    .min(0)
    .max(1000000)
    .default(0)
    .parse(req.query.offset);
router.use(requireHousehold);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 8 },
});
const dir = () => path.resolve(process.env.UPLOAD_DIR || "uploads");
router.get("/", async (req, res) => {
  res.json(
    await q(
      "SELECT f.id,f.pet_id,f.kind,f.title,f.document_type,f.mime_type,f.original_name,f.notes,f.size_bytes,f.created_at,p.name AS pet_name FROM files f JOIN pets p ON p.id=f.pet_id WHERE f.household_id=? AND f.deleted_at IS NULL AND p.archived_at IS NULL AND f.kind='document' ORDER BY f.created_at DESC LIMIT 500" +
        " OFFSET " +
        offset(req),
      [req.member.household_id],
    ),
  );
});
router.post("/", upload.single("file"), async (req, res) => {
  const data = z
    .object({
      pet_id: z.uuid(),
      kind: z.enum(["photo", "document"]),
      title: z.string().trim().min(1).max(160),
      document_type: z.string().max(60).optional().default("Other"),
      notes: z.string().max(5000).optional().default(""),
    })
    .parse(req.body);
  await petAccess(req, data.pet_id);
  if (data.kind === "photo") admin(req, res, () => {});
  if (!req.file) fail(400, "Choose a file to upload.");
  let bytes = req.file.buffer,
    mime,
    ext;
  if (data.kind === "document" && bytes.subarray(0, 5).toString() === "%PDF-") {
    mime = "application/pdf";
    ext = "pdf";
  } else {
    try {
      const info = await sharp(bytes, {
        limitInputPixels: 40000000,
      }).metadata();
      if (
        !["jpeg", "png", "webp"].includes(info.format) ||
        Number(info.pages || 1) > 1
      )
        fail(400, "Upload a single JPG, PNG, or WEBP image.");
      bytes = await sharp(bytes, { limitInputPixels: 40000000 })
        .rotate()
        .resize({
          width: 1400,
          height: 1400,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer();
      mime = "image/webp";
      ext = "webp";
    } catch (e) {
      if (e.status) throw e;
      fail(
        400,
        "This file is not a valid JPG, PNG, WEBP image or PDF document.",
      );
    }
  }
  const fid = id(),
    key = fid + "." + ext;
  await fs.mkdir(dir(), { recursive: true });
  const target = path.join(dir(), key);
  await fs.writeFile(target, bytes, { mode: 0o600 });
  try {
    await tx(async (db) => {
      if (data.kind === "photo")
        await q(
          "UPDATE files SET deleted_at=UTC_TIMESTAMP(3) WHERE pet_id=? AND kind='photo' AND deleted_at IS NULL",
          [data.pet_id],
          db,
        );
      await q(
        "INSERT INTO files(id,household_id,pet_id,kind,title,document_type,storage_key,mime_type,size_bytes,original_name,notes,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          fid,
          req.member.household_id,
          data.pet_id,
          data.kind,
          data.title,
          data.document_type,
          key,
          mime,
          bytes.length,
          path.basename(req.file.originalname).slice(0, 200),
          data.notes,
          req.user.id,
        ],
        db,
      );
      await audit(
        req,
        `Uploaded ${data.kind === "photo" ? "a pet photo" : data.title}`,
        "file",
        fid,
        db,
      );
    });
  } catch (e) {
    await fs.unlink(target);
    throw e;
  }
  res.status(201).json({ id: fid });
});
router.get("/:id/content", async (req, res) => {
  const [file] = await q(
    "SELECT f.* FROM files f JOIN pets p ON p.id=f.pet_id WHERE f.id=? AND f.household_id=? AND f.deleted_at IS NULL AND p.archived_at IS NULL",
    [z.uuid().parse(req.params.id), req.member.household_id],
  );
  if (!file) fail(404, "File not found.");
  const target = path.resolve(dir(), file.storage_key);
  if (path.dirname(target) !== dir()) fail(404, "File not found.");
  const download = file.kind === "document";
  res.set("Content-Type", file.mime_type);
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Cache-Control", "no-store");
  res.set(
    "Content-Disposition",
    `${download ? "attachment" : "inline"}; filename="pawcare-${file.id}.${file.mime_type === "application/pdf" ? "pdf" : "webp"}"`,
  );
  res.sendFile(target);
});
router.delete("/:id", admin, async (req, res) => {
  const fid = z.uuid().parse(req.params.id);
  await tx(async (db) => {
    const result = await q(
      "UPDATE files SET deleted_at=UTC_TIMESTAMP(3) WHERE id=? AND household_id=? AND deleted_at IS NULL",
      [fid, req.member.household_id],
      db,
    );
    if (!result.affectedRows) fail(404, "File not found.");
    await audit(req, "Archived a file", "file", fid, db);
  });
  res.json({ ok: true });
});
router.post("/:id/link", async (req, res) => {
  const data = z
    .object({
      kind: z.enum(["health", "vaccinations", "expenses"]),
      record_id: z.uuid(),
    })
    .parse(req.body);
  const fid = z.uuid().parse(req.params.id);
  const mapping = {
    health: ["health_records", "health_record_id"],
    vaccinations: ["vaccinations", "vaccination_id"],
    expenses: ["expenses", "expense_id"],
  };
  const [table, column] = mapping[data.kind];
  const [record] = await q(
    `SELECT * FROM ${table} WHERE id=? AND household_id=? AND archived_at IS NULL`,
    [data.record_id, req.member.household_id],
  );
  const [file] = await q(
    "SELECT * FROM files WHERE id=? AND household_id=? AND deleted_at IS NULL AND kind='document'",
    [fid, req.member.household_id],
  );
  if (!record || !file || record.pet_id !== file.pet_id)
    fail(400, "The document and record must belong to the same pet.");
  await q(`INSERT INTO record_files(id,file_id,${column}) VALUES(?,?,?)`, [
    id(),
    fid,
    record.id,
  ]);
  res.json({ ok: true });
});
router.get("/links/:kind/:id", async (req, res) => {
  const mapping = {
    health: "health_record_id",
    vaccinations: "vaccination_id",
    expenses: "expense_id",
  };
  const col = mapping[req.params.kind];
  if (!col) fail(404, "Record type not found.");
  res.json(
    await q(
      `SELECT f.id,f.title FROM record_files r JOIN files f ON f.id=r.file_id WHERE r.${col}=? AND f.household_id=? AND f.deleted_at IS NULL`,
      [z.uuid().parse(req.params.id), req.member.household_id],
    ),
  );
});
export default router;
