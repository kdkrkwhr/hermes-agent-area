"""Smoke: BE WAYPOINTS match office-map.json tile centers + idle→lounge + focus deep-work."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server"))
from main import TILE, WAYPOINTS, _is_deep_work, _tile_to_zone  # noqa: E402


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

    focus_tiles = tiles.get("focusDesks") or []
    focus_wp = WAYPOINTS.get("focusDesks") or []
    match = len(focus_tiles) == len(focus_wp) and len(focus_tiles) >= 1
    ok &= match
    print(f"focusDesks count={len(focus_tiles)} match={'OK' if match else 'FAIL'}")
    for i, t in enumerate(focus_tiles):
        exp, got = center(t), focus_wp[i]
        match = exp == got
        ok &= match
        print(
            f"focusDesk[{i}] tile=({t['x']},{t['y']}) exp={exp} got={got} {'OK' if match else 'FAIL'}"
        )

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

    print("--- deep-work → focus ---")
    deep_cases = [
        ({"title": "short task", "max_runtime_seconds": 600}, False, "desk"),
        ({"title": "deep-work pipeline", "max_runtime_seconds": 600}, True, "focus"),
        ({"title": "long compile", "max_runtime_seconds": 3600}, True, "focus"),
        ({"title": "normal", "skills": ["focus-mode"]}, True, "focus"),
        ({"title": "chatty"}, False, "desk"),  # no task-ish → still not deep via empty
    ]
    for task, want_deep, ez in deep_cases:
        got_deep = _is_deep_work(task)
        match = got_deep == want_deep
        ok &= match
        print(f"_is_deep_work({task!r})={got_deep} expect={want_deep} {'OK' if match else 'FAIL'}")
        z, dest = _tile_to_zone("running", 0, task)
        match = z == ez
        ok &= match
        tx, ty = int(dest["x"] // TILE), int(dest["y"] // TILE)
        print(f"  running+task -> zone={z} tile=({tx},{ty}) expect={ez} {'OK' if match else 'FAIL'}")
        if ez == "focus":
            in_focus = any(
                abs(dest["x"] - p["x"]) < 0.1 and abs(dest["y"] - p["y"]) < 0.1
                for p in focus_wp
            )
            ok &= in_focus
            print(f"  dest in focusDesks={'OK' if in_focus else 'FAIL'}")

    # short running (no deep) stays on open desks
    z, dest = _tile_to_zone("running", 1, {"title": "fix typo", "max_runtime_seconds": 120})
    match = z == "desk"
    ok &= match
    open_desk = WAYPOINTS["desks"][1]
    at_open = abs(dest["x"] - open_desk["x"]) < 0.1 and abs(dest["y"] - open_desk["y"]) < 0.1
    ok &= at_open
    print(f"short running home=1 -> desk open[1]={'OK' if match and at_open else 'FAIL'}")

    # sleep tile walkable (collision layer empty) — FE pathfind safety
    coll = next(L for L in wp["layers"] if L["name"] == "collision")
    sw, sh = wp["width"], wp["height"]
    stx = int(sleep_wp["x"] // TILE)
    sty = int(sleep_wp["y"] // TILE)
    gid = coll["data"][sty * sw + stx]
    walkable = gid == 0
    ok &= walkable
    print(f"sleep tile ({stx},{sty}) collision gid={gid} walkable={'OK' if walkable else 'FAIL'}")

    for i, p in enumerate(focus_wp):
        ftx, fty = int(p["x"] // TILE), int(p["y"] // TILE)
        gid = coll["data"][fty * sw + ftx]
        walkable = gid == 0
        ok &= walkable
        print(
            f"focusDesk[{i}] tile ({ftx},{fty}) collision gid={gid} walkable={'OK' if walkable else 'FAIL'}"
        )

    print("RESULT", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
