import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ContractValidationError,
  assertAICard,
  assertGenerateRequest,
  assertReviseRequest,
  validateAICard
} from "../src/index.js";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const readJson = (path) =>
  JSON.parse(readFileSync(resolve(root, path), "utf8"));

test("固定 AICard 示例符合 v1 协议", () => {
  const card = readJson("examples/aicard.demo.json");
  assert.doesNotThrow(() => assertAICard(card));
  assert.equal(card.plan.total_price_cny, 486);
  assert.equal(card.validation.plan_id, card.plan.plan_id);
});

test("五个正常和三个异常业务夹具都符合 GenerateRequest v1", () => {
  const fixtures = [
    "generate.main.json",
    "generate.compact.json",
    "generate.green.json",
    "generate.pet-friendly.json",
    "generate.flexible.json",
    "generate.missing-dimension.json",
    "generate.blurry.json",
    "generate.low-budget.json"
  ];
  for (const fixture of fixtures) {
    const request = readJson(`examples/requests/${fixture}`);
    assert.doesNotThrow(() => assertGenerateRequest(request), fixture);
  }
});

test("调整请求符合 ReviseRequest v1", () => {
  const request = readJson("examples/requests/revise.to-300.json");
  const card = readJson("examples/aicard.demo.json");
  assert.doesNotThrow(() => assertReviseRequest(request));
  assert.equal(request.request_id, card.request_id);
  assert.equal(request.plan_id, card.plan.plan_id);
});

test("客户端非法预算被拒绝，不能降级成假成功", () => {
  const request = readJson("examples/requests/generate.main.json");
  request.constraints.budget_cny = 0;
  assert.throws(
    () => assertGenerateRequest(request),
    (error) =>
      error instanceof ContractValidationError &&
      error.statusCode === 422 &&
      error.issues.some((issue) => issue.path === "$.constraints.budget_cny")
  );
});

test("图片 Data URL 只能放 data_url，不能进入持久引用", () => {
  for (const reference of [
    "data:image/png;base64,AAAA",
    "DATA:image/png;base64,AAAA",
    "//untrusted.example/image.png",
    "https://user:password@example.com/image.png"
  ]) {
    const request = readJson("examples/requests/generate.main.json");
    request.room_input.image.reference = reference;
    assert.throws(
      () => assertGenerateRequest(request),
      (error) =>
        error instanceof ContractValidationError &&
        error.issues.some(
          (issue) => issue.path === "$.room_input.image.reference"
        ),
      reference
    );
  }
});

test("图片 Data URL 会核对 Base64 格式、声明类型和文件签名", () => {
  const valid = readJson("examples/requests/generate.main.json");
  delete valid.room_input.image.reference;
  valid.room_input.image.data_url = "data:image/png;base64,iVBORw0KGgo=";
  valid.room_input.image.media_type = "image/png";
  assert.doesNotThrow(() => assertGenerateRequest(valid));

  const forged = structuredClone(valid);
  forged.room_input.image.data_url = "data:image/png;base64,QUFBQQ==";
  assert.throws(
    () => assertGenerateRequest(forged),
    (error) =>
      error instanceof ContractValidationError &&
      error.issues.some((issue) => issue.message.includes("文件签名"))
  );

  const mismatchedType = structuredClone(valid);
  mismatchedType.room_input.image.media_type = "image/jpeg";
  assert.throws(
    () => assertGenerateRequest(mismatchedType),
    (error) =>
      error instanceof ContractValidationError &&
      error.issues.some(
        (issue) => issue.path === "$.room_input.image.media_type"
      )
  );
});

test("请求拒绝未知嵌套字段和未实现的 style_key", () => {
  const unknownField = readJson("examples/requests/generate.main.json");
  unknownField.room_input.image.internal_note = "must not pass";
  assert.throws(
    () => assertGenerateRequest(unknownField),
    (error) =>
      error instanceof ContractValidationError &&
      error.issues.some(
        (issue) => issue.path === "$.room_input.image.internal_note"
      )
  );

  const unsupportedStyle = readJson("examples/requests/generate.main.json");
  unsupportedStyle.inspiration_input.style_key = "industrial";
  assert.throws(
    () => assertGenerateRequest(unsupportedStyle),
    (error) =>
      error instanceof ContractValidationError &&
      error.issues.some(
        (issue) => issue.path === "$.inspiration_input.style_key"
      )
  );
});

test("AICard 缺少方案引用商品时会被拒绝", () => {
  const card = readJson("examples/aicard.demo.json");
  card.products = card.products.slice(1);
  const issues = validateAICard(card);
  assert.ok(
    issues.some(
      (issue) =>
        issue.path === "$.products" &&
        issue.message.includes("prod-warm-oak-riser")
    )
  );
});

test("AICard 会拒绝状态、后续问题和来源模式互相矛盾", () => {
  const card = readJson("examples/aicard.demo.json");
  card.status = "fallback_ready";
  let issues = validateAICard(card);
  assert.ok(issues.some((issue) => issue.path === "$.status"));

  card.status = "needs_input";
  card.follow_up = null;
  issues = validateAICard(card);
  assert.ok(issues.some((issue) => issue.path === "$.follow_up"));
});

test("AICard 会复算价格、汇总校验状态并校验可选字段类型", () => {
  const priceMismatch = readJson("examples/aicard.demo.json");
  priceMismatch.plan.total_price_cny = 1;
  assert.ok(
    validateAICard(priceMismatch).some(
      (issue) => issue.path === "$.plan.total_price_cny"
    )
  );

  const statusMismatch = readJson("examples/aicard.demo.json");
  statusMismatch.validation.overall_status = "pass";
  statusMismatch.validation.checks[0].status = "fail";
  assert.ok(
    validateAICard(statusMismatch).some(
      (issue) => issue.path === "$.validation.overall_status"
    )
  );

  const invalidReplacement = readJson("examples/aicard.demo.json");
  invalidReplacement.products[0].replacement_for = 42;
  assert.ok(
    validateAICard(invalidReplacement).some(
      (issue) => issue.path === "$.products[0].replacement_for"
    )
  );
});

test("同一 AICard 内相同 product_id 必须对应同一组商品事实", () => {
  const card = readJson("examples/aicard.demo.json");
  const conflictingProduct = structuredClone(card.products[0]);
  conflictingProduct.price_cny += 1;
  const alternative = card.alternatives[0];
  alternative.products.push(conflictingProduct);
  alternative.plan.product_ids.push(conflictingProduct.product_id);
  alternative.plan.total_price_cny += conflictingProduct.price_cny;

  assert.ok(
    validateAICard(card).some((issue) =>
      issue.message.includes("商品事实不一致")
    )
  );
});

test("四个 JSON Schema 文件可解析且内部引用存在", () => {
  const schemaFiles = [
    "packages/contracts/schemas/aicard-v1.schema.json",
    "packages/contracts/schemas/generate-request-v1.schema.json",
    "packages/contracts/schemas/revise-request-v1.schema.json",
    "packages/contracts/schemas/platform-v1.schema.json"
  ];
  for (const schemaFile of schemaFiles) {
    const schema = readJson(schemaFile);
    const serialized = JSON.stringify(schema);
    for (const match of serialized.matchAll(/#\/\$defs\/([^"\\]+)/g)) {
      assert.ok(schema.$defs?.[match[1]], `${schemaFile}: ${match[0]}`);
    }
  }
});
