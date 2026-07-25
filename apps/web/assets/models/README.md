# Local 3D preview assets

This directory is the local handoff point for browser-previewable `.glb` files.

- `little-blue-whale-v1-shape.glb` is a local Hunyuan3D-2mini shape-only sample.
- New files can be produced with `npm run generate:3d`.
- Generated GLB binaries are intentionally ignored by Git because they may be
  large and can contain user-derived geometry.
- The browser can also load a GLB directly without uploading it.

Production model binaries belong in private object storage. Only asset metadata,
ownership, provenance, dimensions, anchors, and composition transforms belong in
the application database.
