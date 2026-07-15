"""Generate office tileset + 16-bit style character sheets (procedural, no external deps)."""
from __future__ import annotations

import json
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets"
OUT.mkdir(parents=True, exist_ok=True)

TILE = 16


def write_png(path: Path, w: int, h: int, rgba: bytes) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + rgba[y * w * 4 : (y + 1) * w * 4] for y in range(h))
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def px(buf: bytearray, w: int, x: int, y: int, color: tuple[int, int, int, int]) -> None:
    if 0 <= x < w and 0 <= y < (len(buf) // (w * 4)):
        i = (y * w + x) * 4
        buf[i : i + 4] = bytes(color)


def fill(buf: bytearray, w: int, x0: int, y0: int, x1: int, y1: int, color: tuple[int, int, int, int]) -> None:
    for y in range(y0, y1):
        for x in range(x0, x1):
            px(buf, w, x, y, color)


def rect(buf: bytearray, w: int, x0: int, y0: int, x1: int, y1: int, color: tuple[int, int, int, int]) -> None:
    for x in range(x0, x1):
        px(buf, w, x, y0, color)
        px(buf, w, x, y1 - 1, color)
    for y in range(y0, y1):
        px(buf, w, x0, y, color)
        px(buf, w, x1 - 1, y, color)


# Cool trendy office palette (slate / teal / soft cyan — not warm wood)
FLOOR = (48, 58, 72, 255)
FLOOR2 = (58, 70, 86, 255)
FLOOR_WOOD = (64, 78, 96, 255)  # cool concrete strip
WALL = (36, 44, 56, 255)
WALL_TOP = (72, 88, 108, 255)
WALL_WARM = (52, 62, 78, 255)  # kept name; cool slate alt
CARPET = (46, 92, 110, 255)  # teal meeting rug
CARPET2 = (36, 78, 96, 255)
BREAK_FLOOR = (56, 72, 88, 255)
SLEEP_FLOOR = (42, 48, 68, 255)
SLEEP_FLOOR2 = (34, 40, 58, 255)
DESK = (70, 82, 98, 255)
DESK_TOP = (96, 112, 132, 255)
CHAIR = (58, 98, 120, 255)
MONITOR = (28, 34, 44, 255)
SCREEN = (80, 220, 200, 255)
SOFA = (72, 110, 140, 255)
TABLE = (86, 100, 118, 255)
DOOR = (78, 98, 120, 255)
WINDOW = (160, 210, 230, 255)
PLANT = (64, 168, 130, 255)
POT = (70, 82, 96, 255)
BED = (70, 88, 120, 255)
BED_SHEET = (210, 220, 235, 255)
CANVAS = (230, 236, 244, 255)
CANVAS_FRAME = (70, 84, 100, 255)
COFFEE = (52, 60, 72, 255)
COFFEE_ACCENT = (90, 200, 190, 255)
BOARD = (236, 242, 248, 255)
BOARD_FRAME = (60, 72, 88, 255)
RUG = (48, 120, 140, 255)
FRAME_ART = (120, 170, 190, 255)
LAMP = (180, 230, 240, 255)
TRANS = (0, 0, 0, 0)


def make_tileset() -> None:
    # 8 cols x 6 rows = 48 tiles
    cols, rows = 8, 6
    w, h = cols * TILE, rows * TILE
    buf = bytearray(w * h * 4)

    def tile_at(ti: int, tj: int) -> tuple[int, int]:
        return ti * TILE, tj * TILE

    # 0 cool slate floor grain
    ox, oy = tile_at(0, 0)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, FLOOR)
    for i in range(0, TILE, 4):
        px(buf, w, ox + i, oy + (i * 3) % TILE, FLOOR2)

    # 1 floor alt
    ox, oy = tile_at(1, 0)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, FLOOR2)
    for i in range(2, TILE, 5):
        px(buf, w, ox + i, oy + 8, FLOOR_WOOD)

    # 2 wall
    ox, oy = tile_at(2, 0)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, WALL)
    fill(buf, w, ox, oy, ox + TILE, oy + 3, WALL_TOP)
    for x in range(0, TILE, 4):
        px(buf, w, ox + x, oy + 8, WALL_WARM)

    # 3 carpet meeting (teal)
    ox, oy = tile_at(3, 0)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, CARPET)
    for i in range(0, TILE, 2):
        px(buf, w, ox + i, oy + 7, CARPET2)

    # 4 break room floor (cool lounge)
    ox, oy = tile_at(4, 0)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, BREAK_FLOOR)
    px(buf, w, ox + 3, oy + 4, (100, 180, 190, 255))
    px(buf, w, ox + 11, oy + 10, (100, 180, 190, 255))

    # 5 desk + monitor (code)
    ox, oy = tile_at(5, 0)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, FLOOR)
    fill(buf, w, ox + 1, oy + 6, ox + 15, oy + 14, DESK)
    fill(buf, w, ox + 2, oy + 4, ox + 14, oy + 8, DESK_TOP)
    fill(buf, w, ox + 5, oy + 2, ox + 11, oy + 6, MONITOR)
    fill(buf, w, ox + 6, oy + 3, ox + 10, oy + 5, SCREEN)

    # 6 chair
    ox, oy = tile_at(6, 0)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, FLOOR)
    fill(buf, w, ox + 4, oy + 6, ox + 12, oy + 13, CHAIR)
    fill(buf, w, ox + 5, oy + 3, ox + 11, oy + 7, CHAIR)

    # 7 meeting table
    ox, oy = tile_at(7, 0)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, CARPET)
    fill(buf, w, ox + 1, oy + 4, ox + 15, oy + 12, TABLE)
    rect(buf, w, ox + 1, oy + 4, ox + 15, oy + 12, DESK)

    # 8 sofa
    ox, oy = tile_at(0, 1)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, BREAK_FLOOR)
    fill(buf, w, ox + 1, oy + 5, ox + 15, oy + 13, SOFA)
    fill(buf, w, ox + 1, oy + 3, ox + 15, oy + 7, SOFA)

    # 9 plant
    ox, oy = tile_at(1, 1)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, FLOOR)
    fill(buf, w, ox + 6, oy + 10, ox + 10, oy + 14, POT)
    fill(buf, w, ox + 5, oy + 3, ox + 11, oy + 11, PLANT)
    px(buf, w, ox + 8, oy + 2, PLANT)

    # 10 door
    ox, oy = tile_at(2, 1)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, WALL)
    fill(buf, w, ox + 3, oy + 2, ox + 13, oy + 15, DOOR)
    px(buf, w, ox + 11, oy + 8, (120, 230, 210, 255))

    # 11 window (bright)
    ox, oy = tile_at(3, 1)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, WALL)
    fill(buf, w, ox + 2, oy + 3, ox + 14, oy + 12, WINDOW)
    rect(buf, w, ox + 2, oy + 3, ox + 14, oy + 12, WALL_TOP)
    # light glow
    fill(buf, w, ox + 4, oy + 5, ox + 12, oy + 10, (220, 235, 245, 255))

    # 12 void dark
    ox, oy = tile_at(4, 1)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, (18, 24, 34, 255))

    # 13 bed
    ox, oy = tile_at(5, 1)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, SLEEP_FLOOR)
    fill(buf, w, ox + 1, oy + 4, ox + 15, oy + 14, BED)
    fill(buf, w, ox + 2, oy + 5, ox + 14, oy + 12, BED_SHEET)
    fill(buf, w, ox + 2, oy + 5, ox + 6, oy + 9, (250, 248, 245, 255))  # pillow

    # 14 canvas / easel
    ox, oy = tile_at(6, 1)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, FLOOR)
    fill(buf, w, ox + 3, oy + 2, ox + 13, oy + 12, CANVAS_FRAME)
    fill(buf, w, ox + 4, oy + 3, ox + 12, oy + 11, CANVAS)
    # simple "art"
    fill(buf, w, ox + 5, oy + 5, ox + 11, oy + 8, (90, 140, 170, 255))
    px(buf, w, ox + 7, oy + 6, (110, 210, 200, 255))
    # easel legs
    fill(buf, w, ox + 5, oy + 12, ox + 7, oy + 15, CANVAS_FRAME)
    fill(buf, w, ox + 9, oy + 12, ox + 11, oy + 15, CANVAS_FRAME)

    # 15 coffee machine
    ox, oy = tile_at(7, 1)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, BREAK_FLOOR)
    fill(buf, w, ox + 4, oy + 4, ox + 12, oy + 14, COFFEE)
    fill(buf, w, ox + 5, oy + 5, ox + 11, oy + 8, COFFEE_ACCENT)
    fill(buf, w, ox + 6, oy + 9, ox + 10, oy + 12, (40, 40, 45, 255))
    px(buf, w, ox + 8, oy + 6, (160, 240, 230, 255))  # light

    # 16 whiteboard
    ox, oy = tile_at(0, 2)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, CARPET)
    fill(buf, w, ox + 1, oy + 2, ox + 15, oy + 13, BOARD_FRAME)
    fill(buf, w, ox + 2, oy + 3, ox + 14, oy + 12, BOARD)
    # scribbles
    for x in range(4, 12, 2):
        px(buf, w, ox + x, oy + 6, (60, 90, 140, 255))
    fill(buf, w, ox + 4, oy + 9, ox + 11, oy + 10, (70, 160, 190, 255))

    # 17 rug / carpet piece
    ox, oy = tile_at(1, 2)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, FLOOR)
    fill(buf, w, ox + 1, oy + 2, ox + 15, oy + 14, RUG)
    rect(buf, w, ox + 1, oy + 2, ox + 15, oy + 14, (36, 90, 108, 255))
    fill(buf, w, ox + 4, oy + 5, ox + 12, oy + 11, (64, 150, 170, 255))

    # 18 wall picture frame
    ox, oy = tile_at(2, 2)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, WALL)
    fill(buf, w, ox, oy, ox + TILE, oy + 3, WALL_TOP)
    fill(buf, w, ox + 3, oy + 4, ox + 13, oy + 13, (50, 64, 80, 255))
    fill(buf, w, ox + 4, oy + 5, ox + 12, oy + 12, FRAME_ART)
    px(buf, w, ox + 7, oy + 8, (90, 200, 170, 255))

    # 19 floor lamp glow tile
    ox, oy = tile_at(3, 2)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, FLOOR)
    fill(buf, w, ox + 7, oy + 2, ox + 9, oy + 14, (70, 84, 100, 255))
    fill(buf, w, ox + 5, oy + 1, ox + 11, oy + 5, LAMP)
    # soft cool glow
    for dy in range(5, 12):
        for dx in range(4, 12):
            if (dx - 8) ** 2 + (dy - 8) ** 2 < 20:
                px(buf, w, ox + dx, oy + dy, (160, 230, 240, 60))

    # 20 sleep floor
    ox, oy = tile_at(4, 2)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, SLEEP_FLOOR)
    for i in range(0, TILE, 3):
        px(buf, w, ox + i, oy + (i * 2) % TILE, SLEEP_FLOOR2)

    # 21 corridor runner (cool strip)
    ox, oy = tile_at(5, 2)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, FLOOR_WOOD)
    fill(buf, w, ox + 2, oy + 1, ox + 14, oy + 15, (70, 100, 120, 255))
    rect(buf, w, ox + 2, oy + 1, ox + 14, oy + 15, (50, 78, 98, 255))

    # 22 round meeting table center piece
    ox, oy = tile_at(6, 2)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, CARPET)
    for row in range(2, 14):
        t = abs((row - 8) / 6.0)
        half = int(6 - t * 5)
        fill(buf, w, ox + 8 - half, oy + row, ox + 8 + half + 1, oy + row + 1, TABLE)
    rect(buf, w, ox + 3, oy + 3, ox + 13, oy + 13, DESK)

    # 23 side table (break)
    ox, oy = tile_at(7, 2)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, BREAK_FLOOR)
    fill(buf, w, ox + 3, oy + 6, ox + 13, oy + 13, TABLE)
    fill(buf, w, ox + 5, oy + 4, ox + 11, oy + 7, (190, 220, 230, 255))  # cups

    # 24 wood floor bright (entry)
    ox, oy = tile_at(0, 3)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, FLOOR_WOOD)
    for i in range(0, TILE, 2):
        px(buf, w, ox + i, oy + 4, DESK_TOP)
        px(buf, w, ox + i, oy + 10, DESK)

    # 25 dual monitor desk (code work denser)
    ox, oy = tile_at(1, 3)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, FLOOR)
    fill(buf, w, ox + 1, oy + 7, ox + 15, oy + 14, DESK)
    fill(buf, w, ox + 2, oy + 2, ox + 7, oy + 7, MONITOR)
    fill(buf, w, ox + 3, oy + 3, ox + 6, oy + 6, SCREEN)
    fill(buf, w, ox + 9, oy + 2, ox + 14, oy + 7, MONITOR)
    fill(buf, w, ox + 10, oy + 3, ox + 13, oy + 6, (100, 180, 220, 255))

    # 26 plant on break floor
    ox, oy = tile_at(2, 3)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, BREAK_FLOOR)
    fill(buf, w, ox + 6, oy + 10, ox + 10, oy + 14, POT)
    fill(buf, w, ox + 5, oy + 3, ox + 11, oy + 11, PLANT)

    # 27 small rug sleep
    ox, oy = tile_at(3, 3)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, SLEEP_FLOOR)
    fill(buf, w, ox + 2, oy + 4, ox + 14, oy + 12, (80, 90, 120, 255))
    rect(buf, w, ox + 2, oy + 4, ox + 14, oy + 12, (60, 70, 100, 255))

    # rest of tiles — cool wall alt
    ox, oy = tile_at(4, 3)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, WALL_WARM)
    fill(buf, w, ox, oy, ox + TILE, oy + 3, WALL_TOP)

    write_png(OUT / "office-tiles.png", w, h, bytes(buf))
    print("wrote", OUT / "office-tiles.png", f"{w}x{h}")


def draw_char_frame(
    buf: bytearray,
    sheet_w: int,
    ox: int,
    oy: int,
    body: tuple[int, int, int, int],
    hair: tuple[int, int, int, int],
    facing: str,
    step: int,
    style: str = "mushroom",
) -> None:
    """쿵야-style cute blob characters (mushroom / onion / riceball), 16x24."""
    EYE = (30, 30, 30, 255)
    CHEEK = (240, 160, 150, 255)
    STEM = (245, 235, 210, 255)
    WHITE = (250, 248, 240, 255)

    fill(buf, sheet_w, ox, oy, ox + 16, oy + 24, TRANS)
    bob = 0 if step == 0 else (1 if step == 1 else -1)
    fill(buf, sheet_w, ox + 4, oy + 21, ox + 12, oy + 23, (0, 0, 0, 55))

    if style == "onion":
        for row in range(4, 20):
            t = abs((row - 12) / 8.0)
            half = int(5 - t * 3)
            y = oy + row + bob
            fill(buf, sheet_w, ox + 8 - half, y, ox + 8 + half + 1, y + 1, body if row % 2 else hair)
        fill(buf, sheet_w, ox + 7, oy + 1 + bob, ox + 9, oy + 5 + bob, (80, 160, 70, 255))
        px(buf, sheet_w, ox + 6, oy + 2 + bob, (80, 160, 70, 255))
        px(buf, sheet_w, ox + 9, oy + 2 + bob, (80, 160, 70, 255))
        face_y = 9
    elif style == "rice":
        for row in range(2, 20):
            t = (row - 2) / 18.0
            half = int(1 + t * 6)
            y = oy + row + bob
            fill(buf, sheet_w, ox + 8 - half, y, ox + 8 + half + 1, y + 1, body if row % 3 else hair)
        fill(buf, sheet_w, ox + 4, oy + 14 + bob, ox + 12, oy + 18 + bob, (45, 70, 50, 255))
        fill(buf, sheet_w, ox + 5, oy + 13 + bob, ox + 11, oy + 14 + bob, (45, 70, 50, 255))
        face_y = 8
    else:
        fill(buf, sheet_w, ox + 5, oy + 12 + bob, ox + 11, oy + 20 + bob, STEM)
        for row in range(2, 13):
            t = (row - 2) / 11.0
            half = int(2 + (1 - abs(t - 0.45) * 1.6) * 5)
            half = max(2, min(7, half))
            y = oy + row + bob
            fill(buf, sheet_w, ox + 8 - half, y, ox + 8 + half + 1, y + 1, body)
        px(buf, sheet_w, ox + 5, oy + 6 + bob, WHITE)
        px(buf, sheet_w, ox + 6, oy + 6 + bob, WHITE)
        px(buf, sheet_w, ox + 10, oy + 5 + bob, WHITE)
        px(buf, sheet_w, ox + 9, oy + 8 + bob, WHITE)
        fill(buf, sheet_w, ox + 3, oy + 11 + bob, ox + 13, oy + 13 + bob, hair)
        face_y = 14

    if facing == "down":
        px(buf, sheet_w, ox + 6, oy + face_y + bob, EYE)
        px(buf, sheet_w, ox + 9, oy + face_y + bob, EYE)
        px(buf, sheet_w, ox + 5, oy + face_y + 2 + bob, CHEEK)
        px(buf, sheet_w, ox + 10, oy + face_y + 2 + bob, CHEEK)
    elif facing == "left":
        px(buf, sheet_w, ox + 5, oy + face_y + bob, EYE)
        px(buf, sheet_w, ox + 4, oy + face_y + 2 + bob, CHEEK)
    elif facing == "right":
        px(buf, sheet_w, ox + 10, oy + face_y + bob, EYE)
        px(buf, sheet_w, ox + 11, oy + face_y + 2 + bob, CHEEK)


def draw_human_boss_frame(
    buf: bytearray,
    sheet_w: int,
    ox: int,
    oy: int,
    facing: str,
    step: int,
) -> None:
    """16-bit human (suit/casual) — 16x24, 4-dir walk."""
    SKIN = (232, 190, 160, 255)
    HAIR = (55, 42, 35, 255)
    SUIT = (45, 58, 92, 255)
    SUIT_DK = (32, 42, 68, 255)
    SHIRT = (240, 236, 228, 255)
    TIE = (160, 55, 50, 255)
    PANTS = (38, 48, 72, 255)
    SHOE = (30, 28, 28, 255)
    EYE = (25, 25, 25, 255)

    fill(buf, sheet_w, ox, oy, ox + 16, oy + 24, TRANS)
    bob = 0 if step == 0 else (1 if step == 1 else -1)
    # shadow
    fill(buf, sheet_w, ox + 4, oy + 22, ox + 12, oy + 23, (0, 0, 0, 50))

    leg_off = 0 if step == 0 else (1 if step == 1 else -1)

    if facing == "down":
        # legs
        fill(buf, sheet_w, ox + 5, oy + 17 + bob, ox + 7, oy + 21 + bob, PANTS)
        fill(buf, sheet_w, ox + 9, oy + 17 + bob, ox + 11, oy + 21 + bob, PANTS)
        fill(buf, sheet_w, ox + 5, oy + 21 + bob + leg_off, ox + 7, oy + 23 + bob + max(leg_off, 0), SHOE)
        fill(buf, sheet_w, ox + 9, oy + 21 + bob - leg_off, ox + 11, oy + 23 + bob + max(-leg_off, 0), SHOE)
        # torso suit
        fill(buf, sheet_w, ox + 4, oy + 11 + bob, ox + 12, oy + 18 + bob, SUIT)
        fill(buf, sheet_w, ox + 7, oy + 11 + bob, ox + 9, oy + 17 + bob, SHIRT)
        fill(buf, sheet_w, ox + 7, oy + 12 + bob, ox + 9, oy + 16 + bob, TIE)
        # arms
        arm = 1 if step == 1 else (-1 if step == 2 else 0)
        fill(buf, sheet_w, ox + 2, oy + 12 + bob + arm, ox + 4, oy + 17 + bob + arm, SUIT_DK)
        fill(buf, sheet_w, ox + 12, oy + 12 + bob - arm, ox + 14, oy + 17 + bob - arm, SUIT_DK)
        # head
        fill(buf, sheet_w, ox + 5, oy + 4 + bob, ox + 11, oy + 10 + bob, SKIN)
        fill(buf, sheet_w, ox + 4, oy + 3 + bob, ox + 12, oy + 6 + bob, HAIR)
        px(buf, sheet_w, ox + 6, oy + 7 + bob, EYE)
        px(buf, sheet_w, ox + 9, oy + 7 + bob, EYE)
    elif facing == "up":
        fill(buf, sheet_w, ox + 5, oy + 17 + bob, ox + 7, oy + 21 + bob, PANTS)
        fill(buf, sheet_w, ox + 9, oy + 17 + bob, ox + 11, oy + 21 + bob, PANTS)
        fill(buf, sheet_w, ox + 5, oy + 21 + bob - leg_off, ox + 7, oy + 23 + bob, SHOE)
        fill(buf, sheet_w, ox + 9, oy + 21 + bob + leg_off, ox + 11, oy + 23 + bob, SHOE)
        fill(buf, sheet_w, ox + 4, oy + 11 + bob, ox + 12, oy + 18 + bob, SUIT)
        arm = 1 if step == 1 else (-1 if step == 2 else 0)
        fill(buf, sheet_w, ox + 2, oy + 12 + bob - arm, ox + 4, oy + 17 + bob - arm, SUIT_DK)
        fill(buf, sheet_w, ox + 12, oy + 12 + bob + arm, ox + 14, oy + 17 + bob + arm, SUIT_DK)
        fill(buf, sheet_w, ox + 5, oy + 4 + bob, ox + 11, oy + 10 + bob, SKIN)
        fill(buf, sheet_w, ox + 4, oy + 2 + bob, ox + 12, oy + 7 + bob, HAIR)
    elif facing == "left":
        fill(buf, sheet_w, ox + 6, oy + 17 + bob, ox + 8, oy + 21 + bob, PANTS)
        fill(buf, sheet_w, ox + 8, oy + 17 + bob, ox + 10, oy + 21 + bob + leg_off, PANTS)
        fill(buf, sheet_w, ox + 6, oy + 21 + bob, ox + 8, oy + 23 + bob, SHOE)
        fill(buf, sheet_w, ox + 8, oy + 21 + bob + leg_off, ox + 10, oy + 23 + bob + max(leg_off, 0), SHOE)
        fill(buf, sheet_w, ox + 5, oy + 11 + bob, ox + 11, oy + 18 + bob, SUIT)
        fill(buf, sheet_w, ox + 6, oy + 11 + bob, ox + 8, oy + 15 + bob, SHIRT)
        # front arm
        arm = 1 if step != 0 else 0
        fill(buf, sheet_w, ox + 3, oy + 12 + bob + arm, ox + 5, oy + 17 + bob + arm, SUIT_DK)
        fill(buf, sheet_w, ox + 5, oy + 4 + bob, ox + 11, oy + 10 + bob, SKIN)
        fill(buf, sheet_w, ox + 5, oy + 3 + bob, ox + 11, oy + 6 + bob, HAIR)
        px(buf, sheet_w, ox + 6, oy + 7 + bob, EYE)
    else:  # right
        fill(buf, sheet_w, ox + 6, oy + 17 + bob, ox + 8, oy + 21 + bob + leg_off, PANTS)
        fill(buf, sheet_w, ox + 8, oy + 17 + bob, ox + 10, oy + 21 + bob, PANTS)
        fill(buf, sheet_w, ox + 6, oy + 21 + bob + leg_off, ox + 8, oy + 23 + bob + max(leg_off, 0), SHOE)
        fill(buf, sheet_w, ox + 8, oy + 21 + bob, ox + 10, oy + 23 + bob, SHOE)
        fill(buf, sheet_w, ox + 5, oy + 11 + bob, ox + 11, oy + 18 + bob, SUIT)
        fill(buf, sheet_w, ox + 8, oy + 11 + bob, ox + 10, oy + 15 + bob, SHIRT)
        arm = 1 if step != 0 else 0
        fill(buf, sheet_w, ox + 11, oy + 12 + bob + arm, ox + 13, oy + 17 + bob + arm, SUIT_DK)
        fill(buf, sheet_w, ox + 5, oy + 4 + bob, ox + 11, oy + 10 + bob, SKIN)
        fill(buf, sheet_w, ox + 5, oy + 3 + bob, ox + 11, oy + 6 + bob, HAIR)
        px(buf, sheet_w, ox + 9, oy + 7 + bob, EYE)


def make_characters() -> None:
    dirs = ["down", "left", "right", "up"]
    agents = [
        ("mushroom", (200, 70, 80, 255), (140, 40, 50, 255), "mushroom"),
        ("onion", (240, 200, 90, 255), (210, 160, 50, 255), "onion"),
        ("claude", (90, 170, 120, 255), (50, 110, 80, 255), "mushroom"),
    ]
    fw, fh = 16, 24
    cols, rows = 3, 4
    for name, body, hair, style in agents:
        w, h = cols * fw, rows * fh
        buf = bytearray(w * h * 4)
        for rj, facing in enumerate(dirs):
            for ci, step in enumerate([0, 1, 2]):
                draw_char_frame(buf, w, ci * fw, rj * fh, body, hair, facing, step, style)
        path = OUT / f"char-{name}.png"
        write_png(path, w, h, bytes(buf))
        print("wrote", path)

    # boss = human 대장님
    w, h = cols * fw, rows * fh
    buf = bytearray(w * h * 4)
    for rj, facing in enumerate(dirs):
        for ci, step in enumerate([0, 1, 2]):
            draw_human_boss_frame(buf, w, ci * fw, rj * fh, facing, step)
    path = OUT / "char-boss.png"
    write_png(path, w, h, bytes(buf))
    print("wrote", path)


def make_map_json() -> None:
    """
    Expanded office — 40x30 tiles with 5 zones + corridor + entrance.

    GID (1-based):
      1 floor  2 floor2  3 wall  4 carpetM  5 breakFloor  6 desk  7 chair  8 table
      9 sofa  10 plant  11 door  12 window  13 void  14 bed  15 canvas  16 coffee
      17 whiteboard  18 rug  19 picture  20 lamp  21 sleepFloor  22 corridor
      23 roundTable  24 sideTable  25 woodEntry  26 dualDesk  27 plantBreak  28 sleepRug
      29 wallWarm
    """
    W, H = 40, 30
    floor = [[1 for _ in range(W)] for _ in range(H)]
    coll = [[0 for _ in range(W)] for _ in range(H)]
    decor = [[0 for _ in range(W)] for _ in range(H)]

    def set_rect(layer, x0, y0, x1, y1, v):
        for y in range(y0, y1):
            for x in range(x0, x1):
                if 0 <= x < W and 0 <= y < H:
                    layer[y][x] = v

    def wall_h(x0, x1, y):
        for x in range(x0, x1):
            floor[y][x] = 3
            coll[y][x] = 13

    def wall_v(y0, y1, x):
        for y in range(y0, y1):
            floor[y][x] = 3
            coll[y][x] = 13

    def door_at(x, y):
        floor[y][x] = 11
        coll[y][x] = 0

    # outer walls
    for x in range(W):
        floor[0][x] = 3
        floor[H - 1][x] = 3
        coll[0][x] = 13
        coll[H - 1][x] = 13
    for y in range(H):
        floor[y][0] = 3
        floor[y][W - 1] = 3
        coll[y][0] = 13
        coll[y][W - 1] = 13

    # --- 작업실 1 (NW code) x1-12, y1-11 ---
    set_rect(floor, 1, 1, 13, 12, 1)
    wall_h(1, 13, 11)
    wall_v(1, 12, 12)
    door_at(6, 11)
    # dual desks + chairs
    for dx, dy in [(3, 4), (7, 4), (3, 7)]:
        decor[dy][dx] = 26
        decor[dy][dx + 1] = 6
        coll[dy][dx] = 13
        coll[dy][dx + 1] = 13
        decor[dy + 1][dx] = 7
        coll[dy + 1][dx] = 13
    decor[2][2] = 10
    coll[2][2] = 13
    decor[2][10] = 20  # lamp
    coll[2][10] = 13
    floor[0][4] = 12
    floor[0][8] = 12
    floor[1][1] = 19  # picture on near-wall via furniture? put on ground as wall tile
    # pictures on north wall ground tiles already wall — embed picture gid on wall row interiors:
    floor[0][5] = 19
    floor[0][9] = 19

    # --- 휴게실 (NE break) x27-38, y1-11 ---
    set_rect(floor, 27, 1, 39, 12, 5)
    wall_h(27, 39, 11)
    wall_v(1, 12, 26)
    door_at(32, 11)
    decor[3][29] = 9
    decor[3][30] = 9
    decor[3][31] = 9
    for x in (29, 30, 31):
        coll[3][x] = 13
    decor[5][35] = 16  # coffee
    coll[5][35] = 13
    decor[6][30] = 24  # side table
    coll[6][30] = 13
    decor[8][28] = 27
    coll[8][28] = 13
    decor[2][37] = 20
    coll[2][37] = 13
    floor[0][30] = 12
    floor[0][34] = 12
    floor[0][36] = 19

    # --- 회의실 (center) x14-25, y3-14 ---
    set_rect(floor, 14, 3, 26, 15, 4)
    wall_h(14, 26, 2)
    wall_h(14, 26, 14)
    wall_v(3, 15, 13)
    wall_v(3, 15, 25)
    # doors into meeting from corridor N/S/E/W
    door_at(19, 2)   # from north hall
    door_at(19, 14)  # south
    door_at(13, 8)   # west corridor
    door_at(25, 8)   # east corridor
    # round table cluster
    for x, y in [(18, 7), (19, 7), (20, 7), (18, 8), (19, 8), (20, 8)]:
        decor[y][x] = 23
        coll[y][x] = 13
    # chairs around
    for x, y in [(17, 7), (21, 7), (19, 6), (19, 9)]:
        decor[y][x] = 7
        coll[y][x] = 13
    # whiteboard top of room
    decor[4][19] = 17
    coll[4][19] = 13
    decor[4][20] = 17
    coll[4][20] = 13
    decor[12][15] = 10
    coll[12][15] = 13
    floor[2][17] = 19
    floor[2][21] = 12

    # --- 작업실 2 (SW art) x1-12, y16-26 ---
    set_rect(floor, 1, 16, 13, 27, 1)
    wall_h(1, 13, 15)
    wall_h(1, 13, 26)
    wall_v(16, 27, 12)
    door_at(6, 15)
    # art desks + canvas
    decor[18][3] = 6
    decor[18][4] = 6
    coll[18][3] = 13
    coll[18][4] = 13
    decor[19][3] = 7
    coll[19][3] = 13
    decor[18][8] = 15  # canvas
    coll[18][8] = 13
    decor[21][5] = 15
    coll[21][5] = 13
    decor[21][9] = 6
    decor[21][10] = 6
    coll[21][9] = 13
    coll[21][10] = 13
    decor[22][9] = 7
    coll[22][9] = 13
    decor[17][2] = 10
    coll[17][2] = 13
    decor[24][2] = 18  # rug
    # rug walkable
    decor[24][11] = 20
    coll[24][11] = 13
    floor[26][4] = 12  # south window on bottom of room wall? bottom is wall at 26 — skip
    # window on left outer already; add picture on wall row 15
    floor[15][3] = 19
    floor[15][9] = 12

    # --- 수면실 (SE sleep) x27-38, y16-26 ---
    set_rect(floor, 27, 16, 39, 27, 21)
    wall_h(27, 39, 15)
    wall_h(27, 39, 26)
    wall_v(16, 27, 26)
    door_at(32, 15)
    # beds
    decor[18][29] = 14
    decor[18][30] = 14
    coll[18][29] = 13
    coll[18][30] = 13
    decor[18][34] = 14
    decor[18][35] = 14
    coll[18][34] = 13
    coll[18][35] = 13
    decor[22][30] = 28  # sleep rug walkable
    decor[22][31] = 28
    decor[24][37] = 10
    coll[24][37] = 13
    decor[20][37] = 20
    coll[20][37] = 13
    floor[15][30] = 19
    floor[15][35] = 12

    # --- corridors ---
    # horizontal mid corridor between rooms (y12-14 already partly meeting)
    set_rect(floor, 1, 12, 39, 15, 22)
    # clear corridor collisions (except outer)
    for y in range(12, 15):
        for x in range(1, 39):
            if floor[y][x] in (3, 11):
                continue
            coll[y][x] = 0
            if floor[y][x] == 1:
                floor[y][x] = 22

    # vertical center corridor (x13-25 outside meeting already handled)
    for y in range(1, 29):
        for x in range(13, 26):
            if floor[y][x] == 3 or coll[y][x]:
                continue
            if floor[y][x] in (4, 5, 21):
                continue
            floor[y][x] = 22

    # south entry hall
    set_rect(floor, 14, 27, 26, 29, 25)
    for y in range(27, 29):
        for x in range(14, 26):
            coll[y][x] = 0
    # entrance doors at bottom
    door_at(19, H - 1)
    door_at(20, H - 1)
    # entry plants
    decor[27][15] = 10
    coll[27][15] = 13
    decor[27][24] = 10
    coll[27][24] = 13
    decor[27][18] = 20
    coll[27][18] = 13

    # reconnect room doors after corridor overwrite
    door_at(6, 11)
    door_at(32, 11)
    door_at(6, 15)
    door_at(32, 15)
    door_at(19, 2)
    door_at(19, 14)
    door_at(13, 8)
    door_at(25, 8)
    # open wall doors properly (ensure floor door + no coll)
    for x, y in [(6, 11), (32, 11), (6, 15), (32, 15), (19, 2), (19, 14), (13, 8), (25, 8), (19, H - 1), (20, H - 1)]:
        floor[y][x] = 11
        coll[y][x] = 0

    # hallway plants / pictures
    for x, y in [(10, 13), (29, 13), (16, 28)]:
        if decor[y][x] == 0:
            decor[y][x] = 10
            coll[y][x] = 13

    # floor variation noise on open floors
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            if floor[y][x] == 1 and (x + y) % 5 == 0:
                floor[y][x] = 2

    # windows on outer north wall (preserve some pictures)
    for x in (3, 7, 11, 28, 33, 37):
        if floor[0][x] == 3:
            floor[0][x] = 12

    def flat(layer):
        out = []
        for row in layer:
            out.extend(row)
        return out

    coll_tiles = []
    for y in range(H):
        for x in range(W):
            coll_tiles.append(3 if coll[y][x] else 0)

    waypoints = {
        "desks": [
            {"x": 3, "y": 6},   # work1 — mushroom
            {"x": 7, "y": 6},   # work1/near — onion
            {"x": 9, "y": 20},  # work2 art — claude
        ],
        "meeting": {"x": 17, "y": 10},
        "break": {"x": 32, "y": 6},
        "sleep": {"x": 32, "y": 21},
        "entrance": {"x": 20, "y": 27},
    }

    data = {
        "compressionlevel": -1,
        "height": H,
        "width": W,
        "tilewidth": TILE,
        "tileheight": TILE,
        "infinite": False,
        "orientation": "orthogonal",
        "renderorder": "right-down",
        "tiledversion": "1.10.0",
        "type": "map",
        "version": "1.10",
        "nextlayerid": 4,
        "nextobjectid": 1,
        "tilesets": [
            {
                "columns": 8,
                "firstgid": 1,
                "image": "office-tiles.png",
                "imageheight": 96,
                "imagewidth": 128,
                "margin": 0,
                "name": "office",
                "spacing": 0,
                "tilecount": 48,
                "tileheight": TILE,
                "tilewidth": TILE,
            }
        ],
        "layers": [
            {
                "id": 1,
                "name": "ground",
                "type": "tilelayer",
                "visible": True,
                "opacity": 1,
                "width": W,
                "height": H,
                "data": flat(floor),
                "x": 0,
                "y": 0,
            },
            {
                "id": 2,
                "name": "furniture",
                "type": "tilelayer",
                "visible": True,
                "opacity": 1,
                "width": W,
                "height": H,
                "data": flat(decor),
                "x": 0,
                "y": 0,
            },
            {
                "id": 3,
                "name": "collision",
                "type": "tilelayer",
                "visible": False,
                "opacity": 0,
                "width": W,
                "height": H,
                "data": coll_tiles,
                "x": 0,
                "y": 0,
            },
        ],
        "properties": [
            {
                "name": "waypoints",
                "type": "string",
                "value": json.dumps(waypoints),
            }
        ],
    }
    path = OUT / "office-map.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    print("wrote", path, f"{W}x{H}")


if __name__ == "__main__":
    make_tileset()
    make_characters()
    make_map_json()
