import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvironment } from "../services/orchestrator/src/local-env.js";
import { loadConfig } from "../services/orchestrator/src/config.js";
import { createPlatform } from "../services/orchestrator/src/platform.js";

const PROJECT_ROOT = resolve(
  fileURLToPath(new URL("../", import.meta.url))
);
const ARTIFACT_DIRECTORY = join(
  PROJECT_ROOT,
  "artifacts",
  "first-live-benchmark"
);
const SOURCE_SCENE = join(
  PROJECT_ROOT,
  "data",
  "private-media",
  "media-3ad85aa3-77d4-4aa9-9443-2dfc5544c8f0.png"
);
const SOURCE_COMPONENT = join(
  ARTIFACT_DIRECTORY,
  "component-mushroom-lamp.png"
);

const wait = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

async function waitForSpaceParse(platform, actorId, assetId) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const detail = platform.assetService.detail(actorId, assetId);
    if (["needs_confirmation", "ready", "failed"].includes(detail.parse_state)) {
      return detail;
    }
    await wait(250);
  }
  throw new Error("space parse timed out");
}

async function waitForGeneration(platform, actorId, runId) {
  let lastPhase = "";
  for (let attempt = 0; attempt < 1800; attempt += 1) {
    const run = platform.planService.getRun(actorId, runId);
    const phase = `${run.status}:${run.phase}:${run.phase_index}/${run.phase_total}`;
    if (phase !== lastPhase) {
      console.log(`[generation] ${phase}`);
      lastPhase = phase;
    }
    if (["succeeded", "failed", "cancelled"].includes(run.status)) return run;
    await wait(500);
  }
  throw new Error("generation run timed out");
}

function writeRenderedImage(platform, actorId, afterRef) {
  const prefix = "asset://private-media/";
  if (!afterRef?.startsWith(prefix)) {
    throw new Error(`unexpected rendered media reference: ${afterRef}`);
  }
  const mediaId = afterRef.slice(prefix.length);
  const media = platform.mediaService.getForProvider(actorId, mediaId);
  const encoded = media.dataUrl.slice(media.dataUrl.indexOf(",") + 1);
  const extension =
    media.mediaType === "image/png"
      ? ".png"
      : media.mediaType === "image/webp"
        ? ".webp"
        : ".jpg";
  const outputPath = join(ARTIFACT_DIRECTORY, `result${extension}`);
  writeFileSync(outputPath, Buffer.from(encoded, "base64"));
  return { mediaId, outputPath };
}

loadLocalEnvironment();
const config = loadConfig();
if (config.backendMode === "demo" || !config.agentPlanApiKey) {
  throw new Error(
    "live benchmark requires AI_BACKEND_MODE=auto/live and AGENT_PLAN_API_KEY"
  );
}

mkdirSync(ARTIFACT_DIRECTORY, { recursive: true });
copyFileSync(SOURCE_SCENE, join(ARTIFACT_DIRECTORY, "scene-before.png"));

const platform = createPlatform({ config });
try {
  const actorId = platform.actorId;
  console.log(
    `[config] text=${config.agentPlanTextModel} image=${config.agentPlanImageModel}`
  );

  const sceneBytes = readFileSync(SOURCE_SCENE);
  const sceneMedia = platform.mediaService.create(actorId, {
    file: {
      filename: `first-live-scene${extname(SOURCE_SCENE)}`,
      contentType: "image/png",
      bytes: sceneBytes
    },
    purpose: "space_source",
    retention: "temporary"
  });
  const createdSpace = platform.assetService.create(actorId, {
    schema_version: "1.0",
    asset_type: "space",
    lifecycle: "saved",
    media_ids: [sceneMedia.media_id],
    provenance: { kind: "upload" },
    attributes: {
      name: "首跑基准｜双屏真实工作桌",
      scene_type: "desk_corner",
      reference_width_cm: 160
    }
  });
  console.log(`[space] created ${createdSpace.value.asset_id}`);
  const parsedSpace = await waitForSpaceParse(
    platform,
    actorId,
    createdSpace.value.asset_id
  );
  if (parsedSpace.parse_state === "failed") {
    throw new Error("space parsing failed");
  }
  const sealedSpace = platform.assetService.patchSpaceVersion(
    actorId,
    createdSpace.value.asset_id,
    parsedSpace.current_space_version_id,
    {
      schema_version: "1.0",
      resource_version: parsedSpace.current_space_version.resource_version,
      changes: {
        reference_width_cm: 160,
        editable_region_id: "desktop-and-back-wall",
        seal: true
      }
    }
  );
  console.log(`[space] sealed ${sealedSpace.space_version_id}`);

  const componentMedia = platform.mediaService.create(actorId, {
    file: {
      filename: "mushroom-lamp-selection.png",
      contentType: "image/png",
      bytes: readFileSync(SOURCE_COMPONENT)
    },
    purpose: "visual_search_query",
    retention: "temporary"
  });
  const visualQuery = await platform.createVisualSearchQuery(actorId, {
    schema_version: "1.0",
    query_media_id: componentMedia.media_id,
    source_context: {
      provider: "benchmark_video_frame",
      external_content_id: "first-live-mushroom-lamp",
      author_display: "首跑基准素材",
      caption: "暖白色蘑菇造型桌面氛围灯",
      timestamp_ms: 4200,
      selection_bbox: {
        x: 0.509,
        y: 0.392,
        width: 0.11,
        height: 0.267
      }
    },
    options: {
      max_candidates: 4,
      search_scope: ["same_item", "similar_item"]
    }
  });
  if (visualQuery.status !== "succeeded") {
    throw new Error(
      `component understanding failed: ${JSON.stringify(visualQuery.error)}`
    );
  }
  console.log(
    `[component] ${visualQuery.source_mode} ${visualQuery.component_identity.category_code} ${visualQuery.component_identity.label}`
  );
  const componentCandidate =
    visualQuery.candidates.find(
      (item) => item.product_id === "prod-green-mushroom-lamp"
    ) || visualQuery.candidates[0];
  if (!componentCandidate) {
    throw new Error("component search returned no candidates");
  }
  const componentSelection = platform.selectVisualSearchCandidate(
    actorId,
    visualQuery.visual_search_query_id,
    {
      schema_version: "1.0",
      candidate_id: componentCandidate.candidate_id,
      asset_lifecycle: "saved",
      modeling_mode: "preview_2d"
    }
  );
  console.log(
    `[component] saved ${componentSelection.source_component.source_component_id} -> ${componentCandidate.product_id}`
  );

  const detectedObjects =
    parsedSpace.attributes?.detected_objects ||
    platform.repository.get(
      "spaceVersions",
      actorId,
      sealedSpace.space_version_id
    ).attributes?.detected_objects ||
    [];
  const keepDetectedObjectIds = detectedObjects
    .filter((item) => ["desk", "chair", "monitor"].includes(item.category))
    .map((item) => item.detected_object_id);
  const designRequest = platform.designRequestService.create(
    actorId,
    {
      schema_version: "1.0",
      trigger: "video_apply",
      space_asset_id: createdSpace.value.asset_id,
      space_version_id: sealedSpace.space_version_id,
      reference_asset_ids: [componentSelection.asset.asset_id],
      goal:
        "保留双显示器、原木桌板和原始机位，把暖白蘑菇台灯作为不可替换的视觉焦点；采用暖木奶油基底并用低饱和樱粉呼应现有键盘，去除垃圾与散乱小物，完成线缆管理和分区收纳。补充商品少而精，改造前后差异一眼可见，成片达到高端家居摄影质感。",
      goal_codes: ["organization", "ambient_lighting"],
      constraints: {
        budget_cny: 1200,
        no_drilling: true,
        keep_detected_object_ids: keepDetectedObjectIds,
        pet_context: "none"
      },
      options: {
        analysis_mode: "auto",
        include_trace: true,
        experience_contract: "renewal-card/2.1",
        preferred_style_key: "warm"
      }
    },
    { internal: true }
  );
  if (!designRequest.can_start_generation) {
    throw new Error(
      `design request is blocked: ${JSON.stringify(designRequest.missing_fields)}`
    );
  }
  console.log(`[design] ${designRequest.design_request_id}`);

  const started = platform.planService.startRun(
    actorId,
    designRequest.design_request_id,
    { schema_version: "1.0", reason: "initial" }
  );
  console.log(`[generation] started ${started.generation_run_id}`);
  const completed = await waitForGeneration(
    platform,
    actorId,
    started.generation_run_id
  );
  if (completed.status !== "succeeded") {
    const rawFailure = platform.repository.get(
      "generationRuns",
      actorId,
      started.generation_run_id
    );
    writeFileSync(
      join(ARTIFACT_DIRECTORY, "failure.json"),
      JSON.stringify(
        {
          run: completed,
          diagnostics: rawFailure.failure_diagnostics || null
        },
        null,
        2
      )
    );
    throw new Error(`generation ${completed.status}`);
  }

  const rawRun = platform.repository.get(
    "generationRuns",
    actorId,
    started.generation_run_id
  );
  const rawPlanVersion = rawRun.result.plan_version;
  const rendered = writeRenderedImage(
    platform,
    actorId,
    rawPlanVersion.aicard.render.after_ref
  );
  const artifacts = rawPlanVersion.pipeline_artifacts;
  const manifest = {
    completed_at: new Date().toISOString(),
    maturity: "runtime_static",
    models: {
      text: config.agentPlanTextModel,
      image: config.agentPlanImageModel
    },
    inputs: {
      scene: "scene-before.png",
      style_key: "warm",
      style_label: "暖木奶油 × 低饱和樱粉",
      source_component: "component-mushroom-lamp.png",
      component_identity: visualQuery.component_identity,
      selected_candidate: componentCandidate
    },
    ids: {
      space_asset_id: createdSpace.value.asset_id,
      space_version_id: sealedSpace.space_version_id,
      visual_search_query_id: visualQuery.visual_search_query_id,
      source_component_asset_id: componentSelection.asset.asset_id,
      source_component_id:
        componentSelection.source_component.source_component_id,
      design_request_id: designRequest.design_request_id,
      generation_run_id: started.generation_run_id,
      plan_asset_id: rawRun.result.plan_asset_id,
      plan_version_id: rawPlanVersion.plan_version_id,
      render_media_id: rendered.mediaId
    },
    outputs: {
      result_image: rendered.outputPath,
      source_mode: rawPlanVersion.source_mode,
      render_attempts: artifacts.render_attempts,
      layout_plan: artifacts.layout_plan,
      product_slots: artifacts.product_slots,
      selected_products: artifacts.selected_products
    }
  };
  const manifestPath = join(ARTIFACT_DIRECTORY, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`[result] ${rendered.outputPath}`);
  console.log(`[manifest] ${manifestPath}`);
} finally {
  await platform.close();
}
