import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const raw = process.env.PAWCARE_API_ORIGIN;
let upstream;
try {
  upstream = new URL(raw);
  if (
    upstream.protocol !== "https:" ||
    upstream.username ||
    upstream.password ||
    upstream.search ||
    upstream.hash ||
    upstream.pathname !== "/" ||
    [process.env.URL, process.env.DEPLOY_PRIME_URL]
      .filter(Boolean)
      .some((url) => new URL(url).origin === upstream.origin)
  )
    throw new Error("Invalid origin");
} catch {
  throw new Error(
    "Set PAWCARE_API_ORIGIN in Netlify to the hosted Express server's HTTPS origin (no path). PawCare requires its backend before publishing.",
  );
}

execFileSync(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "build",
    "--config",
    "client/vite.config.js",
  ],
  { stdio: "inherit" },
);
writeFileSync(
  "dist/_redirects",
  `/api/* ${upstream.origin}/api/:splat 200!\n/* /index.html 200\n`,
);
