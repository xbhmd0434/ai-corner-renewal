import { loadLocalEnvironment } from "../services/orchestrator/src/local-env.js";
import { loadConfig } from "../services/orchestrator/src/config.js";

loadLocalEnvironment();
const config = loadConfig();

if (!config.agentPlanApiKey) {
  throw new Error(
    "未检测到 AGENT_PLAN_API_KEY；请先在被 Git 忽略的 .env.local 中填写"
  );
}

const controller = new AbortController();
const timeout = setTimeout(
  () => controller.abort(),
  config.agentPlanTimeoutMs
);

try {
  const response = await fetch(
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
            content: "只回复 READY，用于验证 Agent Plan 鉴权。"
          }
        ],
        max_tokens: 16,
        temperature: 0
      })
    }
  );

  if (!response.ok) {
    await response.body?.cancel();
    const hint =
      response.status === 401 || response.status === 403
        ? "；请确认使用的是 Agent Plan「配置专属 API Key」生成的凭证，而不是普通方舟 API Key"
        : "";
    throw new Error(
      `Agent Plan 鉴权检查失败：HTTP ${response.status}${hint}`
    );
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Agent Plan 已响应，但返回协议缺少 assistant 内容");
  }

  console.log(
    JSON.stringify(
      {
        status: "ok",
        gateway: "agent_plan",
        model: payload.model || config.agentPlanTextModel,
        usage: payload.usage
          ? {
              prompt_tokens: payload.usage.prompt_tokens ?? null,
              completion_tokens: payload.usage.completion_tokens ?? null,
              total_tokens: payload.usage.total_tokens ?? null
            }
          : null
      },
      null,
      2
    )
  );
} finally {
  clearTimeout(timeout);
}
