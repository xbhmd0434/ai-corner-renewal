import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
});

function safeResolve(root, relative) {
  const target = resolve(join(root, normalize(relative)));
  if (target !== root && !target.startsWith(`${root}${sep}`)) return null;
  return target;
}

async function fileAt(root, relative) {
  const target = safeResolve(root, relative);
  if (!target) return null;
  try {
    const info = await stat(target);
    if (!info.isFile()) return null;
    return target;
  } catch {
    return null;
  }
}

function staticTarget(pathname, config) {
  const legacyAssetPrefix = "/ai-corner-renewal/apps/web/assets/";
  if (pathname.startsWith(legacyAssetPrefix)) {
    return {
      root: config.legacyAssetDirectory,
      relative: pathname.slice(legacyAssetPrefix.length)
    };
  }
  const fixturePrefix = "/__product-discovery-fixtures/";
  if (pathname.startsWith(fixturePrefix)) {
    const fileName = pathname.slice(fixturePrefix.length);
    if (
      !/^product-discovery\.run\.(running|ready|empty)\.json$/.test(fileName)
    ) {
      return null;
    }
    return { root: config.fixtureDirectory, relative: fileName };
  }
  return {
    root: config.staticDirectory,
    relative: pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "")
  };
}

export async function serveStaticFile(request, response, pathname, config) {
  if (!["GET", "HEAD"].includes(request.method || "GET")) return false;
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  const candidate = staticTarget(decoded, config);
  if (!candidate) return false;
  const file = await fileAt(candidate.root, candidate.relative);
  if (!file) return false;
  const body = await readFile(file);
  const isHtml = extname(file).toLowerCase() === ".html";
  response.writeHead(200, {
    "Content-Type":
      MIME_TYPES[extname(file).toLowerCase()] || "application/octet-stream",
    "Content-Length": String(body.length),
    "Cache-Control": isHtml
      ? "no-store"
      : "public, max-age=300, must-revalidate",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin"
  });
  if (request.method === "HEAD") {
    response.end();
  } else {
    response.end(body);
  }
  return true;
}

export function sendLoginPage(response) {
  const body = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#0f0f12">
  <title>一角焕新 · 评审访问</title>
  <style>
    :root{font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif;color:#f7f7f8;background:#0f0f12}
    *{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 20% 10%,#2a203a 0,transparent 38%),#0f0f12}
    main{width:min(420px,100%);padding:32px;border:1px solid #35313d;border-radius:24px;background:rgba(25,24,29,.94);box-shadow:0 24px 80px #0008}
    small{color:#a78bfa;letter-spacing:.14em}h1{margin:12px 0 8px;font-size:28px}p{margin:0 0 24px;color:#b9b7c0;line-height:1.7}
    label{display:block;margin-bottom:8px;font-size:14px;color:#d8d6de}input,button{width:100%;height:48px;border-radius:14px;font:inherit}
    input{border:1px solid #4a4651;background:#111115;color:#fff;padding:0 14px;outline:none}input:focus{border-color:#8b5cf6;box-shadow:0 0 0 3px #8b5cf633}
    button{margin-top:14px;border:0;background:#8b5cf6;color:#fff;font-weight:700;cursor:pointer}button:disabled{opacity:.6;cursor:wait}
    #message{min-height:22px;margin:12px 0 0;color:#fb7185;font-size:14px}
  </style>
</head>
<body>
  <main>
    <small>AI CORNER RENEWAL</small>
    <h1>评审访问</h1>
    <p>请输入主办方提供的访问口令。通过后即可在本设备体验完整焕新流程。</p>
    <form id="access-form">
      <label for="access-code">访问口令</label>
      <input id="access-code" name="access_code" type="password" autocomplete="current-password" required minlength="8" maxlength="128">
      <button type="submit">进入体验</button>
      <p id="message" role="alert"></p>
    </form>
  </main>
  <script>
    const form=document.querySelector("#access-form");
    const button=form.querySelector("button");
    const message=document.querySelector("#message");
    form.addEventListener("submit",async(event)=>{
      event.preventDefault();button.disabled=true;message.textContent="";
      try{
        const response=await fetch("/api/auth/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({access_code:form.access_code.value})});
        const payload=await response.json();
        if(!response.ok)throw new Error(payload?.error?.message||"验证失败");
        location.replace("/");
      }catch(error){message.textContent=error.message||"暂时无法验证，请稍后再试";button.disabled=false}
    });
  </script>
</body>
</html>`;
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": String(Buffer.byteLength(body)),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
  });
  response.end(body);
}
