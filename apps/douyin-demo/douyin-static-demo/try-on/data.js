export const TRYON_LIBRARY = {
  bags: [
    {
      id: "bag-cloud-01",
      name: "云朵腋下包",
      source: "我的包 · 演示模型",
      color: "#76503f"
    },
    {
      id: "bag-moss-02",
      name: "苔绿邮差包",
      source: "我的橱窗 · 演示模型",
      color: "#435546"
    }
  ],
  charms: [
    {
      id: "charm-whale-01",
      name: "小蓝鲸",
      source: "本机 Hunyuan3D 样例",
      color: "#65b9c7"
    },
    {
      id: "charm-flower-02",
      name: "奶油花",
      source: "相似商品 · 演示",
      color: "#f2b76e"
    },
    {
      id: "charm-star-03",
      name: "银色星",
      source: "相似商品 · 演示",
      color: "#d9d7d2"
    }
  ]
};

export const TRYON_ANCHORS = [
  {
    id: "right-ring",
    name: "右侧金属环",
    label: "右环",
    position: [0.9, 0.28, 0.72]
  },
  {
    id: "handle-knot",
    name: "提手根部",
    label: "提手",
    position: [0.45, 0.78, 0.58]
  },
  {
    id: "front-loop",
    name: "正面装饰位",
    label: "正面",
    position: [-0.52, 0.05, 0.76]
  }
];

export const TRYON_VIEWS = {
  perspective: { label: "立体", camera: [3.7, 2.15, 4.9] },
  front: { label: "正面", camera: [0, 0.35, 5.4] },
  right: { label: "侧面", camera: [5.1, 0.4, 0.1] },
  back: { label: "背面", camera: [0, 0.35, -5.4] }
};

export const DEFAULT_TRYON_COMPOSITION = {
  schema_version: "tryon-composition.v1",
  base_model_id: "bag-cloud-01",
  attachment_model_id: "charm-whale-01",
  anchor_id: "right-ring",
  transform: {
    position: [0.9, 0.28, 0.72],
    rotation: [0, 0, -0.12],
    scale: 1
  },
  view: "perspective",
  source_context: {
    kind: "library",
    provider: "douyin_static_demo",
    external_content_id: null,
    timestamp_ms: 0
  },
  saved_at: null
};

export const TRYON_STORAGE_KEY = "douyin-accessory-composition-v1";
export const TRYON_ENTRY_KEY = "douyin-accessory-entry-context";
