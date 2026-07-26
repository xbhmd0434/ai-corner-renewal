/**
 * V2.1 能力门控（feature flag 路由）
 *
 * 依据 `v2-parallel-development-contract.md` 第 8 节，前端必须依据 `/api/health`
 * 声明的 features 决定是否请求对应接口。未声明的能力只能使用明确标注的 fixture，
 * 不能静默假装 Live，也不能请求不存在的路由。
 *
 * 后端尚未实现 V2.1 新能力时，`/api/health` 不会返回这些字段，本模块统一视为 false。
 */

export const CONTRACT_VERSION = "renewal-card/2.1";

/** V2.1 五个新能力标志，未在 health 中声明时一律按 false 处理。 */
export const V2_CAPABILITIES = Object.freeze({
  RENEWAL_INTENT_V2: "renewal_intent_v2",
  RELATED_DESIGNS: "related_designs",
  PLAN_PUBLICATION: "plan_publication",
  IMPLEMENTATION_LIST_V2: "implementation_list_v2",
  CART_BATCH_HANDOFF: "cart_batch_handoff"
});

/** 旧版 / 已上线能力，供前端兼容判断使用。 */
export const LEGACY_CAPABILITIES = Object.freeze({
  PRODUCT_DISCOVERY: "product_discovery",
  PRODUCT_DISCOVERY_LIVE_AGENT: "product_discovery_live_agent",
  DOUYIN_COMMERCE_CATALOG: "douyin_commerce_catalog"
});

const ALL_CAPABILITIES = Object.freeze({
  ...V2_CAPABILITIES,
  ...LEGACY_CAPABILITIES
});

/**
 * 解析 /api/health 响应，提取 features 子集。
 * 后端未声明 features 时返回空对象，调用方按 false 处理。
 * @param {object|null|undefined} health - /api/health 响应
 * @returns {object} - { capabilityName: boolean }
 */
export function readCapabilities(health) {
  const features = (health && health.features) || {};
  const result = {};
  for (const key of Object.values(ALL_CAPABILITIES)) {
    result[key] = features[key] === true;
  }
  return result;
}

/**
 * 判断指定能力是否可用。
 * @param {object} capabilities - readCapabilities 返回值
 * @param {string} name - 能力名（V2_CAPABILITIES / LEGACY_CAPABILITIES）
 * @returns {boolean}
 */
export function hasFeature(capabilities, name) {
  return Boolean(capabilities && capabilities[name] === true);
}

/**
 * 创建能力门控助手。在 feature=false 时调用方应跳过对应接口请求，
 * 改用明确标注的 fixture 或显示「演示数据」入口。
 * @param {object} capabilities - readCapabilities 返回值
 */
export function createCapabilityGate(capabilities) {
  return {
    capabilities,
    has(name) {
      return hasFeature(capabilities, name);
    },
    /**
     * 要求某能力可用才执行；否则抛出 `capability_unavailable`，
     * 调用方应捕获并降级到 fixture / Demo。
     */
    require(name, { hint = "后端尚未声明该能力" } = {}) {
      if (!hasFeature(capabilities, name)) {
        const error = new Error(`${hint}（${name}）`);
        error.code = "capability_unavailable";
        error.capability = name;
        error.status = 0;
        throw error;
      }
    },
    /**
     * 仅当能力可用才执行 action；否则返回 fallback 的结果。
     * 用于“后端不支持时静默走 fixture”的场景。
     */
    async when(name, action, fallback) {
      if (!hasFeature(capabilities, name)) {
        return typeof fallback === "function" ? fallback() : fallback;
      }
      return action();
    }
  };
}

/**
 * 是否处于完全离线状态（后端未连接）。
 * @param {object|null|undefined} health
 * @returns {boolean}
 */
export function isBackendOffline(health) {
  return !health || health.status !== "ok";
}
