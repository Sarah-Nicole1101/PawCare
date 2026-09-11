import { spawn } from "node:child_process";
const children = [
  ["--watch", "server/index.js"],
  ["node_modules/vite/bin/vite.js", "--config", "client/vite.config.js"],
].map((args) => spawn(process.execPath, args, { stdio: "inherit" }));
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((c) => c.kill());
  process.exitCode = code;
}
children.forEach((c) => c.on("exit", (code) => stop(code || 0)));
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
