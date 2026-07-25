import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";
import {
  createPromptLabGenerator,
  createRenderGenerator
} from "../src/adapters/render-generator.js";

const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=";

function input() {
  return {
    roomInput: {
      image: {
        data_url: "data:image/png;base64,iVBORw0KGgo=",
        media_type: "image/png"
      }
    },
    roomProfile: {
      fixed_elements: ["wall", "desk", "chair"]
    },
    plan: {
      title: "轻绿治愈版",
      summary: "保留桌椅，用绿植和暖光整理桌面。",
      preserved_elements: ["desk", "chair"],
      placements: [
        {
          zone: "desktop",
          instruction: "在桌面右侧放一盆小型绿植"
        }
      ]
    },
    products: [{ name: "小型绿植" }],
    requestedMode: "live"
  };
}

test("Seedream 使用 Agent Plan 专属图片端点并返回受校验的图片字节", async () => {
  let requestedUrl;
  let requestedOptions;
  let clock = 0;
  const generate = createRenderGenerator({
    config: loadConfig({
      AI_BACKEND_MODE: "auto",
      AGENT_PLAN_API_KEY: "secret",
      AGENT_PLAN_IMAGE_MODEL: "doubao-seedream-5.0-lite"
    }),
    now: () => (clock += 25),
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      requestedOptions = options;
      return new Response(
        JSON.stringify({
          model: "doubao-seedream-5.0-lite",
          data: [{ b64_json: ONE_PIXEL_PNG }]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }
  });

  const result = await generate(input());
  const body = JSON.parse(requestedOptions.body);

  assert.equal(
    requestedUrl,
    "https://ark.cn-beijing.volces.com/api/plan/v3/images/generations"
  );
  assert.equal(requestedOptions.headers.Authorization, "Bearer secret");
  assert.equal(requestedOptions.redirect, "error");
  assert.equal(body.model, "doubao-seedream-5.0-lite");
  assert.equal(body.image[0], input().roomInput.image.data_url);
  assert.equal(body.size, "2K");
  assert.equal(body.sequential_image_generation, "disabled");
  assert.equal(body.response_format, "b64_json");
  assert.equal(body.output_format, "jpeg");
  assert.equal(body.watermark, false);
  assert.match(body.prompt, /保持原始镜头机位/);
  assert.doesNotMatch(requestedOptions.body, /Bearer secret/);
  assert.equal(result.sourceType, "live");
  assert.equal(result.mediaType, "image/png");
  assert.ok(Buffer.isBuffer(result.bytes));
  assert.equal(result.latencyMs, 25);
});

test("Demo 请求不会消耗 Seedream 额度", async () => {
  let fetchCalls = 0;
  const generate = createRenderGenerator({
    config: loadConfig({
      AI_BACKEND_MODE: "auto",
      AGENT_PLAN_API_KEY: "secret"
    }),
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("must not be called");
    }
  });

  const result = await generate({ ...input(), requestedMode: "demo" });
  assert.equal(fetchCalls, 0);
  assert.equal(result.sourceType, "demo");
});

test("Prompt Lab 将用户当前编辑的完整 Prompt 原样交给 Seedream", async () => {
  let requestedOptions;
  const generate = createPromptLabGenerator({
    config: loadConfig({
      AI_BACKEND_MODE: "auto",
      AGENT_PLAN_API_KEY: "secret",
      AGENT_PLAN_IMAGE_MODEL: "doubao-seedream-5.0-lite"
    }),
    fetchImpl: async (_url, options) => {
      requestedOptions = options;
      return new Response(
        JSON.stringify({
          model: "doubao-seedream-5.0-lite",
          data: [{ b64_json: ONE_PIXEL_PNG }]
        }),
        { status: 200 }
      );
    }
  });
  const prompt =
    "保持两个显示器和键鼠不变；所有新增物必须完整接触桌面，不能挡住屏幕。";
  const result = await generate({
    imageDataUrl: input().roomInput.image.data_url,
    prompt
  });
  const body = JSON.parse(requestedOptions.body);

  assert.equal(body.prompt, prompt);
  assert.equal(body.image[0], input().roomInput.image.data_url);
  assert.equal(result.sourceType, "live");
});

test("Seedream 鉴权和响应契约失败只暴露安全的回退原因", async () => {
  const unauthorized = createRenderGenerator({
    config: loadConfig({
      AI_BACKEND_MODE: "live",
      AGENT_PLAN_API_KEY: "secret"
    }),
    fetchImpl: async () =>
      new Response("sensitive provider body", { status: 401 })
  });
  const authResult = await unauthorized(input());
  assert.equal(authResult.sourceType, "fallback");
  assert.equal(authResult.reason, "render_unauthorized");
  assert.doesNotMatch(JSON.stringify(authResult), /sensitive/);

  const invalid = createRenderGenerator({
    config: loadConfig({
      AI_BACKEND_MODE: "live",
      AGENT_PLAN_API_KEY: "secret"
    }),
    fetchImpl: async () =>
      new Response(JSON.stringify({ data: [{ url: "https://example.invalid" }] }), {
        status: 200
      })
  });
  const invalidResult = await invalid(input());
  assert.equal(invalidResult.sourceType, "fallback");
  assert.equal(invalidResult.reason, "render_contract_invalid");
});
