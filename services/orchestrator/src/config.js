import { isAbsolute, relative, resolve } from "node:path";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1:8765",
  "http://localhost:8765"
];
const DEFAULT_AGENT_PLAN_BASE_URL =
  "https://ark.cn-beijing.volces.com/api/plan/v3";

function integerFromEnv(value, fallback, { min, max }) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`环境变量数值 ${value} 不在 ${min}～${max} 范围内`);
  }
  return parsed;
}

function enumFromEnv(value, fallback, allowed) {
  if (value === undefined || value === "") return fallback;
  if (!allowed.includes(value)) {
    throw new Error(`环境变量值 ${value} 必须是 ${allowed.join("、")}`);
  }
  return value;
}

function modelNameFromEnv(value, fallback, label) {
  const model = value?.trim() || fallback;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(model)) {
    throw new Error(`${label} 不是有效的模型名称`);
  }
  return model;
}

function isLoopbackHostname(hostname) {
  const normalized = hostname.toLowerCase();
  if (
    normalized === "localhost" ||
    normalized === "[::1]" ||
    normalized === "::1"
  ) {
    return true;
  }

  const octets = normalized.split(".");
  return (
    octets.length === 4 &&
    octets[0] === "127" &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
  );
}

function roomAnalyzerUrlFromEnv(value, apiKey) {
  if (value === undefined || value.trim() === "") return "";

  const rawUrl = value.trim();
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("ROOM_ANALYZER_URL 必须是有效的绝对 URL");
  }

  if (parsed.username || parsed.password) {
    throw new Error("ROOM_ANALYZER_URL 不允许包含用户名或密码");
  }
  if (parsed.protocol === "https:") return rawUrl;
  if (
    parsed.protocol === "http:" &&
    isLoopbackHostname(parsed.hostname) &&
    !apiKey
  ) {
    return rawUrl;
  }

  throw new Error(
    "ROOM_ANALYZER_URL 必须使用 HTTPS；仅无 API Key 的本机回环地址可使用 HTTP"
  );
}

function agentPlanBaseUrlFromEnv(value) {
  const rawUrl = value?.trim() || DEFAULT_AGENT_PLAN_BASE_URL;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("AGENT_PLAN_BASE_URL 必须是有效的绝对 URL");
  }

  const pathname = parsed.pathname.replace(/\/+$/, "");
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "ark.cn-beijing.volces.com" ||
    pathname !== "/api/plan/v3" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "AGENT_PLAN_BASE_URL 必须是官方专属地址 https://ark.cn-beijing.volces.com/api/plan/v3"
    );
  }
  return `${parsed.origin}${pathname}`;
}

function assertOutsideWebRoot(path, label) {
  const webRoot = resolve("./apps/web");
  const relation = relative(webRoot, path);
  if (relation === "" || (!relation.startsWith("..") && !isAbsolute(relation))) {
    throw new Error(`${label} 不能位于 apps/web 静态目录内`);
  }
  return path;
}

export function loadConfig(env = process.env) {
  const roomAnalyzerApiKey = env.ROOM_ANALYZER_API_KEY || "";
  const agentPlanApiKey = env.AGENT_PLAN_API_KEY || "";
  const roomAnalyzerUrl = roomAnalyzerUrlFromEnv(
    env.ROOM_ANALYZER_URL,
    roomAnalyzerApiKey
  );
  const roomAnalyzerProvider = enumFromEnv(
    env.ROOM_ANALYZER_PROVIDER,
    roomAnalyzerUrl ? "gateway" : agentPlanApiKey ? "agent_plan" : "demo",
    ["demo", "gateway", "agent_plan"]
  );
  if (roomAnalyzerProvider === "gateway" && !roomAnalyzerUrl) {
    throw new Error("ROOM_ANALYZER_PROVIDER=gateway 时必须配置 ROOM_ANALYZER_URL");
  }
  if (roomAnalyzerProvider === "agent_plan" && !agentPlanApiKey) {
    throw new Error(
      "ROOM_ANALYZER_PROVIDER=agent_plan 时必须配置 AGENT_PLAN_API_KEY"
    );
  }
  const dataDirectory = resolve(env.DATA_DIRECTORY || "./data");
  const host = env.ORCHESTRATOR_HOST || "127.0.0.1";
  if (!isLoopbackHostname(host)) {
    throw new Error(
      "固定 Demo actor 尚无真实鉴权，ORCHESTRATOR_HOST 只能使用回环地址"
    );
  }
  const databasePath = assertOutsideWebRoot(
    resolve(env.DATABASE_PATH || `${dataDirectory}/ai-corner-renewal.sqlite`),
    "DATABASE_PATH"
  );
  const privateMediaDirectory = assertOutsideWebRoot(
    resolve(env.PRIVATE_MEDIA_DIRECTORY || `${dataDirectory}/private-media`),
    "PRIVATE_MEDIA_DIRECTORY"
  );

  return {
    host,
    port: integerFromEnv(env.ORCHESTRATOR_PORT, 8787, { min: 1, max: 65535 }),
    backendMode: enumFromEnv(env.AI_BACKEND_MODE, "demo", ["demo", "auto", "live"]),
    roomAnalyzerProvider,
    roomAnalyzerUrl,
    roomAnalyzerApiKey,
    roomAnalyzerTimeoutMs: integerFromEnv(env.ROOM_ANALYZER_TIMEOUT_MS, 8000, {
      min: 100,
      max: 60_000
    }),
    roomAnalyzerResponseLimitBytes: integerFromEnv(
      env.ROOM_ANALYZER_RESPONSE_LIMIT_BYTES,
      256 * 1024,
      {
        min: 1024,
        max: 5_000_000
      }
    ),
    agentPlanBaseUrl: agentPlanBaseUrlFromEnv(env.AGENT_PLAN_BASE_URL),
    agentPlanApiKey,
    agentPlanTextModel: modelNameFromEnv(
      env.AGENT_PLAN_TEXT_MODEL,
      "doubao-seed-2.0-lite",
      "AGENT_PLAN_TEXT_MODEL"
    ),
    agentPlanImageModel: modelNameFromEnv(
      env.AGENT_PLAN_IMAGE_MODEL,
      "doubao-seedream-5.0-lite",
      "AGENT_PLAN_IMAGE_MODEL"
    ),
    agentPlanTimeoutMs: integerFromEnv(env.AGENT_PLAN_TIMEOUT_MS, 30_000, {
      min: 1000,
      max: 120_000
    }),
    agentPlanLayoutTimeoutMs: integerFromEnv(
      env.AGENT_PLAN_LAYOUT_TIMEOUT_MS,
      90_000,
      {
        min: 5000,
        max: 180_000
      }
    ),
    agentPlanImageTimeoutMs: integerFromEnv(
      env.AGENT_PLAN_IMAGE_TIMEOUT_MS,
      90_000,
      {
        min: 1000,
        max: 180_000
      }
    ),
    agentPlanDiscoveryTimeoutMs: integerFromEnv(
      env.AGENT_PLAN_DISCOVERY_TIMEOUT_MS,
      45_000,
      {
        min: 5000,
        max: 180_000
      }
    ),
    agentPlanDiscoveryResponseLimitBytes: integerFromEnv(
      env.AGENT_PLAN_DISCOVERY_RESPONSE_LIMIT_BYTES,
      512 * 1024,
      {
        min: 1024,
        max: 5_000_000
      }
    ),
    agentPlanImageResponseLimitBytes: integerFromEnv(
      env.AGENT_PLAN_IMAGE_RESPONSE_LIMIT_BYTES,
      24 * 1024 * 1024,
      {
        min: 1024,
        max: 100_000_000
      }
    ),
    requestBodyLimitBytes: integerFromEnv(env.REQUEST_BODY_LIMIT_BYTES, 6_000_000, {
      min: 1024,
      max: 20_000_000
    }),
    cardTtlMs: integerFromEnv(env.CARD_TTL_MS, 30 * 60 * 1000, {
      min: 60_000,
      max: 24 * 60 * 60 * 1000
    }),
    maxStoredCards: integerFromEnv(env.MAX_STORED_CARDS, 200, {
      min: 1,
      max: 10_000
    }),
    dataDirectory,
    databasePath,
    privateMediaDirectory,
    maxUploadBytes: integerFromEnv(env.MAX_UPLOAD_BYTES, 20_000_000, {
      min: 1024,
      max: 100_000_000
    }),
    temporaryRetentionHours: integerFromEnv(
      env.TEMPORARY_RETENTION_HOURS,
      24,
      { min: 1, max: 24 * 30 }
    ),
    mediaAccessTtlSeconds: integerFromEnv(env.MEDIA_ACCESS_TTL_SECONDS, 900, {
      min: 60,
      max: 24 * 60 * 60
    }),
    listLimitMax: integerFromEnv(env.LIST_LIMIT_MAX, 100, {
      min: 1,
      max: 500
    }),
    allowedOrigins: (env.CORS_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(","))
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  };
}
