import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createRoomAnalyzer } from "../services/orchestrator/src/adapters/room-analyzer.js";
import { loadConfig } from "../services/orchestrator/src/config.js";
import { defaultRoomProfile } from "../services/orchestrator/src/data/demo-catalog.js";
import { loadLocalEnvironment } from "../services/orchestrator/src/local-env.js";

const MIME_BY_EXTENSION = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"]
]);

loadLocalEnvironment();
const config = loadConfig();

if (config.backendMode === "demo") {
  throw new Error(
    "AI_BACKEND_MODE=demo 会锁定演示模式；请在 .env.local 中改为 auto 或 live"
  );
}
if (config.roomAnalyzerProvider !== "agent_plan") {
  throw new Error(
    "ROOM_ANALYZER_PROVIDER 必须设为 agent_plan 才能执行本检查"
  );
}

const imagePath = resolve(
  process.argv[2] || "apps/web/assets/desk-before.png"
);
const mediaType = MIME_BY_EXTENSION.get(extname(imagePath).toLowerCase());
if (!mediaType) {
  throw new Error("只支持 PNG、JPEG 或 WebP 空间图片");
}

const bytes = await readFile(imagePath);
if (bytes.length > config.maxUploadBytes) {
  throw new Error(
    `空间图片超过 ${config.maxUploadBytes} 字节的本地上传限制`
  );
}

const analyzeRoom = createRoomAnalyzer({
  config,
  defaultRoomProfile
});
const startedAt = performance.now();
const result = await analyzeRoom(
  {
    room_id: "agent-plan-live-acceptance-room",
    image: {
      data_url: `data:${mediaType};base64,${bytes.toString("base64")}`,
      media_type: mediaType
    },
    reference_width_cm: 120,
    quality_hint: "clear"
  },
  "live"
);
const latencyMs = Math.round(performance.now() - startedAt);

if (result.sourceMode !== "live") {
  throw new Error(
    `Agent Plan 多模态检查未进入 live：${result.fallback?.reason || "unknown"}`
  );
}

console.log(
  JSON.stringify(
    {
      status: "ok",
      source_mode: result.sourceMode,
      provider: "agent_plan",
      model: config.agentPlanTextModel,
      latency_ms: latencyMs,
      image: basename(imagePath),
      room_profile: result.roomProfile
    },
    null,
    2
  )
);
