import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  AgentPlanProductDiscoveryProvider,
  validateAgentOutput
} from "../services/orchestrator/src/adapters/product-discovery-agent.js";
import { loadConfig } from "../services/orchestrator/src/config.js";
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
if (!config.agentPlanApiKey) {
  throw new Error("必须配置 AGENT_PLAN_API_KEY 才能执行本检查");
}

const imagePath = resolve(
  process.argv[2] || "apps/web/assets/desk-after-warm.png"
);
const mediaType = MIME_BY_EXTENSION.get(extname(imagePath).toLowerCase());
if (!mediaType) {
  throw new Error("只支持 PNG、JPEG 或 WebP 效果图");
}

const bytes = await readFile(imagePath);
if (bytes.length > config.maxUploadBytes) {
  throw new Error(`效果图超过 ${config.maxUploadBytes} 字节的上传限制`);
}

const provider = new AgentPlanProductDiscoveryProvider({ config });
const startedAt = performance.now();
const result = await provider.discover({
  image: {
    dataUrl: `data:${mediaType};base64,${bytes.toString("base64")}`,
    mediaType
  },
  context: {
    sceneType: "desk_corner",
    planTitle: "原木呼吸感",
    placements: [
      {
        product_id: "prod-warm-oak-riser",
        zone: "desktop_center_back",
        instruction: "桌上架沿桌面后缘居中"
      },
      {
        product_id: "prod-warm-clamp-lamp",
        zone: "desktop_left_back",
        instruction: "夹在桌面左后侧"
      },
      {
        product_id: "prod-warm-linen-board",
        zone: "wall_leaning_zone",
        instruction: "倚墙放在桌上架后方"
      }
    ],
    aicard: {
      products: [
        {
          product_id: "prod-warm-oak-riser",
          name: "浅橡木桌上架",
          category: "desk_riser"
        },
        {
          product_id: "prod-warm-clamp-lamp",
          name: "暖白夹式台灯",
          category: "lighting"
        },
        {
          product_id: "prod-warm-linen-board",
          name: "亚麻织物留言板",
          category: "display_board"
        }
      ],
      plan: { placements: [] }
    },
    planVersion: {
      implementation_source_roles: [
        { product_id: "prod-warm-oak-riser", role: "source_video" },
        { product_id: "prod-warm-clamp-lamp", role: "source_video" },
        { product_id: "prod-warm-linen-board", role: "source_video" }
      ]
    }
  },
  limits: { maxSubjects: 6, maxQueriesPerSubject: 3 },
  requestedMode: "live"
});
const latencyMs = Math.round(performance.now() - startedAt);
const validation = validateAgentOutput(
  { schema_version: "1.0", subjects: result.subjects },
  6
);
if (!validation.valid) {
  throw new Error(
    `商品发现 Agent 输出未通过协议：${validation.issues.join("；")}`
  );
}

console.log(
  JSON.stringify(
    {
      status: "ok",
      source_mode: result.sourceType,
      strategy: result.strategy,
      provider: result.provider,
      model: result.model,
      prompt_version: result.promptVersion,
      latency_ms: latencyMs,
      image: basename(imagePath),
      subjects_count: validation.subjects.length,
      hotspot_count: validation.subjects.filter((subject) => subject.bbox).length,
      subjects: validation.subjects.map((subject) => ({
        label: subject.label,
        category_code: subject.category_code,
        bbox: subject.bbox,
        confidence: subject.confidence,
        search_queries_count: subject.search_queries.length
      }))
    },
    null,
    2
  )
);
