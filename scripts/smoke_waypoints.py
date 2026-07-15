"""Smoke: BE WAYPOINTS match office-map.json tile centers + idle→sleep."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server"))
from main import TILE, WAYPOINTS, _tile_to_zone  # noqa: E402


def center(t: dict) -> dict:
    return {"x": t["x"] * TILE + TILE // 2, "y": t["y"] * TILE + TILE // 2}


def main() -> int:
    wp = json.loads((ROOT / "public/assets/office-map.json").read_text(encoding="utf-8"))
    prop = next(p for p in wp["properties"] if p["name"] == "waypoints")
    tiles = json.loads(prop["value"])
    ok = True

    for i, t in enumerate(tiles["desks"]):
        exp, got = center(t), WAYPOINTS["desks"][i]
        match = exp == got
        ok &= match
        print(f"desk[{i}] tile=({t['x']},{t['y']}) exp={exp} got={got} {'OK' if match else 'FAIL'}")

    for k in ("meeting", "break", "sleep"):
        exp, got = center(tiles[k]), WAYPOINTS[k]
        match = exp == got
        ok &= match
        print(
            f"{k} tile=({tiles[k]['x']},{tiles[k]['y']}) exp={exp} got={got} {'OK' if match else 'FAIL'}"
        )

    print("--- _tile_to_zone ---")
    for st, desk, ez in (
        ("running", 0, "desk"),
        ("chatting", 1, "desk"),
        ("blocked", 0, "meeting"),
        ("offline", 2, "away"),
        ("idle", 0, "sleep"),
    ):
        z, dest = _tile_to_zone(st, desk)
        match = z == ez
        ok &= match
        tx, ty = int(dest["x"] // TILE), int(dest["y"] // TILE)
        print(
            f"{st} -> zone={z} dest_tile=({tx},{ty}) px=({dest['x']},{dest['y']}) expect={ez} {'OK' if match else 'FAIL'}"
        )

    print("RESULT", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
