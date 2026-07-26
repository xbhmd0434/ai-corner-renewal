/**
 * 把新版 query 参数与旧版 hash 路由收敛成单页启动上下文。
 * 旧链接继续可用，但不再决定页面结构。
 */
export function resolveStartupContext({
  search = "",
  hash = "",
  hasVideoContext = false
} = {}) {
  const query = new URLSearchParams(String(search).replace(/^\?/, ""));
  const rawHash = decodeURIComponent(String(hash).replace(/^#/, ""));
  const [legacyPath = "", legacyQuery = ""] = rawHash.split("?");
  const legacyParams = new URLSearchParams(legacyQuery);
  const source =
    query.get("source") ||
    legacyParams.get("source") ||
    (hasVideoContext ? "video" : "home");

  let drawer = query.get("drawer");
  if (!drawer && /^\/assets(?:\/|$)/.test(legacyPath)) drawer = "asset";
  if (!drawer && /^\/plans(?:\/|$)/.test(legacyPath)) drawer = "history";

  const planMatch = legacyPath.match(
    /^\/plans\/([^/]+)\/versions\/([^/]+)$/
  );

  return {
    source,
    drawer: ["asset", "history"].includes(drawer) ? drawer : null,
    requestUpload:
      query.get("upload") === "1" ||
      legacyPath === "/spaces/new",
    planAssetId: query.get("plan_asset_id") || planMatch?.[1] || null,
    planVersionId: query.get("plan_version_id") || planMatch?.[2] || null,
    legacyPath: legacyPath || null
  };
}

export function getStartupContext(videoContext = null) {
  return resolveStartupContext({
    search: globalThis.location?.search || "",
    hash: globalThis.location?.hash || "",
    hasVideoContext: Boolean(videoContext)
  });
}
