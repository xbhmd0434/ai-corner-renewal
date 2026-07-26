---
name: remix-room-from-inspiration
description: Turn a room photo plus a selected decor component or visual style reference into a structure-preserving room-renewal plan, render instructions, evaluation result, and provenance-aware implementation list. Use when a user asks to move inspiration from an image, video frame, selected object, mood, or style into their own room or local space.
---

# Remix Room From Inspiration

Transform visual inspiration into an executable room-renewal proposal without changing fixed
architecture or inventing product facts.

## Inputs

Obtain:

- one target-space image;
- either an inspiration image, a selected component crop, or a clear style description;
- optional explicit preserve or editable-region instructions.

Ask only for a missing required input. Do not require budget, dimensions, drilling, pets, or
color preferences for a first result. If supplied, treat them as hard constraints.

## Workflow

1. Classify the inspiration as `component` or `style`.
   - For a component, capture category, colors, materials, shape, and a stable
     `source_component_id`.
   - For a style, capture palette, materials, lighting, layout, and visual density.
   - If ambiguous, return `needs_input` with two short candidates instead of guessing.
2. Understand the target scene.
   - Identify scene type, fixed structure, existing objects to preserve, and editable regions.
   - Treat walls, windows, doors, built-ins, camera position, and user-marked objects as locked.
3. Create one primary plan.
   - For component intent, add the exact target
     `source_component:<source_component_id>` as the visual anchor.
   - For style intent, transfer design language without claiming that a generated object is the
     original item.
   - Use `ProductSlot` entries for supplementary needs. Do not place brand, SKU, price, stock, or
     purchase URL in a slot.
4. Build render instructions.
   - Preserve camera position and fixed structure.
   - Make the transformation visible while keeping additions restrained and physically supported.
   - If image generation is available, generate one main result. Otherwise return a complete
     render prompt and set maturity to `plan_only`.
5. Evaluate the result when a rendered image exists.
   - Compare before and after for base fidelity, inspiration fidelity, physical plausibility,
     and constraint compliance.
   - Give a repair instruction and retry at most once when a rendering tool supports revision.
   - Never mark an unevaluated image as validated.
6. Build an implementation list.
   - Order `video_selected`, then `source_video`, then `ai_supplement`.
   - Use `need_search` or `similar` when no verified catalog evidence exists.
   - Include product ID, price, stock, shop, or URL only when catalog evidence is supplied.
7. Emit `corner-renewal/1.0` JSON following
   [references/output-contract.md](references/output-contract.md).
8. Validate the JSON:

```bash
node scripts/validate-renewal-plan.mjs path/to/output.json
```

Use [assets/example-renewal-plan.json](assets/example-renewal-plan.json) as a structural example,
not as content to copy.

## Design Rules

Read [references/design-rules.md](references/design-rules.md) before planning or evaluating.

Always:

- label rendered results `AI 效果示意`;
- distinguish a selected source component from supplementary product needs;
- preserve fixed structure and explicitly preserved objects;
- keep implementation provenance visible;
- say that dimensions require confirmation when measurements are unknown.

Never:

- promise structural, electrical, plumbing, load-bearing, or construction safety;
- silently remove an existing object;
- claim an AI-generated object is an exact purchasable product;
- fabricate price, stock, product ID, seller, or purchase URL;
- describe a plan-only output as a generated or validated render.

## Completion

A successful run produces one portable JSON artifact and, when tools permit, one labeled effect
image. If required evidence is missing, return a useful plan with honest `plan_only`,
`need_search`, or `needs_review` states instead of fabricating completion.
