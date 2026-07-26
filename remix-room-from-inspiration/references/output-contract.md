# Corner Renewal Output Contract 1.0

Emit one UTF-8 JSON object.

## Top level

```json
{
  "contract_version": "corner-renewal/1.0",
  "status": "ready | needs_input",
  "maturity": "plan_only | rendered | rendered_evaluated",
  "inspiration": {},
  "scene": {},
  "plan": {},
  "render": {},
  "evaluation": {},
  "implementation": {},
  "notices": []
}
```

## Inspiration

Common fields:

- `intent_type`: `component` or `style`;
- `summary`: short natural-language description.

Component intent requires:

```json
{
  "component_reference": {
    "source_component_id": "source-component-001",
    "category": "vase",
    "colors": ["cream"],
    "materials": ["ceramic"],
    "shapes": ["rounded"]
  }
}
```

Style intent requires:

```json
{
  "style_reference": {
    "palette": ["warm wood", "cream"],
    "materials": ["wood", "linen"],
    "lighting": ["warm", "soft"],
    "layout": ["low density", "layered"]
  }
}
```

## Scene

Required arrays:

- `fixed_structure`;
- `preserve`;
- `editable_regions`.

Each item is a concise user-visible label. An empty array is valid when the image gives no reliable
evidence, but add a notice explaining the uncertainty.

## Plan

Required fields:

- `title`;
- `design_direction`;
- `actions` with at most 8 entries;
- `product_slots` with at most 8 entries;
- `render_instruction`;
- `negative_constraints`.

Allowed action types: `add`, `organize`, `remove_trash`.

For component intent, one `add` action must target:

```text
source_component:<source_component_id>
```

Each product slot requires:

- `slot_id`;
- `category`;
- `purpose`;
- positive integer `quantity`;
- `placement`;
- `support`;
- `search_queries`.

A slot must not contain product ID, SKU, price, stock, seller, or purchase URL.

## Render and evaluation

`render.status` is `not_run`, `generated`, or `validated`. Always set:

```json
{ "label": "AI 效果示意" }
```

- `not_run` requires a non-empty `prompt` and `maturity=plan_only`.
- `generated` or `validated` requires `output_ref`.
- `validated` requires `maturity=rendered_evaluated` and `evaluation.status=pass`.

`evaluation.status` is `not_run`, `pass`, `needs_review`, or `fail`.
When evaluation runs, include all four gates:

- `base_fidelity`;
- `inspiration_fidelity`;
- `physical_plausibility`;
- `constraint_compliance`.

Each gate is `pass`, `needs_review`, or `fail`. `evaluation.status=pass` requires every gate to
pass.

## Implementation

```json
{
  "items": [
    {
      "list_item_id": "item-001",
      "label": "奶油白陶瓷花瓶",
      "source_role": "video_selected",
      "match_type": "need_search",
      "quantity": 1,
      "placement": "书桌左后方"
    }
  ]
}
```

Allowed source roles, in required order:

1. `video_selected`;
2. `source_video`;
3. `ai_supplement`.

Allowed match types: `exact`, `similar`, `alternative`, `need_search`.

If an item contains `product_id`, `sku`, `price`, `stock`, `seller`, or `purchase_url`, also
include:

```json
{
  "catalog_evidence": {
    "provider": "trusted-provider",
    "checked_at": "2026-07-26T00:00:00Z"
  }
}
```

Use `exact` only with catalog evidence.

## Notices

Each notice requires:

- `code`;
- `level`: `info`, `warning`, or `error`;
- `message`.

Use notices for missing measurements, ambiguous objects, unsupported construction decisions, or
other limitations.
