import {
  API_BASE_URL,
  completePendingOperation,
  createPendingOperation,
  generateIdempotencyKey,
  get,
  post
} from "./http-client.js";

const DEFAULT_CREATE_BODY = Object.freeze({
  schema_version: "1.0",
  reason: "initial",
  options: Object.freeze({
    discovery_mode: "auto",
    max_subjects: 6,
    matches_per_subject: 3
  })
});

function segment(value) {
  return encodeURIComponent(String(value));
}

async function withIdempotency(type, metadata, execute) {
  const idempotencyKey = generateIdempotencyKey();
  createPendingOperation(idempotencyKey, { type, ...metadata });
  try {
    return await execute(idempotencyKey);
  } finally {
    completePendingOperation(idempotencyKey);
  }
}

export async function createProductDiscoveryRun(
  planAssetId,
  planVersionId,
  body = DEFAULT_CREATE_BODY,
  options = {}
) {
  return withIdempotency(
    "createProductDiscoveryRun",
    { planAssetId, planVersionId },
    (idempotencyKey) =>
      post(
        `/api/v1/plans/${segment(planAssetId)}/versions/${segment(planVersionId)}/product-discovery-runs`,
        body,
        { ...options, idempotencyKey }
      )
  );
}

export async function listProductDiscoveryRuns(
  planAssetId,
  planVersionId,
  params = {},
  options = {}
) {
  const url = new URL(
    `/api/v1/plans/${segment(planAssetId)}/versions/${segment(planVersionId)}/product-discovery-runs`,
    API_BASE_URL
  );
  const normalized = {
    sort: params.sort ?? "recent",
    limit: params.limit ?? 1,
    cursor: params.cursor
  };
  Object.entries(normalized).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });
  return get(url.pathname + url.search, options);
}

export async function getProductDiscoveryRun(runId, options = {}) {
  return get(`/api/v1/product-discovery-runs/${segment(runId)}`, options);
}

export async function cancelProductDiscoveryRun(runId, options = {}) {
  return post(
    `/api/v1/product-discovery-runs/${segment(runId)}/cancel`,
    { schema_version: "1.0" },
    options
  );
}

// 只供用户显式进入的“本地离线 Demo”使用。开发服务器把这些地址直接映射到
// 仓库共享 fixture；真实 API 失败不会调用这里。
export async function loadProductDiscoveryFixture(name = "ready", options = {}) {
  if (!new Set(["running", "ready", "empty"]).has(name)) {
    throw new TypeError(`Unknown product discovery fixture: ${name}`);
  }
  return get(`/__product-discovery-fixtures/product-discovery.run.${name}.json`, options);
}

export { DEFAULT_CREATE_BODY };
