/**
 * 统一 HTTP Client
 * 符合 HANDOFF.md 6.3 HTTP Client 约束
 */

const FALLBACK_API_BASE_URL = "http://127.0.0.1:8787";

export const API_BASE_URL =
  globalThis.__AI_CORNER_API_BASE_URL__ ||
  globalThis.location?.origin ||
  FALLBACK_API_BASE_URL;

let pendingOperations = new Map();

/**
 * 生成 Idempotency-Key
 */
export function generateIdempotencyKey() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * 创建并保存 pending operation
 */
export function createPendingOperation(key, operation) {
  pendingOperations.set(key, operation);
  return key;
}

/**
 * 完成 pending operation
 */
export function completePendingOperation(key) {
  pendingOperations.delete(key);
}

/**
 * 查找 pending operation
 */
export function getPendingOperation(key) {
  return pendingOperations.get(key);
}

/**
 * 判断错误是否可重试
 */
function isRetryable(error) {
  if (!error) return false;
  if (error.status >= 500) return true;
  if (error.status === 429) return true;
  if (error.name === "AbortError") return false;
  if (
    error.name === "TypeError" &&
    /network|fetch|连接/i.test(error.message || "")
  ) {
    return true;
  }
  return false;
}

/**
 * 基础 HTTP 请求
 * @param {string} method - HTTP 方法
 * @param {string} path - 请求路径
 * @param {object} options - 请求选项
 * @param {object} [options.body] - 请求体
 * @param {AbortSignal} [options.signal] - AbortSignal
 * @param {string} [options.idempotencyKey] - Idempotency-Key
 * @param {number} [options.resourceVersion] - resource_version
 * @param {boolean} [options.isMultipart] - 是否 multipart/form-data
 * @returns {Promise<object>}
 */
export async function request(method, path, options = {}) {
  const {
    body,
    signal,
    idempotencyKey,
    resourceVersion,
    isMultipart = false
  } = options;

  const url = new URL(path, API_BASE_URL).toString();
  const headers = new Headers();

  if (!isMultipart) {
    headers.set("Content-Type", "application/json");
  }

  if (idempotencyKey) {
    headers.set("Idempotency-Key", idempotencyKey);
  }

  if (resourceVersion !== undefined) {
    headers.set("X-Resource-Version", String(resourceVersion));
  }

  const fetchOptions = {
    method,
    headers,
    signal,
    credentials: "same-origin"
  };

  if (body !== undefined) {
    fetchOptions.body = isMultipart ? body : JSON.stringify(body);
  }

  let attempt = 0;
  const maxAttempts = 3;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const response = await fetch(url, fetchOptions);
      const isJson = response.headers.get("content-type")?.includes("application/json");
      const result = isJson ? await response.json() : await response.text();

      if (!response.ok) {
        const payload =
          typeof result === "object" && result !== null ? result : {};
        const error = {
          status: response.status,
          statusText: response.statusText,
          ...payload,
          code: payload.error?.code || payload.code,
          message:
            payload.error?.message ||
            payload.message ||
            (typeof result === "string" ? result : response.statusText),
          details: payload.error?.details || payload.details,
          requestId: payload.request_id || payload.requestId
        };
        throw error;
      }

      return result;
    } catch (error) {
      if (attempt < maxAttempts && isRetryable(error)) {
        await delay(Math.pow(2, attempt) * 500);
        continue;
      }
      throw error;
    }
  }

  throw new Error("Max retry attempts exceeded");
}

/**
 * GET 请求
 */
export function get(path, options = {}) {
  return request("GET", path, options);
}

/**
 * POST 请求
 */
export function post(path, body, options = {}) {
  return request("POST", path, { ...options, body });
}

/**
 * PUT 请求
 */
export function put(path, body, options = {}) {
  return request("PUT", path, { ...options, body });
}

/**
 * PATCH 请求
 */
export function patch(path, body, options = {}) {
  return request("PATCH", path, { ...options, body });
}

/**
 * DELETE 请求
 */
export function del(path, options = {}) {
  return request("DELETE", path, options);
}

/**
 * 上传文件 (multipart/form-data)
 */
export function upload(path, formData, options = {}) {
  return request("POST", path, { ...options, body: formData, isMultipart: true });
}

/**
 * 延迟函数
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * V2.1 协议第 9 节定义的错误码白名单。
 * 调用方应按错误码（而非 HTTP 状态）决定前端动作。
 */
export const V2_ERROR_CODES = Object.freeze({
  INTENT_CONFIRMATION_REQUIRED: "intent_confirmation_required",
  SCENE_VERSION_STALE: "scene_version_stale",
  RELATED_DESIGN_RUN_ACTIVE: "related_design_run_active",
  PUBLICATION_REQUIRES_SAVED_PLAN: "publication_requires_saved_plan",
  PUBLICATION_ALREADY_EXISTS: "publication_already_exists",
  CART_INTENT_STALE: "cart_intent_stale",
  RELATED_DESIGN_CONTRACT_INVALID: "related_design_contract_invalid",
  IMPLEMENTATION_ORDER_INVALID: "implementation_order_invalid",
  RATE_LIMITED: "rate_limited",
  PROVIDER_FAILED: "provider_failed",
  PROVIDER_TIMEOUT: "provider_timeout",
  RESOURCE_VERSION_CONFLICT: "resource_version_conflict",
  RESOURCE_NOT_FOUND: "resource_not_found"
});

/**
 * 判断错误对象是否为指定错误码。
 * 兼容两种来源：顶层 `code` 或 `error.code`（来自 ErrorEnvelope）。
 * @param {object} error
 * @param {string} code
 * @returns {boolean}
 */
export function isErrorCode(error, code) {
  if (!error || !code) return false;
  const actual = error.code || error.error?.code;
  return actual === code;
}

/**
 * 判断错误是否为指定错误码之一。
 * @param {object} error
 * @param {string[]} codes
 * @returns {boolean}
 */
export function hasErrorCode(error, codes) {
  if (!error || !Array.isArray(codes) || codes.length === 0) return false;
  const actual = error.code || error.error?.code;
  return Boolean(actual) && codes.includes(actual);
}

/**
 * 提取 ErrorEnvelope 中的 retry_after（毫秒），用于 429 rate_limited。
 * 后端可能返回秒或 ISO8601；此处统一返回毫秒数，缺失返回 null。
 * @param {object} error
 * @returns {number|null}
 */
export function extractRetryAfterMs(error) {
  const raw =
    error?.details?.retry_after ??
    error?.details?.retry_after_ms ??
    error?.error?.details?.retry_after ??
    error?.error?.details?.retry_after_ms;
  if (raw == null) return null;
  if (typeof raw === "number") {
    // 兼容秒与毫秒两种写法
    return raw > 1000 ? raw : raw * 1000;
  }
  if (typeof raw === "string") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n > 1000 ? n : n * 1000;
    const date = Date.parse(raw);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  }
  return null;
}

/**
 * 错误映射
 */
export function mapError(error) {
  if (!error) return error;

  const errorMap = {
    400: { type: "badRequest", message: "请求无法处理，请检查输入" },
    404: { type: "notFound", message: "资源未找到" },
    409: { type: "conflict", message: "资源冲突，请刷新后重试" },
    413: { type: "tooLarge", message: "文件过大，请选择更小的文件" },
    415: { type: "unsupportedMediaType", message: "仅支持 JPEG / PNG / WebP 格式" },
    422: { type: "validation", message: "输入校验失败" },
    429: { type: "rateLimit", message: "请求过于频繁，请稍后重试" },
    500: { type: "serverError", message: "服务器错误，请稍后重试" },
    502: { type: "badGateway", message: "网关错误，请稍后重试" },
    504: { type: "gatewayTimeout", message: "请求超时，请稍后重试" }
  };

  // V2.1 协议第 9 节：按错误码补强用户文案与可重试标记
  const code = error.code || error.error?.code;
  const V2_MESSAGES = {
    [V2_ERROR_CODES.INTENT_CONFIRMATION_REQUIRED]:
      "需要先确认意图，再继续生成。",
    [V2_ERROR_CODES.SCENE_VERSION_STALE]: "场景版本已更新，请重新选择。",
    [V2_ERROR_CODES.RELATED_DESIGN_RUN_ACTIVE]:
      "相关设计正在运行，正在恢复进度。",
    [V2_ERROR_CODES.PUBLICATION_REQUIRES_SAVED_PLAN]:
      "请先保存方案，再尝试发布。",
    [V2_ERROR_CODES.PUBLICATION_ALREADY_EXISTS]:
      "该方案已发布，正在打开发布详情。",
    [V2_ERROR_CODES.CART_INTENT_STALE]: "实施清单已更新，正在刷新。",
    [V2_ERROR_CODES.RELATED_DESIGN_CONTRACT_INVALID]:
      "相关设计请求校验失败，可重试或稍后再试。",
    [V2_ERROR_CODES.IMPLEMENTATION_ORDER_INVALID]:
      "当前勾选无法整套加入购物车，请逐项处理。",
    [V2_ERROR_CODES.RATE_LIMITED]: "请求过于频繁，请稍后重试。",
    [V2_ERROR_CODES.PROVIDER_FAILED]: "上游服务暂时不可用，请稍后重试。",
    [V2_ERROR_CODES.PROVIDER_TIMEOUT]: "上游服务超时，请稍后重试。",
    [V2_ERROR_CODES.RESOURCE_VERSION_CONFLICT]:
      "资源已被更新，请刷新后重试。",
    [V2_ERROR_CODES.RESOURCE_NOT_FOUND]: "资源未找到。"
  };

  let mapped = error;
  if (error.status && errorMap[error.status]) {
    const statusMapping = errorMap[error.status];
    mapped = {
      ...statusMapping,
      ...error,
      type: statusMapping.type,
      message: error.message || statusMapping.message
    };
  }
  if (code && V2_MESSAGES[code]) {
    mapped = { ...mapped, code, message: V2_MESSAGES[code] };
  }

  // 429 与 5xx 默认可重试；V2 协议明确 retryable=false 时覆盖
  if (typeof mapped.retryable !== "boolean") {
    if (mapped.status === 429 || (mapped.status >= 500 && mapped.status < 600)) {
      mapped.retryable = true;
    } else if (
      hasErrorCode(mapped, [
        V2_ERROR_CODES.PROVIDER_FAILED,
        V2_ERROR_CODES.PROVIDER_TIMEOUT,
        V2_ERROR_CODES.RATE_LIMITED
      ])
    ) {
      mapped.retryable = true;
    } else if (
      hasErrorCode(mapped, [
        V2_ERROR_CODES.RELATED_DESIGN_CONTRACT_INVALID,
        V2_ERROR_CODES.IMPLEMENTATION_ORDER_INVALID,
        V2_ERROR_CODES.RESOURCE_NOT_FOUND
      ])
    ) {
      mapped.retryable = false;
    }
  }

  if (mapped.name === "AbortError") {
    mapped = { ...mapped, type: "aborted", message: "请求已取消", retryable: false };
  } else if (/network|fetch|连接/i.test(mapped.message || "")) {
    mapped = { ...mapped, type: "network", message: "网络连接失败，请检查网络", retryable: true };
  }

  return mapped;
}

/**
 * 清理 pending operations（页面刷新时调用）
 */
export function clearPendingOperations() {
  pendingOperations.clear();
}
