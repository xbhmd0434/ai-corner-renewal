import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLocalEnvironment } from "../src/local-env.js";

test("local env loads ignored secrets while preserving process-level overrides", () => {
  const root = mkdtempSync(join(tmpdir(), "ai-corner-env-"));
  try {
    writeFileSync(
      join(root, ".env"),
      "AGENT_PLAN_API_KEY=from-env\nAI_BACKEND_MODE=auto\n",
      "utf8"
    );
    writeFileSync(
      join(root, ".env.local"),
      "AGENT_PLAN_API_KEY=from-local\nAGENT_PLAN_TEXT_MODEL='doubao-seed-2.0-lite'\n",
      "utf8"
    );
    const env = { AI_BACKEND_MODE: "demo" };

    const loaded = loadLocalEnvironment({ root, env });

    assert.equal(env.AI_BACKEND_MODE, "demo");
    assert.equal(env.AGENT_PLAN_API_KEY, "from-local");
    assert.equal(env.AGENT_PLAN_TEXT_MODEL, "doubao-seed-2.0-lite");
    assert.deepEqual(
      [...loaded].sort(),
      ["AGENT_PLAN_API_KEY", "AGENT_PLAN_TEXT_MODEL"].sort()
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
