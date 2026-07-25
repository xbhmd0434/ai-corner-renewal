import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const platformSchema = JSON.parse(
  readFileSync(resolve(root, "packages/contracts/schemas/platform-v1.schema.json"), "utf8")
);
const defs = platformSchema.$defs;

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function resolveRef(ref) {
  if (!ref.startsWith("#/$defs/")) {
    throw new Error(`只支持本地 $defs 引用：${ref}`);
  }
  const name = ref.slice("#/$defs/".length);
  const schema = defs[name];
  if (!schema) throw new Error(`未知 $defs：${name}`);
  return schema;
}

function typeMatches(type, value) {
  if (type === "string") return typeof value === "string";
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isObject(value);
  throw new Error(`未知 type：${type}`);
}

function validate(value, schema, path = "$") {
  const issues = [];
  if (!schema) return issues;
  if (schema.$ref) {
    return validate(value, resolveRef(schema.$ref), path);
  }
  if (schema.const !== undefined) {
    if (value !== schema.const) {
      issues.push(`${path} 必须等于 ${JSON.stringify(schema.const)}，实际 ${JSON.stringify(value)}`);
    }
  }
  if (schema.enum) {
    if (!schema.enum.includes(value)) {
      issues.push(`${path} 必须是 ${JSON.stringify(schema.enum)} 之一，实际 ${JSON.stringify(value)}`);
    }
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeMatches(type, value))) {
      issues.push(`${path} 类型不匹配：期望 ${types.join("|")}，实际 ${typeof value}`);
      return issues;
    }
  }
  if (schema.oneOf) {
    const branchIssues = schema.oneOf.map((branch) => validate(value, branch, path));
    const validBranches = branchIssues.filter((sub) => sub.length === 0);
    if (validBranches.length !== 1) {
      if (validBranches.length === 0) {
        issues.push(`${path} 未匹配 oneOf 中任何分支：${JSON.stringify(branchIssues.flat())}`);
      } else {
        issues.push(`${path} 匹配了多个 oneOf 分支（应恰好 1 个）`);
      }
    }
  }
  if (schema.required && isObject(value)) {
    for (const key of schema.required) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        issues.push(`${path}.${key} 必填但缺失`);
      }
    }
  }
  if (schema.additionalProperties === false && isObject(value)) {
    const allowed = new Set(Object.keys(schema.properties || {}));
    for (const key of Object.keys(value)) {
      if (!allowed.has(key)) {
        issues.push(`${path}.${key} 不允许该字段（additionalProperties=false）`);
      }
    }
  }
  if (schema.properties && isObject(value)) {
    for (const [key, subSchema] of Object.entries(schema.properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        issues.push(...validate(value[key], subSchema, `${path}.${key}`));
      }
    }
  }
  if (schema.items && Array.isArray(value)) {
    value.forEach((item, index) => {
      issues.push(...validate(item, schema.items, `${path}[${index}]`));
    });
  }
  if (Number.isInteger(schema.minItems) && Array.isArray(value) && value.length < schema.minItems) {
    issues.push(`${path} 项数少于 ${schema.minItems}`);
  }
  if (Number.isInteger(schema.maxItems) && Array.isArray(value) && value.length > schema.maxItems) {
    issues.push(`${path} 项数超过 ${schema.maxItems}`);
  }
  if (typeof value === "string") {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) {
      issues.push(`${path} 长度少于 ${schema.minLength}`);
    }
    if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) {
      issues.push(`${path} 长度超过 ${schema.maxLength}`);
    }
  }
  if (typeof value === "number") {
    if (Number.isFinite(schema.minimum) && value < schema.minimum) {
      issues.push(`${path} 小于 minimum ${schema.minimum}`);
    }
    if (Number.isFinite(schema.maximum) && value > schema.maximum) {
      issues.push(`${path} 大于 maximum ${schema.maximum}`);
    }
  }
  return issues;
}

const fixtureRoot = resolve(root, "examples/contracts/renewal-v2");
const FIXTURE_TO_SCHEMA = {
  "inspiration.needs-confirmation.json": "Asset",
  "inspiration.confirmed.component.json": "Asset",
  "inspiration.confirmed.style.json": "Asset",
  "related.running.json": "RelatedDesignRun",
  "related.ready.mixed-source.json": "RelatedDesignRun",
  "related.partial.single-dimension.json": "RelatedDesignRun",
  "related.empty.json": "RelatedDesignRun",
  "publication.indexing.json": "Publication",
  "publication.published.json": "Publication",
  "implementation.ready.component.json": "ProductDiscoveryRun",
  "implementation.ready.style.json": "ProductDiscoveryRun",
  "implementation.partial.json": "ProductDiscoveryRun",
  "cart-intent.unavailable.json": "CartIntent"
};

test("每个 canonical fixture 都通过 platform-v1 Schema", () => {
  const jsonFixtures = readdirSync(fixtureRoot).filter((name) => name.endsWith(".json"));
  assert.deepEqual(
    new Set(jsonFixtures),
    new Set(Object.keys(FIXTURE_TO_SCHEMA)),
    "canonical fixtures 与预期文件名不一致"
  );
  for (const [name, schemaName] of Object.entries(FIXTURE_TO_SCHEMA)) {
    const value = JSON.parse(readFileSync(resolve(fixtureRoot, name), "utf8"));
    const schema = defs[schemaName];
    assert.ok(schema, `Schema $defs.${schemaName} 不存在`);
    const issues = validate(value, schema, `${name}`);
    assert.equal(
      issues.length,
      0,
      `${name} 未通过 ${schemaName} 校验：\n  ${issues.join("\n  ")}`
    );
  }
});

test("canonical fixtures 覆盖协议要求的失败/降级/空态", () => {
  const related = ["related.ready.mixed-source.json", "related.partial.single-dimension.json", "related.empty.json"]
    .map((name) => JSON.parse(readFileSync(resolve(fixtureRoot, name), "utf8")));
  const states = new Set(related.map((run) => run.result_state));
  assert.ok(states.has("ready"));
  assert.ok(states.has("partial"));
  assert.ok(states.has("empty"));

  const partial = related.find((run) => run.result_state === "partial");
  assert.ok(
    partial.result.items.some((item) => item.fallback_dimension !== null),
    "partial fixture 必须显式声明 fallback_dimension"
  );

  const publications = ["publication.indexing.json", "publication.published.json"]
    .map((name) => JSON.parse(readFileSync(resolve(fixtureRoot, name), "utf8")));
  const pubStatuses = new Set(publications.map((pub) => pub.status));
  assert.ok(pubStatuses.has("indexing"));
  assert.ok(pubStatuses.has("published"));

  const cart = JSON.parse(readFileSync(resolve(fixtureRoot, "cart-intent.unavailable.json"), "utf8"));
  assert.equal(cart.action.type, "unavailable");
  assert.equal(cart.status, "unavailable");
});

test("component/style 实施清单排序正确 (video_selected/source_video/ai_supplement)", () => {
  const component = JSON.parse(
    readFileSync(resolve(fixtureRoot, "implementation.ready.component.json"), "utf8")
  );
  assert.equal(component.result.implementation_list[0].origin_type, "video_selected");
  assert.equal(component.result.implementation_list[0].sort_group, 0);

  const style = JSON.parse(
    readFileSync(resolve(fixtureRoot, "implementation.ready.style.json"), "utf8")
  );
  const sourceVideoItems = style.result.implementation_list.filter((item) => item.origin_type === "source_video");
  const aiSupplementItems = style.result.implementation_list.filter((item) => item.origin_type === "ai_supplement");
  assert.ok(sourceVideoItems.length > 0, "风格意图 fixture 应至少含一个 source_video 项");
  assert.ok(aiSupplementItems.length > 0, "风格意图 fixture 应至少含一个 ai_supplement 项");
  for (const item of sourceVideoItems) {
    assert.equal(item.sort_group, 0, "source_video 必须在 sort_group=0");
  }
  for (const item of aiSupplementItems) {
    assert.equal(item.sort_group, 1, "ai_supplement 必须在 sort_group=1");
  }
});
