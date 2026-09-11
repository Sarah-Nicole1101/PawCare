import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { ZodError } from "zod";
import auth from "./auth.js";
import care from "./care.js";
import files from "./files.js";
import { sessionMiddleware, csrfMiddleware } from "./security.js";
export const app = express();
app.disable("x-powered-by");
// If a trusted reverse proxy is used, set its exact hop count here after deployment review.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        mediaSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests:
          process.env.NODE_ENV === "production" ? [] : null,
      },
    },
  }),
);
app.use(express.json({ limit: "128kb" }));
app.use(cookieParser());
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use("/api", sessionMiddleware, csrfMiddleware);
app.use("/api/auth", auth);
app.use("/api/files", files);
app.use("/api", care);
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Endpoint not found." }),
);
if (fs.existsSync(path.resolve("dist/index.html"))) {
  app.use(express.static(path.resolve("dist"), { index: false }));
  app.get("/{*splat}", (_req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
}
app.use((error, req, res, _next) => {
  if (error instanceof ZodError)
    return res.status(400).json({
      error: error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(" "),
    });
  if (error.code === "LIMIT_FILE_SIZE")
    return res.status(400).json({ error: "Files must be 5 MB or smaller." });
  if (error.code === "ER_DUP_ENTRY")
    return res
      .status(409)
      .json({ error: "That record already exists. Refresh and try again." });
  if (error.code === "ER_NO_REFERENCED_ROW_2")
    return res.status(400).json({ error: "A linked record is unavailable." });
  if (error.type === "entity.too.large")
    return res.status(413).json({ error: "This request is too large." });
  if (!error.status)
    console.error("Request failed:", error.code || error.name || "Error");
  res.status(error.status || 500).json({
    error: error.status
      ? error.message
      : "PawCare could not complete this request. Check the server connection and try again.",
  });
});
