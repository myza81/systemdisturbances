"""Waveform artifacts (disk-based storage).

Stores full-resolution waveforms outside the database as typed arrays.

Layout (artifact_dir):
  meta.json
  time_s.npy
  analog/<safe_name>.npy
  digital/<safe_name>.npy
  pyramid/
    analog/<safe_name>_<level>.npy  (min/max interleaved)
    digital/<safe_name>_<level>.npy

Raw uploads are stored separately (upload_dir).
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

# Pyramid levels: each level has ~1/ratio of original samples
# Level 0 = full resolution, Level 1 = 1/2, Level 2 = 1/4, etc.
PYRAMID_RATIOS = [1, 2, 4, 8, 16, 32, 64, 128, 256]


_SAFE_RE = re.compile(r"[^A-Za-z0-9._-]+")


def safe_channel_name(name: str) -> str:
    """Return a filesystem-safe name (stable).

    Keep it readable, but remove path separators and weird chars.
    """
    s = (name or "").strip()
    if not s:
        s = "channel"
    s = s.replace(os.sep, "_")
    s = s.replace("/", "_")
    s = _SAFE_RE.sub("_", s)
    s = s.strip("._-")
    return s or "channel"


def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def save_uploaded_file(uploaded_file, dest_path: Path) -> None:
    """Persist a Django UploadedFile (or file-like) to disk."""
    ensure_dir(dest_path.parent)

    # Django UploadedFile supports chunks(); fall back to read().
    with open(dest_path, "wb") as f:
        chunks = getattr(uploaded_file, "chunks", None)
        if callable(chunks):
            for chunk in uploaded_file.chunks():
                f.write(chunk)
        else:
            data = uploaded_file.read()
            f.write(data if isinstance(data, (bytes, bytearray)) else bytes(data))


def _is_uniform_sampling(time_s: np.ndarray, tol: float = 5e-3) -> bool:
    n = int(time_s.size)
    if n < 3:
        return True
    m = min(500, n - 1)
    dts = np.diff(time_s[: m + 1])
    dts = dts[dts > 0]
    if dts.size < 2:
        return True
    mean_dt = float(dts.mean())
    if mean_dt <= 0:
        return False
    max_dev = float(np.max(np.abs(dts - mean_dt)) / mean_dt)
    return max_dev <= tol


def write_artifact_from_payload(payload: dict[str, Any], artifact_dir: Path) -> dict[str, Any]:
    """Write a typed-array artifact; returns meta dict (also written)."""
    ensure_dir(artifact_dir)
    ensure_dir(artifact_dir / "analog")
    ensure_dir(artifact_dir / "digital")

    time_list = payload.get("time") or []
    time_s = np.asarray(time_list, dtype=np.float32)
    np.save(artifact_dir / "time_s.npy", time_s)

    analog_meta = []
    for ch in payload.get("analog", []) or []:
        name = ch.get("name")
        safe = safe_channel_name(str(name))
        arr = np.asarray(ch.get("values") or [], dtype=np.float32)
        np.save(artifact_dir / "analog" / f"{safe}.npy", arr)
        analog_meta.append({
            "name": name,
            "safe": safe,
            "unit": ch.get("unit", ""),
            "phase": ch.get("phase", ""),
        })

    digital_meta = []
    for ch in payload.get("digital", []) or []:
        name = ch.get("name")
        safe = safe_channel_name(str(name))
        arr = np.asarray(ch.get("values") or [], dtype=np.uint8)
        np.save(artifact_dir / "digital" / f"{safe}.npy", arr)
        digital_meta.append({
            "name": name,
            "safe": safe,
        })

    trigger_time_s = payload.get("trigger_time")
    sample_rate = payload.get("sample_rate")

    meta: dict[str, Any] = {
        "format": "npy",
        "station": payload.get("station", ""),
        "device": payload.get("device", ""),
        "frequency": float(payload.get("frequency") or 50.0),
        "sample_rate": float(sample_rate) if sample_rate is not None else 0.0,
        "trigger_time_s": float(trigger_time_s) if trigger_time_s is not None else 0.0,
        "time_start_s": float(time_s[0]) if time_s.size else 0.0,
        "time_end_s": float(time_s[-1]) if time_s.size else 0.0,
        "total_samples": int(time_s.size),
        "is_uniform_sampling": bool(_is_uniform_sampling(time_s)),
        "analog": analog_meta,
        "digital": digital_meta,
    }

    with open(artifact_dir / "meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f)

    return meta


def load_artifact_meta(artifact_dir: Path) -> dict[str, Any] | None:
    try:
        with open(artifact_dir / "meta.json", "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def load_time_s(artifact_dir: Path, mmap: bool = True) -> np.ndarray:
    p = artifact_dir / "time_s.npy"
    return np.load(p, mmap_mode="r" if mmap else None)


def load_channel_array(artifact_dir: Path, kind: str, safe_name: str, mmap: bool = True) -> np.ndarray:
    p = artifact_dir / kind / f"{safe_name}.npy"
    return np.load(p, mmap_mode="r" if mmap else None)


def _compute_envelope(arr: np.ndarray) -> np.ndarray:
    """Compute min/max envelope interleaved (min, max, min, max, ...)."""
    n = len(arr)
    if n <= 1:
        return np.array([], dtype=arr.dtype)
    # For small arrays, just return original
    if n <= 2:
        return arr.astype(np.float32)
    # Interleave min and max
    out = np.empty(n * 2, dtype=np.float32)
    out[0::2] = arr
    out[1::2] = arr
    return out


def _downsample_envelope(arr: np.ndarray, ratio: int) -> np.ndarray:
    """Downsample to 1/ratio with min/max envelope."""
    n = len(arr)
    if n <= ratio:
        return _compute_envelope(arr)
    # Number of output buckets
    out_len = (n + ratio - 1) // ratio
    out = np.empty(out_len * 2, dtype=np.float32)
    for i in range(out_len):
        start = i * ratio
        end = min(start + ratio, n)
        seg = arr[start:end]
        out[i * 2] = float(seg.min())
        out[i * 2 + 1] = float(seg.max())
    return out


def write_pyramid(artifact_dir: Path) -> dict[str, Any]:
    """Precompute min/max pyramids for all channels. Returns pyramid meta."""
    ensure_dir(artifact_dir / "pyramid" / "analog")
    ensure_dir(artifact_dir / "pyramid" / "digital")

    meta = load_artifact_meta(artifact_dir)
    if not meta:
        return {}

    pyramid_meta = {"levels": PYRAMID_RATIOS, "channels": {}}

    for kind in ["analog", "digital"]:
        channels = meta.get(kind, []) or []
        for ch in channels:
            safe = ch.get("safe")
            if not safe:
                continue
            arr = load_channel_array(artifact_dir, kind, safe, mmap=False)
            if arr is None or len(arr) == 0:
                continue
            levels_data = {}
            for ratio in PYRAMID_RATIOS:
                if ratio == 1:
                    env = _compute_envelope(arr)
                else:
                    env = _downsample_envelope(arr, ratio)
                level_idx = PYRAMID_RATIOS.index(ratio)
                np.save(artifact_dir / "pyramid" / kind / f"{safe}_{level_idx}.npy", env)
                levels_data[level_idx] = len(env)
            pyramid_meta["channels"][f"{kind}/{safe}"] = levels_data

    # Save pyramid meta
    with open(artifact_dir / "pyramid" / "meta.json", "w", encoding="utf-8") as f:
        json.dump(pyramid_meta, f)

    return pyramid_meta


def load_pyramid_meta(artifact_dir: Path) -> dict[str, Any]:
    """Load pyramid metadata."""
    try:
        with open(artifact_dir / "pyramid" / "meta.json", "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def get_pyramid_level(sample_count: int, target_points: int) -> int:
    """Determine which pyramid level to use for given sample count and target points.
    
    Returns pyramid level index (0 = full res, 1 = 1/2, etc.)
    """
    if sample_count <= target_points:
        return 0
    ratio = sample_count / target_points
    for i, r in enumerate(PYRAMID_RATIOS):
        if r >= ratio:
            return i
    return len(PYRAMID_RATIOS) - 1


def load_pyramid_channel(artifact_dir: Path, kind: str, safe_name: str, level: int) -> np.ndarray | None:
    """Load a specific pyramid level for a channel."""
    if level < 0 or level >= len(PYRAMID_RATIOS):
        return None
    p = artifact_dir / "pyramid" / kind / f"{safe_name}_{level}.npy"
    try:
        return np.load(p, mmap_mode="r")
    except FileNotFoundError:
        return None
