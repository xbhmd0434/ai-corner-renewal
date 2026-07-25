import {
  ContractValidationError,
  assertRoomProfile
} from "../../../../packages/contracts/src/index.js";

const clone = (value) => structuredClone(value);
const FIXED_ELEMENT_ALIASES = [
  ["built_in_cabinet", ["built_in_cabinet", "固定柜", "嵌入式柜"]],
  ["radiator", ["radiator", "暖气", "散热器"]],
  ["socket", ["socket", "插座"]],
  ["window", ["window", "窗"]],
  ["chair", ["chair", "椅"]],
  ["desk", ["desk", "书桌", "桌子"]],
  ["door", ["door", "门"]],
  ["bed", ["bed", "床"]],
  ["wall", ["wall", "墙"]]
];
const EDITABLE_ZONE_ALIASES = [
  [
    "underdesk_right",
    ["underdesk_right", "书桌下方", "桌下", "书桌底部", "桌子下方"]
  ],
  [
    "desktop_back",
    ["desktop_back", "桌面后方", "桌面后缘", "书桌后方", "桌后"]
  ],
  [
    "wall_leaning_zone",
    ["wall_leaning_zone", "空白墙面", "墙面", "墙角", "倚墙"]
  ],
  ["desktop", ["desktop", "桌面"]]
];

function makeUpstreamError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function toUpstreamRoomInput(roomInput) {
  const image = {};
  for (const key of ["reference", "data_url", "media_type"]) {
    if (roomInput.image[key] !== undefined) image[key] = roomInput.image[key];
  }

  const result = {
    room_id: roomInput.room_id,
    image
  };
  for (const key of ["reference_width_cm", "quality_hint"]) {
    if (roomInput[key] !== undefined) result[key] = roomInput[key];
  }
  return result;
}

function roomImageForAgentPlan(roomInput) {
  if (roomInput.image.data_url) return roomInput.image.data_url;
  if (roomInput.image.reference?.startsWith("https://")) {
    return roomInput.image.reference;
  }
  throw makeUpstreamError(
    "upstream_image_unavailable",
    "Agent Plan 只接收当前请求中的 data URL 或 HTTPS 图片地址"
  );
}

function extractAssistantText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const text = content
      .map((part) =>
        typeof part === "string" ? part : part?.text || part?.content || ""
      )
      .join("")
      .trim();
    if (text) return text;
  }
  throw makeUpstreamError(
    "upstream_contract_invalid",
    "Agent Plan 响应缺少 assistant JSON 内容"
  );
}

function parseAssistantJson(payload) {
  const text = extractAssistantText(payload)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end < start) {
    throw makeUpstreamError(
      "upstream_contract_invalid",
      "Agent Plan 未返回 JSON 对象"
    );
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw makeUpstreamError(
      "upstream_contract_invalid",
      "Agent Plan 返回的 RoomProfile JSON 无法解析"
    );
  }
}

function normalizeOntologyList(values, aliases) {
  if (!Array.isArray(values)) return [];
  const normalized = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const token = value.trim().toLowerCase().replace(/[\s.-]+/g, "_");
    const match = aliases.find(([, candidates]) =>
      candidates.some((candidate) => token.includes(candidate))
    );
    if (match) normalized.push(match[0]);
  }
  return [...new Set(normalized)];
}

function normalizeAgentPlanProfile(candidate, roomInput) {
  const fixedElements = normalizeOntologyList(
    candidate.fixed_elements,
    FIXED_ELEMENT_ALIASES
  );
  const editableZones = normalizeOntologyList(
    candidate.editable_zones,
    EDITABLE_ZONE_ALIASES
  );
  const roomProfile = {
    room_id: roomInput.room_id,
    room_type: candidate.room_type,
    reference_width_cm: roomInput.reference_width_cm ?? null,
    fixed_elements: fixedElements,
    editable_zones: editableZones,
    lighting: candidate.lighting,
    uncertainties: candidate.uncertainties,
    needs_confirmation: candidate.needs_confirmation
  };

  if (fixedElements.length < (candidate.fixed_elements?.length || 0)) {
    roomProfile.uncertainties = [
      ...new Set([
        ...(roomProfile.uncertainties || []),
        "unmapped_fixed_elements"
      ])
    ];
  }
  if (editableZones.length < (candidate.editable_zones?.length || 0)) {
    roomProfile.needs_confirmation = [
      ...new Set([
        ...(roomProfile.needs_confirmation || []),
        "editable_zone_mapping"
      ])
    ];
  }
  if (roomProfile.reference_width_cm === null) {
    roomProfile.uncertainties = [
      ...new Set([...(roomProfile.uncertainties || []), "reference_width_cm"])
    ];
    roomProfile.needs_confirmation = [
      ...new Set([
        ...(roomProfile.needs_confirmation || []),
        "reference_width_cm"
      ])
    ];
  }
  if (roomInput.quality_hint === "blurry") {
    roomProfile.uncertainties = [
      ...new Set([...(roomProfile.uncertainties || []), "room_image_clarity"])
    ];
    roomProfile.needs_confirmation = [
      ...new Set([
        ...(roomProfile.needs_confirmation || []),
        "clearer_room_image"
      ])
    ];
  }
  if (roomInput.quality_hint === "partial") {
    roomProfile.uncertainties = [
      ...new Set([...(roomProfile.uncertainties || []), "room_coverage"])
    ];
    roomProfile.needs_confirmation = [
      ...new Set([
        ...(roomProfile.needs_confirmation || []),
        "full_desk_and_wall_image"
      ])
    ];
  }
  return roomProfile;
}

function agentPlanPrompt(roomInput) {
  return [
    "分析这张真实居住空间照片，只提取可见事实和不确定项。",
    "不要估算厘米尺寸，不要提出商品、价格、施工或改造方案。",
    "严格输出一个 JSON 对象，不要 Markdown，不要解释。",
    "fixed_elements 只能从 wall、window、desk、chair、bed、door、socket、radiator、built_in_cabinet 中选择，只写照片明确可见的项。",
    "editable_zones 只能从 desktop、desktop_back、underdesk_right、wall_leaning_zone 中选择：desktop=桌面，desktop_back=桌面后缘，underdesk_right=桌下右侧，wall_leaning_zone=可安全倚放轻物的墙前区域。",
    "若无法确认某项，不要发明新代码，把疑问写入 uncertainties 或 needs_confirmation。",
    "字段必须且只能包含：",
    '{"room_type":"字符串","fixed_elements":["字符串"],"editable_zones":["字符串"],',
    '"lighting":{"direction":"字符串","confidence":0到1},',
    '"uncertainties":["字符串"],"needs_confirmation":["字符串"]}。',
    `用户提供的画质提示：${roomInput.quality_hint || "未提供"}。`,
    roomInput.reference_width_cm == null
      ? "用户没有提供参考宽度。"
      : `用户确认的参考宽度为 ${roomInput.reference_width_cm} cm；不要从图片重新估算。`
  ].join("\n");
}

function providerFromConfig(config) {
  if (config.roomAnalyzerProvider) return config.roomAnalyzerProvider;
  if (config.roomAnalyzerUrl) return "gateway";
  if (config.agentPlanApiKey) return "agent_plan";
  return "demo";
}

function responseTooLargeError(limitBytes) {
  return makeUpstreamError(
    "upstream_response_too_large",
    `空间理解上游响应超过 ${limitBytes} 字节限制`
  );
}

async function readBoundedJson(response, limitBytes) {
  const contentLengthValue = response.headers?.get?.("content-length");
  if (contentLengthValue !== null && contentLengthValue !== undefined) {
    const contentLength = Number(contentLengthValue);
    if (Number.isFinite(contentLength) && contentLength > limitBytes) {
      throw responseTooLargeError(limitBytes);
    }
  }

  if (!response.body || typeof response.body.getReader !== "function") {
    throw makeUpstreamError(
      "upstream_contract_invalid",
      "空间理解上游响应没有可读取的 JSON 正文"
    );
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > limitBytes) {
        try {
          await reader.cancel();
        } catch {
          // The size error is authoritative even if cancelling the stream fails.
        }
        throw responseTooLargeError(limitBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw makeUpstreamError(
      "upstream_contract_invalid",
      "空间理解上游响应不是有效 JSON"
    );
  }
}

function buildDemoRoomProfile(roomInput, defaultRoomProfile) {
  const profile = {
    room_id: roomInput.room_id,
    room_type: defaultRoomProfile.room_type,
    reference_width_cm: roomInput.reference_width_cm ?? null,
    fixed_elements: clone(defaultRoomProfile.fixed_elements),
    editable_zones: clone(defaultRoomProfile.editable_zones),
    lighting: clone(defaultRoomProfile.lighting),
    uncertainties: clone(defaultRoomProfile.uncertainties),
    needs_confirmation: clone(defaultRoomProfile.needs_confirmation)
  };

  if (profile.reference_width_cm === null) {
    profile.uncertainties.push("reference_width_cm");
    profile.needs_confirmation.push("reference_width_cm");
  }
  if (roomInput.quality_hint === "blurry") {
    profile.uncertainties.push("room_image_clarity");
    profile.needs_confirmation.push("clearer_room_image");
  }
  if (roomInput.quality_hint === "partial") {
    profile.uncertainties.push("room_coverage");
    profile.needs_confirmation.push("full_desk_and_wall_image");
  }

  profile.uncertainties = [...new Set(profile.uncertainties)];
  profile.needs_confirmation = [...new Set(profile.needs_confirmation)];
  return profile;
}

function fallbackReason(error) {
  if (error?.name === "AbortError" || error?.name === "TimeoutError") return "upstream_timeout";
  if (error instanceof ContractValidationError) return "upstream_contract_invalid";
  if (
    [
      "live_not_configured",
      "upstream_contract_invalid",
      "upstream_response_too_large",
      "upstream_room_mismatch",
      "upstream_image_unavailable",
      "upstream_unauthorized",
      "upstream_rate_limited",
      "upstream_http_error"
    ].includes(error?.code)
  ) {
    return error.code;
  }
  return "upstream_unavailable";
}

export function createRoomAnalyzer({
  config,
  defaultRoomProfile,
  fetchImpl = globalThis.fetch
}) {
  const analyzeDemo = (roomInput) => {
    const roomProfile = buildDemoRoomProfile(roomInput, defaultRoomProfile);
    assertRoomProfile(roomProfile);
    return {
      roomProfile,
      sourceMode: "demo",
      fallback: null
    };
  };

  const analyzeGateway = async (roomInput) => {
    if (!config.roomAnalyzerUrl) {
      const error = new Error("未配置 ROOM_ANALYZER_URL");
      error.code = "live_not_configured";
      throw error;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.roomAnalyzerTimeoutMs);
    try {
      const headers = { "Content-Type": "application/json" };
      if (config.roomAnalyzerApiKey) {
        headers.Authorization = `Bearer ${config.roomAnalyzerApiKey}`;
      }

      const response = await fetchImpl(config.roomAnalyzerUrl, {
        method: "POST",
        headers,
        redirect: "error",
        signal: controller.signal,
        body: JSON.stringify({
          schema_version: "1.0",
          task: "extract_room_profile",
          room_input: toUpstreamRoomInput(roomInput),
          output_contract: {
            name: "RoomProfile",
            schema_version: "1.0"
          }
        })
      });

      if (!response.ok) {
        try {
          await response.body?.cancel();
        } catch {
          // The HTTP status is authoritative even if cancelling the body fails.
        }
        throw new Error(`空间理解上游返回 HTTP ${response.status}`);
      }
      const payload = await readBoundedJson(
        response,
        config.roomAnalyzerResponseLimitBytes ?? 256 * 1024
      );
      const roomProfile = payload.room_profile ?? payload;
      assertRoomProfile(roomProfile);
      if (roomProfile.room_id !== roomInput.room_id) {
        throw makeUpstreamError(
          "upstream_room_mismatch",
          "空间理解上游返回了其他房间的结果"
        );
      }
      return {
        roomProfile: clone(roomProfile),
        sourceMode: "live",
        fallback: null
      };
    } finally {
      clearTimeout(timeout);
    }
  };

  const analyzeAgentPlan = async (roomInput) => {
    if (!config.agentPlanApiKey) {
      throw makeUpstreamError(
        "live_not_configured",
        "未配置 AGENT_PLAN_API_KEY"
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      config.agentPlanTimeoutMs ?? 30_000
    );
    try {
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
                  {
                    type: "image_url",
                    image_url: { url: roomImageForAgentPlan(roomInput) }
                  },
                  {
                    type: "text",
                    text: agentPlanPrompt(roomInput)
                  }
                ]
              }
            ],
            response_format: { type: "json_object" },
            temperature: 0.1,
            max_tokens: 1000
          })
        }
      );

      if (!response.ok) {
        try {
          await response.body?.cancel();
        } catch {
          // The status code is authoritative.
        }
        const code =
          response.status === 401 || response.status === 403
            ? "upstream_unauthorized"
            : response.status === 429
              ? "upstream_rate_limited"
              : "upstream_http_error";
        throw makeUpstreamError(
          code,
          `Agent Plan 空间理解返回 HTTP ${response.status}`
        );
      }

      const payload = await readBoundedJson(
        response,
        config.roomAnalyzerResponseLimitBytes ?? 256 * 1024
      );
      const roomProfile = normalizeAgentPlanProfile(
        parseAssistantJson(payload),
        roomInput
      );
      assertRoomProfile(roomProfile);
      return {
        roomProfile: clone(roomProfile),
        sourceMode: "live",
        fallback: null
      };
    } finally {
      clearTimeout(timeout);
    }
  };

  return async function analyzeRoom(roomInput, requestedMode = "auto") {
    const mode =
      config.backendMode === "demo" || requestedMode === "demo"
        ? "demo"
        : "live";
    if (mode === "demo") return analyzeDemo(roomInput);

    try {
      const provider = providerFromConfig(config);
      if (provider === "gateway") return await analyzeGateway(roomInput);
      if (provider === "agent_plan") return await analyzeAgentPlan(roomInput);
      throw makeUpstreamError(
        "live_not_configured",
        "未配置真实空间理解 Provider"
      );
    } catch (error) {
      const demoResult = analyzeDemo(roomInput);
      return {
        ...demoResult,
        sourceMode: "fallback",
        fallback: {
          reason: fallbackReason(error),
          message: "真实空间理解不可用，已使用同协议的本地演示空间档案"
        }
      };
    }
  };
}
