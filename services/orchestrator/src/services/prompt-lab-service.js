import { ApiError, invalid } from "../errors.js";
import {
  buildLayoutRenderPrompt,
  PROMPT_LAB_DEFAULT_PROMPT,
  PROMPT_LAB_VERSION
} from "../prompts/prompt-lab-default.js";

const DATA_URL_PATTERN =
  /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]*={0,2})$/i;
const MAX_PROMPT_CHARACTERS = 16_000;

function imageTypeFromBytes(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function validateImageDataUrl(value, maxBytes) {
  if (typeof value !== "string") {
    throw invalid("prompt_lab_image_required", "请选择一张 PNG、JPEG 或 WebP 图片");
  }
  const match = value.match(DATA_URL_PATTERN);
  if (!match || match[2].length === 0 || match[2].length % 4 !== 0) {
    throw invalid(
      "prompt_lab_image_invalid",
      "图片必须是合法的 PNG、JPEG 或 WebP Data URL"
    );
  }
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > maxBytes) {
    throw new ApiError(
      "prompt_lab_image_too_large",
      `模型输入图片不能超过 ${maxBytes} 字节`,
      413
    );
  }
  const declaredType = match[1].toLowerCase();
  const actualType = imageTypeFromBytes(bytes);
  if (!actualType || declaredType !== actualType) {
    throw invalid(
      "prompt_lab_image_invalid",
      "图片声明类型与实际文件内容不一致"
    );
  }
  return value;
}

function validatePrompt(value) {
  if (typeof value !== "string" || value.trim().length < 20) {
    throw invalid("prompt_lab_prompt_invalid", "Prompt 至少需要 20 个字符");
  }
  const prompt = value.trim();
  if (prompt.length > MAX_PROMPT_CHARACTERS) {
    throw invalid(
      "prompt_lab_prompt_too_long",
      `Prompt 不能超过 ${MAX_PROMPT_CHARACTERS} 个字符`
    );
  }
  return prompt;
}

const ERROR_STATUS = {
  planning_not_configured: 503,
  planning_timeout: 504,
  planning_rate_limited: 429,
  planning_unauthorized: 502,
  planning_http_error: 502,
  planning_response_too_large: 502,
  planning_contract_invalid: 502,
  planning_unavailable: 502,
  render_not_configured: 503,
  render_timeout: 504,
  render_rate_limited: 429,
  render_unauthorized: 502,
  render_http_error: 502,
  render_response_too_large: 502,
  render_image_too_large: 502,
  render_contract_invalid: 502,
  render_unavailable: 502
};

export class PromptLabService {
  constructor({ config, planner, generator }) {
    this.config = config;
    this.planner = planner;
    this.generator = generator;
  }

  template() {
    return {
      schema_version: "1.0",
      prompt_version: PROMPT_LAB_VERSION,
      prompt: PROMPT_LAB_DEFAULT_PROMPT,
      model: `${this.config.agentPlanTextModel} → ${this.config.agentPlanImageModel}`,
      pipeline: ["layout_planning", "render_prompt_build", "image_edit"],
      available:
        this.config.backendMode !== "demo" &&
        Boolean(this.config.agentPlanApiKey),
      backend_mode: this.config.backendMode,
      limits: {
        prompt_characters: MAX_PROMPT_CHARACTERS,
        request_body_bytes: this.config.requestBodyLimitBytes,
        input_image_bytes: Math.min(
          this.config.maxUploadBytes,
          Math.floor(this.config.requestBodyLimitBytes * 0.7)
        )
      },
      privacy: {
        persisted: false,
        message: "实验图片不写入 SQLite 或私有媒体目录，只用于本次模型请求。"
      }
    };
  }

  async render(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw invalid("prompt_lab_request_invalid", "请求必须是 JSON 对象");
    }
    if (body.schema_version !== "1.0") {
      throw invalid("schema_version_unsupported", "schema_version 必须是 1.0");
    }
    const prompt = validatePrompt(body.prompt);
    const imageDataUrl = validateImageDataUrl(
      body.image_data_url,
      Math.min(
        this.config.maxUploadBytes,
        Math.floor(this.config.requestBodyLimitBytes * 0.7)
      )
    );
    const planning = await this.planner({
      imageDataUrl,
      prompt,
      requestedMode: "live"
    });
    if (planning.sourceType !== "live") {
      throw new ApiError(
        planning.reason || "planning_unavailable",
        planning.message || "布置规划失败，未继续调用图片模型",
        ERROR_STATUS[planning.reason] || 502
      );
    }
    if (planning.plan.status === "needs_input") {
      throw new ApiError(
        "prompt_lab_needs_input",
        planning.plan.needs_input_reason,
        422
      );
    }
    const renderPrompt = buildLayoutRenderPrompt(planning.plan);
    const result = await this.generator({
      imageDataUrl,
      prompt: renderPrompt,
      requestedMode: "live"
    });
    if (result.sourceType !== "live") {
      throw new ApiError(
        result.reason || "render_unavailable",
        result.message || "模型改图失败，请稍后重试",
        ERROR_STATUS[result.reason] || 502
      );
    }
    return {
      schema_version: "1.0",
      source_mode: "live",
      prompt_version:
        typeof body.prompt_version === "string" && body.prompt_version.trim()
          ? body.prompt_version.trim().slice(0, 80)
          : "custom",
      model: result.model,
      planning_model: planning.model,
      planning_latency_ms: planning.latencyMs,
      render_latency_ms: result.latencyMs,
      latency_ms: planning.latencyMs + result.latencyMs,
      prompt_characters: prompt.length,
      render_prompt_characters: renderPrompt.length,
      layout_plan: planning.plan,
      product_slots: planning.plan.product_slots,
      media_type: result.mediaType,
      image_data_url: `data:${result.mediaType};base64,${result.bytes.toString("base64")}`
    };
  }
}
