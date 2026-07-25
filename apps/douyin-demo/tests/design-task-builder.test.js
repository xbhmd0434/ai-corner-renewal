import { describe, it } from "node:test";
import assert from "node:assert";
import { buildDesignRequest, validateDesignRequest, createDesignTaskDraft } from "../douyin-static-demo/adapters/design-task-builder.js";

describe("DesignTaskBuilder", () => {
  describe("validateDesignRequest", () => {
    it("should throw error when required fields are missing", () => {
      assert.throws(() => {
        validateDesignRequest({});
      }, /trigger 不能为空/);
    });

    it("should throw error when space_asset_id is missing", () => {
      assert.throws(() => {
        validateDesignRequest({ trigger: "space_upload" });
      }, /space_asset_id 不能为空/);
    });

    it("should throw error when space_version_id is missing", () => {
      assert.throws(() => {
        validateDesignRequest({ trigger: "space_upload", space_asset_id: "space-001" });
      }, /space_version_id 不能为空/);
    });

    it("should throw error when reference_asset_ids exceeds 3", () => {
      assert.throws(() => {
        validateDesignRequest({
          trigger: "space_upload",
          space_asset_id: "space-001",
          space_version_id: "version-001",
          reference_asset_ids: ["ref1", "ref2", "ref3", "ref4"]
        });
      }, /reference_asset_ids 最多3个/);
    });

    it("should throw error when no goal, goal_codes or reference_asset_ids provided", () => {
      assert.throws(() => {
        validateDesignRequest({
          trigger: "space_upload",
          space_asset_id: "space-001",
          space_version_id: "version-001"
        });
      }, /goal、goal_codes 或 reference_asset_ids 至少有一项/);
    });

    it("should throw error when budget_cny is negative", () => {
      assert.throws(() => {
        validateDesignRequest({
          trigger: "space_upload",
          space_asset_id: "space-001",
          space_version_id: "version-001",
          goal: "测试",
          constraints: { budget_cny: -100 }
        });
      }, /budget_cny 必须为正整数/);
    });

    it("should throw error when pet_context is invalid", () => {
      assert.throws(() => {
        validateDesignRequest({
          trigger: "space_upload",
          space_asset_id: "space-001",
          space_version_id: "version-001",
          goal: "测试",
          constraints: { pet_context: "bird" }
        });
      }, /pet_context 必须为 none \/ cat \/ dog/);
    });

    it("should pass validation with valid params", () => {
      assert.doesNotThrow(() => {
        validateDesignRequest({
          trigger: "space_upload",
          space_asset_id: "space-001",
          space_version_id: "version-001",
          goal: "更整洁",
          constraints: { budget_cny: 500, pet_context: "none" }
        });
      });
    });
  });

  describe("buildDesignRequest", () => {
    it("should build request with minimal valid params", () => {
      const request = buildDesignRequest({
        trigger: "space_upload",
        space_asset_id: "space-001",
        space_version_id: "version-001",
        goal: "更整洁"
      });

      assert.equal(request.schema_version, "1.0");
      assert.equal(request.trigger, "space_upload");
      assert.equal(request.space_asset_id, "space-001");
      assert.equal(request.space_version_id, "version-001");
      assert.equal(request.goal, "更整洁");
      assert.equal(request.constraints.budget_cny, undefined);
      assert.deepEqual(request.goal_codes, []);
      assert.deepEqual(request.constraints.keep_detected_object_ids, []);
    });

    it("should limit reference_asset_ids to 3", () => {
      const request = buildDesignRequest({
        trigger: "space_upload",
        space_asset_id: "space-001",
        space_version_id: "version-001",
        reference_asset_ids: ["ref1", "ref2", "ref3", "ref4"]
      });

      assert.equal(request.reference_asset_ids.length, 3);
    });

    it("should remove empty fields", () => {
      const request = buildDesignRequest({
        trigger: "space_upload",
        space_asset_id: "space-001",
        space_version_id: "version-001",
        goal: "",
        goal_codes: [],
        editable_region_id: "",
        reference_asset_ids: ["ref1"] // 提供有效的参考资产满足验证要求
      });

      assert.equal(request.goal, undefined);
      assert.deepEqual(request.goal_codes, []);
      assert.equal(request.editable_region_id, undefined);
    });

    it("should build video entry request", () => {
      const request = buildDesignRequest({
        trigger: "video_apply",
        space_asset_id: "space-001",
        space_version_id: "version-001",
        reference_asset_ids: ["inspiration-001"],
        goal: "增加暖光",
        constraints: { budget_cny: 300 }
      });

      assert.equal(request.trigger, "video_apply");
      assert.equal(request.constraints.budget_cny, 300);
    });
  });

  describe("createDesignTaskDraft", () => {
    it("should create draft with id and timestamps", () => {
      const draft = createDesignTaskDraft({ space_asset_id: "space-001" });

      assert.ok(draft.id);
      assert.ok(draft.createdAt);
      assert.ok(draft.updatedAt);
      assert.equal(draft.space_asset_id, "space-001");
    });
  });
});
