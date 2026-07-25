import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const webRoot = resolve(projectRoot, "apps/web");
const threeRoot = resolve(projectRoot, "node_modules/three");
const host = "127.0.0.1";
const port = Number(process.env.PORT || 8765);
const hunyuanPython =
  process.env.HUNYUAN_PYTHON ||
  "D:\\LittleBlueWhale3D\\.venv-hunyuan3d\\Scripts\\python.exe";
const hunyuanCache =
  process.env.HUNYUAN_CACHE_DIR ||
  "D:\\LittleBlueWhale3D\\.model-cache";
const hunyuanWeights = resolve(
  hunyuanCache,
  "hub/models--tencent--Hunyuan3D-2mini/snapshots/f90a0f7df7d5e6f71109cf333f6a95a0ae3194a6/hunyuan3d-dit-v2-mini/model.fp16.safetensors"
);
const hunyuanSample = resolve(
  webRoot,
  "assets/models/little-blue-whale-v1-shape.glb"
);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

function resolveRequestPath(url) {
  try {
    const pathname = decodeURIComponent(
      new URL(url, `http://${host}:${port}`).pathname
    );
    const isThreeModule = pathname.startsWith("/vendor/three/");
    const root = isThreeModule ? threeRoot : webRoot;
    const relative = isThreeModule
      ? pathname.slice("/vendor/three/".length)
      : pathname === "/"
        ? "index.html"
        : pathname.replace(/^\/+/, "");
    const target = resolve(join(root, normalize(relative)));
    if (target !== root && !target.startsWith(`${root}${sep}`)) return null;
    return target;
  } catch {
    return null;
  }
}

async function fileExists(path) {
  try {
    const info = await stat(path);
    return info.isFile();
  } catch {
    return false;
  }
}

async function respondWithHunyuanRuntime(response) {
  const [pythonReady, weightsReady, sampleReady] = await Promise.all([
    fileExists(hunyuanPython),
    fileExists(hunyuanWeights),
    fileExists(hunyuanSample)
  ]);
  const status =
    pythonReady && weightsReady
      ? "ready"
      : sampleReady
        ? "sample_only"
        : "unavailable";
  const body = JSON.stringify({
    status,
    engine: "Hunyuan3D-2mini",
    profile: "shape-only · RTX 4060 8GB",
    pythonReady,
    weightsReady,
    sampleReady
  });
  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(body);
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url || "/", `http://${host}:${port}`).pathname;
  if (pathname === "/api/runtime/hunyuan") {
    await respondWithHunyuanRuntime(response);
    return;
  }
  const target = resolveRequestPath(request.url || "/");
  if (!target) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const info = await stat(target);
    const file = info.isDirectory() ? join(target, "index.html") : target;
    const body = await readFile(file);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.timeout = 15_000;
server.keepAliveTimeout = 5_000;
server.maxRequestsPerSocket = 100;
server.listen(port, host, () => {
  console.log(`AI 一角焕新运行于 http://${host}:${port}`);
});

export { server };
