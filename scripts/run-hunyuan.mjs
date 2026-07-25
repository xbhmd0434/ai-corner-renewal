import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const adapter = resolve(projectRoot, "scripts/generate-hunyuan-shape.py");
const python =
  process.env.HUNYUAN_PYTHON ||
  "D:\\LittleBlueWhale3D\\.venv-hunyuan3d\\Scripts\\python.exe";

if (!existsSync(python)) {
  console.error(
    [
      "没有找到混元 3D 专用 Python 环境：",
      python,
      "请在 .env.local 或当前终端设置 HUNYUAN_PYTHON。"
    ].join("\n")
  );
  process.exit(2);
}

if (!process.argv.includes("--input") || !process.argv.includes("--output")) {
  console.error(
    [
      "用法：",
      "npm run generate:3d -- --input <物件图片> --output <输出.glb>",
      "",
      "先验证但不加载模型：在末尾追加 --dry-run"
    ].join("\n")
  );
  process.exit(2);
}

const child = spawn(python, [adapter, ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: {
    ...process.env,
    HF_HOME:
      process.env.HUNYUAN_CACHE_DIR ||
      "D:\\LittleBlueWhale3D\\.model-cache",
    HF_HUB_OFFLINE: process.argv.includes("--allow-download") ? "0" : "1"
  },
  stdio: "inherit",
  windowsHide: true
});

child.on("error", (error) => {
  console.error(`无法启动混元 3D：${error.message}`);
  process.exit(3);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`混元 3D 进程被 ${signal} 终止。`);
    process.exit(4);
  }
  process.exit(code ?? 1);
});
