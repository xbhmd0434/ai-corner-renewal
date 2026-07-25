import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createOpenApiDocument } from "../packages/contracts/src/openapi.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputPath = resolve(root, "docs/openapi.yaml");
const serialized = `${JSON.stringify(createOpenApiDocument(), null, 2)}\n`;

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(outputPath, "utf8");
  } catch {
    // The mismatch below gives one stable failure path for missing and stale files.
  }
  if (current !== serialized) {
    console.error("docs/openapi.yaml 与当前路由或 Schema 不一致，请运行 npm run openapi:generate");
    process.exitCode = 1;
  }
} else {
  writeFileSync(outputPath, serialized, "utf8");
  console.log(`generated ${outputPath}`);
}
