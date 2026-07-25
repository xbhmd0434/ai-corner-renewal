# Deterministic design-plan validation

`validateDesignPlan({ plan, products, roomProfile, constraints })` validates one
versioned `DesignPlan` without network access, model calls, clock reads, or input
mutation. It returns the repository's `ValidationReport v1` shape.

```js
import { validateDesignPlan } from "./src/index.js";

const report = validateDesignPlan({
  plan: {
    plan_id: "plan-demo",
    room_id: "room-demo",
    version: 1,
    total_price_cny: 99,
    product_ids: ["lamp-clamp"],
    preserved_elements: ["desk", "chair"],
    placements: [{ product_id: "lamp-clamp", zone: "desktop" }],
    assumptions: [],
    constraint_tags: ["no_drilling"]
  },
  products: [{
    product_id: "lamp-clamp",
    price_cny: 99,
    installation: "clamp",
    pet_safe: true,
    dimensions_cm: { width: 14, depth: 10, height: 42 },
    availability: { status: "demo_available" }
  }],
  roomProfile: {
    room_id: "room-demo",
    reference_width_cm: 120,
    fixed_elements: ["wall", "window", "desk", "chair"],
    editable_zones: ["desktop"],
    uncertainties: [],
    needs_confirmation: []
  },
  constraints: {
    budget_cny: 500,
    hard_constraints: ["no_drilling", "keep_desk", "keep_chair", "pet_safe"]
  }
});
```

The checks have a fixed order and stable codes:

1. `price_total`
2. `budget`
3. `no_drilling`
4. `preserved_elements`
5. `editable_zones`
6. `structure`
7. `dimensions`
8. `availability`
9. `pet_safety`

`fail` means a known hard violation. `warn` means the available facts cannot
prove safety or fit and the user must confirm them. Any failure produces
`overall_status: "failed"`; otherwise any warning produces
`"needs_confirmation"`; a fully verified plan produces `"pass"`.

## Evidence fields used by the rules

The core contract deliberately leaves `placements` open for evolution. The
validator understands these optional structured evidence fields:

- `placement.zone` (also `target_zone`, `editable_zone`, or `placement_zone`)
- `placement.modified_elements`, `removed_elements`, `replaced_elements`
- `placement.required_dimensions_cm` and `available_dimensions_cm`
- `placement.fit_status`
- `product.dimensions_cm: { width, depth, height }`

Missing evidence is never guessed from titles or descriptions. It becomes a
confirmation warning. Product availability accepts `available`, `in_stock`, and
`demo_available`; known unavailable states fail.

Run the executable examples with Node 20:

```sh
node --test packages/validation/test/validation.test.js
```
