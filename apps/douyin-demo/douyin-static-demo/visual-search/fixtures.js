const COMMON_SOURCE = {
  source_type: "demo",
  label: "本地视觉搜索演示候选（非实时商品库）",
  is_live: false
};

export const DEMO_VISUAL_RESULTS = [
  {
    candidate_id: "candidate-oak-riser",
    product_id: "demo-product-oak-riser",
    name: "浅橡木双层桌上架",
    category: "桌面置物架",
    price_cny: 159,
    similarity_score: 0.92,
    match_reasons: ["浅木色与轮廓接近", "双层结构相似"],
    visual_kind: "oak",
    source: COMMON_SOURCE
  },
  {
    candidate_id: "candidate-cream-riser",
    product_id: "demo-product-cream-riser",
    name: "奶油白模块增高架",
    category: "显示器增高架",
    price_cny: 129,
    similarity_score: 0.87,
    match_reasons: ["桌面比例接近", "免打孔可移动"],
    visual_kind: "cream",
    source: COMMON_SOURCE
  },
  {
    candidate_id: "candidate-walnut-riser",
    product_id: "demo-product-walnut-riser",
    name: "胡桃木抽屉收纳架",
    category: "桌面收纳",
    price_cny: 199,
    similarity_score: 0.81,
    match_reasons: ["结构相似", "增加隐藏收纳"],
    visual_kind: "walnut",
    source: COMMON_SOURCE
  }
];

export function getDemoVisualResults() {
  return DEMO_VISUAL_RESULTS.map((item) => ({
    ...item,
    match_reasons: [...item.match_reasons],
    source: { ...item.source }
  }));
}
