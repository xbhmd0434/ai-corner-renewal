import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";

test("room analyzer response limit defaults to 256 KiB and is configurable", () => {
  assert.equal(loadConfig({}).roomAnalyzerResponseLimitBytes, 256 * 1024);
  assert.equal(loadConfig({}).agentPlanImageTimeoutMs, 90_000);
  assert.equal(
    loadConfig({}).agentPlanImageResponseLimitBytes,
    24 * 1024 * 1024
  );
  assert.equal(
    loadConfig({ AGENT_PLAN_IMAGE_TIMEOUT_MS: "120000" })
      .agentPlanImageTimeoutMs,
    120_000
  );
  assert.equal(
    loadConfig({ ROOM_ANALYZER_RESPONSE_LIMIT_BYTES: "4096" })
      .roomAnalyzerResponseLimitBytes,
    4096
  );
  assert.throws(
    () => loadConfig({ ROOM_ANALYZER_RESPONSE_LIMIT_BYTES: "512" }),
    /512/
  );
  assert.throws(
    () => loadConfig({ ORCHESTRATOR_HOST: "0.0.0.0" }),
    /回环地址/
  );
  assert.throws(
    () =>
      loadConfig({
        PRIVATE_MEDIA_DIRECTORY: "./apps/web/private-media"
      }),
    /静态目录/
  );
});

test("layout planning uses an independent 90 second timeout", () => {
  assert.equal(loadConfig({}).agentPlanLayoutTimeoutMs, 90_000);
  assert.equal(
    loadConfig({ AGENT_PLAN_LAYOUT_TIMEOUT_MS: "75000" })
      .agentPlanLayoutTimeoutMs,
    75_000
  );
});

test("room analyzer URL requires HTTPS outside an uncredentialed loopback", () => {
  assert.equal(
    loadConfig({
      ROOM_ANALYZER_URL: "https://analyzer.example/v1/room",
      ROOM_ANALYZER_API_KEY: "secret"
    }).roomAnalyzerUrl,
    "https://analyzer.example/v1/room"
  );
  assert.equal(
    loadConfig({ ROOM_ANALYZER_URL: "http://127.0.0.2:9000/analyze" })
      .roomAnalyzerUrl,
    "http://127.0.0.2:9000/analyze"
  );
  assert.equal(
    loadConfig({ ROOM_ANALYZER_URL: "http://[::1]:9000/analyze" })
      .roomAnalyzerUrl,
    "http://[::1]:9000/analyze"
  );

  assert.throws(
    () => loadConfig({ ROOM_ANALYZER_URL: "http://analyzer.example/v1/room" }),
    /HTTPS/
  );
  assert.throws(
    () =>
      loadConfig({
        ROOM_ANALYZER_URL: "http://localhost:9000/analyze",
        ROOM_ANALYZER_API_KEY: "secret"
      }),
    /HTTPS/
  );
  assert.throws(
    () =>
      loadConfig({
        ROOM_ANALYZER_URL: "https://user:password@analyzer.example/v1/room"
      }),
    /用户名或密码/
  );
  assert.throws(
    () => loadConfig({ ROOM_ANALYZER_URL: "not-a-url" }),
    /ROOM_ANALYZER_URL/
  );
});

test("Agent Plan credential selects the official provider without exposing a custom host", () => {
  const config = loadConfig({
    AGENT_PLAN_API_KEY: "secret",
    AGENT_PLAN_TEXT_MODEL: "doubao-seed-2.0-lite"
  });
  assert.equal(config.roomAnalyzerProvider, "agent_plan");
  assert.equal(
    config.agentPlanBaseUrl,
    "https://ark.cn-beijing.volces.com/api/plan/v3"
  );
  assert.equal(config.agentPlanTextModel, "doubao-seed-2.0-lite");

  assert.throws(
    () =>
      loadConfig({
        AGENT_PLAN_API_KEY: "secret",
        AGENT_PLAN_BASE_URL: "https://relay.example/v3"
      }),
    /官方专属地址/
  );
  assert.throws(
    () =>
      loadConfig({
        ROOM_ANALYZER_PROVIDER: "agent_plan"
      }),
    /AGENT_PLAN_API_KEY/
  );
  assert.throws(
    () =>
      loadConfig({
        AGENT_PLAN_API_KEY: "secret",
        AGENT_PLAN_TEXT_MODEL: "bad model name"
      }),
    /模型名称/
  );
});
