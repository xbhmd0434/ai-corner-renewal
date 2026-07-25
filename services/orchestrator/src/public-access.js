import {
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import { ApiError } from "./errors.js";

export const SESSION_COOKIE_NAME = "ai_corner_session";

function digest(value) {
  return createHmac("sha256", "ai-corner-constant-time-compare")
    .update(String(value))
    .digest();
}

function equalSecret(left, right) {
  return timingSafeEqual(digest(left), digest(right));
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator < 1) return [part, ""];
        return [
          part.slice(0, separator),
          decodeURIComponent(part.slice(separator + 1))
        ];
      })
  );
}

function sign(encodedPayload, secret) {
  return createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
}

function createSessionToken(secret, ttlSeconds, now) {
  const payload = {
    sid: randomBytes(16).toString("base64url"),
    exp: Math.floor(now() / 1000) + ttlSeconds
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    token: `${encoded}.${sign(encoded, secret)}`,
    payload
  };
}
function verifySessionToken(token, secret, now) {
  if (typeof token !== "string" || token.length > 2048) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;
  const expected = sign(encoded, secret);
  if (!equalSecret(signature, expected)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    );
    if (
      typeof payload.sid !== "string" ||
      !Number.isInteger(payload.exp) ||
      payload.exp <= Math.floor(now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : value;
}

function requestIp(request, trustProxy) {
  if (trustProxy) {
    const forwarded = firstHeader(request.headers["x-forwarded-for"]);
    const first = forwarded?.split(",")[0]?.trim();
    if (first && first.length <= 128) return first;
  }
  return request.socket.remoteAddress || "unknown";
}

function createWindowLimiter({ limit, windowMs, now }) {
  const entries = new Map();
  return function consume(key) {
    const current = now();
    const existing = entries.get(key);
    if (!existing || current - existing.startedAt >= windowMs) {
      entries.set(key, { startedAt: current, count: 1 });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (existing.count >= limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((windowMs - (current - existing.startedAt)) / 1000)
        )
      };
    }
    existing.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  };
}

function rateLimitError(code, message, retryAfterSeconds) {
  const error = new ApiError(code, message, 429, {
    retry_after_seconds: retryAfterSeconds
  });
  error.headers = { "Retry-After": String(retryAfterSeconds) };
  error.retryable = true;
  return error;
}

export function isExpensiveRequest(method, pathname) {
  if (method !== "POST") return false;
  return (
    pathname === "/api/generate" ||
    pathname === "/api/revise" ||
    /^\/api\/v1\/design-requests\/[^/]+\/runs$/.test(pathname) ||
    /^\/api\/v1\/plans\/[^/]+\/revisions$/.test(pathname) ||
    /^\/api\/v1\/design-requests\/[^/]+\/related-design-runs$/.test(pathname) ||
    /^\/api\/v1\/plans\/[^/]+\/versions\/[^/]+\/product-discovery-runs$/.test(
      pathname
    ) ||
    pathname === "/api/v1/visual-search-queries"
  );
}

export function createPublicAccessController({
  config,
  now = () => Date.now()
}) {
  const authLimiter = createWindowLimiter({
    limit: config.authAttemptsPerWindow,
    windowMs: config.authWindowSeconds * 1000,
    now
  });
  const apiLimiter = createWindowLimiter({
    limit: config.apiRequestsPerMinute,
    windowMs: 60_000,
    now
  });
  const aiLimiter = createWindowLimiter({
    limit: config.aiRequestsPerMinute,
    windowMs: 60_000,
    now
  });
  let activeAiRequests = 0;

  function session(request) {
    if (!config.publicAccessEnabled) {
      return { sid: "local-development", exp: null };
    }
    const token = parseCookies(request.headers.cookie)[SESSION_COOKIE_NAME];
    return verifySessionToken(token, config.sessionSigningSecret, now);
  }

  function requireSession(request) {
    const value = session(request);
    if (!value) {
      throw new ApiError(
        "authentication_required",
        "请输入比赛访问口令后继续",
        401
      );
    }
    return value;
  }

  function login(request, accessCode) {
    if (!config.publicAccessEnabled) {
      return { cookie: "", expiresAt: null };
    }
    const ip = requestIp(request, config.trustProxy);
    const attempt = authLimiter(ip);
    if (!attempt.allowed) {
      throw rateLimitError(
        "authentication_rate_limited",
        "访问口令尝试次数过多，请稍后再试",
        attempt.retryAfterSeconds
      );
    }
    if (
      typeof accessCode !== "string" ||
      !equalSecret(accessCode, config.demoAccessCode)
    ) {
      throw new ApiError("invalid_access_code", "访问口令不正确", 401);
    }
    const created = createSessionToken(
      config.sessionSigningSecret,
      config.sessionTtlSeconds,
      now
    );
    return {
      cookie: [
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(created.token)}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        "Secure",
        `Max-Age=${config.sessionTtlSeconds}`
      ].join("; "),
      expiresAt: created.payload.exp
    };
  }

  function clearCookie() {
    return [
      `${SESSION_COOKIE_NAME}=`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Secure",
      "Max-Age=0"
    ].join("; ");
  }

  function enforceApiLimit(request, currentSession) {
    const ip = requestIp(request, config.trustProxy);
    const result = apiLimiter(`${currentSession.sid}:${ip}`);
    if (!result.allowed) {
      throw rateLimitError(
        "api_rate_limited",
        "请求过于频繁，请稍后再试",
        result.retryAfterSeconds
      );
    }
  }

  function acquireAi(request, currentSession) {
    if (!config.aiRequestsEnabled) {
      const error = new ApiError(
        "ai_requests_disabled",
        "真实 AI 调用当前已暂停，请稍后再试",
        503
      );
      error.retryable = true;
      throw error;
    }
    const ip = requestIp(request, config.trustProxy);
    const result = aiLimiter(`${currentSession.sid}:${ip}`);
    if (!result.allowed) {
      throw rateLimitError(
        "ai_rate_limited",
        "AI 生成请求过于频繁，请稍后再试",
        result.retryAfterSeconds
      );
    }
    if (activeAiRequests >= config.aiMaxConcurrent) {
      const error = new ApiError(
        "ai_capacity_reached",
        "当前生成任务较多，请稍后再试",
        503
      );
      error.retryable = true;
      throw error;
    }
    activeAiRequests += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      activeAiRequests = Math.max(0, activeAiRequests - 1);
    };
  }

  return {
    enabled: config.publicAccessEnabled,
    session,
    requireSession,
    login,
    clearCookie,
    enforceApiLimit,
    acquireAi
  };
}
