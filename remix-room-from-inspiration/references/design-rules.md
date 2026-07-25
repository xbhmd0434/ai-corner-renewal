# Design Rules

## Intent boundary

- `component`: preserve the selected object's recognizable category, silhouette, color, material,
  and proportion. Represent it with one immutable source anchor.
- `style`: transfer palette, material language, lighting, layout rhythm, and density. Do not imply
  that a particular generated object came from the source.
- When confidence is insufficient, expose component and style candidates for confirmation.

## Scene ownership

Treat the target scene as the stable base and the inspiration as a replaceable input.

Locked by default:

- camera position and viewing direction;
- walls, ceiling, floor boundaries, windows, doors, columns, and built-ins;
- large existing furniture unless the user explicitly marks it editable;
- every object the user asks to preserve.

Editable by default:

- loose decor;
- small storage;
- textiles, lamps, plants, and desktop accessories;
- explicit user-selected regions.

Use only these action types:

- `add`: add the source anchor or a supplementary need;
- `organize`: rearrange loose small objects inside an editable region;
- `remove_trash`: remove only clearly disposable clutter.

Do not move, replace, resize, repaint, or remove fixed or preserved objects.

## Planning

- Produce one primary direction, not several unranked alternatives.
- Make the change clearly visible, but prefer a small number of purposeful additions.
- Place every addition on a plausible supporting surface.
- Keep circulation, doors, drawers, switches, and windows unobstructed.
- When dimensions are unknown, describe a size range as provisional and require measurement before
  purchase.
- A `ProductSlot` is a design need, not a product. It may contain category, purpose, quantity,
  appearance, placement, support, clearance constraints, and search phrases.

## Rendering

Keep the original perspective, crop, and fixed geometry. Describe:

- the exact source component anchor for component intent;
- target palette, materials, lighting, and density for style intent;
- placement and support for each addition;
- negative constraints that prevent structural drift, floating objects, duplicated objects,
  distorted proportions, unreadable surfaces, and excessive clutter.

Generate only one main render unless the user explicitly requests alternatives. Label the result
`AI 效果示意`.

## Evaluation

Evaluate these independent gates:

1. `base_fidelity`: camera and fixed structure remain stable.
2. `inspiration_fidelity`: the source component remains recognizable, or the style language is
   transferred coherently.
3. `physical_plausibility`: objects are supported, correctly scaled, and not visibly intersecting.
4. `constraint_compliance`: preserved objects and explicit constraints are respected.

Use `fail` for a clear violation, `needs_review` for uncertain visual evidence, and `pass` only
when the evidence supports the claim. An unevaluated render must remain `not_run`.

## Commerce truth

Separate visual needs from product facts:

- Without catalog evidence, output `need_search`, `similar`, or `alternative`.
- Use `exact` only when a trusted catalog explicitly binds the source or result to that product.
- Price, stock, product ID, seller, and purchase URL require `catalog_evidence.provider` and
  `catalog_evidence.checked_at`.
- Order implementation items by source role:
  `video_selected → source_video → ai_supplement`.
