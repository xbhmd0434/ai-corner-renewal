import { loadLocalEnvironment } from "./local-env.js";
import { loadConfig } from "./config.js";
import { createApiServer } from "./server.js";
import { createPlatform } from "./platform.js";

loadLocalEnvironment();
const config = loadConfig();
const platform = createPlatform({ config });
const server = createApiServer({ orchestrator: platform, config });

server.listen(config.port, config.host, () => {
  console.log(
    `AI 一角焕新后端运行于 http://${config.host}:${config.port}（mode=${config.backendMode}）`
  );
});

function shutdown(signal) {
  console.log(`收到 ${signal}，正在停止后端服务`);
  server.close(async (error) => {
    await platform.close();
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
