import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
  if (!match) return null;

  let value = match[2].trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1);
  }
  return [match[1], value];
}

export function loadLocalEnvironment({
  root = PROJECT_ROOT,
  env = process.env
} = {}) {
  const protectedKeys = new Set(Object.keys(env));
  const loaded = [];

  for (const filename of [".env", ".env.local"]) {
    const path = resolve(root, filename);
    if (!existsSync(path)) continue;

    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const pair = parseLine(line);
      if (!pair) continue;
      const [name, value] = pair;
      if (protectedKeys.has(name)) continue;
      env[name] = value;
      loaded.push(name);
    }
  }

  return [...new Set(loaded)];
}
