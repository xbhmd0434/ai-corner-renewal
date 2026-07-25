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

  if (error.status && errorMap[error.status]) {
    return { ...error, ...errorMap[error.status] };
  }

  if (error.name === "AbortError") {
    return { ...error, type: "aborted", message: "请求已取消" };
  }

  if (/network|fetch|连接/i.test(error.message || "")) {
    return { ...error, type: "network", message: "网络连接失败，请检查网络" };
  }

  return error;
}

/**
 * 清理 pending operations（页面刷新时调用）
 */
export function clearPendingOperations() {
  pendingOperations.clear();
}
