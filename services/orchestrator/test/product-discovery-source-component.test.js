import test from "node:test";
import assert from "node:assert/strict";
import { PlanGroundedDiscoveryProvider } from "../src/adapters/product-discovery-agent.js";

test("商品发现会排除用户视频圈选的 SourceComponent", async () => {
  const product = {
    product_id: "prod-warm-clamp-lamp",
    name: "用户圈选灯具",
    category: "lighting"
  };
  const context = {
    aicard: {
      products: [product],
      plan: {
        product_ids: [product.product_id],
        placements: [
          {
            product_id: product.product_id,
            zone: "desktop_back",
            instruction: "作为视觉焦点"
          }
        ]
      }
    },
    planVersion: {
      implementation_source_roles: [
        { product_id: product.product_id, role: "video_selected" }
      ]
    }
  };
  const result = await new PlanGroundedDiscoveryProvider().discover({
    context,
    limits: { maxSubjects: 6 }
  });
  assert.deepEqual(result.subjects, []);
});
