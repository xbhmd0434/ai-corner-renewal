import test from "node:test";
import assert from "node:assert/strict";
import { RenderPreview } from "../douyin-static-demo/renewal/components/render-preview.js";

test("move preview renders the selected component and space instead of lamp constants", () => {
  const element = { hidden: true, innerHTML: "" };
  const preview = new RenderPreview(element);

  preview.render({
    selectedReference: {
      assetId: "item-user-selected",
      name: "黑色桌面音箱",
      accessUrl: "/api/v1/media/component/content",
      referenceKind: "component",
      sourceComponent: {
        immutable_anchor: true,
        label: "黑色桌面音箱"
      }
    },
    selectedSpace: {
      name: "窗边工作桌",
      accessUrl: "/api/v1/media/space/content"
    },
    confirmedIntent: {
      intentType: "component",
      summary: "黑色桌面音箱"
    },
    canGenerate: true
  });

  assert.match(element.innerHTML, /黑色桌面音箱/);
  assert.match(element.innerHTML, /窗边工作桌/);
  assert.doesNotMatch(element.innerHTML, /蘑菇小台灯/);
  assert.doesNotMatch(element.innerHTML, /只放入一盏蘑菇灯/);
});
