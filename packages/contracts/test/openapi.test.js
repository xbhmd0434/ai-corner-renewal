import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createOpenApiDocument } from "../src/openapi.js";
import { V1_ROUTE_MANIFEST } from "../src/v1-route-manifest.js";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));

function resolveLocalRef(document, reference) {
  assert.match(reference, /^#\//, `只允许本地 OpenAPI 引用：${reference}`);
  return reference
    .slice(2)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((value, part) => value?.[part], document);
}

function collectRefs(value, refs = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectRefs(item, refs));
    return refs;
  }
  if (!value || typeof value !== "object") return refs;
  if (typeof value.$ref === "string") refs.push(value.$ref);
  Object.values(value).forEach((item) => collectRefs(item, refs));
  return refs;
}

test("OpenAPI 覆盖共享清单中的全部 /api/v1 路由", () => {
  const document = createOpenApiDocument();
  assert.equal(document.openapi, "3.1.0");
  assert.equal(V1_ROUTE_MANIFEST.length, 41);

  for (const route of V1_ROUTE_MANIFEST) {
    const operation = document.paths[route.template]?.[route.method.toLowerCase()];
    assert.ok(operation, `${route.method} ${route.template}`);
    assert.equal(operation.operationId, route.operationId);
    const hasIdempotency = operation.parameters.some(
      (parameter) =>
        parameter.$ref === "#/components/parameters/IdempotencyKey"
    );
    assert.equal(hasIdempotency, route.idempotent === true, route.operationId);
  }

  const documentedV1Operations = Object.entries(document.paths)
    .filter(([path]) => path.startsWith("/api/v1/"))
    .flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, operation]) => ({
        method: method.toUpperCase(),
        path,
        operationId: operation.operationId
      }))
    );
  assert.equal(documentedV1Operations.length, V1_ROUTE_MANIFEST.length);
});

test("OpenAPI 所有本地引用可解析，GenerationRun 状态字段完整", () => {
  const document = createOpenApiDocument();
  for (const reference of collectRefs(document)) {
    assert.ok(resolveLocalRef(document, reference), reference);
  }

  const run = document.components.schemas.GenerationRun;
  for (const field of ["progress", "needs_input", "retryable", "result", "error"]) {
    assert.ok(run.required.includes(field), field);
  }
  assert.equal(run.examples.length, 5);
  assert.deepEqual(
    new Set(run.examples.map((example) => example.status)),
    new Set(["queued", "succeeded", "cancelled", "failed"])
  );
});

test("提交的 docs/openapi.yaml 与生成器输出一致", () => {
  const current = JSON.parse(
    readFileSync(resolve(root, "docs/openapi.yaml"), "utf8")
  );
  assert.deepEqual(current, createOpenApiDocument());
});
