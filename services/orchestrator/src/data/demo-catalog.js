const DEMO_UPDATED_AT = "2026-07-25T00:00:00+08:00";

const DEMO_AVAILABILITY = {
  status: "demo_available",
  source_type: "demo",
  checked_at: DEMO_UPDATED_AT,
  is_live: false
};

const DEMO_PRODUCT_SOURCE = {
  source_type: "demo",
  label: "本地结构化演示商品库（非实时）",
  updated_at: DEMO_UPDATED_AT,
  is_live: false,
  disclaimer: "价格、库存、尺寸和安全属性仅用于演示，购买前必须以真实商品页为准。"
};

export const inspirations = {
  warm: {
    inspiration_id: "demo-inspiration-warm",
    source_type: "demo",
    style_key: "warm",
    display_name: "原木呼吸感",
    style: ["japanese_natural"],
    colors: ["oat_white", "light_oak"],
    materials: ["light_wood", "linen", "ceramic"],
    transferable_elements: ["clamp_lamp", "desk_riser", "leaning_linen_board"],
    excluded_elements: ["drilled_wall_shelf"],
    is_live: false,
    source: {
      source_type: "demo",
      label: "前端原木灵感样例的结构化副本（非实时）",
      updated_at: DEMO_UPDATED_AT,
      is_live: false
    }
  },
  compact: {
    inspiration_id: "demo-inspiration-compact",
    source_type: "demo",
    style_key: "compact",
    display_name: "高效收纳版",
    style: ["modern_organized"],
    colors: ["mist_gray", "dark_walnut"],
    materials: ["wood", "matte_plastic", "metal"],
    transferable_elements: ["zoned_containers", "vertical_storage", "cable_management"],
    excluded_elements: ["drilled_pegboard"],
    is_live: false,
    source: {
      source_type: "demo",
      label: "前端现代收纳灵感样例的结构化副本（非实时）",
      updated_at: DEMO_UPDATED_AT,
      is_live: false
    }
  },
  green: {
    inspiration_id: "demo-inspiration-green",
    source_type: "demo",
    style_key: "green",
    display_name: "轻绿治愈版",
    style: ["natural_restorative"],
    colors: ["sage_green", "linen_beige"],
    materials: ["bamboo", "linen", "ceramic", "rattan"],
    transferable_elements: ["low_plants", "soft_light", "ceramic_planter"],
    excluded_elements: ["large_floor_plant_in_walkway"],
    is_live: false,
    source: {
      source_type: "demo",
      label: "前端自然治愈灵感样例的结构化副本（非实时）",
      updated_at: DEMO_UPDATED_AT,
      is_live: false
    }
  }
};

export const products = {
  "prod-warm-oak-riser": {
    product_id: "prod-warm-oak-riser",
    name: "浅橡木桌上架",
    category: "desk_riser",
    price_cny: 129,
    dimensions_cm: { width: 58, depth: 20, height: 8 },
    dimensions_label: "58 × 20 × 8cm",
    installation: "freestanding",
    pet_safe: true,
    reason: "用低矮层次抬高视觉中心，同时保留桌面两侧操作区。",
    availability: { ...DEMO_AVAILABILITY },
    source: { ...DEMO_PRODUCT_SOURCE }
  },
  "prod-warm-clamp-lamp": {
    product_id: "prod-warm-clamp-lamp",
    name: "暖白夹式台灯",
    category: "lighting",
    price_cny: 99,
    dimensions_cm: { width: null, depth: null, height: null },
    dimensions_label: "三档调光；演示数据未提供外形尺寸",
    installation: "clamp",
    pet_safe: true,
    reason: "夹装在桌边即可补充暖光，不占主要工作区，也不需要墙面打孔。",
    availability: { ...DEMO_AVAILABILITY },
    source: { ...DEMO_PRODUCT_SOURCE }
  },
  "prod-warm-linen-board": {
    product_id: "prod-warm-linen-board",
    name: "亚麻织物留言板",
    category: "display_board",
    price_cny: 79,
    dimensions_cm: { width: 40, depth: null, height: 55 },
    dimensions_label: "40 × 55cm",
    installation: "leaning",
    pet_safe: true,
    reason: "采用倚墙摆放迁移亚麻质感，替代灵感中需要打孔的墙面层板。",
    availability: { ...DEMO_AVAILABILITY },
    source: { ...DEMO_PRODUCT_SOURCE }
  },
  "prod-warm-storage-trays": {
    product_id: "prod-warm-storage-trays",
    name: "奶油白收纳盘 × 2",
    category: "desktop_storage",
    price_cny: 58,
    dimensions_cm: { width: null, depth: null, height: null },
    dimensions_label: "A5 / A6，2 件套",
    installation: "freestanding",
    pet_safe: true,
    reason: "把每日小物分区，减少桌面散落，同时延续燕麦白配色。",
    availability: { ...DEMO_AVAILABILITY },
    source: { ...DEMO_PRODUCT_SOURCE }
  },
  "prod-warm-cable-box": {
    product_id: "prod-warm-cable-box",
    name: "隐藏式理线盒",
    category: "cable_management",
    price_cny: 45,
    dimensions_cm: { width: 32, depth: null, height: null },
    dimensions_label: "长边 32cm；其余尺寸需复测",
    installation: "freestanding",
    pet_safe: true,
    reason: "集中遮挡插排和余线，降低视觉噪声并减少宠物直接接触线材。",
    availability: { ...DEMO_AVAILABILITY },
    source: { ...DEMO_PRODUCT_SOURCE }
  },
  "prod-warm-pothos-planter": {
    product_id: "prod-warm-pothos-planter",
    name: "绿萝陶盆组合",
    category: "plant",
    price_cny: 76,
    dimensions_cm: { width: null, depth: null, height: null },
    dimensions_label: "演示数据未提供尺寸",
    installation: "freestanding",
    pet_safe: false,
    reason: "提供一处柔软绿植焦点；有宠物时必须替换为明确标注的安全候选。",
    alternative_product_ids: ["prod-pet-safe-faux-plant"],
    availability: { ...DEMO_AVAILABILITY },
    source: { ...DEMO_PRODUCT_SOURCE }
  },
  "prod-compact-file-rack": {
    product_id: "prod-compact-file-rack",
    name: "立式文件架",
    category: "file_storage",
    price_cny: 69,
    dimensions_cm: { width: 32, depth: null, height: null },
    dimensions_label: "3 格 / 32cm；其余尺寸需复测",
    installation: "freestanding",
    pet_safe: true,
    reason: "将文件垂直分区并靠右摆放，避免遮挡左侧自然光。",
    availability: { ...DEMO_AVAILABILITY },
    source: { ...DEMO_PRODUCT_SOURCE }
  },
  "prod-compact-underdesk-drawer": {
    product_id: "prod-compact-underdesk-drawer",
    name: "抽拉式桌下盒",
    category: "underdesk_storage",
    price_cny: 79,
    dimensions_cm: { width: null, depth: null, height: null },
    dimensions_label: "免钉；演示数据未提供尺寸",
    installation: "no_drill_slide",
    pet_safe: true,
    reason: "隐藏充电头和备用文具，以免打孔方式释放桌面空间。",
    availability: { ...DEMO_AVAILABILITY },
    source: { ...DEMO_PRODUCT_SOURCE }
  },
  "prod-compact-monitor-riser": {
    product_id: "prod-compact-monitor-riser",
    name: "屏幕增高架",
    category: "monitor_riser",
    price_cny: 88,
    dimensions_cm: { width: 52, depth: null, height: null },
    dimensions_label: "宽 52cm；深度和高度需复测",
    installation: "freestanding",
    pet_safe: true,
    reason: "建立单一视觉中心，并为键盘或文件留出下方收纳空间。",
    availability: { ...DEMO_AVAILABILITY },
    source: { ...DEMO_PRODUCT_SOURCE }
  },
  "prod-compact-magnetic-clips": {
    product_id: "prod-compact-magnetic-clips",
    name: "磁吸理线扣 × 6",
    category: "cable_management",
    price_cny: 39,
    dimensions_cm: { width: null, depth: null, height: null },
    dimensions_label: "6 枚；演示数据未提供单枚尺寸",
    installation: "removable_adhesive",
    pet_safe: true,
    reason: "固定三条常用线材的出口，可移胶满足租房可恢复要求。",
    availability: { ...DEMO_AVAILABILITY },
    source: { ...DEMO_PRODUCT_SOURCE }
  },
  "prod-compact-sorting-cups": {
    product_id: "prod-compact-sorting-cups",
    name: "桌面分类杯",
    category: "desktop_storage",
    price_cny: 53,
    dimensions_cm: { width: null, depth: null, height: null },
    dimensions_label: "2 件套；演示数据未提供尺寸",
    installation: "freestanding",
    pet_safe: true,
    reason: "将每日使用的文具按用途分开，支持快速任务切换。",
    availability: { ...DEMO_AVAILABILITY },
    source: { ...DEMO_PRODUCT_SOURCE }
  },
  "prod-green-bamboo-riser": {
    product_id: "prod-green-bamboo-riser",
    name: "竹木桌上架",
    category: "desk_riser",
    price_cny: 138,
    dimensions_cm: { width: 60, depth: 22, height: null },
    dimensions_label: "60 × 22cm；高度需复测",
    installation: "freestanding",
    pet_safe: true,
    reason: "用竹木建立轻盈层次，同时将材质数量控制在自然材质范围内。",
    availability: { ...DEMO_AVAILABILITY },
    source: { ...DEMO_PRODUCT_SOURCE }
  },
  "prod-green-mushroom-lamp": {
    product_id: "prod-green-mushroom-lamp",
    name: "暖光蘑菇灯",
    category: "lighting",
    price_cny: 89,
    dimensions_cm: { width: null, depth: null, height: null },
    dimensions_label: "USB 供电；演示数据未提供外形尺寸",
    installation: "freestanding",
    pet_safe: true,
    reason: "在右后侧形成不直射屏幕的夜间暖光层次。",
    availability: { ...DEMO_AVAILABILITY },
    source: { ...DEMO_PRODUCT_SOURCE }
  },
  "prod-green-linen-mat": {
    product_id: "prod-green-linen-mat",
    name: "亚麻桌垫",
    category: "desk_mat",
    price_cny: 69,
    dimensions_cm: { width: 70, depth: 35, height: null },
    dimensions_label: "70 × 35cm",
    installation: "freestanding",
    pet_safe: true,
    reason: "用单一亚麻底面收拢键盘区，并保留前方工作留白。",
    availability: { ...DEMO_AVAILABILITY },
    source: { ...DEMO_PRODUCT_SOURCE }
  },
  "prod-green-peperomia-planter": {
    product_id: "prod-green-peperomia-planter",
    name: "豆瓣绿陶盆",
    category: "plant",
    price_cny: 58,
    dimensions_cm: { width: null, depth: null, height: null },
    dimensions_label: "低矮耐阴；演示数据未提供尺寸",
    installation: "freestanding",
    pet_safe: true,
    reason: "低矮体量适合放在右侧，不遮挡左侧采光或窗边开合。",
    availability: { ...DEMO_AVAILABILITY },
    source: { ...DEMO_PRODUCT_SOURCE }
  },
  "prod-green-fern-vase": {
    product_id: "prod-green-fern-vase",
    name: "蕨类水培瓶",
    category: "plant",
    price_cny: 66,
    dimensions_cm: { width: null, depth: null, height: null },
    dimensions_label: "小型；演示数据未提供尺寸",
    installation: "freestanding",
    pet_safe: null,
    reason: "补充一高一低的绿植层次；具体蕨类品种和水培液安全性需要确认。",
    alternative_product_ids: ["prod-pet-safe-faux-plant"],
    availability: { ...DEMO_AVAILABILITY },
    source: { ...DEMO_PRODUCT_SOURCE }
  },
  "prod-green-rattan-baskets": {
    product_id: "prod-green-rattan-baskets",
    name: "藤编收纳篮",
    category: "desktop_storage",
    price_cny: 79,
    dimensions_cm: { width: null, depth: null, height: null },
    dimensions_label: "2 件套；演示数据未提供尺寸",
    installation: "freestanding",
    pet_safe: true,
    reason: "隐藏低频零碎物，同时延续自然材质但不增加新的主色。",
    availability: { ...DEMO_AVAILABILITY },
    source: { ...DEMO_PRODUCT_SOURCE }
  },
  "prod-green-wood-cable-clips": {
    product_id: "prod-green-wood-cable-clips",
    name: "木质理线器",
    category: "cable_management",
    price_cny: 53,
    dimensions_cm: { width: null, depth: null, height: null },
    dimensions_label: "4 枚；演示数据未提供单枚尺寸",
    installation: "removable_adhesive",
    pet_safe: true,
    reason: "固定常用线材出口，并让理线配件融入浅木材质体系。",
    availability: { ...DEMO_AVAILABILITY },
    source: { ...DEMO_PRODUCT_SOURCE }
  },
  "prod-pet-safe-faux-plant": {
    product_id: "prod-pet-safe-faux-plant",
    name: "宠物友好仿真绿植摆件（演示替代）",
    category: "plant_alternative",
    price_cny: 76,
    dimensions_cm: { width: 14, depth: 14, height: 22 },
    dimensions_label: "14 × 14 × 22cm",
    installation: "freestanding",
    pet_safe: true,
    reason: "作为有宠物场景的演示替代，避开绿萝和品种不明水培植物；真实材质仍需在购买前核验。",
    replacement_for: "prod-warm-pothos-planter",
    alternative_for_product_ids: [
      "prod-warm-pothos-planter",
      "prod-green-fern-vase"
    ],
    availability: { ...DEMO_AVAILABILITY },
    source: {
      ...DEMO_PRODUCT_SOURCE,
      label: "本地宠物安全替代测试数据（非实时）"
    }
  },
  "prod-test-drilled-wall-shelf": {
    product_id: "prod-test-drilled-wall-shelf",
    name: "固定式墙面层板（约束测试候选）",
    category: "wall_shelf",
    price_cny: 119,
    dimensions_cm: { width: 60, depth: 20, height: 2 },
    dimensions_label: "60 × 20 × 2cm",
    installation: "requires_drilling",
    pet_safe: true,
    reason: "仅用于验证 no_drilling 过滤规则；明确禁止进入任何默认演示方案。",
    eligible_for_default_plan: false,
    availability: { ...DEMO_AVAILABILITY },
    source: {
      ...DEMO_PRODUCT_SOURCE,
      label: "本地硬约束负例测试数据（非实时）"
    }
  }
};

export const tutorials = [
  {
    tutorial_id: "tutorial-warm-no-drill-reset",
    style_key: "warm",
    title: "35 分钟免打孔原木桌面整理",
    duration_minutes: 35,
    difficulty: "easy",
    task_tags: ["declutter", "desk_riser", "cable_management", "no_drilling"],
    related_product_ids: [
      "prod-warm-oak-riser",
      "prod-warm-linen-board",
      "prod-warm-cable-box"
    ],
    is_live: false,
    source: {
      source_type: "demo",
      label: "本地教程演示条目（非真实视频）",
      updated_at: DEMO_UPDATED_AT,
      is_live: false
    }
  },
  {
    tutorial_id: "tutorial-compact-zoning",
    style_key: "compact",
    title: "25 分钟按频率完成桌面分区",
    duration_minutes: 25,
    difficulty: "minimal",
    task_tags: ["frequency_zoning", "vertical_storage", "cable_management", "no_drilling"],
    related_product_ids: [
      "prod-compact-file-rack",
      "prod-compact-underdesk-drawer",
      "prod-compact-magnetic-clips"
    ],
    is_live: false,
    source: {
      source_type: "demo",
      label: "本地教程演示条目（非真实视频）",
      updated_at: DEMO_UPDATED_AT,
      is_live: false
    }
  },
  {
    tutorial_id: "tutorial-green-workspace",
    style_key: "green",
    title: "45 分钟布置低矮绿植与柔光",
    duration_minutes: 45,
    difficulty: "easy",
    task_tags: ["workspace_clearance", "low_plants", "ambient_lighting", "no_drilling"],
    related_product_ids: [
      "prod-green-bamboo-riser",
      "prod-green-peperomia-planter",
      "prod-green-mushroom-lamp"
    ],
    is_live: false,
    source: {
      source_type: "demo",
      label: "本地教程演示条目（非真实视频）",
      updated_at: DEMO_UPDATED_AT,
      is_live: false
    }
  }
];

export const planTemplates = {
  warm: {
    plan_id: "plan-warm-v1",
    style_key: "warm",
    room_id: "demo-room-001",
    inspiration_id: "demo-inspiration-warm",
    version: 1,
    title: "原木呼吸感",
    summary: "保留桌椅和左侧自然采光，以低矮桌上架、暖光与亚麻质感重整视觉中心，全程免打孔。",
    total_price_cny: 486,
    product_ids: [
      "prod-warm-oak-riser",
      "prod-warm-clamp-lamp",
      "prod-warm-linen-board",
      "prod-warm-storage-trays",
      "prod-warm-cable-box",
      "prod-warm-pothos-planter"
    ],
    preserved_elements: ["desk", "chair", "wall", "window", "left_natural_light"],
    placements: [
      {
        product_id: "prod-warm-oak-riser",
        zone: "desktop_center_back",
        instruction: "桌上架沿桌面后缘居中，左右各保留至少 20cm 操作区。",
        clearance_cm: { left: 20, right: 20 }
      },
      {
        product_id: "prod-warm-clamp-lamp",
        zone: "desktop_left_back",
        instruction: "夹在桌面左后侧，灯头避开屏幕反光方向。",
        clearance_cm: { from_screen: 15 }
      },
      {
        product_id: "prod-warm-linen-board",
        zone: "wall_leaning_zone",
        instruction: "直接倚墙放在桌上架后方，不粘贴、不打孔。",
        clearance_cm: { from_wall: 0 }
      },
      {
        product_id: "prod-warm-storage-trays",
        zone: "desktop_right",
        instruction: "A5 与 A6 收纳盘按使用频率叠放在右侧。",
        clearance_cm: { from_desk_edge: 5 }
      },
      {
        product_id: "prod-warm-cable-box",
        zone: "desktop_back",
        instruction: "插排和余线统一收入桌面后缘的理线盒。",
        clearance_cm: { ventilation: 5 }
      },
      {
        product_id: "prod-warm-pothos-planter",
        zone: "desktop_right_back",
        instruction: "作为低矮焦点放在右后侧；有宠物时替换为安全候选。",
        clearance_cm: { from_keyboard: 20 }
      }
    ],
    steps: [
      {
        order: 1,
        title: "清空并分区",
        instruction: "桌面只保留每日使用物，低频物品移入抽屉。",
        verification: "键盘、鼠标与书写区内没有低频杂物。"
      },
      {
        order: 2,
        title: "抬高视觉中心",
        instruction: "桌上架居中，左右各留至少 20cm 操作区。",
        verification: "桌上架稳定，左右操作区均未被占用。"
      },
      {
        order: 3,
        title: "整理光线与线材",
        instruction: "灯放左后侧；电源和余线统一收入理线盒。",
        verification: "灯光不直射屏幕，常用线材可以正常拉动。"
      },
      {
        order: 4,
        title: "补一处柔软焦点",
        instruction: "亚麻板直接倚墙，不粘贴、不打孔；按宠物情况选择绿植。",
        verification: "墙面无新增孔洞，绿植不侵占键盘操作区。"
      }
    ],
    render_ref: "demo-after-warm",
    assumptions: [
      "desk_width_at_least_100cm",
      "desk_depth_at_least_55cm",
      "left_light_source_confirmed",
      "product_dimensions_with_null_values_need_remeasurement"
    ],
    constraint_tags: ["no_drilling", "keep_desk", "keep_chair"],
    tutorial_ids: ["tutorial-warm-no-drill-reset"],
    estimated_minutes: 35,
    difficulty: "easy",
    source_mode: "demo",
    is_live: false
  },
  compact: {
    plan_id: "plan-compact-v1",
    style_key: "compact",
    room_id: "demo-room-001",
    inspiration_id: "demo-inspiration-compact",
    version: 1,
    title: "高效收纳版",
    summary: "减少装饰，把预算集中在线材、文件和常用小物分区，适合任务切换频繁的桌面。",
    total_price_cny: 328,
    product_ids: [
      "prod-compact-file-rack",
      "prod-compact-underdesk-drawer",
      "prod-compact-monitor-riser",
      "prod-compact-magnetic-clips",
      "prod-compact-sorting-cups"
    ],
    budget_order: [
      "prod-compact-file-rack",
      "prod-compact-underdesk-drawer",
      "prod-compact-magnetic-clips",
      "prod-compact-sorting-cups",
      "prod-compact-monitor-riser"
    ],
    minimum_product_ids: [
      "prod-compact-file-rack",
      "prod-compact-underdesk-drawer",
      "prod-compact-magnetic-clips"
    ],
    preserved_elements: ["desk", "chair", "wall", "window", "left_natural_light"],
    placements: [
      {
        product_id: "prod-compact-file-rack",
        zone: "desktop_right_back",
        instruction: "文件架靠右后侧，避免遮挡左侧自然光。",
        clearance_cm: { from_desk_edge: 5 }
      },
      {
        product_id: "prod-compact-underdesk-drawer",
        zone: "underdesk_right",
        instruction: "抽拉盒固定在右侧桌板下，避开腿部活动范围。",
        clearance_cm: { knee_space: 10 }
      },
      {
        product_id: "prod-compact-monitor-riser",
        zone: "desktop_center_back",
        instruction: "屏幕增高架居中，正面保留键盘收纳空间。",
        clearance_cm: { from_desk_back: 3 }
      },
      {
        product_id: "prod-compact-magnetic-clips",
        zone: "desktop_back",
        instruction: "在桌后固定三条常用线出口，其余线材收入桌下。",
        clearance_cm: { between_cables: 3 }
      },
      {
        product_id: "prod-compact-sorting-cups",
        zone: "desktop_right",
        instruction: "分类杯放在文件架前方，只保留每日使用文具。",
        clearance_cm: { from_keyboard: 15 }
      }
    ],
    steps: [
      {
        order: 1,
        title: "按使用频率分三类",
        instruction: "每天、每周、低频物品分别处理。",
        verification: "桌面仅保留每日使用物品。"
      },
      {
        order: 2,
        title: "垂直收纳文件",
        instruction: "文件架靠右，避免遮挡左侧自然光。",
        verification: "文件标签可见，窗边采光未被遮挡。"
      },
      {
        order: 3,
        title: "隐藏零碎物",
        instruction: "抽拉盒放置充电头和备用文具。",
        verification: "抽拉盒开合顺畅且不碰腿。"
      },
      {
        order: 4,
        title: "固定线材出口",
        instruction: "桌后预留三条常用线，其余收入盒中。",
        verification: "常用线能到达设备，桌面无多余线圈。"
      }
    ],
    render_ref: "demo-after-warm",
    assumptions: [
      "desk_width_at_least_90cm",
      "underdesk_surface_accepts_no_drill_slide",
      "left_light_source_confirmed",
      "product_dimensions_with_null_values_need_remeasurement"
    ],
    constraint_tags: ["no_drilling", "keep_desk", "keep_chair", "pet_safe"],
    tutorial_ids: ["tutorial-compact-zoning"],
    estimated_minutes: 25,
    difficulty: "minimal",
    source_mode: "demo",
    is_live: false
  },
  green: {
    plan_id: "plan-green-v1",
    style_key: "green",
    room_id: "demo-room-001",
    inspiration_id: "demo-inspiration-green",
    version: 1,
    title: "轻绿治愈版",
    summary: "用自然材质和两株低矮绿植缓和工作感，植物避开主操作区并保留左侧采光和桌面留白。",
    total_price_cny: 552,
    product_ids: [
      "prod-green-bamboo-riser",
      "prod-green-mushroom-lamp",
      "prod-green-linen-mat",
      "prod-green-peperomia-planter",
      "prod-green-fern-vase",
      "prod-green-rattan-baskets",
      "prod-green-wood-cable-clips"
    ],
    preserved_elements: ["desk", "chair", "wall", "window", "left_natural_light"],
    placements: [
      {
        product_id: "prod-green-bamboo-riser",
        zone: "desktop_center_back",
        instruction: "竹木桌上架居中，前方保留完整键盘区。",
        clearance_cm: { front_workspace: 25 }
      },
      {
        product_id: "prod-green-mushroom-lamp",
        zone: "desktop_right_back",
        instruction: "蘑菇灯放右后侧，光线不直射屏幕。",
        clearance_cm: { from_screen: 15 }
      },
      {
        product_id: "prod-green-linen-mat",
        zone: "desktop_center",
        instruction: "桌垫沿键盘区铺平，前方保留至少 25cm 工作空间。",
        clearance_cm: { front_workspace: 25 }
      },
      {
        product_id: "prod-green-peperomia-planter",
        zone: "desktop_right_back",
        instruction: "低矮豆瓣绿放在右后侧，不挡窗边开合。",
        clearance_cm: { from_window: 15 }
      },
      {
        product_id: "prod-green-fern-vase",
        zone: "desktop_right",
        instruction: "水培瓶与豆瓣绿形成一高一低组合，并远离桌边。",
        clearance_cm: { from_desk_edge: 10 }
      },
      {
        product_id: "prod-green-rattan-baskets",
        zone: "desktop_riser_under",
        instruction: "藤编篮放在桌上架下方，收纳低频零碎物。",
        clearance_cm: { pull_out_space: 10 }
      },
      {
        product_id: "prod-green-wood-cable-clips",
        zone: "desktop_back",
        instruction: "木质理线器沿桌后缘固定四条线材出口。",
        clearance_cm: { between_cables: 3 }
      }
    ],
    steps: [
      {
        order: 1,
        title: "先确定工作留白",
        instruction: "键盘区前方保留至少 25cm 空间。",
        verification: "桌垫和收纳均未进入前方留白区。"
      },
      {
        order: 2,
        title: "绿植一高一低",
        instruction: "两株植物均放右侧，避免影响窗边开合。",
        verification: "窗户可完整开合，花盆距离桌边至少 10cm。"
      },
      {
        order: 3,
        title: "收拢材质数量",
        instruction: "主视觉只使用浅木、亚麻、陶器三类材质。",
        verification: "新增物品没有引入高饱和主色或第四种主材质。"
      },
      {
        order: 4,
        title: "夜间补一处暖光",
        instruction: "小灯不直射屏幕，形成背景层次。",
        verification: "坐姿视角下屏幕无明显灯具反光。"
      }
    ],
    render_ref: "demo-after-warm",
    assumptions: [
      "desk_width_at_least_110cm",
      "desk_depth_at_least_60cm",
      "window_opening_clearance_confirmed",
      "fern_species_and_hydroponic_solution_need_confirmation",
      "product_dimensions_with_null_values_need_remeasurement"
    ],
    constraint_tags: ["no_drilling", "keep_desk", "keep_chair"],
    tutorial_ids: ["tutorial-green-workspace"],
    estimated_minutes: 45,
    difficulty: "easy",
    source_mode: "demo",
    is_live: false
  }
};

export const defaultRoomProfile = {
  room_id: "demo-room-001",
  room_type: "desk_corner",
  reference_width_cm: 120,
  fixed_elements: ["wall", "window", "desk", "chair"],
  editable_zones: ["desktop", "desktop_back", "underdesk_right", "wall_leaning_zone"],
  lighting: {
    direction: "left",
    confidence: 0.82
  },
  uncertainties: ["desk_depth", "socket_position"],
  needs_confirmation: ["desk_depth", "socket_position"],
  source_mode: "demo",
  is_live: false,
  source: {
    source_type: "demo",
    label: "默认书桌空间演示档案（非实时识别）",
    updated_at: DEMO_UPDATED_AT,
    is_live: false
  }
};

export const dataSources = [
  {
    data_source_id: "source-demo-inspirations-v1",
    kind: "inspiration_profiles",
    source_type: "demo",
    label: "前端三套灵感样例结构化数据",
    updated_at: DEMO_UPDATED_AT,
    is_live: false,
    disclaimer: "不是实时抖音内容解析结果，不包含真实用户或作者数据。"
  },
  {
    data_source_id: "source-demo-products-v1",
    kind: "product_catalog",
    source_type: "demo",
    label: "本地演示商品目录",
    updated_at: DEMO_UPDATED_AT,
    is_live: false,
    disclaimer: "价格、库存、尺寸、安装和宠物安全属性均为测试数据，不能用于真实购买决策。"
  },
  {
    data_source_id: "source-demo-tutorials-v1",
    kind: "tutorial_catalog",
    source_type: "demo",
    label: "本地教程条目",
    updated_at: DEMO_UPDATED_AT,
    is_live: false,
    disclaimer: "仅用于演示内容承接结构，不对应真实视频或达人账号。"
  },
  {
    data_source_id: "source-demo-render-v1",
    kind: "render_asset",
    source_type: "demo",
    label: "预生成书桌焕新效果素材",
    updated_at: DEMO_UPDATED_AT,
    is_live: false,
    disclaimer: "效果图仅为视觉示意，三套方案当前共用样例素材，尺寸与商品一致性仍需复核。"
  }
];
