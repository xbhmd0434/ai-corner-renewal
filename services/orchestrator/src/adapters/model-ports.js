/*
 * Provider ports are intentionally empty in P0. They freeze the model boundary
 * without pretending a credentialed provider is connected.
 *
 * A concrete adapter must:
 * - read its endpoint/key from the server environment;
 * - accept only the allowlisted contract below;
 * - validate and convert the provider response;
 * - never own price, inventory, dimensions, authorization or hard constraints.
 */

export const MODEL_PORTS = Object.freeze({
  asset_understanding: {
    environment: ["ASSET_UNDERSTANDING_URL", "ASSET_UNDERSTANDING_API_KEY"],
    recommended_model: "Doubao-Seed-2.0 Lite（复杂空间推理可切 Pro）",
    output_contract: "AssetUnderstandingResult v1"
  },
  planning_agent: {
    environment: ["PLANNING_AGENT_URL", "PLANNING_AGENT_API_KEY"],
    recommended_model: "Doubao-Seed-2.0 Pro",
    output_contract: "PlanProposal v1"
  },
  render_edit: {
    environment: ["RENDER_EDIT_URL", "RENDER_EDIT_API_KEY"],
    recommended_model: "Doubao-Seedream-5.0-lite 图片编辑 API",
    output_contract: "RenderEditResult v1"
  },
  segmentation: {
    environment: ["SEGMENTATION_URL", "SEGMENTATION_API_KEY"],
    recommended_model: "检测与分割专用模型（bbox + mask），不使用通用 Agent",
    output_contract: "SegmentationResult v1"
  }
});

export class ProviderNotConfiguredError extends Error {
  constructor(portName) {
    super(`${portName} provider 尚未配置`);
    this.name = "ProviderNotConfiguredError";
    this.code = "provider_not_configured";
    this.portName = portName;
  }
}

export class UnconfiguredModelPort {
  constructor(name) {
    if (!MODEL_PORTS[name]) throw new Error(`未知模型端口 ${name}`);
    this.name = name;
    this.capability = MODEL_PORTS[name];
  }

  async invoke() {
    throw new ProviderNotConfiguredError(this.name);
  }
}
