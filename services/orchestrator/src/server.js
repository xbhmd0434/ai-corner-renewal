import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createOpenApiDocument } from "../../../packages/contracts/src/openapi.js";
import { ApiError } from "./errors.js";
import { v1Route } from "../../../packages/contracts/src/v1-route-manifest.js";

const makeRequestId = () => `http-request-${randomUUID()}`;
const OPENAPI_DOCUMENT = createOpenApiDocument();
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;
const LOG_ROUTE_TEMPLATES = [
  [/^\/api\/v1\/media\/[^/]+\/content$/, "/api/v1/media/{media_id}/content"],
  [/^\/api\/v1\/media\/[^/]+$/, "/api/v1/media/{media_id}"],
  [
    /^\/api\/v1\/assets\/[^/]+\/parse-runs$/,
    "/api/v1/assets/{asset_id}/parse-runs"
  ],
  [
    /^\/api\/v1\/assets\/[^/]+\/intent-confirmations$/,
    "/api/v1/assets/{asset_id}/intent-confirmations"
  ],
  [
    /^\/api\/v1\/assets\/[^/]+\/versions\/[^/]+$/,
    "/api/v1/assets/{asset_id}/versions/{space_version_id}"
  ],
  [
    /^\/api\/v1\/assets\/[^/]+\/versions$/,
    "/api/v1/assets/{asset_id}/versions"
  ],
  [/^\/api\/v1\/assets\/[^/]+$/, "/api/v1/assets/{asset_id}"],
  [
    /^\/api\/v1\/design-requests\/[^/]+\/related-design-runs$/,
    "/api/v1/design-requests/{design_request_id}/related-design-runs"
  ],
  [
    /^\/api\/v1\/design-requests\/[^/]+\/runs$/,
    "/api/v1/design-requests/{design_request_id}/runs"
  ],
  [
    /^\/api\/v1\/design-requests\/[^/]+$/,
    "/api/v1/design-requests/{design_request_id}"
  ],
  [
    /^\/api\/v1\/related-design-runs\/[^/]+\/cancel$/,
    "/api/v1/related-design-runs/{related_design_run_id}/cancel"
  ],
  [
    /^\/api\/v1\/related-design-runs\/[^/]+$/,
    "/api/v1/related-design-runs/{related_design_run_id}"
  ],
  [
    /^\/api\/v1\/generation-runs\/[^/]+\/cancel$/,
    "/api/v1/generation-runs/{generation_run_id}/cancel"
  ],
  [
    /^\/api\/v1\/generation-runs\/[^/]+$/,
    "/api/v1/generation-runs/{generation_run_id}"
  ],
  [
    /^\/api\/v1\/plans\/[^/]+\/versions\/[^/]+$/,
    "/api/v1/plans/{plan_asset_id}/versions/{plan_version_id}"
  ],
  [
    /^\/api\/v1\/plans\/[^/]+\/revisions$/,
    "/api/v1/plans/{plan_asset_id}/revisions"
  ],
  [/^\/api\/v1\/plans\/[^/]+$/, "/api/v1/plans/{plan_asset_id}"],
  [
    /^\/api\/v1\/plans\/[^/]+\/versions\/[^/]+\/publications$/,
    "/api/v1/plans/{plan_asset_id}/versions/{plan_version_id}/publications"
  ],
  [
    /^\/api\/v1\/publications\/[^/]+$/,
    "/api/v1/publications/{publication_id}"
  ],
  [
    /^\/api\/v1\/plans\/[^/]+\/versions\/[^/]+\/product-discovery-runs$/,
    "/api/v1/plans/{plan_asset_id}/versions/{plan_version_id}/product-discovery-runs"
  ],
  [
    /^\/api\/v1\/product-discovery-runs\/[^/]+\/cart-intents$/,
    "/api/v1/product-discovery-runs/{product_discovery_run_id}/cart-intents"
  ],
  [
    /^\/api\/v1\/product-discovery-runs\/[^/]+$/,
    "/api/v1/product-discovery-runs/{product_discovery_run_id}"
  ],
  [
    /^\/api\/v1\/product-discovery-runs\/[^/]+\/cancel$/,
    "/api/v1/product-discovery-runs/{product_discovery_run_id}/cancel"
  ]
];

function logRoute(pathname) {
  return (
    LOG_ROUTE_TEMPLATES.find(([pattern]) => pattern.test(pathname))?.[1] ||
    pathname
  );
}

function methodNotAllowed(allowedMethods) {
  const error = new ApiError(
    "method_not_allowed",
    "该接口不支持当前 HTTP 方法",
    405,
    { allowed_methods: [...allowedMethods] }
  );
  error.allowedMethods = [...allowedMethods];
  return error;
}

function setSecurityHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

function applyCors(request, response, allowedOrigins) {
  const origin = request.headers.origin;
  if (!origin) return;
  if (!allowedOrigins.includes(origin)) {
    throw new ApiError("origin_not_allowed", "该浏览器来源未被允许", 403);
  }
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, DELETE, OPTIONS"
  );
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Idempotency-Key"
  );
  response.setHeader(
    "Access-Control-Expose-Headers",
    "X-Request-Id, ETag, Deprecation, Sunset"
  );
  response.setHeader("Access-Control-Max-Age", "600");
}

function sendJson(response, statusCode, payload, headers = {}) {
  setSecurityHeaders(response);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, value);
  }
  response.writeHead(statusCode);
  response.end(payload === null || payload === undefined ? "" : JSON.stringify(payload));
}

function sendNoContent(response, headers = {}) {
  setSecurityHeaders(response);
  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, value);
  }
  response.writeHead(204);
  response.end();
}

function sendMedia(response, value) {
  setSecurityHeaders(response);
  response.setHeader("Content-Type", value.mediaType);
  response.setHeader("Content-Length", String(value.bytes.length));
  response.setHeader("Content-Disposition", `inline; filename="${value.filename}"`);
  response.writeHead(200);
  response.end(value.bytes);
}

async function readBytes(request, limitBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limitBytes) {
      throw new ApiError(
        "payload_too_large",
        `请求体不能超过 ${limitBytes} 字节`,
        413
      );
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(request, limitBytes, methods = "JSON") {
  const contentType = request.headers["content-type"] || "";
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new ApiError(
      "unsupported_media_type",
      `${methods} 接口只接受 application/json`,
      415
    );
  }
  const bytes = await readBytes(request, limitBytes);
  if (bytes.length === 0) {
    throw new ApiError("empty_body", "请求体不能为空", 400);
  }
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new ApiError("invalid_json", "请求体不是合法 JSON", 400);
  }
}

function parseContentDisposition(value) {
  const name = value.match(/(?:^|;)\s*name="([^"]+)"/i)?.[1];
  const filename = value.match(/(?:^|;)\s*filename="([^"]*)"/i)?.[1];
  return { name, filename };
}

async function readMultipart(request, config) {
  const contentType = request.headers["content-type"] || "";
  const match = contentType.match(
    /^multipart\/form-data\s*;\s*boundary=(?:"([^"]+)"|([^;]+))$/i
  );
  const boundaryText = (match?.[1] || match?.[2] || "").trim();
  if (!boundaryText || boundaryText.length > 70 || /[^\x20-\x7e]/.test(boundaryText)) {
    throw new ApiError(
      "unsupported_media_type",
      "上传接口要求合法 multipart/form-data boundary",
      415
    );
  }
  const bytes = await readBytes(request, config.maxUploadBytes + 1_000_000);
  const boundary = Buffer.from(`--${boundaryText}`);
  const separator = Buffer.from("\r\n\r\n");
  const parts = [];
  let cursor = 0;
  while (true) {
    const boundaryIndex = bytes.indexOf(boundary, cursor);
    if (boundaryIndex < 0) break;
    let start = boundaryIndex + boundary.length;
    if (bytes.subarray(start, start + 2).toString() === "--") break;
    if (bytes.subarray(start, start + 2).toString() !== "\r\n") {
      throw new ApiError("invalid_multipart", "multipart 边界格式错误", 400);
    }
    start += 2;
    const headerEnd = bytes.indexOf(separator, start);
    if (headerEnd < 0 || headerEnd - start > 16_384) {
      throw new ApiError("invalid_multipart", "multipart Header 不完整", 400);
    }
    const nextBoundary = bytes.indexOf(boundary, headerEnd + separator.length);
    if (nextBoundary < 0) {
      throw new ApiError("invalid_multipart", "multipart 缺少结束边界", 400);
    }
    const headerText = bytes.subarray(start, headerEnd).toString("utf8");
    const headers = {};
    for (const line of headerText.split("\r\n")) {
      const colon = line.indexOf(":");
      if (colon < 1) throw new ApiError("invalid_multipart", "multipart Header 非法", 400);
      headers[line.slice(0, colon).trim().toLowerCase()] = line
        .slice(colon + 1)
        .trim();
    }
    const disposition = parseContentDisposition(
      headers["content-disposition"] || ""
    );
    if (!disposition.name) {
      throw new ApiError("invalid_multipart", "multipart part 缺少 name", 400);
    }
    const dataEnd =
      bytes.subarray(nextBoundary - 2, nextBoundary).toString() === "\r\n"
        ? nextBoundary - 2
        : nextBoundary;
    parts.push({
      name: disposition.name,
      filename: disposition.filename,
      contentType: headers["content-type"],
      bytes: bytes.subarray(headerEnd + separator.length, dataEnd)
    });
    cursor = nextBoundary;
  }
  const allowed = new Set(["file", "purpose", "retention"]);
  if (parts.some((part) => !allowed.has(part.name))) {
    throw new ApiError("multipart_field_not_allowed", "上传包含不支持的字段", 422);
  }
  const fileParts = parts.filter((part) => part.name === "file");
  if (fileParts.length !== 1 || !fileParts[0].filename || !fileParts[0].contentType) {
    throw new ApiError("media_file_required", "必须上传且只能上传一个 file", 422);
  }
  const text = {};
  for (const part of parts.filter((item) => item.name !== "file")) {
    if (part.filename || part.bytes.length > 200) {
      throw new ApiError("multipart_field_invalid", `${part.name} 字段非法`, 422);
    }
    text[part.name] = part.bytes.toString("utf8");
  }
  const file = fileParts[0];
  return {
    value: {
      file: {
        filename: file.filename,
        contentType: file.contentType.toLowerCase(),
        bytes: Buffer.from(file.bytes)
      },
      purpose: text.purpose,
      retention: text.retention || "temporary"
    },
    fingerprintValue: {
      purpose: text.purpose,
      retention: text.retention || "temporary",
      file: {
        filename: file.filename,
        media_type: file.contentType.toLowerCase(),
        byte_size: file.bytes.length,
        digest: createHash("sha256").update(file.bytes).digest("hex")
      }
    }
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint({ params, query, body }) {
  return createHash("sha256")
    .update(
      stableJson({
        params,
        query: Object.fromEntries(
          [...query.entries()].sort(([a], [b]) => a.localeCompare(b))
        ),
        body
      })
    )
    .digest("hex");
}

function requireIdempotencyKey(request) {
  const key = request.headers["idempotency-key"];
  if (typeof key !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new ApiError(
      "idempotency_key_required",
      "请提供 8～200 字符的 Idempotency-Key",
      422
    );
  }
  return key;
}

function errorPayload(error, requestId) {
  const safeApiError =
    error instanceof ApiError && Number.isInteger(error.statusCode);
  const publicClientError =
    Number.isInteger(error?.statusCode) &&
    error.statusCode >= 400 &&
    error.statusCode < 500;
  const isPublic = safeApiError || publicClientError;
  const statusCode = isPublic ? error.statusCode : 500;
  return {
    statusCode,
    headers:
      statusCode === 405 && Array.isArray(error.allowedMethods)
        ? { Allow: [...new Set(error.allowedMethods)].sort().join(", ") }
        : {},
    body: {
      schema_version: "1.0",
      request_id: requestId,
      error: {
        code: isPublic ? error.code || "request_failed" : "internal_error",
        message: isPublic ? error.message : "服务内部错误",
        retryable:
          isPublic && typeof error.retryable === "boolean"
            ? error.retryable
            : statusCode >= 500,
        ...(isPublic && error.issues ? { issues: error.issues } : {}),
        ...(isPublic && error.details ? { details: error.details } : {})
      }
    }
  };
}

const defaultLogger = {
  info(event) {
    console.log(JSON.stringify(event));
  },
  error(event) {
    console.error(JSON.stringify(event));
  }
};

function response(status, body, headers = {}) {
  return { status, body, headers };
}

function etag(value) {
  return value?.resource_version
    ? { ETag: `"resource-version-${value.resource_version}"` }
    : {};
}

async function dispatchV1({
  request,
  pathname,
  url,
  platform,
  config
}) {
  if (!platform.mediaService) return null;
  const actorId = platform.actorId;
  const method = request.method || "GET";
  const routes = [
    {
      ...v1Route("createMedia"),
      regex: /^\/api\/v1\/media$/,
      run: ({ body }) => response(201, platform.mediaService.create(actorId, body))
    },
    {
      ...v1Route("getMediaContent"),
      regex: /^\/api\/v1\/media\/([^/]+)\/content$/,
      run: ({ params }) => ({
        media: platform.mediaService.getContent(
          actorId,
          decodeURIComponent(params[0]),
          url.searchParams.get("token")
        )
      })
    },
    {
      ...v1Route("deleteMedia"),
      regex: /^\/api\/v1\/media\/([^/]+)$/,
      run: ({ params }) => {
        platform.mediaService.deleteUnbound(actorId, decodeURIComponent(params[0]));
        return response(204, null);
      }
    },
    {
      ...v1Route("createAsset"),
      regex: /^\/api\/v1\/assets$/,
      run: ({ body }) => {
        const result = platform.assetService.create(actorId, body);
        return response(result.status, result.value, etag(result.value));
      }
    },
    {
      ...v1Route("listAssets"),
      regex: /^\/api\/v1\/assets$/,
      run: () =>
        response(
          200,
          platform.assetService.list(
            actorId,
            Object.fromEntries(url.searchParams.entries())
          )
        )
    },
    {
      ...v1Route("createAssetParseRun"),
      regex: /^\/api\/v1\/assets\/([^/]+)\/parse-runs$/,
      run: ({ params, body }) =>
        response(
          202,
          platform.assetService.retryParse(
            actorId,
            decodeURIComponent(params[0]),
            body
          )
        )
    },
    {
      ...v1Route("createSpaceVersion"),
      regex: /^\/api\/v1\/assets\/([^/]+)\/versions$/,
      run: ({ params, body }) =>
        response(
          201,
          platform.assetService.createSpaceVersion(
            actorId,
            decodeURIComponent(params[0]),
            body
          )
        )
    },
    {
      ...v1Route("listSpaceVersions"),
      regex: /^\/api\/v1\/assets\/([^/]+)\/versions$/,
      run: ({ params }) =>
        response(
          200,
          platform.assetService.listSpaceVersions(
            actorId,
            decodeURIComponent(params[0])
          )
        )
    },
    {
      ...v1Route("sealSpaceVersion"),
      regex: /^\/api\/v1\/assets\/([^/]+)\/versions\/([^/]+)$/,
      run: ({ params, body }) => {
        const value = platform.assetService.patchSpaceVersion(
          actorId,
          decodeURIComponent(params[0]),
          decodeURIComponent(params[1]),
          body
        );
        return response(200, value, etag(value));
      }
    },
    {
      ...v1Route("getAsset"),
      regex: /^\/api\/v1\/assets\/([^/]+)$/,
      run: ({ params }) => {
        const value = platform.assetService.detail(
          actorId,
          decodeURIComponent(params[0])
        );
        return response(200, value, etag(value));
      }
    },
    {
      ...v1Route("updateAsset"),
      regex: /^\/api\/v1\/assets\/([^/]+)$/,
      run: ({ params, body }) => {
        const value = platform.assetService.patch(
          actorId,
          decodeURIComponent(params[0]),
          body
        );
        return response(200, value, etag(value));
      }
    },
    {
      ...v1Route("deleteAsset"),
      regex: /^\/api\/v1\/assets\/([^/]+)$/,
      run: ({ params }) => {
        platform.assetService.delete(actorId, decodeURIComponent(params[0]));
        return response(204, null);
      }
    },
    {
      ...v1Route("confirmInspirationIntent"),
      regex: /^\/api\/v1\/assets\/([^/]+)\/intent-confirmations$/,
      run: ({ params, body }) => {
        const value = platform.assetService.confirmIntent(
          actorId,
          decodeURIComponent(params[0]),
          body
        );
        return response(200, value, etag(value));
      }
    },
    {
      ...v1Route("createDesignRequest"),
      regex: /^\/api\/v1\/design-requests$/,
      run: ({ body }) =>
        response(201, platform.designRequestService.create(actorId, body))
    },
    {
      ...v1Route("getDesignRequest"),
      regex: /^\/api\/v1\/design-requests\/([^/]+)$/,
      run: ({ params }) =>
        response(
          200,
          platform.designRequestService.get(
            actorId,
            decodeURIComponent(params[0])
          )
        )
    },
    {
      ...v1Route("createGenerationRun"),
      regex: /^\/api\/v1\/design-requests\/([^/]+)\/runs$/,
      run: ({ params, body }) =>
        response(
          202,
          platform.planService.startRun(
            actorId,
            decodeURIComponent(params[0]),
            body
          )
        )
    },
    {
      ...v1Route("createRelatedDesignRun"),
      regex: /^\/api\/v1\/design-requests\/([^/]+)\/related-design-runs$/,
      run: ({ params, body }) =>
        response(
          202,
          platform.relatedDesignService.create(
            actorId,
            decodeURIComponent(params[0]),
            body
          )
        )
    },
    {
      ...v1Route("listRelatedDesignRuns"),
      regex: /^\/api\/v1\/design-requests\/([^/]+)\/related-design-runs$/,
      run: ({ params }) =>
        response(
          200,
          platform.relatedDesignService.list(
            actorId,
            decodeURIComponent(params[0])
          )
        )
    },
    {
      ...v1Route("getRelatedDesignRun"),
      regex: /^\/api\/v1\/related-design-runs\/([^/]+)$/,
      run: ({ params }) =>
        response(
          200,
          platform.relatedDesignService.get(
            actorId,
            decodeURIComponent(params[0])
          )
        )
    },
    {
      ...v1Route("cancelRelatedDesignRun"),
      regex: /^\/api\/v1\/related-design-runs\/([^/]+)\/cancel$/,
      run: ({ params }) =>
        response(
          200,
          platform.relatedDesignService.cancel(
            actorId,
            decodeURIComponent(params[0])
          )
        )
    },
    {
      ...v1Route("getGenerationRun"),
      regex: /^\/api\/v1\/generation-runs\/([^/]+)$/,
      run: ({ params }) =>
        response(
          200,
          platform.planService.getRun(actorId, decodeURIComponent(params[0]))
        )
    },
    {
      ...v1Route("cancelGenerationRun"),
      regex: /^\/api\/v1\/generation-runs\/([^/]+)\/cancel$/,
      run: ({ params }) =>
        response(
          200,
          platform.planService.cancel(actorId, decodeURIComponent(params[0]))
        )
    },
    {
      ...v1Route("listPlans"),
      regex: /^\/api\/v1\/plans$/,
      run: () =>
        response(
          200,
          platform.planService.listPlans(
            actorId,
            Object.fromEntries(url.searchParams.entries())
          )
        )
    },
    {
      ...v1Route("getPlanVersion"),
      regex: /^\/api\/v1\/plans\/([^/]+)\/versions\/([^/]+)$/,
      run: ({ params }) =>
        response(
          200,
          platform.planService.getPlanVersion(
            actorId,
            decodeURIComponent(params[0]),
            decodeURIComponent(params[1])
          )
        )
    },
    {
      ...v1Route("createPlanRevision"),
      regex: /^\/api\/v1\/plans\/([^/]+)\/revisions$/,
      run: ({ params, body }) =>
        response(
          202,
          platform.planService.createRevision(
            actorId,
            decodeURIComponent(params[0]),
            body
          )
        )
    },
    {
      ...v1Route("getPlan"),
      regex: /^\/api\/v1\/plans\/([^/]+)$/,
      run: ({ params }) => {
        const value = platform.planService.getPlan(
          actorId,
          decodeURIComponent(params[0])
        );
        return response(200, value, etag(value));
      }
    },
    {
      ...v1Route("updatePlan"),
      regex: /^\/api\/v1\/plans\/([^/]+)$/,
      run: ({ params, body }) => {
        const value = platform.planService.patchPlan(
          actorId,
          decodeURIComponent(params[0]),
          body
        );
        return response(200, value, etag(value));
      }
    },
    {
      ...v1Route("getPreferences"),
      regex: /^\/api\/v1\/me\/preferences$/,
      run: () => {
        const value = platform.preferenceService.get(actorId);
        return response(200, value, etag(value));
      }
    },
    {
      ...v1Route("updatePreferences"),
      regex: /^\/api\/v1\/me\/preferences$/,
      run: ({ body }) => {
        const value = platform.preferenceService.patch(actorId, body);
        return response(200, value, etag(value));
      }
    },
    {
      ...v1Route("createEventBatch"),
      regex: /^\/api\/v1\/events\/batch$/,
      run: ({ body }) =>
        response(202, platform.eventService.ingest(actorId, body))
    },
    {
      ...v1Route("createProductDiscoveryRun"),
      regex: /^\/api\/v1\/plans\/([^/]+)\/versions\/([^/]+)\/product-discovery-runs$/,
      run: ({ params, body }) =>
        response(
          202,
          platform.createProductDiscoveryRun(
            actorId,
            decodeURIComponent(params[0]),
            decodeURIComponent(params[1]),
            body
          )
        )
    },
    {
      ...v1Route("createPublication"),
      regex: /^\/api\/v1\/plans\/([^/]+)\/versions\/([^/]+)\/publications$/,
      run: ({ params, body }) =>
        response(
          201,
          platform.publicationService.create(
            actorId,
            decodeURIComponent(params[0]),
            decodeURIComponent(params[1]),
            body
          )
        )
    },
    {
      ...v1Route("getPublication"),
      regex: /^\/api\/v1\/publications\/([^/]+)$/,
      run: ({ params }) =>
        response(
          200,
          platform.publicationService.get(
            actorId,
            decodeURIComponent(params[0])
          )
        )
    },
    {
      ...v1Route("withdrawPublication"),
      regex: /^\/api\/v1\/publications\/([^/]+)$/,
      run: ({ params }) => {
        platform.publicationService.withdraw(actorId, decodeURIComponent(params[0]));
        return response(204, null);
      }
    },
    {
      ...v1Route("listProductDiscoveryRuns"),
      regex: /^\/api\/v1\/plans\/([^/]+)\/versions\/([^/]+)\/product-discovery-runs$/,
      run: ({ params }) =>
        response(
          200,
          platform.listProductDiscoveryRuns(
            actorId,
            decodeURIComponent(params[0]),
            decodeURIComponent(params[1]),
            Object.fromEntries(url.searchParams.entries())
          )
        )
    },
    {
      ...v1Route("getProductDiscoveryRun"),
      regex: /^\/api\/v1\/product-discovery-runs\/([^/]+)$/,
      run: ({ params }) =>
        response(
          200,
          platform.getProductDiscoveryRun(
            actorId,
            decodeURIComponent(params[0])
          )
        )
    },
    {
      ...v1Route("cancelProductDiscoveryRun"),
      regex: /^\/api\/v1\/product-discovery-runs\/([^/]+)\/cancel$/,
      run: ({ params }) =>
        response(
          200,
          platform.cancelProductDiscoveryRun(
            actorId,
            decodeURIComponent(params[0])
          )
        )
    },
    {
      ...v1Route("createCartIntent"),
      regex: /^\/api\/v1\/product-discovery-runs\/([^/]+)\/cart-intents$/,
      run: ({ params, body }) =>
        response(
          201,
          platform.commerceHandoffService.create(
            actorId,
            decodeURIComponent(params[0]),
            body
          )
        )
    }
  ];

  const pathMatches = routes.filter((route) => route.regex.test(pathname));
  const route = pathMatches.find((candidate) => candidate.method === method);
  if (!route) {
    if (pathMatches.length) {
      throw methodNotAllowed(pathMatches.map((candidate) => candidate.method));
    }
    return null;
  }
  const match = pathname.match(route.regex);
  const params = match.slice(1);
  let body = null;
  let fingerprintBody = null;
  if (["POST", "PATCH"].includes(method) && route.template.indexOf("/cancel") < 0) {
    if (route.multipart) {
      const multipart = await readMultipart(request, config);
      body = multipart.value;
      fingerprintBody = multipart.fingerprintValue;
    } else {
      body = await readJson(request, config.requestBodyLimitBytes);
      if (body?.schema_version !== "1.0") {
        throw new ApiError(
          "schema_version_unsupported",
          "schema_version 必须是 1.0",
          422
        );
      }
      fingerprintBody = body;
    }
  }
  if (!route.idempotent) return route.run({ params, body });

  const key = requireIdempotencyKey(request);
  const requestFingerprint = fingerprint({
    params: params.map(decodeURIComponent),
    query: url.searchParams,
    body: fingerprintBody
  });
  const existing = platform.repository.getIdempotency(
    actorId,
    method,
    route.template,
    key
  );
  if (existing) {
    if (existing.fingerprint !== requestFingerprint) {
      throw new ApiError(
        "idempotency_key_reused",
        "该 Idempotency-Key 已用于不同请求",
        409
      );
    }
    if (
      route.template === "/api/v1/media" &&
      existing.body?.media_id
    ) {
      const media = platform.repository.get(
        "media",
        actorId,
        existing.body.media_id
      );
      return response(
        existing.status,
        platform.mediaService.project(actorId, media),
        existing.headers
      );
    }
    return response(existing.status, existing.body, existing.headers);
  }
  const result = await route.run({ params, body });
  const persistedResult =
    route.template === "/api/v1/media" && result.body
      ? {
          ...result,
          body: {
            ...result.body,
            access: null
          }
        }
      : result;
  platform.repository.putIdempotency(
    actorId,
    method,
    route.template,
    key,
    requestFingerprint,
    persistedResult
  );
  return result;
}

export function createApiServer({
  orchestrator,
  config,
  logger = defaultLogger,
  requestIdFactory = makeRequestId
}) {
  const server = createServer(async (request, responseObject) => {
    const startedAt = Date.now();
    const requestId = requestIdFactory();
    const method = request.method || "GET";
    let pathname = "<invalid-request-target>";
    let pathForLog = pathname;
    let statusCode = 500;
    let sourceMode;
    responseObject.setHeader("X-Request-Id", requestId);

    try {
      let url;
      try {
        url = new URL(request.url || "/", "http://localhost");
        pathname = url.pathname;
        pathForLog = logRoute(pathname);
      } catch {
        throw new ApiError(
          "invalid_request_target",
          "HTTP 请求目标不是合法 URL",
          400
        );
      }
      applyCors(request, responseObject, config.allowedOrigins);
      if (method === "OPTIONS") {
        statusCode = 204;
        sendNoContent(responseObject);
        return;
      }

      if (method === "GET" && pathname === "/api/health") {
        const health = orchestrator.health();
        statusCode = 200;
        sendJson(responseObject, statusCode, {
          schema_version: "1.0",
          request_id: requestId,
          ...health
        });
        return;
      }
      if (method === "GET" && pathname === "/api/openapi.json") {
        statusCode = 200;
        sendJson(responseObject, statusCode, OPENAPI_DOCUMENT);
        return;
      }
      if (method === "GET" && pathname === "/api/prompt-lab") {
        statusCode = 200;
        sendJson(responseObject, statusCode, {
          request_id: requestId,
          ...orchestrator.promptLabTemplate()
        });
        return;
      }
      if (method === "POST" && pathname === "/api/prompt-lab/render") {
        const body = await readJson(request, config.requestBodyLimitBytes, "POST");
        const result = await orchestrator.renderPromptLab(body);
        sourceMode = result.source_mode;
        statusCode = 200;
        sendJson(responseObject, statusCode, {
          request_id: requestId,
          ...result
        });
        return;
      }
      if (method === "POST" && pathname === "/api/generate") {
        const body = await readJson(request, config.requestBodyLimitBytes, "POST");
        const card = await orchestrator.generate(body);
        sourceMode = card.source_mode;
        statusCode = 200;
        sendJson(responseObject, statusCode, card);
        return;
      }
      if (method === "POST" && pathname === "/api/revise") {
        const body = await readJson(request, config.requestBodyLimitBytes, "POST");
        const card = await orchestrator.revise(body);
        sourceMode = card.source_mode;
        statusCode = 200;
        sendJson(responseObject, statusCode, card);
        return;
      }
      if (
        [
          "/api/health",
          "/api/openapi.json",
          "/api/generate",
          "/api/revise",
          "/api/prompt-lab",
          "/api/prompt-lab/render"
        ].includes(pathname) &&
        !(
          (method === "GET" && pathname === "/api/health") ||
          (method === "GET" && pathname === "/api/openapi.json") ||
          (method === "GET" && pathname === "/api/prompt-lab") ||
          (method === "POST" &&
            [
              "/api/generate",
              "/api/revise",
              "/api/prompt-lab/render"
            ].includes(pathname))
        )
      ) {
        const allowedMethod = [
          "/api/health",
          "/api/openapi.json",
          "/api/prompt-lab"
        ].includes(pathname)
          ? "GET"
          : "POST";
        throw methodNotAllowed([allowedMethod]);
      }

      const result = pathname.startsWith("/api/v1/")
        ? await dispatchV1({
            request,
            pathname,
            url,
            platform: orchestrator,
            config
          })
        : null;
      if (!result) throw new ApiError("route_not_found", "接口不存在", 404);
      statusCode = result.media ? 200 : result.status;
      if (result.media) {
        sendMedia(responseObject, result.media);
      } else if (statusCode === 204) {
        sendNoContent(responseObject, result.headers);
      } else {
        sourceMode = result.body?.source_mode;
        sendJson(responseObject, statusCode, result.body, result.headers);
      }
    } catch (error) {
      const payload = errorPayload(error, requestId);
      statusCode = payload.statusCode;
      sendJson(responseObject, statusCode, payload.body, payload.headers);
      if (statusCode >= 500) {
        logger.error({
          event: "api_request_failed",
          request_id: requestId,
          method,
          path: pathForLog,
          status_code: statusCode,
          error_code: payload.body.error.code
        });
      }
    } finally {
      logger.info({
        event: "api_request",
        request_id: requestId,
        method,
        path: pathForLog,
        status_code: statusCode,
        source_mode: sourceMode,
        duration_ms: Date.now() - startedAt
      });
    }
  });

  server.requestTimeout = Math.max(
    30_000,
    (config.agentPlanImageTimeoutMs ?? 90_000) + 5_000
  );
  server.headersTimeout = 10_000;
  server.timeout = server.requestTimeout;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;
  return server;
}
