import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const webRoot = join(root, "apps", "web");
const required = [
  "README.md",
  "HANDOFF.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "LICENSE",
  "apps/web/index.html",
  "apps/web/styles.css",
  "apps/web/app.js",
  "apps/web/data/demo-data.js",
  "apps/web/assets/desk-before.png",
  "apps/web/assets/desk-after-warm.png",
  "docs/product-spec.md",
  "docs/architecture.md",
  "docs/team-roles.md",
  "docs/public-release.md"
];

const missing = required.filter((path) => !existsSync(join(root, path)));
if (missing.length) {
  throw new Error(`缺少必要文件：\n${missing.join("\n")}`);
}

const html = readFileSync(join(webRoot, "index.html"), "utf8");
const localReferences = [...html.matchAll(/(?:src|href)="(\.\/[^"#?]+)"/g)].map((match) => match[1]);
const brokenReferences = localReferences.filter((reference) => {
  const target = resolve(dirname(join(webRoot, "index.html")), reference);
  return !existsSync(target);
});
if (brokenReferences.length) {
  throw new Error(`HTML 存在无效本地引用：\n${brokenReferences.join("\n")}`);
}

const ignoredDirectories = new Set([".git", "node_modules", "dist", "artifacts"]);
const textExtensions = new Set([".html", ".css", ".js", ".mjs", ".json", ".md", ".yml", ".yaml", ".txt"]);
const secretPatterns = [
  ["GitHub token", /gh[oprsu]_[A-Za-z0-9_]{20,}/g],
  ["OpenAI-style key", /sk-[A-Za-z0-9_-]{20,}/g],
  ["Private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["Committed API key", /OPENAI_API_KEY\s*=\s*[^\s<]+/g]
];

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    if (ignoredDirectories.has(name)) return [];
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const findings = [];
for (const file of walk(root)) {
  if (!textExtensions.has(extname(file))) continue;
  const content = readFileSync(file, "utf8");
  for (const [label, pattern] of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) findings.push(`${label}: ${file.replace(`${root}\\`, "")}`);
  }
}
if (findings.length) {
  throw new Error(`检测到可能的敏感内容：\n${findings.join("\n")}`);
}

console.log(`验证通过：${required.length} 个必要文件，${localReferences.length} 个本地引用，未发现常见秘密模式。`);
