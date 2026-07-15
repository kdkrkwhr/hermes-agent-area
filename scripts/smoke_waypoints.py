"""Smoke: BE WAYPOINTS match office-map.json tile centers + idle→lounge."""
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

    lou_tiles = tiles.get("lounge") or []
    lou_wp = WAYPOINTS.get("lounge") or []
    match = len(lou_tiles) == len(lou_wp) and all(
        center(t) == lou_wp[i] for i, t in enumerate(lou_tiles)
    )
    ok &= match
    print(f"lounge spots={len(lou_tiles)} match={'OK' if match else 'FAIL'}")

    print("--- _tile_to_zone ---")
    sleep_wp = WAYPOINTS["sleep"]
    for st, desk, ez in (
        ("running", 0, "desk"),
        ("chatting", 1, "desk"),
        ("blocked", 0, "meeting"),
        ("offline", 2, "sleep"),
        ("idle", 0, "break"),
    ):
        z, dest = _tile_to_zone(st, desk)
        match = z == ez
        ok &= match
        tx, ty = int(dest["x"] // TILE), int(dest["y"] // TILE)
        print(
            f"{st} -> zone={z} dest_tile=({tx},{ty}) px=({dest['x']},{dest['y']}) expect={ez} {'OK' if match else 'FAIL'}"
        )
        if st == "idle":
            in_lounge = any(
                abs(dest["x"] - p["x"]) < 0.1 and abs(dest["y"] - p["y"]) < 0.1
                for p in lou_wp
            )
            ok &= in_lounge
            print(f"  idle dest in lounge={'OK' if in_lounge else 'FAIL'}")
        if st == "offline":
            at_sleep = (
                abs(dest["x"] - sleep_wp["x"]) < 0.1
                and abs(dest["y"] - sleep_wp["y"]) < 0.1
            )
            ok &= at_sleep
            print(f"  offline dest = sleep={'OK' if at_sleep else 'FAIL'}")

    # sleep tile walkable (collision layer empty) — FE pathfind safety
    coll = next(L for L in wp["layers"] if L["name"] == "collision")
    sw, sh = wp["width"], wp["height"]
    stx = int(sleep_wp["x"] // TILE)
    sty = int(sleep_wp["y"] // TILE)
    gid = coll["data"][sty * sw + stx]
    walkable = gid == 0
    ok &= walkable
    print(f"sleep tile ({stx},{sty}) collision gid={gid} walkable={'OK' if walkable else 'FAIL'}")

    print("RESULT", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
