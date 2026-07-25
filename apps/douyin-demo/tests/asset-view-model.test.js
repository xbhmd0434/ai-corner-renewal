import { describe, it } from "node:test";
import assert from "node:assert";
import { adaptAsset, adaptAssets, getAssetTypeText, getLifecycleText, getParseStateText, getParseStateClass, isDemoAsset } from "../douyin-static-demo/adapters/asset-view-model.js";

describe("Asset ViewModel", () => {
  const baseAsset = {
    asset_id: "asset-001",
    type: "space",
    name: "我的书桌",
    description: "书房的书桌",
    lifecycle: "saved",
    parse_state: "ready",
    resource_version: 2,
    media_id: "media-001",
    access_url: "https://example.com/image.jpg",
    detected_objects: [
      {
        detected_object_id: "obj-001",
        label: "台灯",
        type: "灯具",
        style: "北欧",
        color: "白色",
        size: "中",
        confidence: 0.92,
        bbox: [0.1, 0.2, 0.3, 0.4],
        removed: false
      },
      {
        detected_object_id: "obj-002",
        label: "显示器",
        type: "电子产品",
        style: "简约",
        color: "黑色",
        size: "大",
        confidence: 0.88,
        bbox: [0.5, 0.1, 0.4, 0.5],
        removed: true
      }
    ],
    created_at: "2026-07-25T10:00:00Z",
    updated_at: "2026-07-25T12:00:00Z"
  };

  describe("adaptAsset", () => {
    it("should adapt the implemented /api/v1 asset shape", () => {
      const viewModel = adaptAsset({
        schema_version: "1.0",
        asset_id: "space-implemented",
        asset_type: "space",
        lifecycle: "temporary",
        parse_state: "needs_confirmation",
        name: "真实协议空间",
        resource_version: 1,
        current_space_version_id: "space-version-implemented",
        current_space_version: {
          space_version_id: "space-version-implemented",
          state: "draft",
          resource_version: 2
        },
        preview: { url: "/api/v1/media/media-1/content?token=test" },
        attributes: {
          detected_objects: [
            {
              detected_object_id: "detected-1",
              label: "书桌",
              disposition: "keep"
            }
          ]
        }
      });

      assert.equal(viewModel.type, "space");
      assert.equal(viewModel.currentSpaceVersionId, "space-version-implemented");
      assert.equal(viewModel.spaceVersionState, "draft");
      assert.equal(viewModel.accessUrl, "/api/v1/media/media-1/content?token=test");
      assert.equal(viewModel.objectCount, 1);
    });

    it("should adapt asset with all fields", () => {
      const viewModel = adaptAsset(baseAsset);

      assert.equal(viewModel.assetId, "asset-001");
      assert.equal(viewModel.type, "space");
      assert.equal(viewModel.name, "我的书桌");
      assert.equal(viewModel.lifecycle, "saved");
      assert.equal(viewModel.parseState, "ready");
      assert.equal(viewModel.resourceVersion, 2);
      assert.equal(viewModel.mediaId, "media-001");
      assert.equal(viewModel.accessUrl, "https://example.com/image.jpg");
      assert.equal(viewModel.objectCount, 1); // only non-removed objects
      assert.equal(viewModel.createdAt instanceof Date, true);
      assert.equal(viewModel.updatedAt instanceof Date, true);
      assert.equal(viewModel.canEdit, true);
      assert.equal(viewModel.canSave, false); // lifecycle is saved, not temporary
      assert.equal(viewModel.canArchive, true);
      assert.equal(viewModel.canDelete, true);
      assert.equal(viewModel.isReady, true);
      assert.equal(viewModel.needsConfirmation, false);
      assert.equal(viewModel.isFailed, false);
      assert.equal(viewModel.isParsing, false);
    });

    it("should handle temporary lifecycle", () => {
      const asset = { ...baseAsset, lifecycle: "temporary" };
      const viewModel = adaptAsset(asset);

      assert.equal(viewModel.canSave, true);
      assert.equal(viewModel.canEdit, false);
    });

    it("should handle needs_confirmation parse state", () => {
      const asset = { ...baseAsset, parse_state: "needs_confirmation" };
      const viewModel = adaptAsset(asset);

      assert.equal(viewModel.needsConfirmation, true);
      assert.equal(viewModel.isReady, false);
    });

    it("should handle failed parse state", () => {
      const asset = { ...baseAsset, parse_state: "failed" };
      const viewModel = adaptAsset(asset);

      assert.equal(viewModel.isFailed, true);
      assert.equal(viewModel.isReady, false);
    });

    it("should handle parsing parse state", () => {
      const asset = { ...baseAsset, parse_state: "parsing" };
      const viewModel = adaptAsset(asset);

      assert.equal(viewModel.isParsing, true);
      assert.equal(viewModel.isReady, false);
    });

    it("should handle null asset", () => {
      const viewModel = adaptAsset(null);
      assert.equal(viewModel, null);
    });

    it("should handle empty detected_objects", () => {
      const asset = { ...baseAsset, detected_objects: [] };
      const viewModel = adaptAsset(asset);
      assert.equal(viewModel.objectCount, 0);
    });
  });

  describe("adaptAssets", () => {
    it("should adapt array of assets", () => {
      const assets = [baseAsset, { ...baseAsset, asset_id: "asset-002" }];
      const viewModels = adaptAssets(assets);

      assert.equal(viewModels.length, 2);
      assert.equal(viewModels[0].assetId, "asset-001");
      assert.equal(viewModels[1].assetId, "asset-002");
    });

    it("should handle null in array", () => {
      const assets = [baseAsset, null, { ...baseAsset, asset_id: "asset-002" }];
      const viewModels = adaptAssets(assets);

      assert.equal(viewModels.length, 2);
    });

    it("should handle empty array", () => {
      const viewModels = adaptAssets([]);
      assert.equal(viewModels.length, 0);
    });

    it("should handle non-array input", () => {
      const viewModels = adaptAssets(null);
      assert.equal(viewModels.length, 0);
    });
  });

  describe("getAssetTypeText", () => {
    it("should return correct type text", () => {
      assert.equal(getAssetTypeText("space"), "空间");
      assert.equal(getAssetTypeText("inspiration"), "灵感");
      assert.equal(getAssetTypeText("item"), "单品");
      assert.equal(getAssetTypeText("unknown"), "unknown");
      assert.equal(getAssetTypeText(null), "未知");
    });
  });

  describe("getLifecycleText", () => {
    it("should return correct lifecycle text", () => {
      assert.equal(getLifecycleText("temporary"), "临时");
      assert.equal(getLifecycleText("saved"), "已保存");
      assert.equal(getLifecycleText("archived"), "已归档");
      assert.equal(getLifecycleText("deleted"), "已删除");
      assert.equal(getLifecycleText(null), "未知");
    });
  });

  describe("getParseStateText", () => {
    it("should return correct parse state text", () => {
      assert.equal(getParseStateText("queued"), "等待解析");
      assert.equal(getParseStateText("parsing"), "解析中");
      assert.equal(getParseStateText("needs_confirmation"), "待确认");
      assert.equal(getParseStateText("ready"), "已完成");
      assert.equal(getParseStateText("failed"), "解析失败");
      assert.equal(getParseStateText(null), "未知");
    });
  });

  describe("getParseStateClass", () => {
    it("should return correct parse state class", () => {
      assert.equal(getParseStateClass("queued"), "parse-queued");
      assert.equal(getParseStateClass("parsing"), "parse-parsing");
      assert.equal(getParseStateClass("needs_confirmation"), "parse-warning");
      assert.equal(getParseStateClass("ready"), "parse-ready");
      assert.equal(getParseStateClass("failed"), "parse-failed");
      assert.equal(getParseStateClass(null), "parse-unknown");
    });
  });

  describe("isDemoAsset", () => {
    it("should return true when source_mode is demo", () => {
      const asset = { ...baseAsset, source_mode: "demo" };
      assert.equal(isDemoAsset(asset), true);
    });

    it("should return true when is_demo is true", () => {
      const asset = { ...baseAsset, is_demo: true };
      assert.equal(isDemoAsset(asset), true);
    });

    it("should return false when neither flag is set", () => {
      assert.equal(isDemoAsset(baseAsset), false);
    });

    it("should return false for null", () => {
      assert.equal(isDemoAsset(null), false);
    });
  });
});
