"""Generate a shape-only GLB with the local Hunyuan3D-2mini runtime.

This adapter intentionally targets the existing dedicated Hunyuan environment
instead of installing GPU packages into the project's general Python runtime.
The default profile is tuned for the local RTX 4060 Laptop GPU with 8 GB VRAM.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


DEFAULT_CACHE = Path(r"D:\LittleBlueWhale3D\.model-cache")
DEFAULT_MODEL_ID = "tencent/Hunyuan3D-2mini"
DEFAULT_SUBFOLDER = "hunyuan3d-dit-v2-mini"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Use the local Hunyuan3D-2mini model to generate a shape-only GLB."
    )
    parser.add_argument("--input", required=True, type=Path, help="Source PNG/JPEG/WebP image.")
    parser.add_argument("--output", required=True, type=Path, help="Destination .glb path.")
    parser.add_argument("--seed", type=int, default=20260725)
    parser.add_argument("--steps", type=int, default=30)
    parser.add_argument("--guidance-scale", type=float, default=5.0)
    parser.add_argument("--octree-resolution", type=int, default=192, choices=(128, 192, 256))
    parser.add_argument("--num-chunks", type=int, default=200_000)
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE)
    parser.add_argument(
        "--allow-download",
        action="store_true",
        help="Allow Hugging Face network access when local weights are missing.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate paths and print the resolved job without loading the model.",
    )
    return parser


def validate_args(args: argparse.Namespace) -> tuple[Path, Path, Path]:
    source = args.input.expanduser().resolve()
    destination = args.output.expanduser().resolve()
    cache = args.cache_dir.expanduser().resolve()

    if not source.is_file():
        raise FileNotFoundError(f"Input image not found: {source}")
    if source.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
        raise ValueError("Input must be PNG, JPEG, or WebP.")
    if destination.suffix.lower() != ".glb":
        raise ValueError("Output must use the .glb extension.")
    if not cache.is_dir():
        raise FileNotFoundError(f"Hunyuan cache not found: {cache}")
    return source, destination, cache


def emit(event: str, **payload: object) -> None:
    print(json.dumps({"event": event, **payload}, ensure_ascii=False), flush=True)


def main() -> int:
    args = build_parser().parse_args()
    try:
        source, destination, cache = validate_args(args)
    except (FileNotFoundError, ValueError) as error:
        emit("validation_error", message=str(error))
        return 2

    job = {
        "input": str(source),
        "output": str(destination),
        "cache_dir": str(cache),
        "model_id": DEFAULT_MODEL_ID,
        "subfolder": DEFAULT_SUBFOLDER,
        "seed": args.seed,
        "steps": args.steps,
        "guidance_scale": args.guidance_scale,
        "octree_resolution": args.octree_resolution,
        "num_chunks": args.num_chunks,
        "offline": not args.allow_download,
    }
    emit("job_validated", **job)
    if args.dry_run:
        return 0

    os.environ["HF_HOME"] = str(cache)
    if not args.allow_download:
        os.environ["HF_HUB_OFFLINE"] = "1"

    import torch
    from PIL import Image
    from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
    from hy3dgen.shapegen.pipelines import export_to_trimesh

    if not torch.cuda.is_available():
        emit("runtime_error", message="CUDA GPU is required for this generation profile.")
        return 3

    emit(
        "model_loading",
        gpu=torch.cuda.get_device_name(0),
        vram_gib=round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 2),
    )
    try:
        pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
            DEFAULT_MODEL_ID,
            subfolder=DEFAULT_SUBFOLDER,
            use_safetensors=True,
            device="cuda",
        )
        emit(
            "model_ready",
            allocated_vram_gib=round(torch.cuda.memory_allocated() / 1024**3, 2),
        )

        image = Image.open(source).convert("RGBA")
        generator = torch.Generator(device="cpu").manual_seed(args.seed)
        emit("generation_started", steps=args.steps)
        output = pipeline(
            image=image,
            num_inference_steps=args.steps,
            guidance_scale=args.guidance_scale,
            generator=generator,
            octree_resolution=args.octree_resolution,
            num_chunks=args.num_chunks,
            output_type="mesh",
        )
        mesh = export_to_trimesh(output)[0]
        destination.parent.mkdir(parents=True, exist_ok=True)
        mesh.export(destination)
        emit(
            "generation_completed",
            output=str(destination),
            bytes=destination.stat().st_size,
            vertices=int(len(mesh.vertices)),
            faces=int(len(mesh.faces)),
        )
        return 0
    except torch.OutOfMemoryError:
        emit(
            "runtime_error",
            message=(
                "CUDA out of memory. Close other GPU apps or retry with "
                "--octree-resolution 128 --num-chunks 100000."
            ),
        )
        return 4
    except Exception as error:  # Hunyuan raises several library-specific exceptions.
        emit("runtime_error", message=f"{type(error).__name__}: {error}")
        return 5


if __name__ == "__main__":
    sys.exit(main())
