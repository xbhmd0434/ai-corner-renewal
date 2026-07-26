import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvironment } from "../services/orchestrator/src/local-env.js";
import { loadConfig } from "../services/orchestrator/src/config.js";
import { createComponentUnderstandingProvider } from "../services/orchestrator/src/adapters/component-understanding.js";

const PROJECT_ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const DEFAULT_IMAGE = resolve(
  PROJECT_ROOT,
  "artifacts",
  "first-live-benchmark",
  "component-mushroom-lamp.png"
);

loadLocalEnvironment();
const config = loadConfig();
if (config.backendMode === "demo" || !config.agentPlanApiKey) {
  throw new Error(
    "component check requires AI_BACKEND_MODE=auto/live and AGENT_PLAN_API_KEY"
  );
}

const imagePath = resolve(process.argv[2] || DEFAULT_IMAGE);
const imageDataUrl = `data:image/png;base64,${readFileSync(imagePath).toString("base64")}`;
const provider = createComponentUnderstandingProvider({ config });

try {
  const result = await provider({
    imageDataUrl,
    sourceContext: {
      provider: "local_component_check",
      caption: "暖白色蘑菇造型桌面氛围灯"
    },
    requestedMode: "auto"
  });
  console.log(
    JSON.stringify(
      {
        status: "ok",
        source_type: result.sourceType,
        model: result.model,
        prompt_version: result.promptVersion,
        latency_ms: result.latencyMs,
        identity: result.identity
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        code: error?.code || "component_check_failed",
        message: String(error?.message || "unknown error").slice(0, 500)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
}
