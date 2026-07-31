#!/usr/bin/env python3
"""
Headless simulation of the GoVacuum edge-sweep (perimeter) logic.

This is a faithful Python port of the algorithm in js/robot_vacuum_navigation.js
and the CLEAN_EDGE replan flow in js/robot_vacuum_engine.js, used to verify the
fix for the "perimeter restarts from the left side after an obstacle" bug.

It is a TEST/VERIFICATION harness, not production code.
"""

# ---- CONFIG (from js/robot_vacuum_config.js) ----
MAP_DATA = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,1,0,0,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
]
WIDTH = len(MAP_DATA[0])
HEIGHT = len(MAP_DATA)
ROOMS = [
    {'id':0,'name':'Living Room','x1':1,'y1':1,'x2':6,'y2':5},
    {'id':1,'name':'Bedroom','x1':8,'y1':1,'x2':18,'y2':5},
    {'id':2,'name':'Kitchen','x1':1,'y1':7,'x2':18,'y2':10},
]
BASE = (1,1)
BASE_FRONT = (2,1)
EDGE_INTERIOR_PENALTY = 20   # the fixed value (was 6)
ROOM_LEAVE_PENALTY = 50
CLEAN_STEP_COST = 5
DIRTY_STEP_COST = 1
DEBUG = False


def is_valid(x, y):
    return 0 <= x < WIDTH and 0 <= y < HEIGHT and MAP_DATA[y][x] == 0


class State:
    def __init__(self):
        self.dirt = [[1 if is_valid(x,y) else 0 for x in range(WIDTH)] for y in range(HEIGHT)]
        self.known_obstacles = set()   # set of (x,y) grid tiles
        self.actual_obstacles = set()  # ground truth

    def has_known_obstacle(self, x, y):
        return (x, y) in self.known_obstacles

    def sense(self, rx, ry):
        """Promote actual obstacles within Chebyshev range 1 to known. Return newly found."""
        newly = []
        for (ox, oy) in self.actual_obstacles:
            if (ox, oy) not in self.known_obstacles:
                if abs(ox - rx) <= 1 and abs(oy - ry) <= 1:
                    self.known_obstacles.add((ox, oy))
                    newly.append((ox, oy))
        return newly


def get_edge_targets(room):
    t = []
    for y in range(room['y1'], room['y2']+1): t.append((room['x1'], y))
    for x in range(room['x1']+1, room['x2']+1): t.append((x, room['y2']))
    for y in range(room['y2']-1, room['y1']-1, -1): t.append((room['x2'], y))
    for x in range(room['x2']-1, room['x1'], -1): t.append((x, room['y1']))
    return t


def is_edge_tile(room, x, y):
    return x == room['x1'] or x == room['x2'] or y == room['y1'] or y == room['y2']


def resolve_edge_start_index(room, rx, ry):
    targets = get_edge_targets(room)
    best, bd = 0, float('inf')
    for i, (tx, ty) in enumerate(targets):
        d = abs(tx - rx) + abs(ty - ry)
        if d < bd:
            bd, best = d, i
    return best


def find_path(state, sx, sy, ex, ey, planned, room, ignore_dirt=False, edge_phase=False):
    if (sx, sy) == (ex, ey):
        return []
    # base exit constraint
    if (sx, sy) == BASE:
        bfx, bfy = BASE_FRONT
        if (bfx, bfy) == (ex, ey):
            return [(bfx, bfy)]
        sub = find_path(state, bfx, bfy, ex, ey, planned, room, ignore_dirt, edge_phase)
        return [(bfx, bfy)] + sub if sub else []

    import heapq
    open_set = [(0, sx, sy, [])]
    min_g = {(sx, sy): 0}
    dirs = [(0,-1),(1,0),(0,1),(-1,0)]
    while open_set:
        open_set.sort(key=lambda n: n[0])
        g, cx, cy, path = open_set.pop(0)
        if (cx, cy) == (ex, ey):
            return path
        for dx, dy in dirs:
            nx, ny = cx+dx, cy+dy
            if not is_valid(nx, ny) or state.has_known_obstacle(nx, ny):
                continue
            if not ignore_dirt:
                dirty = planned[ny][nx] == 1
                if edge_phase:
                    step = DIRTY_STEP_COST if dirty else 1000
                else:
                    step = DIRTY_STEP_COST if dirty else CLEAN_STEP_COST
            else:
                step = 1
            if room and (nx < room['x1'] or nx > room['x2'] or ny < room['y1'] or ny > room['y2']):
                step += ROOM_LEAVE_PENALTY
            if edge_phase and room and not is_edge_tile(room, nx, ny):
                step += EDGE_INTERIOR_PENALTY
            ng = g + step
            if (nx, ny) not in min_g or ng < min_g[(nx, ny)]:
                min_g[(nx, ny)] = ng
                open_set.append((ng, nx, ny, path + [(nx, ny)]))
    return []


def gen_edge_sweep(state, room, curx, cury, edge_start_index):
    planned = [row[:] for row in state.dirt]
    full = []
    cx, cy = curx, cury
    targets = get_edge_targets(room)
    idx = edge_start_index if edge_start_index is not None else resolve_edge_start_index(room, curx, cury)
    targets = targets[idx:] + targets[:idx]
    reached = False
    for (tx, ty) in targets:
        if not is_valid(tx, ty) or state.dirt[ty][tx] == 0 or state.has_known_obstacle(tx, ty):
            continue
        if planned[ty][tx] == 0:
            continue
        if (cx, cy) == (tx, ty):
            continue
        sub = find_path(state, cx, cy, tx, ty, planned, room, False, True)
        if sub:
            full.extend(sub)
            for (px, py) in sub:
                planned[py][px] = 0
            cx, cy = tx, ty
            reached = True
    return full


def simulate(room_id, obstacle_tiles, sense_every_step=True, verbose=True):
    """
    Simulate the robot executing CLEAN_EDGE with replanning on obstacle sensing.
    Returns the list of grid tiles the robot actually visited (in order).
    """
    state = State()
    room = ROOMS[room_id]
    state.actual_obstacles = set(obstacle_tiles)
    # reset dirt only for the target room (like resetDirtForRoom)
    state.dirt = [[0]*WIDTH for _ in range(HEIGHT)]
    for y in range(room['y1'], room['y2']+1):
        for x in range(room['x1'], room['x2']+1):
            if is_valid(x, y):
                state.dirt[y][x] = 1

    rx, ry = BASE_FRONT  # robot enters room from base front
    # sense at start
    state.sense(rx, ry)
    edge_start = resolve_edge_start_index(room, rx, ry)

    visited = [(rx, ry)]
    state.dirt[ry][rx] = 0
    path = gen_edge_sweep(state, room, rx, ry, edge_start)

    steps = 0
    max_steps = 2000
    while steps < max_steps:
        steps += 1
        if not path:
            # replan (like onTaskComplete / replanRoute)
            path = gen_edge_sweep(state, room, rx, ry, edge_start)
            if not path:
                break
        # take one step toward path[0]
        nx, ny = path[0]
        rx, ry = nx, ny
        path.pop(0)
        visited.append((rx, ry))
        state.dirt[ry][rx] = 0
        # sense
        newly = state.sense(rx, ry)
        if newly:
            # if any newly known obstacle is on remaining path -> replan
            blocked = any((ox, oy) in [(p[0], p[1]) for p in path] for (ox, oy) in newly)
            if blocked:
                if DEBUG:
                    print(f"  [replan] at step {steps}: robot=({rx},{ry}) sensed {newly}")
                path = gen_edge_sweep(state, room, rx, ry, edge_start)
                if DEBUG:
                    print(f"  [replan] new path (first 12): {path[:12]}")
    return visited, state



def run_scenario(room_id, obstacle_tiles):
    room = ROOMS[room_id]
    visited, state = simulate(room_id, obstacle_tiles)

    # Map of first-visit order for visual inspection
    order = {}
    for i, p in enumerate(visited):
        order.setdefault(p, i)

    print("\nVisit order (edge tiles labelled by first-visit step, '.'=interior):")
    print("     " + " ".join(f"{x:>3}" for x in range(room['x1']-1, room['x2']+2)))
    for y in range(room['y1']-1, room['y2']+2):
        row = []
        for x in range(room['x1']-1, room['x2']+2):
            if not is_valid(x, y):
                row.append("  #")
            elif (x, y) in obstacle_tiles:
                row.append("  O")
            elif (x, y) in order:
                row.append(f"{order[(x, y)]:>3}")
            else:
                row.append("  .")
        print(f"y={y:<2} " + " ".join(row))

    # --- Direction check --------------------------------------------------
    # A correct right-wall sweep visits each reachable edge tile exactly once,
    # in one consistent direction around the loop. The "restart from the left"
    # bug forces the robot to RE-STEP on edge tiles it already swept (it goes
    # back over them in the opposite direction). So the reliable signal is:
    #   (a) no edge tile is stepped on more than once, and
    #   (b) every reachable, non-obstacle edge tile is covered.
    edge_visits = [p for p in visited if is_edge_tile(room, p[0], p[1])]
    from collections import Counter
    counts = Counter(edge_visits)
    reswept = {p: c for p, c in counts.items() if c > 1}

    print("\nEdge tiles stepped on more than once (backward re-sweep):",
          len(reswept), dict(reswept) if reswept else "")
    print("No backward re-sweep (right-wall consistent):", len(reswept) == 0)

    # Coverage: every reachable, non-obstacle edge tile should be visited.
    reachable_edge = [p for p in get_edge_targets(room)
                      if is_valid(p[0], p[1]) and p not in obstacle_tiles]
    covered = [p for p in reachable_edge if p in set(visited)]
    print("Edge coverage: %d/%d reachable edge tiles visited" % (len(covered), len(reachable_edge)))

    print("Total steps taken:", len(visited), "| unique tiles:", len(set(visited)))


if __name__ == '__main__':
    print("="*70)
    print("SCENARIO A: Bedroom, obstacle on left edge (present from the start)")
    print("="*70)
    run_scenario(1, [(8, 3)])

    print("\n" + "="*70)
    print("SCENARIO B: Bedroom, obstacle on BOTTOM edge, sensed mid-sweep (live replan)")
    print("="*70)
    run_scenario(1, [(12, 5)])

    print("\n" + "="*70)
    print("SCENARIO C: Kitchen (wide room), obstacle on top edge")
    print("="*70)
    run_scenario(2, [(10, 7)])
