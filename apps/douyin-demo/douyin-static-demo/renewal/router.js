/**
 * Hash Router
 * 符合 HANDOFF.md 2.2 P0 路由规范
 * 使用 Hash Router，刷新静态服务器不会 404
 */

const ROUTES = {
  HOME: "/home",
  ASSETS: "/assets",
  ASSET_DETAIL: "/assets/:asset_id",
  SPACES_NEW: "/spaces/new",
  TASK: "/task",
  GENERATION: "/generation/:generation_run_id",
  PLANS: "/plans",
  PLAN_VERSION: "/plans/:plan_asset_id/versions/:plan_version_id",
  PREFERENCES: "/preferences"
};

/**
 * 解析 Hash 路由
 * @returns {object} - { path, params, query }
 */
export function parseRoute() {
  const hash = window.location.hash || "#/home";
  const path = hash.replace(/^#/, "");
  const [pathname, queryString] = path.split("?");

  const params = {};
  const query = {};

  // 解析查询参数
  if (queryString) {
    new URLSearchParams(queryString).forEach((value, key) => {
      query[key] = value;
    });
  }

  // 解析路径参数
  Object.values(ROUTES).forEach(route => {
    if (route.includes(":")) {
      const regex = new RegExp(`^${route.replace(/:[^/]+/g, "([^/]+)")}$`);
      const match = pathname.match(regex);
      if (match) {
        const paramNames = route.match(/:([^/]+)/g) || [];
        paramNames.forEach((param, index) => {
          params[param.slice(1)] = match[index + 1];
        });
      }
    }
  });

  return { path: pathname, params, query };
}

/**
 * 获取路由名称
 * @param {string} path - 路径
 * @returns {string} - 路由名称
 */
export function getRouteName(path) {
  const routeMap = {
    [ROUTES.HOME]: "home",
    [ROUTES.ASSETS]: "assets",
    [ROUTES.ASSET_DETAIL]: "asset-detail",
    [ROUTES.SPACES_NEW]: "spaces-new",
    [ROUTES.TASK]: "task",
    [ROUTES.GENERATION]: "generation",
    [ROUTES.PLANS]: "plans",
    [ROUTES.PLAN_VERSION]: "plan-version",
    [ROUTES.PREFERENCES]: "preferences"
  };

  // 精确匹配
  if (routeMap[path]) return routeMap[path];

  // 带参数的路由匹配
  for (const [route, name] of Object.entries(routeMap)) {
    if (route.includes(":") && matchRoute(route, path)) {
      return name;
    }
  }

  return "home";
}

/**
 * 检查路径是否匹配路由模式
 * @param {string} pattern - 路由模式（如 /assets/:id）
 * @param {string} path - 实际路径
 * @returns {boolean} - 是否匹配
 */
function matchRoute(pattern, path) {
  const regex = new RegExp(`^${pattern.replace(/:[^/]+/g, "([^/]+)")}$`);
  return regex.test(path);
}

/**
 * 导航到指定路由
 * @param {string} path - 目标路径
 * @param {object} [state] - 历史状态
 */
export function navigate(path, state = {}) {
  window.history.pushState(state, "", `#${path}`);
  emitRouteChange();
}

/**
 * 替换当前路由（不产生历史记录）
 * @param {string} path - 目标路径
 * @param {object} [state] - 历史状态
 */
export function replace(path, state = {}) {
  window.history.replaceState(state, "", `#${path}`);
  emitRouteChange();
}

/**
 * 返回上一页
 */
export function goBack() {
  window.history.back();
}

/**
 * 监听路由变化
 * @param {Function} callback - 回调函数
 * @returns {Function} - 取消监听函数
 */
export function onRouteChange(callback) {
  const handlePopState = () => callback(parseRoute());
  const handleHashChange = () => callback(parseRoute());
  const handleRouteChange = () => callback(parseRoute());

  window.addEventListener("popstate", handlePopState);
  window.addEventListener("hashchange", handleHashChange);
  window.addEventListener("routeChange", handleRouteChange);

  // 立即执行一次
  callback(parseRoute());

  return () => {
    window.removeEventListener("popstate", handlePopState);
    window.removeEventListener("hashchange", handleHashChange);
    window.removeEventListener("routeChange", handleRouteChange);
  };
}

/**
 * 触发路由变化事件
 */
function emitRouteChange() {
  window.dispatchEvent(new CustomEvent("routeChange"));
}

/**
 * 获取页面 ID
 * @param {string} routeName - 路由名称
 * @returns {string} - 页面 ID
 */
export function getPageId(routeName) {
  const pageMap = {
    "home": "page-home",
    "assets": "page-assets",
    "asset-detail": "page-assets",
    "spaces-new": "page-spaces-new",
    "task": "page-task",
    "generation": "page-generation",
    "plans": "page-plans",
    "plan-version": "page-plans",
    "preferences": "page-preferences"
  };
  return pageMap[routeName] || "page-home";
}

/**
 * 获取页面标题
 * @param {string} routeName - 路由名称
 * @returns {string} - 页面标题
 */
export function getPageTitle(routeName) {
  const titleMap = {
    "home": "AI 一角焕新",
    "assets": "资产中心",
    "asset-detail": "资产详情",
    "spaces-new": "上传空间",
    "task": "设计任务",
    "generation": "生成中",
    "plans": "方案历史",
    "plan-version": "方案详情",
    "preferences": "偏好设置"
  };
  return titleMap[routeName] || "AI 一角焕新";
}

export { ROUTES };
