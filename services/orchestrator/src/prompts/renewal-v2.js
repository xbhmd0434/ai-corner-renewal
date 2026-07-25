export const RENEWAL_LAYOUT_PROMPT_VERSION = "layout-planner-v2.0.0";
export const RENEWAL_RENDER_PROMPT_VERSION = "render-spec-builder-v2.0.0";
export const RENEWAL_RENDER_EVALUATOR_PROMPT_VERSION = "render-evaluator-v1.0.0";

const STYLE_PRESETS = Object.freeze({
  warm: {
    label: "原木呼吸感",
    palette: ["燕麦白", "浅橡木", "暖琥珀光"],
    materials: ["浅色木材", "亚麻", "陶瓷"],
    mood: "温暖、松弛、克制但有生活感"
  },
  compact: {
    label: "高效收纳",
    palette: ["雾灰", "深胡桃木", "少量黑色"],
    materials: ["木材", "哑光金属", "织物"],
    mood: "清晰、秩序化、利落且不显拥挤"
  },
  green: {
    label: "轻绿治愈",
    palette: ["鼠尾草绿", "亚麻米", "暖白"],
    materials: ["竹木", "藤编", "亚麻", "陶瓷"],
    mood: "自然、安静、有层次的治愈感"
  }
});

export function stylePreset(styleKey = "warm") {
  return STYLE_PRESETS[styleKey] || STYLE_PRESETS.warm;
}

export function buildFormalLayoutPrompt({
  roomProfile,
  sourceComponent,
  styleKey,
  goal,
  constraints
}) {
  const preset = stylePreset(styleKey);
  return [
    `prompt_version=${RENEWAL_LAYOUT_PROMPT_VERSION}`,
    "你是正式空间焕新规划 Agent。图片顺序固定：图1是用户真实空间；如果有图2，图2是用户从视频关键帧圈选并确认的 SourceComponent 裁剪图。",
    "SourceComponent 是不可替换锚点：必须原样作为方案焦点放入空间，不得改成同类替代品，不得忽略，不得把它写进 product_slots。",
    "product_slots 只描述为了让整体构图完整、惊艳、可落地而需要补充的其他可移动商品；不得包含品牌、SKU、价格、库存、链接。",
    "保持原图相机机位、画幅、透视、墙体、门窗、踢脚线、插座、采光方向和用户要求保留的大型家具不变。",
    "规划需要让改造前后差异一眼可见，同时遵守真实尺度、重力、遮挡、通行和安装约束。",
    `预设风格：${preset.label}；色板：${preset.palette.join("、")}；材质：${preset.materials.join("、")}；氛围：${preset.mood}。`,
    `用户目标：${goal || "把选中的组件自然地融入空间，并形成完整、有记忆点的焕新效果"}。`,
    `空间事实：${JSON.stringify(roomProfile || {})}`,
    `SourceComponent：${JSON.stringify(sourceComponent || null)}`,
    `硬约束：${JSON.stringify(constraints || {})}`,
    "actions 只允许 organize_loose_items、remove_trash、add。若有 SourceComponent，必须有一条 add action，target 精确写成 source_component:<source_component_id>。",
    "product_slots 最多5个，每个 slot 都要包含摆放位置、支撑面、净空约束和1~4条中文搜索词。",
    "严格返回 JSON，不要 Markdown、解释或额外字段。status 只能是 ready 或 needs_input。",
    '{"status":"ready","needs_input_reason":"","scene":{"scene_type":"字符串","primary_function":"字符串","existing_style":"字符串","dominant_colors":[],"main_materials":[],"lighting":"字符串","editable_area":"字符串"},"preserve":[{"object":"字符串","reason":"字符串"}],"problems":[{"type":"字符串","area":"字符串","evidence":"字符串","priority":1}],"design_direction":{"goal":"字符串","focal_point":"字符串","palette":[],"materials":[],"spatial_strategy":"字符串"},"actions":[{"type":"add","target":"source_component:source-component-id","placement":"字符串","instruction":"字符串","reason":"字符串"}],"product_slots":[{"slot_id":"supplement-1","category":"lighting","purpose":"字符串","quantity":1,"size_constraint":"字符串","color":"字符串","material":"字符串","placement":"字符串","support":"字符串","clearance_constraints":[],"douyin_search_queries":["字符串"]}],"render_instruction":"字符串","negative_constraints":[]}'
  ].join("\n");
}

export function buildFormalRenderPrompt({
  layoutPlan,
  sourceComponent,
  styleKey,
  products,
  repairInstruction = ""
}) {
  const preset = stylePreset(styleKey);
  const sourceProductId =
    sourceComponent?.selected_catalog_candidate?.product_id || null;
  const supplementary = (products || [])
    .filter((item) => item.product_id !== sourceProductId)
    .map((item) => ({
      name: item.name,
      category: item.category,
      reason: item.reason
    }));
  return [
    `prompt_version=${RENEWAL_RENDER_PROMPT_VERSION}`,
    "对输入的真实空间照片做高完成度、可落地、令人眼前一亮的软装改造。图片顺序固定：图1是必须保持结构与机位的原始空间；图2是用户亲自圈选的 SourceComponent。",
    "最高优先级：把图2中的同一个 SourceComponent 原样放进图1空间。保留其可见造型、比例、颜色、材质和识别特征；不得用相似品替换，不得遗漏，不得改变为另一种商品。",
    "严格锁定图1的相机机位、焦距感、画幅、透视、墙体、门窗、踢脚线、插座、固定柜体、自然采光方向和未授权区域。",
    `整体风格：${preset.label}；色板：${preset.palette.join("、")}；材质：${preset.materials.join("、")}；气质：${preset.mood}。`,
    `SourceComponent 身份：${JSON.stringify(sourceComponent || null)}`,
    `布局规划：${JSON.stringify(layoutPlan)}`,
    `补充商品（它们不是 SourceComponent）：${JSON.stringify(supplementary)}`,
    "构图要有明确视觉焦点、前中后景层次、材质对比、灯光氛围和生活细节。新增商品必须服务于 SourceComponent 与用户场景，不要像商品堆砌。",
    "效果必须写实、比例可信、接触阴影正确、材质细节清晰，达到高端家居摄影与电影感室内视觉标准。",
    "禁止：改房型、改机位、增加门窗、遮挡主要通道、漂浮物、重复物体、畸形结构、文字、标签、价格、水印、拼图或前后对比排版。",
    ...(layoutPlan?.negative_constraints || []).map((item) => `禁止：${item}`),
    repairInstruction ? `上一次视觉校验未通过，本次必须修复：${repairInstruction}` : "",
    "只输出一张改造完成后的真实室内照片。"
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildRenderEvaluationPrompt({ sourceComponent, layoutPlan }) {
  return [
    `prompt_version=${RENEWAL_RENDER_EVALUATOR_PROMPT_VERSION}`,
    "你是效果图视觉验收 Agent。图片顺序：图1改造前空间，图2用户圈选 SourceComponent，图3生成后的效果图。",
    "检查图3是否保持图1的机位与固定结构，是否真正出现图2的同一个组件，改造是否清晰、有完成度、协调且物理可信。",
    `SourceComponent：${JSON.stringify(sourceComponent || null)}`,
    `LayoutPlan：${JSON.stringify(layoutPlan)}`,
    "hard_failures 只可使用：source_component_missing、source_component_replaced、camera_changed、fixed_structure_changed、severe_geometry_error、unusable_image。",
    `阈值：base_fidelity>=0.85，${
      sourceComponent
        ? "source_component_fidelity>=0.86，"
        : "当前没有 SourceComponent，source_component_fidelity 不参与通过判断，"
    }change_visibility>=0.72，visual_coherence>=0.70，physical_plausibility>=0.80，constraint_compliance>=0.90，clutter_risk<=0.35，且 hard_failures 为空才通过。`,
    "严格返回 JSON：",
    '{"accepted":true,"scores":{"base_fidelity":0.0,"source_component_fidelity":0.0,"change_visibility":0.0,"visual_coherence":0.0,"physical_plausibility":0.0,"constraint_compliance":0.0,"clutter_risk":0.0},"hard_failures":[],"repair_instruction":"若不通过，给下一次生图的具体修复指令；通过则为空字符串"}'
  ].join("\n");
}
