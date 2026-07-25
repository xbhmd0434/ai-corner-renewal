import { createServer, request as httpRequest } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import {
  extname,
  join,
  normalize,
  resolve,
  sep
} from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(
  fileURLToPath(new URL("..", import.meta.url))
);
const backendCandidates = [
  process.env.AI_CORNER_BACKEND_ROOT,
  resolve(projectRoot, "..", ".."),
  resolve(projectRoot, "..", "ai-corner-renewal")
].filter(Boolean);
const backendRoot = backendCandidates.find((candidate) =>
  existsSync(join(candidate, "apps", "web", "assets"))
);
if (!backendRoot) {
  throw new Error(
    "找不到 AI 一角焕新后端资源目录。请从仓库根目录运行 npm start，" +
      "或设置 AI_CORNER_BACKEND_ROOT。"
  );
}
const backendAssetRoot = resolve(
  backendRoot,
  "apps",
  "web",
  "assets"
);
const threeCandidates = [
  resolve(projectRoot, "node_modules", "three"),
  resolve(backendRoot, "node_modules", "three")
];
const threeRoot = threeCandidates.find((candidate) =>
  existsSync(candidate)
);
if (!threeRoot) {
  throw new Error("缺少 Three.js 依赖，请先在仓库根目录运行 npm install。");
}
const host = process.env.WEB_HOST || "127.0.0.1";
const port = Number(process.env.WEB_PORT || 8765);
const backendHost = process.env.API_HOST || "127.0.0.1";
const backendPort = Number(process.env.API_PORT || 8787);
const backendAssetPrefix =
  "/ai-corner-renewal/apps/web/assets/";
const threePrefix = "/vendor/three/";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

function safeResolve(root, relative) {
  const target = resolve(join(root, normalize(relative)));
  if (target !== root && !target.startsWith(`${root}${sep}`)) return null;
  return target;
}

function resolveStaticPath(requestUrl) {
  try {
    const pathname = decodeURIComponent(
      new URL(requestUrl, `http://${host}:${port}`).pathname
    );
    if (pathname.startsWith(backendAssetPrefix)) {
      return safeResolve(
        backendAssetRoot,
        pathname.slice(backendAssetPrefix.length)
      );
    }
    if (pathname.startsWith(threePrefix)) {
      return safeResolve(
        threeRoot,
        pathname.slice(threePrefix.length)
      );
    }
    const relative =
      pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    return safeResolve(projectRoot, relative);
  } catch {
    return null;
  }
}

function proxyApi(request, response) {
  const headers = {
    ...request.headers,
    host: `${backendHost}:${backendPort}`
  };
  // 浏览器与本服务同源；代理到受控本机 API 时不转发浏览器 Origin，
  // 避免把代理端口误当成直接跨域来源交给后端 CORS 校验。
  delete headers.origin;
  delete headers.referer;
  const upstream = httpRequest(
    {
      hostname: backendHost,
      port: backendPort,
      method: request.method,
      path: request.url,
      headers
    },
    (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode || 502,
        upstreamResponse.headers
      );
      upstreamResponse.pipe(response);
    }
  );
  upstream.setTimeout(30_000, () => {
    upstream.destroy(new Error("Backend request timed out"));
  });
  upstream.on("error", (error) => {
    if (response.headersSent) {
      response.destroy(error);
      return;
    }
    response.writeHead(502, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    response.end(
      JSON.stringify({
        error: {
          code: "backend_unavailable",
          message: "AI 一角焕新后端未启动"
        }
      })
    );
  });
  request.pipe(upstream);
}

const server = createServer(async (request, response) => {
  const pathname = new URL(
    request.url || "/",
    `http://${host}:${port}`
  ).pathname;
  if (pathname.startsWith("/api/")) {
    proxyApi(request, response);
    return;
  }

  const target = resolveStaticPath(request.url || "/");
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
      "Content-Type":
        mimeTypes[extname(file).toLowerCase()] ||
        "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(body);
  } catch {
    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8"
    });
    response.end("Not found");
  }
});

server.requestTimeout = 35_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `前端端口 ${host}:${port} 已被占用。请运行 npm start 自动选择空闲端口，` +
        "或通过 WEB_PORT 指定其他端口。"
    );
  } else {
    console.error("前端服务启动失败：", error);
  }
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log(
    `抖音展示 Demo：http://${host}:${port}/douyin-static-demo/index.html`
  );
  console.log(
    `API 代理：http://${host}:${port}/api/* → http://${backendHost}:${backendPort}`
  );
});
