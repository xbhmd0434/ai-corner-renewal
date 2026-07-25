import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";
import { createApiServer } from "../src/server.js";

const silentLogger = {
  info() {},
  error() {}
};

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
}

function publicConfig(extra = {}) {
  return loadConfig({
    ORCHESTRATOR_HOST: "0.0.0.0",
    DEMO_ACCESS_CODE: "judge-code",
    SESSION_SIGNING_SECRET: "0123456789abcdef0123456789abcdef",
    API_REQUESTS_PER_MINUTE: "20",
    AI_REQUESTS_PER_MINUTE: "3",
    ...extra
  });
}

test("公网模式先显示访问口令页，登录后才提供正式前端和 API", async () => {
  const orchestrator = {
    health() {
      return {
        status: "ok",
        service: "ai-corner-renewal-orchestrator",
        service_version: "test",
        auth_mode: "shared_access_code",
        actor_id: "must-not-leak-before-login"
      };
    }
  };
  const server = createApiServer({
    orchestrator,
    config: publicConfig(),
    logger: silentLogger
  });
  const baseUrl = await listen(server);
  try {
    const page = await fetch(`${baseUrl}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /评审访问/);

    const health = await fetch(`${baseUrl}/api/health`);
    const publicHealth = await health.json();
    assert.equal(health.status, 200);
    assert.equal(publicHealth.authentication_required, true);
    assert.equal(publicHealth.actor_id, undefined);

    const protectedResponse = await fetch(`${baseUrl}/api/openapi.json`);
    assert.equal(protectedResponse.status, 401);
    assert.equal(
      (await protectedResponse.json()).error.code,
      "authentication_required"
    );

    const rejected = await fetch(`${baseUrl}/api/auth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_code: "wrong-code" })
    });
    assert.equal(rejected.status, 401);

    const accepted = await fetch(`${baseUrl}/api/auth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_code: "judge-code" })
    });
    assert.equal(accepted.status, 200);
    const cookie = accepted.headers.get("set-cookie").split(";")[0];
    assert.match(cookie, /^ai_corner_session=/);

    const authenticatedPage = await fetch(`${baseUrl}/`, {
      headers: { Cookie: cookie }
    });
    assert.equal(authenticatedPage.status, 200);
    assert.match(await authenticatedPage.text(), /抖音静态刷视频 Demo/);

    const openApi = await fetch(`${baseUrl}/api/openapi.json`, {
      headers: { Cookie: cookie }
    });
    assert.equal(openApi.status, 200);

    const frontendModules = [
      "http-client.js",
      "legacy-client.js",
      "product-discovery-client.js",
      "v1-client.js"
    ];
    for (const moduleName of frontendModules) {
      const moduleResponse = await fetch(`${baseUrl}/api/${moduleName}`, {
        headers: { Cookie: cookie }
      });
      assert.equal(moduleResponse.status, 200, moduleName);
      assert.match(
        moduleResponse.headers.get("content-type"),
        /^text\/javascript/
      );
    }
  } finally {
    await close(server);
  }
});

test("公网 AI 总开关在进入业务服务前拒绝昂贵请求", async () => {
  let generateCalls = 0;
  const orchestrator = {
    health() {
      return {
        status: "ok",
        service: "ai-corner-renewal-orchestrator",
        service_version: "test",
        auth_mode: "shared_access_code"
      };
    },
    async generate() {
      generateCalls += 1;
      return {};
    }
  };
  const server = createApiServer({
    orchestrator,
    config: publicConfig({ AI_REQUESTS_ENABLED: "false" }),
    logger: silentLogger
  });
  const baseUrl = await listen(server);
  try {
    const accepted = await fetch(`${baseUrl}/api/auth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_code: "judge-code" })
    });
    const cookie = accepted.headers.get("set-cookie").split(";")[0];
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json"
      },
      body: "{}"
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "ai_requests_disabled");
    assert.equal(generateCalls, 0);
  } finally {
    await close(server);
  }
});

test("公网 AI 分钟限额返回 429 且不重复进入业务服务", async () => {
  let generateCalls = 0;
  const orchestrator = {
    health() {
      return {
        status: "ok",
        service: "ai-corner-renewal-orchestrator",
        service_version: "test",
        auth_mode: "shared_access_code"
      };
    },
    async generate() {
      generateCalls += 1;
      return { schema_version: "1.0", source_mode: "demo" };
    }
  };
  const server = createApiServer({
    orchestrator,
    config: publicConfig({ AI_REQUESTS_PER_MINUTE: "1" }),
    logger: silentLogger
  });
  const baseUrl = await listen(server);
  try {
    const accepted = await fetch(`${baseUrl}/api/auth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_code: "judge-code" })
    });
    const cookie = accepted.headers.get("set-cookie").split(";")[0];
    const request = () =>
      fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json"
        },
        body: "{}"
      });
    assert.equal((await request()).status, 200);
    const limited = await request();
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).error.code, "ai_rate_limited");
    assert.equal(generateCalls, 1);
  } finally {
    await close(server);
  }
});
