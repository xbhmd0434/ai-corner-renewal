const ROUTES = [
  {
    operationId: "createMedia",
    method: "POST",
    template: "/api/v1/media",
    idempotent: true,
    multipart: true
  },
  {
    operationId: "getMediaContent",
    method: "GET",
    template: "/api/v1/media/{media_id}/content"
  },
  {
    operationId: "deleteMedia",
    method: "DELETE",
    template: "/api/v1/media/{media_id}"
  },
  {
    operationId: "createAsset",
    method: "POST",
    template: "/api/v1/assets",
    idempotent: true
  },
  {
    operationId: "listAssets",
    method: "GET",
    template: "/api/v1/assets"
  },
  {
    operationId: "createAssetParseRun",
    method: "POST",
    template: "/api/v1/assets/{asset_id}/parse-runs",
    idempotent: true
  },
  {
    operationId: "createSpaceVersion",
    method: "POST",
    template: "/api/v1/assets/{asset_id}/versions",
    idempotent: true
  },
  {
    operationId: "listSpaceVersions",
    method: "GET",
    template: "/api/v1/assets/{asset_id}/versions"
  },
  {
    operationId: "sealSpaceVersion",
    method: "PATCH",
    template: "/api/v1/assets/{asset_id}/versions/{space_version_id}"
  },
  {
    operationId: "getAsset",
    method: "GET",
    template: "/api/v1/assets/{asset_id}"
  },
  {
    operationId: "updateAsset",
    method: "PATCH",
    template: "/api/v1/assets/{asset_id}"
  },
  {
    operationId: "deleteAsset",
    method: "DELETE",
    template: "/api/v1/assets/{asset_id}"
  },
  {
    operationId: "createDesignRequest",
    method: "POST",
    template: "/api/v1/design-requests",
    idempotent: true
  },
  {
    operationId: "getDesignRequest",
    method: "GET",
    template: "/api/v1/design-requests/{design_request_id}"
  },
  {
    operationId: "createGenerationRun",
    method: "POST",
    template: "/api/v1/design-requests/{design_request_id}/runs",
    idempotent: true
  },
  {
    operationId: "getGenerationRun",
    method: "GET",
    template: "/api/v1/generation-runs/{generation_run_id}"
  },
  {
    operationId: "cancelGenerationRun",
    method: "POST",
    template: "/api/v1/generation-runs/{generation_run_id}/cancel"
  },
  {
    operationId: "listPlans",
    method: "GET",
    template: "/api/v1/plans"
  },
  {
    operationId: "getPlanVersion",
    method: "GET",
    template: "/api/v1/plans/{plan_asset_id}/versions/{plan_version_id}"
  },
  {
    operationId: "createPlanRevision",
    method: "POST",
    template: "/api/v1/plans/{plan_asset_id}/revisions",
    idempotent: true
  },
  {
    operationId: "getPlan",
    method: "GET",
    template: "/api/v1/plans/{plan_asset_id}"
  },
  {
    operationId: "updatePlan",
    method: "PATCH",
    template: "/api/v1/plans/{plan_asset_id}"
  },
  {
    operationId: "getPreferences",
    method: "GET",
    template: "/api/v1/me/preferences"
  },
  {
    operationId: "updatePreferences",
    method: "PATCH",
    template: "/api/v1/me/preferences"
  },
  {
    operationId: "createEventBatch",
    method: "POST",
    template: "/api/v1/events/batch",
    idempotent: true
  },
  {
    operationId: "createProductDiscoveryRun",
    method: "POST",
    template: "/api/v1/plans/{plan_asset_id}/versions/{plan_version_id}/product-discovery-runs",
    idempotent: true
  },
  {
    operationId: "listProductDiscoveryRuns",
    method: "GET",
    template: "/api/v1/plans/{plan_asset_id}/versions/{plan_version_id}/product-discovery-runs"
  },
  {
    operationId: "getProductDiscoveryRun",
    method: "GET",
    template: "/api/v1/product-discovery-runs/{product_discovery_run_id}"
  },
  {
    operationId: "cancelProductDiscoveryRun",
    method: "POST",
    template: "/api/v1/product-discovery-runs/{product_discovery_run_id}/cancel"
  }
];

const operationIds = new Set();
const methodPaths = new Set();
for (const route of ROUTES) {
  const methodPath = `${route.method} ${route.template}`;
  if (operationIds.has(route.operationId) || methodPaths.has(methodPath)) {
    throw new Error(`重复的 /api/v1 路由契约：${route.operationId} / ${methodPath}`);
  }
  operationIds.add(route.operationId);
  methodPaths.add(methodPath);
}

export const V1_ROUTE_MANIFEST = Object.freeze(
  ROUTES.map((route) => Object.freeze({ ...route }))
);

const ROUTE_BY_OPERATION = new Map(
  V1_ROUTE_MANIFEST.map((route) => [route.operationId, route])
);

export function v1Route(operationId) {
  const route = ROUTE_BY_OPERATION.get(operationId);
  if (!route) throw new Error(`未知 /api/v1 operationId：${operationId}`);
  return route;
}
