export const RENEWAL_LAYOUT_PROMPT_VERSION = "layout-planner-v2.1.0";
export const RENEWAL_RENDER_PROMPT_VERSION = "render-spec-builder-v2.1.0";
export const RENEWAL_RENDER_EVALUATOR_PROMPT_VERSION = "render-evaluator-v1.1.0";

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
    "product_slots 和普通 add action 也不得出现 SourceComponent 的同义品类。例如 SourceComponent 为 table_lamp 时，table_lamp 与 lighting 都必须排除，不能再补第二盏台灯。",
    "product_slots 只描述为了让整体构图完整、惊艳、可落地而需要补充的其他可移动商品；不得包含品牌、SKU、价格、库存、链接。",
    "保持原图相机机位、画幅、透视、墙体、门窗、踢脚线、插座、采光方向和用户要求保留的大型家具不变。",
    "规划需要让改造前后差异一眼可见，同时遵守真实尺度、重力、遮挡、通行和安装约束。",
    "如果目标包含整理、收纳、去杂物、垃圾或线缆治理，actions 必须同时包含 remove_trash 与 organize_loose_items；render_instruction 必须明确禁止把原图散乱物原样复制到效果图。",
    `预设风格：${preset.label}；色板：${preset.palette.join("、")}；材质：${preset.materials.join("、")}；氛围：${preset.mood}。`,
    `用户目标：${goal || "把选中的组件自然地融入空间，并形成完整、有记忆点的焕新效果"}。`,
    `空间事实：${JSON.stringify(roomProfile || {})}`,
    `SourceComponent：${JSON.stringify(sourceComponent || null)}`,
    `硬约束：${JSON.stringify(constraints || {})}`,
    "actions 只允许 organize_loose_items、remove_trash、add，总数必须为1~8项，并按必要性从高到低排列。若有 SourceComponent，必须有一条 add action，target 精确写成 source_component:<source_component_id>。",
    "product_slots 最多4个，按对整体效果的必要性从高到低排列；宁可少而精，不得为了凑数添加相似或重复品类。每个 slot 都要包含摆放位置、支撑面、净空约束和1~4条中文搜索词。",
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
    "若 LayoutPlan 包含 remove_trash 或 organize_loose_items，必须真实移除垃圾、包装、空瓶和大部分无序小物，只保留必要输入设备与少量有意图的陈设；不能仅增加收纳盒却把原杂物继续散放在桌面。",
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
    "hard_failures 只可使用：source_component_missing、source_component_replaced、duplicate_source_category、camera_changed、fixed_structure_changed、severe_geometry_error、clutter_not_reduced、unusable_image。",
    "必须先做可核验观察再评分：比较改造前后可见散乱小物、空瓶、包装和线缆，输出 before_clutter_level/after_clutter_level；估算真正消失或被合理收纳的比例 clutter_reduction_ratio；确认整理动作是否在图中真实可见；统计 SourceComponent 数量和额外同品类商品数量。",
    "若 LayoutPlan 含 remove_trash 或 organize_loose_items，则 after_clutter_level 必须为 low、clutter_reduction_ratio 必须至少 0.55、organization_action_visible 必须为 true，否则 hard_failures 必须包含 clutter_not_reduced。收纳盒里装着少量分类物不算失败，但原图的大量散乱物仍在桌面必须失败。",
    "若存在 SourceComponent，source_component_count 应为 1；same_category_extra_count 必须为 0。出现第二盏灯或其他同品类重复商品时，hard_failures 必须包含 duplicate_source_category。",
    `阈值：base_fidelity>=0.85，${
      sourceComponent
        ? "source_component_fidelity>=0.86，"
        : "当前没有 SourceComponent，source_component_fidelity 不参与通过判断，"
    }change_visibility>=0.72，visual_coherence>=0.70，physical_plausibility>=0.80，constraint_compliance>=0.90，clutter_risk<=0.35，且 hard_failures 为空才通过。`,
    "严格返回 JSON：",
    '{"accepted":true,"scores":{"base_fidelity":0.0,"source_component_fidelity":0.0,"change_visibility":0.0,"visual_coherence":0.0,"physical_plausibility":0.0,"constraint_compliance":0.0,"clutter_risk":0.0},"observations":{"before_clutter_level":"high","after_clutter_level":"low","clutter_reduction_ratio":0.0,"organization_action_visible":true,"source_component_count":1,"same_category_extra_count":0},"hard_failures":[],"repair_instruction":"若不通过，给下一次生图的具体修复指令；通过则为空字符串"}'
  ].join("\n");
}
