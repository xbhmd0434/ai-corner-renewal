const MAX_RESPONSE_BYTES = 512 * 1024;

function plannerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function imageForPlanner(imageDataUrl) {
  if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
    throw plannerError("planning_image_invalid", "布置规划需要合法的图片 Data URL");
  }
  return imageDataUrl;
}

async function readBoundedJson(response, limitBytes = MAX_RESPONSE_BYTES) {
  const length = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(length) && length > limitBytes) {
    throw plannerError("planning_response_too_large", "布置规划响应过大");
  }
  if (!response.body || typeof response.body.getReader !== "function") {
    throw plannerError("planning_contract_invalid", "布置规划响应没有正文");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limitBytes) {
        await reader.cancel().catch(() => {});
        throw plannerError("planning_response_too_large", "布置规划响应过大");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw plannerError("planning_contract_invalid", "布置规划响应不是合法 JSON");
  }
}

function assistantJson(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  const text = Array.isArray(content)
    ? content.map((part) => part?.text || part?.content || "").join("")
    : content;
  if (typeof text !== "string" || !text.trim()) {
    throw plannerError("planning_contract_invalid", "布置规划响应缺少 JSON 内容");
  }
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw plannerError("planning_contract_invalid", "布置规划没有返回 JSON 对象");
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw plannerError("planning_contract_invalid", "布置规划 JSON 无法解析");
  }
}

function requiredString(value, path, maximum = 2000) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw plannerError("planning_contract_invalid", `${path} 必须是非空字符串`);
  }
  return value.trim();
}

function stringArray(value, path, maximum = 16) {
  if (!Array.isArray(value) || value.length > maximum) {
    throw plannerError("planning_contract_invalid", `${path} 必须是数组`);
  }
  return value.map((item, index) => requiredString(item, `${path}[${index}]`, 300));
}

function normalizePlan(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw plannerError("planning_contract_invalid", "布置规划必须是 JSON 对象");
  }
  const status = candidate.status;
  if (!["ready", "needs_input"].includes(status)) {
    throw plannerError("planning_contract_invalid", "status 不受支持");
  }
  if (status === "needs_input") {
    return {
      status,
      needs_input_reason: requiredString(
        candidate.needs_input_reason,
        "needs_input_reason"
      )
    };
  }
  const scene = candidate.scene;
  const direction = candidate.design_direction;
  if (!scene || typeof scene !== "object" || !direction || typeof direction !== "object") {
    throw plannerError("planning_contract_invalid", "缺少 scene 或 design_direction");
  }
  const actions = Array.isArray(candidate.actions) ? candidate.actions : [];
  const productSlots = Array.isArray(candidate.product_slots)
    ? candidate.product_slots
    : [];
  if (actions.length < 1 || actions.length > 8 || productSlots.length > 5) {
    throw plannerError(
      "planning_contract_invalid",
      "actions 必须为 1～8 项，product_slots 不能超过 5 项"
    );
  }
  return {
    status,
    needs_input_reason: "",
    scene: {
      scene_type: requiredString(scene.scene_type, "scene.scene_type", 100),
      primary_function: requiredString(
        scene.primary_function,
        "scene.primary_function",
        300
      ),
      existing_style: requiredString(scene.existing_style, "scene.existing_style", 200),
      dominant_colors: stringArray(scene.dominant_colors, "scene.dominant_colors", 8),
      main_materials: stringArray(scene.main_materials, "scene.main_materials", 8),
      lighting: requiredString(scene.lighting, "scene.lighting", 300),
      editable_area: requiredString(scene.editable_area, "scene.editable_area", 500)
    },
    preserve: (candidate.preserve || []).slice(0, 24).map((item, index) => ({
      object: requiredString(item?.object, `preserve[${index}].object`, 200),
      reason: requiredString(item?.reason, `preserve[${index}].reason`, 300)
    })),
    problems: (candidate.problems || []).slice(0, 3).map((item, index) => ({
      type: requiredString(item?.type, `problems[${index}].type`, 40),
      area: requiredString(item?.area, `problems[${index}].area`, 200),
      evidence: requiredString(item?.evidence, `problems[${index}].evidence`, 500),
      priority: Number.isInteger(item?.priority) ? item.priority : index + 1
    })),
    design_direction: {
      goal: requiredString(direction.goal, "design_direction.goal", 500),
      focal_point: requiredString(
        direction.focal_point,
        "design_direction.focal_point",
        300
      ),
      palette: stringArray(direction.palette, "design_direction.palette", 8),
      materials: stringArray(direction.materials, "design_direction.materials", 8),
      spatial_strategy: requiredString(
        direction.spatial_strategy,
        "design_direction.spatial_strategy",
        800
      )
    },
    actions: actions.map((item, index) => {
      const type = requiredString(item?.type, `actions[${index}].type`, 40);
      if (!["organize_loose_items", "remove_trash", "add"].includes(type)) {
        throw plannerError(
          "planning_contract_invalid",
          `actions[${index}].type 不允许修改现有家具`
        );
      }
      return {
      type,
      target: requiredString(item?.target, `actions[${index}].target`, 200),
      placement: requiredString(item?.placement, `actions[${index}].placement`, 500),
      instruction: requiredString(
        item?.instruction,
        `actions[${index}].instruction`,
        800
      ),
      reason: requiredString(item?.reason, `actions[${index}].reason`, 500)
    };
    }),
    product_slots: productSlots.map((item, index) => ({
      slot_id: requiredString(item?.slot_id, `product_slots[${index}].slot_id`, 80),
      category: requiredString(item?.category, `product_slots[${index}].category`, 100),
      purpose: requiredString(item?.purpose, `product_slots[${index}].purpose`, 300),
      quantity:
        Number.isInteger(item?.quantity) && item.quantity >= 1 && item.quantity <= 6
          ? item.quantity
          : 1,
      size_constraint: requiredString(
        item?.size_constraint,
        `product_slots[${index}].size_constraint`,
        300
      ),
      color: requiredString(item?.color, `product_slots[${index}].color`, 150),
      material: requiredString(item?.material, `product_slots[${index}].material`, 150),
      placement: requiredString(
        item?.placement,
        `product_slots[${index}].placement`,
        500
      ),
      support: requiredString(item?.support, `product_slots[${index}].support`, 300),
      clearance_constraints: stringArray(
        item?.clearance_constraints || [],
        `product_slots[${index}].clearance_constraints`,
        8
      ),
      douyin_search_queries: stringArray(
        item?.douyin_search_queries || [],
        `product_slots[${index}].douyin_search_queries`,
        4
      )
    })),
    render_instruction: requiredString(
      candidate.render_instruction,
      "render_instruction",
      3000
    ),
    negative_constraints: stringArray(
      candidate.negative_constraints || [],
      "negative_constraints",
      24
    )
  };
}

function reasonFor(error) {
  if (error?.name === "AbortError" || error?.name === "TimeoutError") {
    return "planning_timeout";
  }
  if (
    [
      "planning_image_invalid",
      "planning_response_too_large",
      "planning_contract_invalid",
      "planning_unauthorized",
      "planning_rate_limited",
      "planning_http_error"
    ].includes(error?.code)
  ) {
    return error.code;
  }
  return "planning_unavailable";
}

export function createLayoutPlanner({
  config,
  fetchImpl = globalThis.fetch,
  now = () => Date.now()
}) {
  return async function planLayout({
    imageDataUrl,
    imageDataUrls,
    prompt,
    requestedMode = "live"
  }) {
    if (
      config.backendMode === "demo" ||
      requestedMode === "demo" ||
      !config.agentPlanApiKey
    ) {
      return {
        sourceType: "fallback",
        reason: "planning_not_configured",
        message: "布置规划模型未启用。",
        model: config.agentPlanTextModel,
        latencyMs: 0
      };
    }
    const startedAt = now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      config.agentPlanLayoutTimeoutMs ?? 90_000
    );
    try {
      const plannerImages = (
        Array.isArray(imageDataUrls) && imageDataUrls.length
          ? imageDataUrls
          : [imageDataUrl]
      )
        .slice(0, 4)
        .map(imageForPlanner);
      const response = await fetchImpl(
        `${config.agentPlanBaseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.agentPlanApiKey}`,
            "Content-Type": "application/json"
          },
          redirect: "error",
          signal: controller.signal,
          body: JSON.stringify({
            model: config.agentPlanTextModel,
            messages: [
              {
                role: "user",
                content: [
                  ...plannerImages.map((url) => ({
                    type: "image_url",
                    image_url: { url }
                  })),
                  { type: "text", text: prompt }
                ]
              }
            ],
            response_format: { type: "json_object" },
            temperature: 0,
            max_tokens: 4000
          })
        }
      );
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        const code =
          response.status === 401 || response.status === 403
            ? "planning_unauthorized"
            : response.status === 429
              ? "planning_rate_limited"
              : "planning_http_error";
        throw plannerError(code, `布置规划返回 HTTP ${response.status}`);
      }
      const payload = await readBoundedJson(
        response,
        config.roomAnalyzerResponseLimitBytes ?? MAX_RESPONSE_BYTES
      );
      return {
        sourceType: "live",
        model: payload.model || config.agentPlanTextModel,
        latencyMs: Math.max(0, now() - startedAt),
        plan: normalizePlan(assistantJson(payload))
      };
    } catch (error) {
      return {
        sourceType: "fallback",
        reason: reasonFor(error),
        diagnostic:
          typeof error?.message === "string"
            ? error.message.slice(0, 300)
            : "unknown planning error",
        message: "布置规划失败，未继续调用图片模型。",
        model: config.agentPlanTextModel,
        latencyMs: Math.max(0, now() - startedAt)
      };
    } finally {
      clearTimeout(timeout);
    }
  };
}
