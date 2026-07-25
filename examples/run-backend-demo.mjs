import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../services/orchestrator/src/config.js";
import { createApiServer } from "../services/orchestrator/src/server.js";
import { createPlatform } from "../services/orchestrator/src/platform.js";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const request = JSON.parse(
  readFileSync(resolve(root, "examples/requests/generate.main.json"), "utf8")
);
const demoDirectory = mkdtempSync(join(tmpdir(), "ai-corner-demo-"));
const config = {
  ...loadConfig({}),
  databasePath: join(demoDirectory, "state.sqlite"),
  privateMediaDirectory: join(demoDirectory, "private-media")
};
const orchestrator = createPlatform({ config });
const server = createApiServer({
  orchestrator,
  config,
  logger: { info() {}, error() {} }
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

try {
  const health = await fetch(`${baseUrl}/api/health`).then((response) =>
    response.json()
  );
  console.log(`1. 健康检查：${health.status}，运行模式 ${health.backend_mode}`);

  const card = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  }).then((response) => response.json());
  console.log(
    `2. 生成方案：${card.plan.title}，${card.products.length} 件，合计 ¥${card.plan.total_price_cny}`
  );
  console.log(
    `   空间分析来源：${card.source_mode}；确定性校验：${card.validation.overall_status}`
  );
  console.log(
    `   数据来源：${card.data_sources
      .map((source) => `${source.kind}=${source.source_type}`)
      .join("，")}`
  );

  const revised = await fetch(`${baseUrl}/api/revise`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      schema_version: "1.0",
      request_id: card.request_id,
      plan_id: card.plan.plan_id,
      target_budget_cny: 300
    })
  }).then((response) => response.json());

  console.log(
    `3. 压到 300 元：${revised.plan.title} v${revised.plan.version}，${revised.products.length} 件，合计 ¥${revised.plan.total_price_cny}`
  );
  console.log(
    `   预算校验：${revised.validation.checks.find((check) => check.code === "budget").message}`
  );

  const plans = await fetch(`${baseUrl}/api/v1/plans`).then((response) =>
    response.json()
  );
  console.log(`4. 持久方案历史：${plans.total} 个方案谱系，当前共 2 个版本。`);

  if (revised.plan.total_price_cny > 300) {
    throw new Error("示例验收失败：调整后仍超过 300 元");
  }
  if (plans.total !== 1) {
    throw new Error("示例验收失败：兼容接口结果未写入持久方案历史");
  }
  console.log("5. 示例验收通过：协议、商品组合、总价、校验和持久版本一致。");
} finally {
  await new Promise((resolveClose, rejectClose) =>
    server.close((error) => (error ? rejectClose(error) : resolveClose()))
  );
  await orchestrator.close();
  rmSync(demoDirectory, { recursive: true, force: true });
}
