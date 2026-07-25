export const MODEL_LIBRARY = {
  bags: [
    {
      id: "bag-cloud-01",
      name: "云朵腋下包",
      source: "用户拍摄 · 演示样本",
      status: "demo",
      dimensionsCm: { width: 27, height: 18, depth: 8 },
      color: "#6d513f"
    },
    {
      id: "bag-moss-02",
      name: "苔绿邮差包",
      source: "用户模型库",
      status: "demo",
      dimensionsCm: { width: 30, height: 21, depth: 9 },
      color: "#465342"
    }
  ],
  charms: [
    {
      id: "charm-whale-01",
      name: "小蓝鲸挂件",
      source: "本机 Hunyuan3D 样例",
      status: "hunyuan-sample",
      color: "#4d91a3"
    },
    {
      id: "charm-flower-02",
      name: "奶油花朵",
      source: "视频圈选 · 演示样本",
      status: "demo",
      color: "#e9b06c"
    },
    {
      id: "charm-star-03",
      name: "银色星星",
      source: "商品全景图 · 演示样本",
      status: "demo",
      color: "#d7d2c8"
    }
  ]
};

export const BAG_ANCHORS = [
  {
    id: "right-ring",
    name: "右侧金属环",
    shortName: "右环",
    position: [0.92, 0.56, 0.58]
  },
  {
    id: "handle-knot",
    name: "提手根部",
    shortName: "提手",
    position: [0.44, 0.96, 0.47]
  },
  {
    id: "front-loop",
    name: "正面装饰环",
    shortName: "正面",
    position: [-0.54, 0.27, 0.67]
  }
];

export const DEFAULT_COMPOSITION = {
  schemaVersion: 1,
  id: "composition-demo-01",
  baseModelId: "bag-cloud-01",
  attachmentModelId: "charm-whale-01",
  anchorId: "right-ring",
  transform: {
    position: [0.92, 0.32, 0.7],
    rotation: [0, 0, -0.12],
    scale: 1
  },
  view: "perspective",
  savedAt: null
};

export const VIEW_PRESETS = {
  perspective: {
    label: "立体",
    camera: [3.8, 2.45, 4.9]
  },
  front: {
    label: "正面",
    camera: [0, 0.45, 5.5]
  },
  right: {
    label: "右侧",
    camera: [5.2, 0.5, 0.15]
  },
  back: {
    label: "背面",
    camera: [0, 0.45, -5.5]
  }
};

export const STORAGE_KEY = "room-remix-accessory-composition-v1";
