import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const webRoot = resolve(projectRoot, "apps/web");
const host = "127.0.0.1";
const port = Number(process.env.PORT || 8765);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

function resolveRequestPath(url) {
  try {
    const pathname = decodeURIComponent(
      new URL(url, `http://${host}:${port}`).pathname
    );
    const root = webRoot;
    const relative =
      pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const target = resolve(join(root, normalize(relative)));
    if (target !== root && !target.startsWith(`${root}${sep}`)) return null;
    return target;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
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
