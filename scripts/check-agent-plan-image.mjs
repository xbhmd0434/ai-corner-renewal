import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadLocalEnvironment } from "../services/orchestrator/src/local-env.js";
import { loadConfig } from "../services/orchestrator/src/config.js";
import { createPlatform } from "../services/orchestrator/src/platform.js";
import { createApiServer } from "../services/orchestrator/src/server.js";

loadLocalEnvironment();
const baseConfig = loadConfig();
if (!baseConfig.agentPlanApiKey) {
  throw new Error("未配置 AGENT_PLAN_API_KEY");
}
if (baseConfig.backendMode === "demo") {
  throw new Error("AI_BACKEND_MODE=demo 不会调用 Seedream，请改为 auto 或 live");
}

const scratch = mkdtempSync(join(tmpdir(), "seedream-live-check-"));
const config = {
  ...baseConfig,
  databasePath: join(scratch, "state.sqlite"),
  privateMediaDirectory: join(scratch, "private-media")
};
const platform = createPlatform({ config });
const server = createApiServer({
  orchestrator: platform,
  config,
  logger: { info() {}, error() {} }
});

try {
  await new Promise((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen)
  );
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const sourceBytes = readFileSync(
    resolve("apps/web/assets/desk-before.png")
  );
  const request = JSON.parse(
    readFileSync(resolve("examples/requests/generate.main.json"), "utf8")
  );
  request.options.analysis_mode = "live";
  request.room_input.image = {
    data_url: `data:image/png;base64,${sourceBytes.toString("base64")}`,
    media_type: "image/png"
  };

  const card = await platform.generate(request);

  const renderSource = card.data_sources?.find(
    (source) => source.kind === "render_generation"
  );
  const safeSummary = {
    room_analysis: card.source_mode,
    render_source: renderSource?.source_type || "demo",
    render_model: config.agentPlanImageModel,
    render_is_demo: card.render?.is_demo_asset,
    notice_codes: (card.notices || []).map((notice) => notice.code)
  };
  console.log(JSON.stringify(safeSummary, null, 2));

  if (card.render?.is_demo_asset !== false || !card.render?.after_ref) {
    throw new Error(
      `Seedream 未生成实时效果图：${renderSource?.source_type || "demo"}`
    );
  }

  const imageResponse = await fetch(
    new URL(card.render.after_ref, baseUrl)
  );
  const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
  if (
    !imageResponse.ok ||
    !imageResponse.headers.get("content-type")?.startsWith("image/") ||
    imageBytes.length < 1024 ||
    imageBytes.equals(sourceBytes)
  ) {
    throw new Error("实时效果图已生成，但私有媒体读取验收失败");
  }
  console.log(
    JSON.stringify({
      private_media_read: "passed",
      differs_from_source: true,
      media_type: imageResponse.headers.get("content-type"),
      byte_size: imageBytes.length
    })
  );
} finally {
  if (server.listening) {
    await new Promise((resolveClose, rejectClose) =>
      server.close((error) =>
        error ? rejectClose(error) : resolveClose()
      )
    );
  }
  await platform.close();
  rmSync(scratch, { recursive: true, force: true });
}
