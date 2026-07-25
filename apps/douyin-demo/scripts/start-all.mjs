import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(
  fileURLToPath(new URL("..", import.meta.url))
);
const backendCandidates = [
  process.env.AI_CORNER_BACKEND_ROOT,
  resolve(projectRoot, "..", ".."),
  resolve(projectRoot, "..", "ai-corner-renewal")
].filter(Boolean);
const backendRoot = backendCandidates.find((candidate) =>
  existsSync(
    join(candidate, "services", "orchestrator", "src", "index.js")
  )
);
if (!backendRoot) {
  throw new Error(
    "找不到 AI 一角焕新后端。请从仓库根目录运行 npm start，" +
      "或设置 AI_CORNER_BACKEND_ROOT。"
  );
}
const webHost = process.env.WEB_HOST || "127.0.0.1";
const apiHost = process.env.API_HOST || "127.0.0.1";
const requestedWebPort = Number(process.env.WEB_PORT || 8765);
const requestedApiPort = Number(process.env.API_PORT || 8787);

function canListen(host, port) {
  return new Promise((resolveAvailability, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", (error) => {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") {
        resolveAvailability(false);
        return;
      }
      reject(error);
    });
    probe.listen(port, host, () => {
      probe.close(() => resolveAvailability(true));
    });
  });
}

async function findAvailablePort(host, preferredPort, attempts = 20) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const candidate = preferredPort + offset;
    if (await canListen(host, candidate)) return candidate;
  }
  throw new Error(
    `${host}:${preferredPort}-${preferredPort + attempts - 1} 均不可用`
  );
}

async function isCompatibleBackend(host, port) {
  try {
    const response = await fetch(`http://${host}:${port}/api/health`, {
      signal: AbortSignal.timeout(1500)
    });
    if (!response.ok) return false;
    const health = await response.json();
    return (
      health?.status === "ok" &&
      health?.service === "ai-corner-renewal-orchestrator" &&
      Array.isArray(health?.api_versions) &&
      health.api_versions.includes("v1")
    );
  } catch {
    return false;
  }
}

async function resolveRuntime() {
  let apiPort = requestedApiPort;
  let startBackend = true;

  if (!(await canListen(apiHost, apiPort))) {
    if (await isCompatibleBackend(apiHost, apiPort)) {
      startBackend = false;
      console.log(
        `检测到已运行的 AI 一角焕新后端，直接复用：http://${apiHost}:${apiPort}`
      );
    } else if (process.env.API_PORT) {
      throw new Error(
        `API_PORT=${apiPort} 已被其他程序占用，且不是兼容的 AI 一角焕新后端`
      );
    } else {
      apiPort = await findAvailablePort(apiHost, apiPort + 1);
      console.log(
        `默认 API 端口 ${requestedApiPort} 已占用，自动改用 ${apiPort}`
      );
    }
  }

  let webPort = requestedWebPort;
  if (!(await canListen(webHost, webPort))) {
    if (process.env.WEB_PORT) {
      throw new Error(`WEB_PORT=${webPort} 已被其他程序占用`);
    }
    webPort = await findAvailablePort(webHost, webPort + 1);
    console.log(
      `默认前端端口 ${requestedWebPort} 已占用，自动改用 ${webPort}`
    );
  }

  return { apiPort, startBackend, webPort };
}

const { apiPort, startBackend, webPort } = await resolveRuntime();
const sharedEnv = {
  ...process.env,
  API_HOST: apiHost,
  API_PORT: String(apiPort),
  WEB_HOST: webHost,
  WEB_PORT: String(webPort)
};
const children = [];

children.push({
  label: "前端服务",
  process: spawn(process.execPath, ["scripts/serve.mjs"], {
    cwd: projectRoot,
    env: sharedEnv,
    stdio: "inherit"
  })
});

if (startBackend) {
  children.push({
    label: "后端服务",
    process: spawn(
      process.execPath,
      ["services/orchestrator/src/index.js"],
      {
        cwd: backendRoot,
        env: {
          ...sharedEnv,
          ORCHESTRATOR_PORT: String(apiPort)
        },
        stdio: "inherit"
      }
    )
  });
}

let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.process.killed) child.process.kill();
  }
  process.exitCode = exitCode;
}

for (const child of children) {
  child.process.on("error", (error) => {
    console.error(`${child.label}启动失败：`, error);
    stop(1);
  });
  child.process.on("exit", (code, signal) => {
    if (stopping) return;
    console.error(
      `${child.label}异常退出：code=${code ?? "none"} signal=${signal || "none"}`
    );
    stop(code || 1);
  });
}

process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());
