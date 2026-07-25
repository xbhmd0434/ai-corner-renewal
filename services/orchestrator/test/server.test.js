import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config.js";
import { createApiServer } from "../src/server.js";
import { createOrchestrator } from "../src/workflow.js";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const mainRequest = JSON.parse(
  readFileSync(resolve(root, "examples/requests/generate.main.json"), "utf8")
);
const silentLogger = { info() {}, error() {} };

async function withServer(run, configOverrides = {}) {
  const config = {
    ...loadConfig({}),
    ...configOverrides
  };
  let id = 0;
  const orchestrator = createOrchestrator({
    config,
    requestIdFactory: () => `req-api-${String(++id).padStart(3, "0")}`,
    now: () => new Date("2026-07-24T16:00:00.000Z")
  });
  const server = createApiServer({
    orchestrator,
    config,
    logger: silentLogger,
    requestIdFactory: () => `req-http-${String(++id).padStart(3, "0")}`
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolveClose, rejectClose) =>
      server.close((error) => (error ? rejectClose(error) : resolveClose()))
    );
  }
}

test("health → generate → revise(300) HTTP 主链路", async () => {
  await withServer(async (baseUrl) => {
    const healthResponse = await fetch(`${baseUrl}/api/health`);
    const health = await healthResponse.json();
    assert.equal(healthResponse.status, 200);
    assert.equal(health.status, "ok");
    assert.match(health.request_id, /^req-/);

    const openApiResponse = await fetch(`${baseUrl}/api/openapi.json`);
    const openApi = await openApiResponse.json();
    assert.equal(openApiResponse.status, 200);
    assert.equal(openApi.openapi, "3.1.0");
    assert.equal(
      openApi.paths["/api/v1/generation-runs/{generation_run_id}"].get
        .operationId,
      "getGenerationRun"
    );

    const generateResponse = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mainRequest)
    });
    const card = await generateResponse.json();
    assert.equal(generateResponse.status, 200);
    assert.equal(card.plan.total_price_cny, 486);

    const reviseResponse = await fetch(`${baseUrl}/api/revise`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schema_version: "1.0",
        request_id: card.request_id,
        plan_id: card.plan.plan_id,
        target_budget_cny: 300
      })
    });
    const revised = await reviseResponse.json();
    assert.equal(reviseResponse.status, 200);
    assert.equal(revised.plan.total_price_cny, 240);
  });
});

test("非法 JSON、媒体类型、超限与未知方案返回结构化错误", async () => {
  await withServer(
    async (baseUrl) => {
      const invalidJson = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{"
      });
      assert.equal(invalidJson.status, 400);
      assert.equal((await invalidJson.json()).error.code, "invalid_json");

      const unsupported = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}"
      });
      assert.equal(unsupported.status, 415);

      const lookalikeJson = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/jsonp" },
        body: "{}"
      });
      assert.equal(lookalikeJson.status, 415);

      const tooLarge = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: "x".repeat(2048) })
      });
      assert.equal(tooLarge.status, 413);

      const unknown = await fetch(`${baseUrl}/api/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema_version: "1.0",
          request_id: "req-missing",
          plan_id: "plan-missing",
          target_budget_cny: 300
        })
      });
      assert.equal(unknown.status, 404);
      assert.equal((await unknown.json()).error.code, "card_not_found");
    },
    { requestBodyLimitBytes: 1024 }
  );
});

test("CORS 只允许配置的本地前端来源", async () => {
  await withServer(async (baseUrl) => {
    const allowed = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: "http://127.0.0.1:8765" }
    });
    assert.equal(allowed.status, 200);
    assert.equal(
      allowed.headers.get("access-control-allow-origin"),
      "http://127.0.0.1:8765"
    );

    const rejected = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: "https://untrusted.example" }
    });
    assert.equal(rejected.status, 403);
    assert.equal((await rejected.json()).error.code, "origin_not_allowed");
  });
});

test("Prompt Lab 提供模板并把改图请求路由到独立实验服务", async () => {
  const config = loadConfig({});
  let received;
  const orchestrator = {
    health() {
      return { status: "ok" };
    },
    promptLabTemplate() {
      return {
        schema_version: "1.0",
        prompt_version: "physical-desk-v1.0.0",
        prompt: "默认测试 Prompt",
        available: true
      };
    },
    async renderPromptLab(value) {
      received = value;
      return {
        schema_version: "1.0",
        source_mode: "live",
        prompt_version: value.prompt_version,
        model: "seedream-test",
        latency_ms: 12,
        media_type: "image/png",
        image_data_url: "data:image/png;base64,test"
      };
    }
  };
  const server = createApiServer({
    orchestrator,
    config,
    logger: silentLogger,
    requestIdFactory: () => "req-prompt-lab"
  });
  await new Promise((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen)
  );
  const { port } = server.address();
  try {
    const templateResponse = await fetch(
      `http://127.0.0.1:${port}/api/prompt-lab`
    );
    const template = await templateResponse.json();
    assert.equal(templateResponse.status, 200);
    assert.equal(template.prompt_version, "physical-desk-v1.0.0");
    assert.equal(template.request_id, "req-prompt-lab");

    const renderResponse = await fetch(
      `http://127.0.0.1:${port}/api/prompt-lab/render`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema_version: "1.0",
          prompt_version: "custom-v1",
          prompt: "用户当前编辑的 Prompt",
          image_data_url: "data:image/png;base64,test"
        })
      }
    );
    const result = await renderResponse.json();
    assert.equal(renderResponse.status, 200);
    assert.equal(received.prompt, "用户当前编辑的 Prompt");
    assert.equal(result.source_mode, "live");

    const wrongMethod = await fetch(
      `http://127.0.0.1:${port}/api/prompt-lab`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
    );
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get("allow"), "GET");
    assert.deepEqual((await wrongMethod.json()).error.details.allowed_methods, [
      "GET"
    ]);
  } finally {
    await new Promise((resolveClose, rejectClose) =>
      server.close((error) => (error ? rejectClose(error) : resolveClose()))
    );
  }
});

test("服务端异常只返回通用错误，不把内部细节发给客户端", async () => {
  const config = loadConfig({});
  const orchestrator = {
    health() {
      return { status: "ok" };
    },
    async generate() {
      const error = new Error("sensitive upstream detail");
      error.code = "upstream_secret_error";
      error.statusCode = 500;
      error.details = { secret: "must-not-leak" };
      throw error;
    },
    async revise() {
      throw new Error("not used");
    }
  };
  const server = createApiServer({
    orchestrator,
    config,
    logger: silentLogger,
    requestIdFactory: () => "req-http-redaction"
  });
  await new Promise((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen)
  );
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.equal(body.error.code, "internal_error");
    assert.equal(body.error.message, "服务内部错误");
    assert.doesNotMatch(JSON.stringify(body), /sensitive|must-not-leak|upstream_secret/);
  } finally {
    await new Promise((resolveClose, rejectClose) =>
      server.close((error) => (error ? rejectClose(error) : resolveClose()))
    );
  }
});
