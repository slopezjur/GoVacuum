import { CONFIG } from './robot_vacuum_config.js';

/**
 * Binary min-heap keyed by the A* f-score.
 * Replaces the previous "sort the open array on every pop" approach,
 * reducing node extraction from O(n log n) to O(log n).
 */
class MinHeap {
    constructor() {
        this.items = [];
    }

    get size() {
        return this.items.length;
    }

    push(item) {
        this.items.push(item);
        this.bubbleUp(this.items.length - 1);
    }

    pop() {
        const top = this.items[0];
        const last = this.items.pop();
        if (this.items.length > 0) {
            this.items[0] = last;
            this.bubbleDown(0);
        }
        return top;
    }

    bubbleUp(index) {
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (this.items[parent].f <= this.items[index].f) {break;}
            [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
            index = parent;
        }
    }

    bubbleDown(index) {
        const length = this.items.length;
        for (;;) {
            const left = index * 2 + 1;
            const right = left + 1;
            let smallest = index;
            if (left < length && this.items[left].f < this.items[smallest].f) {smallest = left;}
            if (right < length && this.items[right].f < this.items[smallest].f) {smallest = right;}
            if (smallest === index) {break;}
            [this.items[smallest], this.items[index]] = [this.items[index], this.items[smallest]];
            index = smallest;
        }
    }
}

/**
 * @class NavigationSystem
 */
export class NavigationSystem {

    static getEdgeTargets(room) {
        const edgeTargets = [];
        // Counter-clockwise perimeter (right-wall following) for brush-side edge cleaning.
        // Starting from the top-left corner, tracing the boundary in counter-clockwise order
        // means the vacuum's right side is always against the wall during traversal.
        for (let y = room.y1; y <= room.y2; y++) {edgeTargets.push({ x: room.x1, y });}
        for (let x = room.x1 + 1; x <= room.x2; x++) {edgeTargets.push({ x, y: room.y2 });}
        for (let y = room.y2 - 1; y >= room.y1; y--) {edgeTargets.push({ x: room.x2, y });}
        for (let x = room.x2 - 1; x >= room.x1 + 1; x--) {edgeTargets.push({ x, y: room.y1 });}
        return edgeTargets;
    }

    static isRoomEdgeTile(room, x, y) {
        return x === room.x1 || x === room.x2 || y === room.y1 || y === room.y2;
    }

    static hasRemainingEdgeTiles(state, room) {
        for (const target of this.getEdgeTargets(room)) {
            if (state.isValidPosition(target.x, target.y) &&
                state.dirtMap[target.y][target.x] === 1 &&
                !state.hasKnownObstacleAt(target.x, target.y)) {
                return true;
            }
        }
        return false;
    }

    // Pick the perimeter tile where the sweep should START: the one reachable from
    // the robot's current position with the shortest path. Starting where the robot
    // actually enters the room prevents it from crossing (and cleaning with the
    // wrong orientation) perimeter tiles on its way to a far starting corner.
    static resolveEdgeStartIndex(state, room, robotX, robotY) {
        const cx = Math.floor(robotX);
        const cy = Math.floor(robotY);
        const edgeTargets = this.getEdgeTargets(room);
        let closestIdx = 0;
        let minCost = Infinity;

        for (let i = 0; i < edgeTargets.length; i++) {
            const target = edgeTargets[i];
            if (!state.isValidPosition(target.x, target.y) || state.hasKnownObstacleAt(target.x, target.y)) {continue;}

            // Pure travel distance (uniform weights) to each candidate starting tile
            const path = this.findPath(state, cx, cy, target.x, target.y, null, null, true);
            if (path.length > 0 && path.length < minCost) {
                minCost = path.length;
                closestIdx = i;
            }
        }

        return closestIdx;
    }

    // A* Algorithm (Manhattan-distance heuristic with h * 1.001 tie-breaker
    // to prioritize straight trajectories).
    // Nodes are expanded from a binary min-heap and store a parent pointer
    // instead of a copied path array, so the route is reconstructed once at the end.
    static findPath(state, startX, startY, endX, endY, plannedDirtMap = null, roomBounds = null, ignoreDirtFlag = false) {
        if (startX === endX && startY === endY) {return [];}

        // Force base exit constraint: if starting from the base, the first tile of any path MUST be the base front tile
        if (startX === CONFIG.ROBOT.BASE_X && startY === CONFIG.ROBOT.BASE_Y) {
            const bfx = CONFIG.ROBOT.BASE_FRONT_X;
            const bfy = CONFIG.ROBOT.BASE_FRONT_Y;
            if (bfx === endX && bfy === endY) {
                return [{ x: bfx + 0.5, y: bfy + 0.5 }];
            }
            const subPath = this.findPath(state, bfx, bfy, endX, endY, plannedDirtMap, roomBounds, ignoreDirtFlag);
            if (subPath.length > 0) {
                return [{ x: bfx + 0.5, y: bfy + 0.5 }, ...subPath];
            }
            return [];
        }

        // Manhattan heuristic; the * 1.001 multiplier breaks ties in favor of straight lines
        const heuristic = (x, y) => (Math.abs(x - endX) + Math.abs(y - endY)) * 1.001;

        const openHeap = new MinHeap();
        const startKey = `${startX},${startY}`;
        // key -> { x, y, parentKey } for O(1) path reconstruction
        const cameFrom = new Map([[startKey, { x: startX, y: startY, parentKey: null }]]);
        const minG = new Map([[startKey, 0]]);
        openHeap.push({ key: startKey, g: 0, f: heuristic(startX, startY) });

        const directions = [[0,-1], [1,0], [0,1], [-1,0]];

        while (openHeap.size > 0) {
            // Expand the node with the lowest estimated total cost (f = g + h)
            const current = openHeap.pop();
            const { x: cx, y: cy } = cameFrom.get(current.key);

            if (cx === endX && cy === endY) {
                return this.reconstructPath(cameFrom, current.key);
            }

            for (const dir of directions) {
                const nx = cx + dir[0]; const ny = cy + dir[1];

                if (!state.isValidPosition(nx, ny) || state.hasKnownObstacleAt(nx, ny)) {
                    if (!(nx === endX && ny === endY && !state.hasKnownObstacleAt(nx, ny))) {continue;}
                }

                // Dynamic weight matrix (per functional spec):
                //   dirty tile inside the room: 1
                //   already cleaned tile:       5 (avoid re-stepping unless it is a mandatory bottleneck)
                //   tile outside the room:     +50 ("mental walls")
                //   known obstacle:       infinite (blocked above)
                let stepCost = 1;
                if (!ignoreDirtFlag) {
                    const isDirty = plannedDirtMap ? plannedDirtMap[ny][nx] === 1 : state.dirtMap[ny][nx] === 1;
                    stepCost = isDirty ? 1 : 5; // Clean tiles are expensive to step on
                }

                // Heavy penalty for leaving the target room during a sweep
                if (roomBounds && (nx < roomBounds.x1 || nx > roomBounds.x2 || ny < roomBounds.y1 || ny > roomBounds.y2)) {
                    stepCost += 50;
                }

                const nextG = current.g + stepCost;

                const key = `${nx},${ny}`;
                if (!minG.has(key) || nextG < minG.get(key)) {
                    minG.set(key, nextG);
                    cameFrom.set(key, { x: nx, y: ny, parentKey: current.key });
                    openHeap.push({ key, g: nextG, f: nextG + heuristic(nx, ny) });
                }
            }
        }
        return [];
    }

    // Walk parent pointers from the goal back to the start and emit tile centers.
    static reconstructPath(cameFrom, goalKey) {
        const path = [];
        let key = goalKey;
        while (key !== null) {
            const node = cameFrom.get(key);
            if (node.parentKey !== null) {
                path.push({ x: node.x + 0.5, y: node.y + 0.5 });
            }
            key = node.parentKey;
        }
        return path.reverse();
    }

    static generateRoomSweepPath(state, room, currentX, currentY, isEdgePhase, edgeStartIndex = null) {
        const plannedDirt = state.dirtMap.map(row => [...row]);
        const fullPath = [];
        let cx = Math.floor(currentX); let cy = Math.floor(currentY);

        if (isEdgePhase) {
            // COUNTER-CLOCKWISE EDGE SWEEP: generate full perimeter path with
            // right-wall following so the brush-side always contacts the wall.
            // Bypasses obstacles by routing through interior tiles,
            // then returns to the edge on the other side.
            // If a target is truly unreachable it's skipped and the
            // sweep continues to the next reachable perimeter tile.
            //
            // The sweep always walks the perimeter in a fixed counter-clockwise
            // order and resumes at the first edge tile that is still dirty in the
            // REAL dirt map. Tiles already passed (and cleaned) are skipped, so a
            // replan after sensing an obstacle continues forward around the room
            // instead of restarting from the geometrically closest edge tile —
            // which after an interior detour is usually a tile BEHIND the robot
            // and would make it sweep the perimeter backwards (from the left side).
            // ----------------------------------------------------
            let edgeTargets = this.getEdgeTargets(room);
            const startIdx = edgeStartIndex ?? this.resolveEdgeStartIndex(state, room, currentX, currentY);
            edgeTargets = [...edgeTargets.slice(startIdx), ...edgeTargets.slice(0, startIdx)];

            let reachedNewTarget = false;

            for (const target of edgeTargets) {
                // Skip if invalid, blocked by an obstacle, or already cleaned in a
                // PREVIOUS pass (real dirt map). Previously-passed tiles stay skipped
                // across replans, which is what keeps the sweep moving forward.
                if (!state.isValidPosition(target.x, target.y) ||
                    state.dirtMap[target.y][target.x] === 0 ||
                    state.hasKnownObstacleAt(target.x, target.y)) {
                    continue;
                }

                // Skip tiles already covered by the path built so far in THIS pass.
                if (plannedDirt[target.y][target.x] === 0) {
                    continue;
                }

                // Already standing on this edge tile; move to the next perimeter target
                if (cx === target.x && cy === target.y) {
                    continue;
                }

                // Contour hugging: A* recalculates a short route around any known
                // obstacle blocking the edge, keeping the sweep on the original
                // counter-clockwise sequence (the obstacle face acts as a temporary wall).
                const subPath = this.findPath(state, cx, cy, target.x, target.y, plannedDirt, room, false);

                if (subPath.length > 0) {
                    fullPath.push(...subPath);
                    // Mark tiles along the found sub-path as mentally cleaned so we don't
                    // immediately backtrack over them on the next replan.
                    for (const p of subPath) {
                        const px = Math.floor(p.x);
                        const py = Math.floor(p.y);
                        if (plannedDirt[py] && plannedDirt[py][px] !== undefined) {
                            plannedDirt[py][px] = 0;
                        }
                    }
                    cx = target.x;
                    cy = target.y;
                    reachedNewTarget = true;
                    // Continue to the next edge target instead of breaking — this builds a
                    // longer perimeter path that naturally curves around obstacles.
                }
                // Unreachable edge tile: leave plannedDirt as-is and try the next target.
                // Only transition to CLEAN_INNER when *no* new target was reached in the
                // entire pass (handled by the caller checking fullPath.length === 0).
            }

            // If we didn't reach any new edge target at all, the perimeter is done / blocked.
            if (!reachedNewTarget) {
                // Mark remaining dirty edge tiles as cleaned so the caller transitions phases.
                for (const target of edgeTargets) {
                    if (plannedDirt[target.y]?.[target.x] === 1 && !state.hasKnownObstacleAt(target.x, target.y)) {
                        plannedDirt[target.y][target.x] = 0;
                    }
                }
            }
        } else {
            // ----------------------------------------------------
            // INNER FILL SWEEP (Boustrophedon / lawnmower S-pattern)
            // ----------------------------------------------------
            // Remaining dirty tiles are covered with continuous parallel lines
            // traced along the LONGEST axis of the uncleaned region, minimizing
            // 180° turns. A* routes around any obstacle cutting a line (contour
            // bypass when the geometry allows it) and only transits through
            // already-clean tiles when it is a mandatory bottleneck, so the
            // current sub-zone is completed before moving to the next one.
            const dirtyTiles = [];
            for (let y = room.y1; y <= room.y2; y++) {
                for (let x = room.x1; x <= room.x2; x++) {
                    if (state.isValidPosition(x, y) && state.dirtMap[y][x] === 1 && !state.hasKnownObstacleAt(x, y)) {
                        dirtyTiles.push({ x, y });
                    }
                }
            }

            if (dirtyTiles.length > 0) {
                // Predominant axis of the uncleaned region (width vs. height)
                const minX = Math.min(...dirtyTiles.map(t => t.x));
                const maxX = Math.max(...dirtyTiles.map(t => t.x));
                const minY = Math.min(...dirtyTiles.map(t => t.y));
                const maxY = Math.max(...dirtyTiles.map(t => t.y));
                const sweepHorizontal = (maxX - minX) >= (maxY - minY);

                // Build the S-pattern target sequence: parallel lines with
                // alternating direction so each line starts where the previous ended.
                const sweepTargets = [];
                if (sweepHorizontal) {
                    for (let y = minY; y <= maxY; y++) {
                        const line = dirtyTiles.filter(t => t.y === y).sort((a, b) => a.x - b.x);
                        if ((y - minY) % 2 === 1) {line.reverse();}
                        sweepTargets.push(...line);
                    }
                } else {
                    for (let x = minX; x <= maxX; x++) {
                        const line = dirtyTiles.filter(t => t.x === x).sort((a, b) => a.y - b.y);
                        if ((x - minX) % 2 === 1) {line.reverse();}
                        sweepTargets.push(...line);
                    }
                }

                for (const target of sweepTargets) {
                    // Skip tiles cleaned in a previous pass or covered by the path built so far
                    if (state.dirtMap[target.y][target.x] === 0 || plannedDirt[target.y][target.x] === 0) {
                        continue;
                    }

                    // Already standing on this tile; move to the next sweep target
                    if (cx === target.x && cy === target.y) {
                        continue;
                    }

                    const subPath = this.findPath(state, cx, cy, target.x, target.y, plannedDirt, room, false);

                    if (subPath.length > 0) {
                        fullPath.push(...subPath);
                        // Mark as mentally cleaned
                        for (const p of subPath) {
                            const px = Math.floor(p.x); const py = Math.floor(p.y);
                            if (plannedDirt[py] && plannedDirt[py][px] !== undefined) {plannedDirt[py][px] = 0;}
                        }
                        cx = target.x; cy = target.y;
                    } else {
                        // Tile isolated by obstacles, give up on it
                        plannedDirt[target.y][target.x] = 0;
                    }
                }
            }
        }
        return fullPath;
    }
}
