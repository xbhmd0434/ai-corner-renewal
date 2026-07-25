import { describe, it } from "node:test";
import assert from "node:assert";
import { adaptPlanResult, isPlanNull, formatPrice, getStatusText, getStatusClass } from "../douyin-static-demo/adapters/plan-version-view-model.js";

describe("PlanVersion ViewModel", () => {
  const baseEnvelope = {
    plan_asset_id: "plan-001",
    plan_resource_version: 1,
    plan_version: {
      plan_version_id: "plan-version-001",
      version: 1,
      design_request_snapshot: {},
      redactions: [],
      aicard: {
        status: "ready",
        title: "优化方案",
        summary: "让空间更整洁",
        source_mode: "live",
        render: {
          before_ref: "https://example.com/before.jpg",
          after_ref: "https://example.com/after.jpg"
        },
        plan: {
          id: "plan-1",
          title: "主方案",
          total_price_cny: 500,
          render: {
            before_ref: "https://example.com/plan-before.jpg",
            after_ref: "https://example.com/plan-after.jpg"
          },
          products: []
        },
        alternatives: [],
        products: [],
        steps: [],
        tutorials: [],
        validation: {},
        applied_constraints: {},
        warnings: [],
        redactions: [],
        follow_up: [],
        judge_trace: {}
      }
    }
  };

  describe("adaptPlanResult", () => {
    it("should adapt the implemented AICard v1 shape", () => {
      const envelope = {
        plan_asset_id: "plan-actual",
        plan_resource_version: 1,
        plan_version: {
          plan_version_id: "plan-version-actual",
          version: 1,
          design_request_snapshot: {},
          redactions: [],
          aicard: {
            status: "ready",
            source_mode: "demo",
            render: {
              before_ref: "/api/v1/media/media-1/content?token=test",
              after_ref: "./assets/desk-after-warm.png",
              is_ai_generated: true,
              disclaimer: "AI 设计示意"
            },
            plan: {
              plan_id: "design-plan-1",
              title: "原木呼吸感",
              summary: "保留桌椅并增加暖光",
              total_price_cny: 486,
              product_ids: ["product-1"],
              steps: [
                {
                  step_id: "step-1",
                  title: "清空桌面",
                  instruction: "先移除低频物品"
                }
              ]
            },
            alternatives: [],
            products: [
              {
                product_id: "product-1",
                name: "浅橡木桌上架",
                price_cny: 129,
                reason: "抬高视觉中心",
                source: { label: "结构化演示商品库" }
              }
            ],
            tutorials: [],
            validation: {
              overall_status: "needs_confirmation",
              checks: [
                { code: "budget", status: "pass", message: "未超过预算" }
              ],
              warnings: []
            },
            constraints: {
              budget_cny: 500,
              hard_constraints: ["no_drilling"]
            },
            notices: [],
            trace: [],
            follow_up: null
          }
        }
      };

      const viewModel = adaptPlanResult(envelope);

      assert.equal(viewModel.title, "原木呼吸感");
      assert.equal(viewModel.summary, "保留桌椅并增加暖光");
      assert.equal(viewModel.totalPriceCny, 486);
      assert.equal(viewModel.steps[0].description, "先移除低频物品");
      assert.equal(viewModel.products[0].reason, "抬高视觉中心");
      assert.equal(viewModel.validation.overallStatus, "needs_confirmation");
      assert.equal(viewModel.appliedConstraints.noDrilling, true);
      assert.match(viewModel.afterImage, /ai-corner-renewal\/apps\/web\/assets\/desk-after-warm\.png$/);
    });

    it("should adapt ready status envelope", () => {
      const viewModel = adaptPlanResult(baseEnvelope);

      assert.equal(viewModel.status, "ready");
      assert.equal(viewModel.planAssetId, "plan-001");
      assert.equal(viewModel.planVersionId, "plan-version-001");
      assert.equal(viewModel.version, 1);
      assert.equal(viewModel.sourceBadge, "实时");
      assert.equal(viewModel.title, "优化方案");
      assert.equal(viewModel.totalPriceCny, 500);
      assert.ok(viewModel.canSave);
      assert.ok(viewModel.canRevise);
    });

    it("should adapt fallback_ready status", () => {
      const envelope = {
        ...baseEnvelope,
        plan_version: {
          ...baseEnvelope.plan_version,
          aicard: {
            ...baseEnvelope.plan_version.aicard,
            status: "fallback_ready",
            source_mode: "fallback"
          }
        }
      };

      const viewModel = adaptPlanResult(envelope);
      assert.equal(viewModel.status, "fallback_ready");
      assert.equal(viewModel.sourceBadge, "已降级");
    });

    it("should handle plan=null case", () => {
      const envelope = {
        plan_asset_id: null,
        plan_resource_version: null,
        plan_version: {
          plan_version_id: "plan-version-002",
          version: 1,
          design_request_snapshot: {},
          redactions: [],
          aicard: {
            status: "needs_input",
            title: "需要补充信息",
            summary: "缺少必要信息",
            source_mode: "live",
            render: {
              before_ref: "https://example.com/before.jpg",
              after_ref: null
            },
            plan: null,
            alternatives: [],
            products: [],
            steps: [],
            tutorials: [],
            validation: {},
            applied_constraints: {},
            warnings: [],
            redactions: [],
            follow_up: [],
            judge_trace: {}
          }
        }
      };

      const viewModel = adaptPlanResult(envelope);
      assert.equal(viewModel.status, "needs_input");
      assert.equal(viewModel.planAssetId, null);
      assert.equal(viewModel.afterImage, null);
      assert.equal(viewModel.canSave, false);
      assert.equal(viewModel.canRevise, false);
    });

    it("should handle missing envelope", () => {
      const viewModel = adaptPlanResult(null);
      assert.equal(viewModel, null);
    });
  });

  describe("isPlanNull", () => {
    it("should return true when status is needs_input and plan is null", () => {
      const envelope = {
        plan_version: {
          aicard: {
            status: "needs_input",
            plan: null
          }
        }
      };

      assert.equal(isPlanNull(envelope), true);
    });

    it("should return false when status is ready", () => {
      const envelope = {
        plan_version: {
          aicard: {
            status: "ready",
            plan: {}
          }
        }
      };

      assert.equal(isPlanNull(envelope), false);
    });

    it("should return false when plan exists", () => {
      const envelope = {
        plan_version: {
          aicard: {
            status: "needs_input",
            plan: { id: "plan-001" }
          }
        }
      };

      assert.equal(isPlanNull(envelope), false);
    });
  });

  describe("formatPrice", () => {
    it("should format price with ¥", () => {
      assert.equal(formatPrice(100), "¥100");
      assert.equal(formatPrice(599), "¥599");
    });

    it("should return empty string for null", () => {
      assert.equal(formatPrice(null), "");
    });

    it("should return empty string for undefined", () => {
      assert.equal(formatPrice(undefined), "");
    });
  });

  describe("getStatusText", () => {
    it("should return correct status text", () => {
      assert.equal(getStatusText("ready"), "优化完成");
      assert.equal(getStatusText("fallback_ready"), "优化完成（已降级）");
      assert.equal(getStatusText("needs_input"), "需要补充信息");
      assert.equal(getStatusText("running"), "生成中");
      assert.equal(getStatusText("failed"), "生成失败");
      assert.equal(getStatusText("cancelled"), "已取消");
      assert.equal(getStatusText("unknown"), "未知");
    });
  });

  describe("getStatusClass", () => {
    it("should return correct status class", () => {
      assert.equal(getStatusClass("ready"), "status-ready");
      assert.equal(getStatusClass("fallback_ready"), "status-fallback");
      assert.equal(getStatusClass("needs_input"), "status-warning");
      assert.equal(getStatusClass("running"), "status-running");
      assert.equal(getStatusClass("failed"), "status-error");
      assert.equal(getStatusClass("cancelled"), "status-cancelled");
      assert.equal(getStatusClass("unknown"), "status-unknown");
    });
  });
});
