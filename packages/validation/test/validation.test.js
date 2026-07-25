import assert from "node:assert/strict";
import test from "node:test";

import {
  VALIDATION_CHECK_CODES,
  validateDesignPlan
} from "../src/index.js";

function product(overrides = {}) {
  return {
    product_id: "lamp-clamp",
    name: "暖白夹灯",
    category: "lighting",
    price_cny: 99,
    installation: "clamp",
    pet_safe: true,
    reason: "夹在桌边，不占桌面",
    dimensions_cm: { width: 14, depth: 10, height: 42 },
    availability: {
      status: "demo_available",
      source_type: "demo",
      checked_at: "2026-07-25T00:00:00.000Z",
      live_verified: false
    },
    source: {
      source_type: "demo",
      label: "演示商品库",
      updated_at: "2026-07-25T00:00:00.000Z"
    },
    ...overrides
  };
}

function validInput(overrides = {}) {
  const products = overrides.products ?? [
    product(),
    product({
      product_id: "desk-riser",
      name: "浅橡木桌上架",
      category: "storage",
      price_cny: 129,
      installation: "freestanding",
      dimensions_cm: { width: 58, depth: 20, height: 8 }
    })
  ];

  return {
    plan: {
      plan_id: "plan-warm-v1",
      room_id: "room-001",
      inspiration_id: "warm",
      version: 1,
      title: "原木呼吸感",
      summary: "保留桌椅，用免打孔商品整理桌面。",
      total_price_cny: products.reduce(
        (sum, item) => sum + (Number.isInteger(item.price_cny) ? item.price_cny : 0),
        0
      ),
      product_ids: products.map((item) => item.product_id),
      preserved_elements: ["desk", "chair"],
      placements: products.map((item) => ({
        product_id: item.product_id,
        zone: "desktop"
      })),
      steps: [],
      render_ref: "demo-after-warm",
      assumptions: [],
      constraint_tags: ["no_drilling", "preserve_structure"],
      ...overrides.plan
    },
    products,
    roomProfile: {
      room_id: "room-001",
      room_type: "desk_corner",
      reference_width_cm: 120,
      fixed_elements: ["wall", "window", "desk", "chair"],
      editable_zones: ["desktop", "wall_leaning_zone"],
      lighting: { direction: "left", confidence: 0.82 },
      uncertainties: [],
      needs_confirmation: [],
      ...overrides.roomProfile
    },
    constraints: {
      budget_cny: 500,
      hard_constraints: ["no_drilling", "keep_desk", "keep_chair", "pet_safe"],
      soft_preferences: [],
      goals: ["organization"],
      ...overrides.constraints
    }
  };
}

function check(report, code) {
  const result = report.checks.find((item) => item.code === code);
  assert.ok(result, `缺少 ${code} 检查`);
  return result;
}

test("合法方案返回稳定的 ValidationReport v1", () => {
  const input = validInput();
  const snapshot = structuredClone(input);

  const first = validateDesignPlan(input);
  const second = validateDesignPlan(input);

  assert.deepEqual(first, second);
  assert.deepEqual(input, snapshot, "校验器不应修改输入");
  assert.equal(first.report_id, "validation-plan-warm-v1-v1");
  assert.equal(first.plan_id, "plan-warm-v1");
  assert.equal(first.plan_version, 1);
  assert.equal(first.overall_status, "pass");
  assert.equal(first.checks.length, 9);
  assert.deepEqual(first.warnings, []);
  assert.ok(first.checks.every((item) => item.status === "pass"));
});

test("no_drilling：需要打孔的商品触发硬失败", () => {
  const drillingProduct = product({
    installation: "requires_drilling"
  });
  const input = validInput({
    products: [drillingProduct],
    plan: {
      total_price_cny: drillingProduct.price_cny,
      product_ids: [drillingProduct.product_id],
      placements: [{ product_id: drillingProduct.product_id, zone: "desktop" }]
    }
  });

  const report = validateDesignPlan(input);

  assert.equal(report.overall_status, "failed");
  assert.equal(check(report, VALIDATION_CHECK_CODES.NO_DRILLING).status, "fail");
  assert.match(
    check(report, VALIDATION_CHECK_CODES.NO_DRILLING).message,
    /需要打孔/
  );
});

test("预算：按商品事实重算，不能用方案声明总价绕过预算", () => {
  const expensiveProduct = product({ price_cny: 520 });
  const input = validInput({
    products: [expensiveProduct],
    plan: {
      total_price_cny: 300,
      product_ids: [expensiveProduct.product_id],
      placements: [{ product_id: expensiveProduct.product_id, zone: "desktop" }]
    },
    constraints: { budget_cny: 500 }
  });

  const report = validateDesignPlan(input);

  assert.equal(report.overall_status, "failed");
  assert.equal(check(report, VALIDATION_CHECK_CODES.PRICE_TOTAL).status, "fail");
  assert.equal(check(report, VALIDATION_CHECK_CODES.BUDGET).status, "fail");
  assert.match(check(report, VALIDATION_CHECK_CODES.BUDGET).message, /超出 ¥20/);
});

test("尺寸未知：不误报通过，返回 needs_confirmation 和复测提示", () => {
  const unknownSizeProduct = product({
    dimensions_cm: { width: 14, depth: null, height: 42 }
  });
  const input = validInput({
    products: [unknownSizeProduct],
    plan: {
      total_price_cny: unknownSizeProduct.price_cny,
      product_ids: [unknownSizeProduct.product_id],
      placements: [{ product_id: unknownSizeProduct.product_id, zone: "desktop" }],
      assumptions: ["desk_depth_at_least_55cm"]
    },
    roomProfile: {
      uncertainties: ["desk_depth"],
      needs_confirmation: ["desk_depth"]
    }
  });

  const report = validateDesignPlan(input);

  assert.equal(report.overall_status, "needs_confirmation");
  assert.equal(check(report, VALIDATION_CHECK_CODES.DIMENSIONS).status, "warn");
  assert.match(check(report, VALIDATION_CHECK_CODES.DIMENSIONS).message, /购买前需复测/);
  assert.ok(report.warnings.includes("confirm_dimensions_before_purchase"));
  assert.ok(report.warnings.includes("measure_desk_depth_before_purchase"));
});

test("桌面商品宽于已知桌面时触发明确尺寸失败", () => {
  const wideProduct = product({
    product_id: "wide-riser",
    name: "58cm 桌上架",
    dimensions_cm: { width: 58, depth: 20, height: 8 }
  });
  const input = validInput({
    products: [wideProduct],
    plan: {
      total_price_cny: wideProduct.price_cny,
      product_ids: [wideProduct.product_id],
      placements: [{ product_id: wideProduct.product_id, zone: "desktop_center_back" }]
    },
    roomProfile: {
      reference_width_cm: 40
    }
  });

  const report = validateDesignPlan(input);
  const dimensionCheck = check(report, VALIDATION_CHECK_CODES.DIMENSIONS);

  assert.equal(report.overall_status, "failed");
  assert.equal(dimensionCheck.status, "fail");
  assert.match(dimensionCheck.message, /58cm 超过桌面参考宽度 40cm/);
});

test("已知桌宽低于方案最小桌宽假设时触发明确尺寸失败", () => {
  const narrowProduct = product();
  const input = validInput({
    products: [narrowProduct],
    plan: {
      total_price_cny: narrowProduct.price_cny,
      product_ids: [narrowProduct.product_id],
      placements: [{ product_id: narrowProduct.product_id, zone: "desktop" }],
      assumptions: ["desk_width_at_least_100cm"]
    },
    roomProfile: {
      reference_width_cm: 40
    }
  });

  const report = validateDesignPlan(input);
  const dimensionCheck = check(report, VALIDATION_CHECK_CODES.DIMENSIONS);

  assert.equal(report.overall_status, "failed");
  assert.equal(dimensionCheck.status, "fail");
  assert.match(
    dimensionCheck.message,
    /桌面宽度至少 100cm，当前参考宽度为 40cm/
  );
});

test("保留物、可编辑区和固定结构均由结构化事实校验", () => {
  const input = validInput({
    plan: {
      preserved_elements: ["desk"],
      placements: [
        {
          product_id: "lamp-clamp",
          zone: "window",
          modified_elements: ["window"]
        },
        { product_id: "desk-riser", zone: "desktop" }
      ]
    }
  });

  const report = validateDesignPlan(input);

  assert.equal(report.overall_status, "failed");
  assert.equal(
    check(report, VALIDATION_CHECK_CODES.PRESERVED_ELEMENTS).status,
    "fail"
  );
  assert.equal(check(report, VALIDATION_CHECK_CODES.EDITABLE_ZONES).status, "fail");
  assert.equal(check(report, VALIDATION_CHECK_CODES.STRUCTURE).status, "fail");
});

test("缺货与宠物不安全商品分别触发硬失败", () => {
  const unsafeProduct = product({
    pet_safe: false,
    availability: {
      status: "out_of_stock",
      source_type: "demo",
      checked_at: "2026-07-25T00:00:00.000Z"
    }
  });
  const input = validInput({
    products: [unsafeProduct],
    plan: {
      total_price_cny: unsafeProduct.price_cny,
      product_ids: [unsafeProduct.product_id],
      placements: [{ product_id: unsafeProduct.product_id, zone: "desktop" }]
    }
  });

  const report = validateDesignPlan(input);

  assert.equal(report.overall_status, "failed");
  assert.equal(check(report, VALIDATION_CHECK_CODES.AVAILABILITY).status, "fail");
  assert.equal(check(report, VALIDATION_CHECK_CODES.PET_SAFETY).status, "fail");
});
