#!/usr/bin/env python3
"""将 fixtures/sample-cases 下的目录打成 ZIP，供「用例库 → 导入 → ZIP 包」试用。

Usage:
  python scripts/build_fixture_zips.py
"""
from __future__ import annotations

import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "fixtures" / "sample-cases"
OUT = SAMPLES / "zips"

BUNDLES = [
    ("portable-01-example-domain", ["case.spec.ts"]),
    ("portable-02-playwright-dev", ["case.spec.ts"]),
    ("portable-03-baidu-search", ["case.spec.ts"]),
    ("bundle-01-example-env", ["case.spec.ts", "environment.json"]),
]


def pack(name: str, files: list[str]) -> Path:
    src_dir = SAMPLES / name
    if not src_dir.is_dir():
        raise SystemExit(f"缺少目录: {src_dir}")
    OUT.mkdir(parents=True, exist_ok=True)
    out_path = OUT / f"{name}.zip"
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for fname in files:
            fpath = src_dir / fname
            if not fpath.is_file():
                raise SystemExit(f"缺少文件: {fpath}")
            zf.write(fpath, arcname=fname)
    return out_path


def main() -> int:
    built = []
    for name, files in BUNDLES:
        built.append(pack(name, files))
    print(f"[build_fixture_zips] 已生成 {len(built)} 个 ZIP -> {OUT}")
    for p in built:
        print(f"  - {p.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
