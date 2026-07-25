import { spawn } from "node:child_process";

const children = [
  spawn(process.execPath, ["scripts/serve.mjs"], {
    cwd: process.cwd(),
    stdio: "inherit"
  }),
  spawn(process.execPath, ["services/orchestrator/src/index.js"], {
    cwd: process.cwd(),
    stdio: "inherit"
  })
];

let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exitCode = exitCode;
}

for (const child of children) {
  child.on("error", (error) => {
    console.error(error);
    stop(1);
  });
  child.on("exit", (code, signal) => {
    if (stopping) return;
    if (code && code !== 0) {
      console.error(`本地服务异常退出：code=${code} signal=${signal || "none"}`);
      stop(code);
    }
  });
}

process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());
