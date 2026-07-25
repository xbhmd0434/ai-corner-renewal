/*
 * AI 接入边界（当前故意不直连供应商）：
 *
 * 1. space / inspiration / item 的结构化理解：
 *    接多模态结构化输出模型。火山方舟建议优先评估 Doubao-Seed-2.0 Lite；
 *    复杂空间推理再切 Pro。供应商响应必须在此转换为内部对象，禁止透传。
 * 2. bbox / mask：
 *    接检测与分割专用 API，不让通用 Agent 猜像素蒙版。
 * 3. 预算、库存、尺寸、所有权、状态机：
 *    永远不接模型，由 contracts / validation / service 代码拥有。
 *
 * P0 没有配置模型端点时使用下面的确定性适配器，并明确标记 source_mode=demo。
 */

const clone = (value) => structuredClone(value);

export class DeterministicAssetUnderstandingAdapter {
  constructor({ now = () => new Date() } = {}) {
    this.now = now;
  }

  async analyze({ asset, spaceVersion }) {
    if (asset.asset_type === "space") {
      const referenceWidth =
        spaceVersion?.reference_width_cm ??
        asset.attributes?.reference_width_cm ??
        null;
      return {
        source_mode: "demo",
        parse_state: "needs_confirmation",
        attributes: {
          scene_type: asset.attributes?.scene_type || "desk_corner",
          reference_width_cm: referenceWidth,
          editable_regions: [
            {
              editable_region_id: "desktop-and-back-wall",
              label: "桌面与后墙"
            }
          ],
          detected_objects: [
            {
              detected_object_id: `detected-${asset.asset_id}-desk`,
              category: "desk",
              display_name: "书桌",
              bbox: { x: 0.08, y: 0.48, width: 0.84, height: 0.42 },
              detection_confidence: 0.9,
              disposition: "keep",
              confirmation_state: "suggested"
            },
            {
              detected_object_id: `detected-${asset.asset_id}-monitor`,
              category: "monitor",
              display_name: "显示器",
              bbox: { x: 0.31, y: 0.18, width: 0.28, height: 0.31 },
              detection_confidence: 0.84,
              disposition: "keep",
              confirmation_state: "suggested"
            }
          ],
          uncertainties: [
            {
              code: "desk_depth_unknown",
              message: "桌面深度未知，购买前需要复测"
            }
          ]
        },
        provider_trace: {
          provider: "deterministic-demo",
          model: null,
          completed_at: this.now().toISOString()
        }
      };
    }

    if (asset.asset_type === "inspiration") {
      const baseAttributes = clone(asset.attributes || {});
      const providedAnalysis = baseAttributes.intent_analysis;
      const confirmed = baseAttributes.confirmed_intent || null;
      // 一次跑一次意图分析：来源固定 demo，摘要通过启发式决定
      const styleKey = baseAttributes.style_key || "warm";
      const styles = baseAttributes.styles || [styleKey];
      const colors =
        baseAttributes.colors || (styleKey === "green" ? ["green", "warm_white"] : ["wood", "warm_white"]);
      const materials = baseAttributes.materials || ["wood", "fabric"];
      const scope = baseAttributes.inspiration_scope || null;
      // 有 selection_bbox 时优先视作组件；scope=color/material 视作风格；否则 needs_confirmation
      let intentAnalysis = null;
      const hasBbox = Boolean(asset.provenance?.selection_bbox);
      if (scope === "item" || hasBbox) {
        intentAnalysis = {
          state: "ready",
          suggested_type: "component",
          summary: providedAnalysis?.summary || baseAttributes.name || asset.name || "视频圈选的组件",
          component_reference: providedAnalysis?.component_reference || {
            category_code: "unspecified_component",
            colors: [...colors].slice(0, 4),
            materials: [...materials].slice(0, 4),
            shape_keywords: []
          },
          style_reference: null,
          candidates: [],
          source_mode: "demo",
          provider: "deterministic-demo",
          model: null
        };
      } else if (scope === "color" || scope === "material" || scope === "overall") {
        intentAnalysis = {
          state: "ready",
          suggested_type: "style",
          summary: providedAnalysis?.summary || baseAttributes.name || asset.name || "视频里的整体风格",
          component_reference: null,
          style_reference: providedAnalysis?.style_reference || {
            style_keywords: [...styles].slice(0, 4),
            colors: [...colors].slice(0, 4),
            materials: [...materials].slice(0, 4)
          },
          candidates: [],
          source_mode: "demo",
          provider: "deterministic-demo",
          model: null
        };
      } else {
        intentAnalysis = {
          state: "needs_confirmation",
          suggested_type: null,
          summary: providedAnalysis?.summary || asset.name || "无法判断是圈选具体组件还是整体风格",
          component_reference: {
            category_code: "unspecified_component",
            colors: [...colors].slice(0, 3),
            materials: [...materials].slice(0, 3),
            shape_keywords: []
          },
          style_reference: {
            style_keywords: [...styles].slice(0, 3),
            colors: [...colors].slice(0, 3),
            materials: [...materials].slice(0, 3)
          },
          candidates: [
            { intent_type: "component", summary: "组件：视频里的具体物件" },
            { intent_type: "style", summary: "风格：整体氛围" }
          ],
          source_mode: "demo",
          provider: "deterministic-demo",
          model: null
        };
      }
      const parseState = intentAnalysis.state === "needs_confirmation" ? "needs_confirmation" : "ready";
      return {
        source_mode: "demo",
        parse_state: parseState,
        attributes: {
          ...baseAttributes,
          style_key: styleKey,
          styles,
          colors,
          materials,
          intent_analysis: intentAnalysis,
          confirmed_intent: confirmed
        },
        provider_trace: {
          provider: "deterministic-demo",
          model: null,
          completed_at: this.now().toISOString()
        }
      };
    }

    return {
      source_mode: "demo",
      parse_state: "ready",
      attributes: {
        ...clone(asset.attributes || {}),
        user_role: asset.attributes?.user_role || "reference",
        identity_level: asset.attributes?.identity_level || "category_only"
      },
      provider_trace: {
        provider: "deterministic-demo",
        model: null,
        completed_at: this.now().toISOString()
      }
    };
  }
}
