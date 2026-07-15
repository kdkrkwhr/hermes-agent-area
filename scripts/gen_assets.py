"""Generate Silicon Valley open-office tileset + map + character sheets."""
from __future__ import annotations

import json
import math
import struct
import wave
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets"
OUT.mkdir(parents=True, exist_ok=True)

DRAW_TILE = 16
EXPORT_TILE = 32
ASSET_SCALE = EXPORT_TILE // DRAW_TILE
TILE = DRAW_TILE


def upscale_rgba(rgba: bytes, w: int, h: int, factor: int) -> tuple[bytes, int, int]:
    if factor <= 1:
        return rgba, w, h
    nw, nh = w * factor, h * factor
    out = bytearray(nw * nh * 4)
    for y in range(nh):
        sy = y // factor
        for x in range(nw):
            sx = x // factor
            si = (sy * w + sx) * 4
            di = (y * nw + x) * 4
            out[di : di + 4] = rgba[si : si + 4]
    return bytes(out), nw, nh


def write_png(path: Path, w: int, h: int, rgba: bytes, scale: int = 1) -> None:
    if scale > 1:
        rgba, w, h = upscale_rgba(rgba, w, h, scale)

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


# Silicon Valley loft — bright wood, glass, sage, soft cream (not dungeon navy)
FLOOR = (232, 220, 196, 255)  # light oak
FLOOR2 = (214, 224, 230, 255)  # soft gray carpet
FLOOR_WOOD = (210, 186, 150, 255)
WALL = (244, 240, 234, 255)  # plaster
WALL_TOP = (198, 210, 218, 255)
WALL_WARM = (236, 230, 220, 255)
CARPET = (186, 214, 198, 255)  # sage meeting
CARPET2 = (160, 196, 178, 255)
BREAK_FLOOR = (248, 246, 242, 255)  # white terrazzo
SLEEP_FLOOR = (226, 232, 242, 255)
SLEEP_FLOOR2 = (210, 218, 232, 255)
DESK = (120, 92, 68, 255)
DESK_TOP = (176, 140, 102, 255)
CHAIR = (72, 120, 132, 255)
MONITOR = (36, 42, 52, 255)
SCREEN = (120, 210, 230, 255)
SOFA = (90, 140, 150, 255)
TABLE = (168, 140, 108, 255)
DOOR = (180, 210, 220, 255)
WINDOW = (170, 210, 235, 255)
SKY = (210, 230, 245, 255)
PLANT = (72, 168, 110, 255)
POT = (150, 120, 90, 255)
BED = (160, 180, 210, 255)
BED_SHEET = (248, 250, 252, 255)
CANVAS = (250, 248, 242, 255)
CANVAS_FRAME = (120, 100, 80, 255)
COFFEE = (70, 74, 82, 255)
COFFEE_ACCENT = (90, 190, 170, 255)
BOARD = (252, 252, 250, 255)
BOARD_FRAME = (140, 150, 160, 255)
RUG = (120, 170, 160, 255)
FRAME_ART = (110, 180, 170, 255)
LAMP = (255, 236, 180, 255)
BEAN = (230, 140, 110, 255)
GLASS = (200, 220, 230, 180)
TRANS = (0, 0, 0, 0)


def make_tileset() -> None:
    """Chunky furniture on transparent/minimal bg — readable on big open map."""
    cols, rows = 8, 6
    w, h = cols * TILE, rows * TILE
    buf = bytearray(w * h * 4)

    def tile_at(ti: int, tj: int) -> tuple[int, int]:
        return ti * TILE, tj * TILE

    # 0 light oak
    ox, oy = tile_at(0, 0)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, FLOOR)
    for i in range(0, TILE, 4):
        fill(buf, w, ox, oy + i, ox + TILE, oy + i + 1, (220, 206, 178, 255))

    # 1 soft carpet
    ox, oy = tile_at(1, 0)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, FLOOR2)
    for i in range(0, TILE, 5):
        px(buf, w, ox + i, oy + (i * 2) % TILE, (200, 212, 220, 255))

    # 2 soft plaster wall
    ox, oy = tile_at(2, 0)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, WALL)
    fill(buf, w, ox, oy, ox + TILE, oy + 3, WALL_TOP)
    fill(buf, w, ox, oy + TILE - 2, ox + TILE, oy + TILE, (220, 214, 204, 255))

    # 3 sage zone carpet
    ox, oy = tile_at(3, 0)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, CARPET)
    rect(buf, w, ox, oy, ox + TILE, oy + TILE, CARPET2)

    # 4 lounge / kitchen white
    ox, oy = tile_at(4, 0)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, BREAK_FLOOR)
    for i in range(2, TILE, 6):
        px(buf, w, ox + i, oy + 6, (230, 228, 224, 255))

    # 5 BIG desk + monitor (fills tile)
    ox, oy = tile_at(5, 0)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, TRANS)
    fill(buf, w, ox, oy + 7, ox + TILE, oy + TILE, DESK)
    fill(buf, w, ox, oy + 5, ox + TILE, oy + 8, DESK_TOP)
    fill(buf, w, ox + 3, oy + 1, ox + 13, oy + 6, MONITOR)
    fill(buf, w, ox + 4, oy + 2, ox + 12, oy + 5, SCREEN)

    # 6 BIG chair
    ox, oy = tile_at(6, 0)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, TRANS)
    fill(buf, w, ox + 2, oy + 5, ox + 14, oy + 15, CHAIR)
    fill(buf, w, ox + 3, oy + 2, ox + 13, oy + 8, CHAIR)
    fill(buf, w, ox + 4, oy + 1, ox + 12, oy + 3, (90, 150, 160, 255))

    # 7 meeting table leaf
    ox, oy = tile_at(7, 0)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, TRANS)
    fill(buf, w, ox + 1, oy + 3, ox + 15, oy + 13, TABLE)
    rect(buf, w, ox + 1, oy + 3, ox + 15, oy + 13, DESK)

    # 8 BIG sofa segment
    ox, oy = tile_at(0, 1)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, TRANS)
    fill(buf, w, ox, oy + 4, ox + TILE, oy + 15, SOFA)
    fill(buf, w, ox, oy + 2, ox + TILE, oy + 7, (110, 160, 168, 255))
    fill(buf, w, ox + 1, oy + 1, ox + 5, oy + 5, (120, 170, 175, 255))  # cushion

    # 9 BIG plant (fills tile)
    ox, oy = tile_at(1, 1)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, TRANS)
    fill(buf, w, ox + 5, oy + 11, ox + 11, oy + 16, POT)
    fill(buf, w, ox + 2, oy + 2, ox + 14, oy + 12, PLANT)
    fill(buf, w, ox + 4, oy + 0, ox + 12, oy + 4, (56, 150, 96, 255))
    px(buf, w, ox + 8, oy + 1, (40, 120, 70, 255))

    # 10 glass door
    ox, oy = tile_at(2, 1)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, WALL)
    fill(buf, w, ox + 2, oy + 1, ox + 14, oy + 15, DOOR)
    rect(buf, w, ox + 2, oy + 1, ox + 14, oy + 15, WALL_TOP)
    px(buf, w, ox + 12, oy + 8, (80, 200, 180, 255))

    # 11 bright window + sky
    ox, oy = tile_at(3, 1)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, WALL)
    fill(buf, w, ox + 1, oy + 2, ox + 15, oy + 14, WINDOW)
    fill(buf, w, ox + 2, oy + 3, ox + 14, oy + 12, SKY)
    fill(buf, w, ox + 3, oy + 9, ox + 13, oy + 12, (190, 215, 180, 255))  # hills
    rect(buf, w, ox + 1, oy + 2, ox + 15, oy + 14, WALL_TOP)

    # 12 outdoor / void (light courtyard hint)
    ox, oy = tile_at(4, 1)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, (180, 200, 160, 255))
    for i in range(0, TILE, 3):
        px(buf, w, ox + i, oy + 10, (150, 180, 120, 255))

    # 13 nap pod / bed BIG
    ox, oy = tile_at(5, 1)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, TRANS)
    fill(buf, w, ox, oy + 3, ox + TILE, oy + 15, BED)
    fill(buf, w, ox + 1, oy + 4, ox + 15, oy + 13, BED_SHEET)
    fill(buf, w, ox + 1, oy + 4, ox + 7, oy + 9, (255, 255, 255, 255))

    # 14 whiteboard / standup board BIG
    ox, oy = tile_at(6, 1)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, TRANS)
    fill(buf, w, ox + 1, oy + 1, ox + 15, oy + 14, BOARD_FRAME)
    fill(buf, w, ox + 2, oy + 2, ox + 14, oy + 13, BOARD)
    fill(buf, w, ox + 3, oy + 5, ox + 12, oy + 6, (80, 160, 190, 255))
    fill(buf, w, ox + 4, oy + 8, ox + 10, oy + 9, (60, 120, 140, 255))

    # 15 coffee bar / island
    ox, oy = tile_at(7, 1)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, TRANS)
    fill(buf, w, ox, oy + 6, ox + TILE, oy + 15, (190, 170, 140, 255))
    fill(buf, w, ox + 2, oy + 3, ox + 14, oy + 12, COFFEE)
    fill(buf, w, ox + 4, oy + 4, ox + 12, oy + 7, COFFEE_ACCENT)
    fill(buf, w, ox + 6, oy + 8, ox + 10, oy + 11, (40, 40, 45, 255))

    # 16 glass partition
    ox, oy = tile_at(0, 2)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, GLASS)
    rect(buf, w, ox, oy, ox + TILE, oy + TILE, (160, 190, 205, 255))
    fill(buf, w, ox + 7, oy, ox + 9, oy + TILE, (170, 200, 215, 200))

    # 17 rug leaf BIG
    ox, oy = tile_at(1, 2)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, TRANS)
    fill(buf, w, ox + 1, oy + 1, ox + 15, oy + 15, RUG)
    rect(buf, w, ox + 1, oy + 1, ox + 15, oy + 15, (90, 140, 130, 255))
    fill(buf, w, ox + 4, oy + 4, ox + 12, oy + 12, (140, 190, 175, 255))

    # 18 wall poster / art
    ox, oy = tile_at(2, 2)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, WALL)
    fill(buf, w, ox, oy, ox + TILE, oy + 3, WALL_TOP)
    fill(buf, w, ox + 2, oy + 3, ox + 14, oy + 14, (80, 90, 100, 255))
    fill(buf, w, ox + 3, oy + 4, ox + 13, oy + 13, FRAME_ART)
    fill(buf, w, ox + 5, oy + 6, ox + 11, oy + 10, (255, 200, 120, 255))

    # 19 floor lamp BIG
    ox, oy = tile_at(3, 2)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, TRANS)
    fill(buf, w, ox + 7, oy + 4, ox + 9, oy + 15, (120, 110, 95, 255))
    fill(buf, w, ox + 4, oy + 1, ox + 12, oy + 6, LAMP)
    fill(buf, w, ox + 5, oy + 2, ox + 11, oy + 5, (255, 248, 210, 255))

    # 20 nap soft floor
    ox, oy = tile_at(4, 2)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, SLEEP_FLOOR)
    for i in range(0, TILE, 4):
        px(buf, w, ox + i, oy + (i * 2) % TILE, SLEEP_FLOOR2)

    # 21 polished concrete path
    ox, oy = tile_at(5, 2)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, (200, 204, 210, 255))
    fill(buf, w, ox + 1, oy + 1, ox + 15, oy + 15, (188, 194, 202, 255))

    # 22 round table center BIG
    ox, oy = tile_at(6, 2)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, TRANS)
    for row in range(1, 15):
        t = abs((row - 8) / 7.0)
        half = int(7 - t * 6)
        fill(buf, w, ox + 8 - half, oy + row, ox + 8 + half + 1, oy + row + 1, TABLE)
    rect(buf, w, ox + 2, oy + 2, ox + 14, oy + 14, DESK)

    # 23 beanbag / pouf BIG
    ox, oy = tile_at(7, 2)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, TRANS)
    for row in range(3, 15):
        t = abs((row - 9) / 6.0)
        half = int(6 - t * 4)
        fill(buf, w, ox + 8 - half, oy + row, ox + 8 + half + 1, oy + row + 1, BEAN)
    fill(buf, w, ox + 5, oy + 5, ox + 11, oy + 8, (240, 160, 130, 255))

    # 24 lobby bright wood
    ox, oy = tile_at(0, 3)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, FLOOR_WOOD)
    for i in range(0, TILE, 3):
        fill(buf, w, ox, oy + i, ox + TILE, oy + i + 1, (195, 168, 130, 255))

    # 25 dual-monitor workbench BIG
    ox, oy = tile_at(1, 3)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, TRANS)
    fill(buf, w, ox, oy + 8, ox + TILE, oy + TILE, DESK)
    fill(buf, w, ox, oy + 6, ox + TILE, oy + 9, DESK_TOP)
    fill(buf, w, ox + 1, oy + 1, ox + 7, oy + 7, MONITOR)
    fill(buf, w, ox + 2, oy + 2, ox + 6, oy + 6, SCREEN)
    fill(buf, w, ox + 9, oy + 1, ox + 15, oy + 7, MONITOR)
    fill(buf, w, ox + 10, oy + 2, ox + 14, oy + 6, (100, 190, 220, 255))

    # 26 big planter on lounge floor tint
    ox, oy = tile_at(2, 3)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, TRANS)
    fill(buf, w, ox + 4, oy + 10, ox + 12, oy + 16, POT)
    fill(buf, w, ox + 1, oy + 1, ox + 15, oy + 12, PLANT)
    fill(buf, w, ox + 3, oy + 0, ox + 13, oy + 4, (50, 140, 90, 255))

    # 27 soft rug on sleep
    ox, oy = tile_at(3, 3)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, TRANS)
    fill(buf, w, ox + 1, oy + 2, ox + 15, oy + 14, (170, 185, 210, 255))
    rect(buf, w, ox + 1, oy + 2, ox + 15, oy + 14, (140, 155, 185, 255))

    # 28 cream wall alt
    ox, oy = tile_at(4, 3)
    fill(buf, w, ox, oy, ox + TILE, oy + TILE, WALL_WARM)
    fill(buf, w, ox, oy, ox + TILE, oy + 3, WALL_TOP)

    # fill remaining unused slots with light floor noise
    for ti, tj in [(5, 3), (6, 3), (7, 3), (0, 4), (1, 4), (2, 4), (3, 4), (4, 4), (5, 4), (6, 4), (7, 4), (0, 5), (1, 5), (2, 5), (3, 5), (4, 5), (5, 5), (6, 5), (7, 5)]:
        ox, oy = tile_at(ti, tj)
        fill(buf, w, ox, oy, ox + TILE, oy + TILE, FLOOR2)

    write_png(OUT / "office-tiles.png", w, h, bytes(buf), scale=ASSET_SCALE)
    print("wrote", OUT / "office-tiles.png", f"{w * ASSET_SCALE}x{h * ASSET_SCALE}")


def make_map_json() -> None:
    """
    Room-bounded campus loft (40×30) with clear walls/doors + 2-tile halls.

    Zones (floors, interior):
      작업실1 10×12 NW carpet  — x=1..10, y=1..12
      작업실2 10×12 SW oak     — x=1..10, y=15..26
      회의실   8×8  center     — x=16..23, y=4..11
      휴게실   8×8  NE         — x=27..34, y=1..8
      수면실   5×5  SE         — x=29..33, y=19..23
      복도     2-wide spine    — x=12..13 (수직) + y=13..14 (수평)
      로비/입구               — y=26..28 center, doors on south wall

    GID (1-based):
      1 oak  2 carpet  3 wall  4 sage  5 loungeWhite  6 desk  7 chair  8 table
      9 sofa  10 plant  11 glassDoor  12 window  13 courtyard  14 bed  15 board
      16 coffee  17 glass  18 rug  19 poster  20 lamp  21 napFloor  22 concrete
      23 roundTable  24 beanbag  25 lobbyWood  26 dualDesk  27 bigPlant  28 sleepRug
      29 creamWall
    """
    W, H = 40, 30
    floor = [[22 for _ in range(W)] for _ in range(H)]
    coll = [[0 for _ in range(W)] for _ in range(H)]
    decor = [[0 for _ in range(W)] for _ in range(H)]

    def set_rect(layer, x0, y0, x1, y1, v):
        for y in range(y0, y1):
            for x in range(x0, x1):
                if 0 <= x < W and 0 <= y < H:
                    layer[y][x] = v

    def solid(x, y):
        if 0 <= x < W and 0 <= y < H:
            coll[y][x] = 13

    def put(x, y, gid, block=True):
        decor[y][x] = gid
        if block:
            solid(x, y)

    def wall_h(x0, x1, y, gid=3):
        for x in range(x0, x1):
            floor[y][x] = gid
            solid(x, y)

    def wall_v(x, y0, y1, gid=3):
        for y in range(y0, y1):
            floor[y][x] = gid
            solid(x, y)

    def door(x, y):
        floor[y][x] = 11
        coll[y][x] = 0

    # --- outer shell ---
    for x in range(W):
        floor[0][x] = 3
        floor[H - 1][x] = 3
        solid(x, 0)
        solid(x, H - 1)
    for y in range(H):
        floor[y][0] = 3
        floor[y][W - 1] = 3
        solid(0, y)
        solid(W - 1, y)
    for x in range(2, 38):
        floor[0][x] = 12  # north glass facade (still solid)

    # --- floors by zone ---
    set_rect(floor, 1, 1, 11, 13, 2)      # work1 carpet
    set_rect(floor, 1, 15, 11, 27, 1)     # work2 oak
    set_rect(floor, 16, 4, 24, 12, 4)     # meeting sage
    set_rect(floor, 27, 1, 35, 9, 5)      # lounge white
    set_rect(floor, 29, 19, 34, 24, 21)   # sleep soft
    set_rect(floor, 12, 1, 14, 27, 22)    # vertical corridor
    set_rect(floor, 1, 13, 38, 15, 22)    # horizontal corridor
    set_rect(floor, 14, 26, 26, 29, 25)   # lobby wood
    set_rect(floor, 14, 15, 29, 26, 22)   # SE open hall/path
    set_rect(floor, 24, 1, 27, 13, 22)    # NE hall between meet/lounge

    # oak grain noise in work2
    for y in range(15, 27):
        for x in range(1, 11):
            if floor[y][x] == 1 and (x + y) % 6 == 0:
                floor[y][x] = 25

    # --- room walls + doors onto corridors ---
    wall_v(11, 1, 13)
    door(11, 6)
    wall_v(11, 15, 27)
    door(11, 20)

    # meeting glass box 16..23 × 4..11
    wall_h(16, 24, 4, 17)
    wall_h(16, 24, 11, 17)
    wall_v(16, 4, 12, 17)
    wall_v(23, 4, 12, 17)
    set_rect(floor, 17, 5, 23, 11, 4)
    door(16, 7)
    door(23, 7)
    door(19, 11)
    door(20, 11)

    # lounge cream box 27..34 × 1..8
    wall_h(27, 35, 1, 29)
    wall_h(27, 35, 8, 3)
    wall_v(27, 1, 9)
    wall_v(34, 1, 9)
    set_rect(floor, 28, 2, 34, 8, 5)
    for x in range(28, 34):
        floor[1][x] = 5
        coll[1][x] = 0
    door(27, 4)
    door(27, 5)

    # sleep small room 29..33 × 19..23
    wall_h(29, 34, 19)
    wall_h(29, 34, 23)
    wall_v(29, 19, 24)
    wall_v(33, 19, 24)
    set_rect(floor, 30, 20, 33, 23, 21)
    door(29, 21)

    # --- furniture: work1 Open Desk (wall-aligned + monitors/lamps/plants) ---
    put(2, 3, 26)
    put(3, 3, 6)
    put(4, 3, 26)
    put(3, 4, 7)
    put(6, 3, 26)
    put(7, 3, 6)
    put(8, 3, 26)
    put(7, 4, 7)
    put(5, 3, 20)          # desk lamp between stations
    put(1, 3, 20)          # wall lamp
    put(9, 3, 20)
    put(5, 4, 7)           # spare chair (desks WP at y=5 clear)
    put(9, 4, 7)
    put(1, 4, 10)
    put(10, 4, 10)
    put(2, 8, 15)
    put(2, 9, 15)
    put(9, 8, 10)
    put(9, 9, 10)
    put(1, 8, 19, False)   # side posters
    put(1, 9, 19, False)
    put(10, 8, 19, False)
    put(5, 10, 18, False)
    put(6, 10, 18, False)
    put(4, 10, 18, False)
    put(7, 10, 18, False)
    put(2, 11, 24)         # corner beanbag
    put(10, 11, 10)

    # work2 Focus desks
    put(2, 17, 26)
    put(3, 17, 6)
    put(4, 17, 26)
    put(3, 18, 7)
    put(7, 17, 26)
    put(8, 17, 6)
    put(9, 17, 26)
    put(8, 18, 7)
    put(5, 17, 20)
    put(1, 17, 20)
    put(10, 17, 20)
    put(5, 18, 7)
    put(1, 18, 10)
    put(10, 18, 10)
    put(2, 22, 20)
    put(4, 22, 20)
    put(9, 23, 10)
    put(1, 23, 10)
    put(5, 24, 24)
    put(6, 24, 18, False)
    put(7, 24, 18, False)
    put(2, 24, 19, False)
    put(10, 24, 19, False)

    # meeting War Room: table + chairs + board + side props
    put(19, 7, 23)
    put(20, 7, 23)
    put(19, 8, 23)
    put(20, 8, 23)
    put(18, 7, 7)
    put(21, 7, 7)
    put(19, 6, 7)
    put(20, 9, 7)
    put(17, 5, 15)
    put(18, 5, 15)
    put(22, 5, 15)         # extra board strip
    put(22, 10, 10)
    put(17, 10, 10)
    put(17, 6, 20)         # lamp by boards
    put(22, 6, 20)
    put(21, 10, 24)        # side beanbag
    put(17, 9, 7)          # side chair (meeting WP 18,9 clear)
    put(18, 10, 18, False)
    put(19, 10, 18, False)

    # lounge: sofa + coffee + round table + wall props
    put(28, 2, 9)
    put(29, 2, 9)
    put(30, 2, 9)
    put(31, 2, 9)
    put(33, 3, 16)
    put(32, 3, 16)
    put(29, 5, 23)
    put(30, 5, 23)
    put(29, 6, 23)
    put(30, 6, 23)
    put(28, 5, 7)
    put(31, 6, 7)
    put(33, 6, 24)
    put(33, 7, 20)
    put(32, 2, 20)         # lamp behind sofa
    # keep (28,4)/(28,6) clear — lounge doors at (27,4)/(27,5)
    put(33, 2, 19, False)
    put(31, 5, 18, False)
    put(32, 6, 18, False)
    put(29, 3, 10)         # plant off door path
    put(30, 3, 10)

    # sleep Nap Pod: bed + lamps + rugs
    put(31, 20, 14)
    put(32, 20, 14)
    put(30, 22, 28, False)
    put(31, 22, 28, False)
    put(32, 22, 20)
    put(30, 20, 20)        # second lamp
    put(32, 21, 20)        # lamp (sleep WP 31,21 clear)
    # keep (30,21) clear — sleep door at (29,21)

    # lobby entrance: rugs + plants + posters
    door(19, H - 1)
    door(20, H - 1)
    put(16, 27, 27)
    put(23, 27, 27)
    put(15, 26, 19)
    put(24, 26, 19)
    put(17, 27, 18, False)
    put(18, 27, 18, False)
    put(21, 27, 18, False)
    put(22, 27, 18, False)
    put(14, 27, 10)
    put(25, 27, 10)
    put(15, 27, 19, False)
    put(24, 27, 19, False)
    put(17, 26, 20)
    put(22, 26, 20)

    # corridor plants / posters (edges + hall sides; keep 2-tile spine walkable)
    for x, y in [
        (12, 3),
        (13, 10),
        (12, 17),
        (13, 24),
        (18, 13),
        (25, 13),
        (12, 7),
        (13, 14),
        (12, 21),
        (22, 13),
        (28, 13),
        (33, 13),
    ]:
        if decor[y][x] == 0:
            put(x, y, 10)
    for x, y in [
        (12, 5),
        (13, 8),
        (12, 12),
        (13, 19),
        (12, 25),
        (16, 14),
        (24, 14),
        (30, 14),
        (35, 13),
    ]:
        if decor[y][x] == 0:
            put(x, y, 19, False)

    waypoints = {
        "desks": [
            {"x": 3, "y": 5},
            {"x": 7, "y": 5},
            {"x": 3, "y": 19},
        ],
        "meeting": {"x": 18, "y": 9},
        "break": {"x": 31, "y": 4},
        "lounge": [
            {"x": 31, "y": 4},
            {"x": 32, "y": 5},
            {"x": 28, "y": 3},
            {"x": 30, "y": 7},
            {"x": 33, "y": 5},
            {"x": 29, "y": 4},
            {"x": 32, "y": 7},
            {"x": 28, "y": 7},
            {"x": 31, "y": 7},
            {"x": 33, "y": 4},
        ],
        "sleep": {"x": 31, "y": 21},
        "entrance": {"x": 20, "y": 27},
    }

    walk_pts = (
        waypoints["desks"]
        + waypoints["lounge"]
        + [waypoints[k] for k in ("meeting", "break", "sleep", "entrance")]
    )
    for p in walk_pts:
        x, y = p["x"], p["y"]
        coll[y][x] = 0
        if decor[y][x] in (6, 7, 9, 10, 14, 15, 16, 20, 23, 24, 26, 27):
            decor[y][x] = 0

    def flat(layer):
        out = []
        for row in layer:
            out.extend(row)
        return out

    coll_tiles = [3 if coll[y][x] else 0 for y in range(H) for x in range(W)]

    data = {
        "compressionlevel": -1,
        "height": H,
        "width": W,
        "tilewidth": EXPORT_TILE,
        "tileheight": EXPORT_TILE,
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
                "imageheight": 6 * EXPORT_TILE,
                "imagewidth": 8 * EXPORT_TILE,
                "margin": 0,
                "name": "office",
                "spacing": 0,
                "tilecount": 48,
                "tileheight": EXPORT_TILE,
                "tilewidth": EXPORT_TILE,
            }
        ],
        "layers": [
            {"id": 1, "name": "ground", "type": "tilelayer", "visible": True, "opacity": 1, "width": W, "height": H, "data": flat(floor), "x": 0, "y": 0},
            {"id": 2, "name": "furniture", "type": "tilelayer", "visible": True, "opacity": 1, "width": W, "height": H, "data": flat(decor), "x": 0, "y": 0},
            {"id": 3, "name": "collision", "type": "tilelayer", "visible": False, "opacity": 0, "width": W, "height": H, "data": coll_tiles, "x": 0, "y": 0},
        ],
        "properties": [{"name": "waypoints", "type": "string", "value": json.dumps(waypoints)}],
    }
    path = OUT / "office-map.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    print("wrote", path, f"{W}x{H}")


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


def draw_cat_frame(
    buf: bytearray,
    sheet_w: int,
    ox: int,
    oy: int,
    facing: str,
    step: int,
) -> None:
    """Tiny office cat — same 16×24 CHAR_FRAME grid as agents."""
    FUR = (230, 150, 70, 255)
    FUR_DK = (190, 110, 50, 255)
    BELLY = (245, 220, 180, 255)
    EYE_A = (80, 190, 90, 255)  # amber-green iris
    PUPIL = (20, 18, 16, 255)
    NOSE = (220, 100, 110, 255)
    WHISK = (40, 35, 30, 200)

    fill(buf, sheet_w, ox, oy, ox + 16, oy + 24, TRANS)
    bob = 0 if step == 0 else (1 if step == 1 else -1)
    leg = 0 if step == 0 else (1 if step == 1 else -1)
    fill(buf, sheet_w, ox + 4, oy + 22, ox + 12, oy + 23, (0, 0, 0, 45))

    # body + head blob
    fill(buf, sheet_w, ox + 4, oy + 10 + bob, ox + 12, oy + 18 + bob, FUR)
    fill(buf, sheet_w, ox + 5, oy + 12 + bob, ox + 11, oy + 17 + bob, BELLY)
    fill(buf, sheet_w, ox + 4, oy + 5 + bob, ox + 12, oy + 12 + bob, FUR)
    # ears
    fill(buf, sheet_w, ox + 4, oy + 3 + bob, ox + 7, oy + 6 + bob, FUR_DK)
    fill(buf, sheet_w, ox + 9, oy + 3 + bob, ox + 12, oy + 6 + bob, FUR_DK)
    px(buf, sheet_w, ox + 5, oy + 4 + bob, BELLY)
    px(buf, sheet_w, ox + 10, oy + 4 + bob, BELLY)
    # legs
    fill(buf, sheet_w, ox + 5, oy + 17 + bob, ox + 7, oy + 21 + bob + max(leg, 0), FUR_DK)
    fill(buf, sheet_w, ox + 9, oy + 17 + bob, ox + 11, oy + 21 + bob + max(-leg, 0), FUR_DK)
    # tail tip (behind / side)
    if facing == "left":
        fill(buf, sheet_w, ox + 12, oy + 12 + bob - leg, ox + 15, oy + 14 + bob - leg, FUR_DK)
    elif facing == "right":
        fill(buf, sheet_w, ox + 1, oy + 12 + bob - leg, ox + 4, oy + 14 + bob - leg, FUR_DK)
    else:
        fill(buf, sheet_w, ox + 12, oy + 14 + bob, ox + 15, oy + 16 + bob - leg, FUR_DK)

    if facing == "down":
        px(buf, sheet_w, ox + 6, oy + 8 + bob, EYE_A)
        px(buf, sheet_w, ox + 9, oy + 8 + bob, EYE_A)
        px(buf, sheet_w, ox + 6, oy + 9 + bob, PUPIL)
        px(buf, sheet_w, ox + 9, oy + 9 + bob, PUPIL)
        px(buf, sheet_w, ox + 7, oy + 10 + bob, NOSE)
        px(buf, sheet_w, ox + 8, oy + 10 + bob, NOSE)
        px(buf, sheet_w, ox + 3, oy + 10 + bob, WHISK)
        px(buf, sheet_w, ox + 12, oy + 10 + bob, WHISK)
    elif facing == "up":
        fill(buf, sheet_w, ox + 5, oy + 4 + bob, ox + 11, oy + 7 + bob, FUR_DK)
    elif facing == "left":
        px(buf, sheet_w, ox + 5, oy + 8 + bob, EYE_A)
        px(buf, sheet_w, ox + 5, oy + 9 + bob, PUPIL)
        px(buf, sheet_w, ox + 5, oy + 10 + bob, NOSE)
        px(buf, sheet_w, ox + 2, oy + 10 + bob, WHISK)
    else:
        px(buf, sheet_w, ox + 10, oy + 8 + bob, EYE_A)
        px(buf, sheet_w, ox + 10, oy + 9 + bob, PUPIL)
        px(buf, sheet_w, ox + 10, oy + 10 + bob, NOSE)
        px(buf, sheet_w, ox + 13, oy + 10 + bob, WHISK)


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
        write_png(path, w, h, bytes(buf), scale=ASSET_SCALE)
        print("wrote", path, f"{w * ASSET_SCALE}x{h * ASSET_SCALE}")

    # boss = human 대장님
    w, h = cols * fw, rows * fh
    buf = bytearray(w * h * 4)
    for rj, facing in enumerate(dirs):
        for ci, step in enumerate([0, 1, 2]):
            draw_human_boss_frame(buf, w, ci * fw, rj * fh, facing, step)
    path = OUT / "char-boss.png"
    write_png(path, w, h, bytes(buf), scale=ASSET_SCALE)
    print("wrote", path, f"{w * ASSET_SCALE}x{h * ASSET_SCALE}")

    # lounge mascot cat (same sheet layout)
    w, h = cols * fw, rows * fh
    buf = bytearray(w * h * 4)
    for rj, facing in enumerate(dirs):
        for ci, step in enumerate([0, 1, 2]):
            draw_cat_frame(buf, w, ci * fw, rj * fh, facing, step)
    path = OUT / "char-mascot.png"
    write_png(path, w, h, bytes(buf), scale=ASSET_SCALE)
    print("wrote", path, f"{w * ASSET_SCALE}x{h * ASSET_SCALE}")



def write_wav_mono(path: Path, samples: list[float], sr: int = 22050) -> None:
    """16-bit PCM mono WAV. samples are floats in roughly [-1, 1]."""
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        frames = bytearray()
        for s in samples:
            v = max(-1.0, min(1.0, s))
            frames += struct.pack("<h", int(v * 32767))
        wf.writeframes(bytes(frames))


def make_ambient_bgm() -> None:
    """
    Soft looping office ambient (cool slate drone + gentle shimmer).
    Duration chosen so all tones complete whole cycles (seam-friendly loop).
    """
    sr = 22050
    duration = 8.0  # seconds
    n = int(sr * duration)
    # Hz chosen so periods divide duration evenly: f * duration is integer
    tones = [
        (110.0, 0.11),   # A2 pad
        (164.814, 0.07),  # E3
        (220.0, 0.05),   # A3
        (329.628, 0.028),  # E4 shimmer
    ]
    samples: list[float] = []
    for i in range(n):
        t = i / sr
        # slow amplitude breathe so loop feels alive, still start≈end
        breathe = 0.85 + 0.15 * math.sin(2 * math.pi * t / duration)
        v = 0.0
        for freq, amp in tones:
            v += amp * math.sin(2 * math.pi * freq * t)
        # very soft high noise tickle (filtered-ish by low gain)
        noise = ((i * 1103515245 + 12345) & 0x7FFF) / 32768.0 - 0.5
        v += noise * 0.012
        samples.append(v * breathe * 0.55)
    path = OUT / "office-ambient.wav"
    write_wav_mono(path, samples, sr)
    print("wrote", path, f"{duration}s@{sr}Hz")


def make_sfx_oneshot(name: str, freq: float, ms: int = 90, amp: float = 0.22) -> None:
    sr = 22050
    n = int(sr * ms / 1000)
    samples: list[float] = []
    for i in range(n):
        t = i / sr
        env = math.sin(math.pi * i / max(1, n - 1))  # fade in/out
        samples.append(amp * env * math.sin(2 * math.pi * freq * t))
    path = OUT / name
    write_wav_mono(path, samples, sr)
    print("wrote", path)


def make_audio() -> None:
    make_ambient_bgm()
    make_sfx_oneshot("sfx-running.wav", freq=523.25, ms=70, amp=0.18)  # C5 soft
    make_sfx_oneshot("sfx-blocked.wav", freq=311.13, ms=95, amp=0.16)  # Eb4 soft


if __name__ == "__main__":
    make_tileset()
    make_characters()
    make_map_json()
    make_audio()
