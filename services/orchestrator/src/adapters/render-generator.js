const DEFAULT_RESPONSE_LIMIT_BYTES = 24 * 1024 * 1024;

function providerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function imageForAgentPlan(roomInput) {
  if (roomInput.image.data_url) return roomInput.image.data_url;
  if (roomInput.image.reference?.startsWith("https://")) {
    return roomInput.image.reference;
  }
  throw providerError(
    "render_image_unavailable",
    "Seedream 只能接收当前请求中的 data URL 或 HTTPS 图片"
  );
}

function renderPrompt({ plan, roomProfile, products }) {
  const preserved = [
    ...(roomProfile.fixed_elements || []),
    ...(plan.preserved_elements || [])
  ];
  const placements = (plan.placements || [])
    .map((placement) => `${placement.zone}：${placement.instruction}`)
    .join("；");
  const productNames = (products || []).map((product) => product.name).join("、");

  return [
    "对输入的真实房间照片做局部软装改造，生成写实、可信、可执行的室内效果图。",
    "严格保持原始镜头机位、画幅、透视关系、房间结构、墙面、门窗、采光方向和大型家具位置不变。",
    `必须保持不变的元素：${[...new Set(preserved)].join("、") || "原有空间结构" }。`,
    `方案主题：${plan.title}。${plan.summary}`,
    productNames ? `使用这些软装或同等外观物件：${productNames}。` : "",
    placements ? `只按以下位置进行编辑：${placements}。` : "",
    "不要新增门窗，不要改变房间面积，不要拆改桌椅，不要生成施工中的场景。",
    "新增物件必须符合真实比例、重力、遮挡关系和现有光照；除上述修改外，其他区域保持原图不变。",
    "输出一张完成改造后的真实室内照片，不要拼图，不要前后对比排版，不要添加文字、标签或价格。"
  ]
    .filter(Boolean)
    .join("\n");
}

function responseTooLarge(limitBytes) {
  return providerError(
    "render_response_too_large",
    `Seedream 响应超过 ${limitBytes} 字节限制`
  );
}

async function readBoundedJson(response, limitBytes) {
  const contentLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(contentLength) && contentLength > limitBytes) {
    throw responseTooLarge(limitBytes);
  }
  if (!response.body || typeof response.body.getReader !== "function") {
    throw providerError(
      "render_contract_invalid",
      "Seedream 响应没有可读取的 JSON 正文"
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
          // The bounded-read error is authoritative.
        }
        throw responseTooLarge(limitBytes);
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
    throw providerError(
      "render_contract_invalid",
      "Seedream 响应不是有效 JSON"
    );
  }
}

function decodeGeneratedImage(payload, maxBytes) {
  let encoded = payload?.data?.[0]?.b64_json;
  if (typeof encoded !== "string" || !encoded.trim()) {
    throw providerError(
      "render_contract_invalid",
      "Seedream 响应缺少 data[0].b64_json"
    );
  }

  const dataUrlMatch = encoded.match(
    /^data:(image\/(?:jpeg|png|webp));base64,([\s\S]+)$/i
  );
  const declaredMediaType = dataUrlMatch?.[1]?.toLowerCase();
  if (dataUrlMatch) encoded = dataUrlMatch[2];
  encoded = encoded.replace(/\s/g, "");
  if (
    encoded.length === 0 ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
  ) {
    throw providerError(
      "render_contract_invalid",
      "Seedream 返回的图片 Base64 无效"
    );
  }

  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0 || bytes.length > maxBytes) {
    throw providerError(
      "render_image_too_large",
      `Seedream 图片超过 ${maxBytes} 字节限制`
    );
  }

  let mediaType;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    mediaType = "image/jpeg";
  } else if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
  ) {
    mediaType = "image/png";
  } else if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    mediaType = "image/webp";
  } else {
    throw providerError(
      "render_contract_invalid",
      "Seedream 返回的图片签名不受支持"
    );
  }
  if (declaredMediaType && declaredMediaType !== mediaType) {
    throw providerError(
      "render_contract_invalid",
      "Seedream 返回的图片 MIME 与文件签名不一致"
    );
  }
  return { bytes, mediaType };
}

function fallbackReason(error) {
  if (error?.name === "AbortError" || error?.name === "TimeoutError") {
    return "render_timeout";
  }
  return [
    "render_not_configured",
    "render_image_unavailable",
    "render_unauthorized",
    "render_rate_limited",
    "render_http_error",
    "render_response_too_large",
    "render_image_too_large",
    "render_contract_invalid"
  ].includes(error?.code)
    ? error.code
    : "render_unavailable";
}

function createSeedreamRequest({
  config,
  fetchImpl,
  now
}) {
  return async function requestSeedream({ roomInput, prompt }) {
    const startedAt = now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      config.agentPlanImageTimeoutMs ?? 90_000
    );
    try {
      const response = await fetchImpl(
        `${config.agentPlanBaseUrl}/images/generations`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.agentPlanApiKey}`,
            "Content-Type": "application/json"
          },
          redirect: "error",
          signal: controller.signal,
          body: JSON.stringify({
            model: config.agentPlanImageModel,
            prompt,
            image: [imageForAgentPlan(roomInput)],
            size: "2K",
            sequential_image_generation: "disabled",
            response_format: "b64_json",
            output_format: "jpeg",
            watermark: false
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
            ? "render_unauthorized"
            : response.status === 429
              ? "render_rate_limited"
              : "render_http_error";
        throw providerError(code, `Seedream 返回 HTTP ${response.status}`);
      }

      const payload = await readBoundedJson(
        response,
        config.agentPlanImageResponseLimitBytes ??
          DEFAULT_RESPONSE_LIMIT_BYTES
      );
      const image = decodeGeneratedImage(
        payload,
        config.maxUploadBytes ?? 20_000_000
      );
      return {
        sourceType: "live",
        model: payload.model || config.agentPlanImageModel,
        latencyMs: Math.max(0, now() - startedAt),
        ...image
      };
    } finally {
      clearTimeout(timeout);
    }
  };
}

export function createPromptLabGenerator({
  config,
  fetchImpl = globalThis.fetch,
  now = () => Date.now()
}) {
  const requestSeedream = createSeedreamRequest({ config, fetchImpl, now });
  return async function generatePromptLabImage({
    imageDataUrl,
    prompt,
    requestedMode = "live"
  }) {
    if (config.backendMode === "demo" || requestedMode === "demo") {
      return {
        sourceType: "fallback",
        reason: "render_not_configured",
        message: "当前 AI_BACKEND_MODE=demo，Prompt 实验台未调用模型。",
        model: config.agentPlanImageModel,
        latencyMs: 0
      };
    }
    if (!config.agentPlanApiKey) {
      return {
        sourceType: "fallback",
        reason: "render_not_configured",
        message: "未配置 Agent Plan 专属 Key，Prompt 实验台无法调用模型。",
        model: config.agentPlanImageModel,
        latencyMs: 0
      };
    }
    const startedAt = now();
    try {
      return await requestSeedream({
        roomInput: {
          image: {
            data_url: imageDataUrl
          }
        },
        prompt
      });
    } catch (error) {
      return {
        sourceType: "fallback",
        reason: fallbackReason(error),
        message: "Seedream 改图失败，请检查本地配置或稍后重试。",
        model: config.agentPlanImageModel,
        latencyMs: Math.max(0, now() - startedAt)
      };
    }
  };
}

export function createRenderGenerator({
  config,
  fetchImpl = globalThis.fetch,
  now = () => Date.now()
}) {
  const requestSeedream = createSeedreamRequest({ config, fetchImpl, now });
  return async function generateRender({
    roomInput,
    plan,
    roomProfile,
    products,
    requestedMode = "auto"
  }) {
    if (config.backendMode === "demo" || requestedMode === "demo") {
      return {
        sourceType: "demo",
        model: config.agentPlanImageModel,
        latencyMs: 0
      };
    }
    if (!config.agentPlanApiKey) {
      return {
        sourceType: "fallback",
        reason: "render_not_configured",
        message: "未配置 Agent Plan 专属 Key，效果图已回退为 Demo。",
        model: config.agentPlanImageModel,
        latencyMs: 0
      };
    }

    const startedAt = now();
    try {
      return await requestSeedream({
        roomInput,
        prompt: renderPrompt({ plan, roomProfile, products })
      });
    } catch (error) {
      return {
        sourceType: "fallback",
        reason: fallbackReason(error),
        message: "Seedream 实时效果图生成失败，已保留方案并回退为 Demo 效果图。",
        model: config.agentPlanImageModel,
        latencyMs: Math.max(0, now() - startedAt)
      };
    }
  };
}
