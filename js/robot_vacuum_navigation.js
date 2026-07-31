/**
 * @class NavigationSystem
 */
class NavigationSystem {

    static getEdgeTargets(room) {
        const edgeTargets = [];
        // Counter-clockwise perimeter (right-wall following) for brush-side edge cleaning.
        // Starting from the top-left corner, tracing the boundary in counter-clockwise order
        // means the vacuum's right side is always against the wall during traversal.
        for (let y = room.y1; y <= room.y2; y++) edgeTargets.push({ x: room.x1, y });
        for (let x = room.x1 + 1; x <= room.x2; x++) edgeTargets.push({ x, y: room.y2 });
        for (let y = room.y2 - 1; y >= room.y1; y--) edgeTargets.push({ x: room.x2, y });
        for (let x = room.x2 - 1; x >= room.x1 + 1; x--) edgeTargets.push({ x, y: room.y1 });
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
            if (!state.isValidPosition(target.x, target.y) || state.hasKnownObstacleAt(target.x, target.y)) continue;

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
    // to prioritize straight trajectories)
    static findPath(state, startX, startY, endX, endY, plannedDirtMap = null, roomBounds = null, ignoreDirtFlag = false) {
        if (startX === endX && startY === endY) return [];

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

        let openSet = [{ x: startX, y: startY, g: 0, f: heuristic(startX, startY), path: [] }];
        let minG = new Map();
        minG.set(`${startX},${startY}`, 0);

        const directions = [[0,-1], [1,0], [0,1], [-1,0]];

        while (openSet.length > 0) {
            // Expand the node with the lowest estimated total cost (f = g + h)
            openSet.sort((a, b) => a.f - b.f);
            let current = openSet.shift();

            if (current.x === endX && current.y === endY) return current.path;

            for (let dir of directions) {
                let nx = current.x + dir[0]; let ny = current.y + dir[1];

                if (!state.isValidPosition(nx, ny) || state.hasKnownObstacleAt(nx, ny)) {
                    if (!(nx === endX && ny === endY && !state.hasKnownObstacleAt(nx, ny))) continue;
                }

                // Dynamic weight matrix (per functional spec):
                //   dirty tile inside the room: 1
                //   already cleaned tile:       5 (avoid re-stepping unless it is a mandatory bottleneck)
                //   tile outside the room:     +50 ("mental walls")
                //   known obstacle:       infinite (blocked above)
                let stepCost = 1;
                if (!ignoreDirtFlag) {
                    let isDirty = plannedDirtMap ? plannedDirtMap[ny][nx] === 1 : state.dirtMap[ny][nx] === 1;
                    stepCost = isDirty ? 1 : 5; // Clean tiles are expensive to step on
                }

                // Heavy penalty for leaving the target room during a sweep
                if (roomBounds && (nx < roomBounds.x1 || nx > roomBounds.x2 || ny < roomBounds.y1 || ny > roomBounds.y2)) {
                    stepCost += 50;
                }

                let nextG = current.g + stepCost;

                let key = `${nx},${ny}`;
                if (!minG.has(key) || nextG < minG.get(key)) {
                    minG.set(key, nextG);
                    openSet.push({
                        x: nx, y: ny,
                        g: nextG,
                        f: nextG + heuristic(nx, ny),
                        path: [...current.path, { x: nx + 0.5, y: ny + 0.5 }]
                    });
                }
            }
        }
        return [];
    }

    static generateRoomSweepPath(state, room, currentX, currentY, isEdgePhase, edgeStartIndex = null) {
        let plannedDirt = state.dirtMap.map(row => [...row]);
        let fullPath = [];
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

            for (let target of edgeTargets) {
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
                let subPath = this.findPath(state, cx, cy, target.x, target.y, plannedDirt, room, false);

                if (subPath.length > 0) {
                    fullPath.push(...subPath);
                    // Mark tiles along the found sub-path as mentally cleaned so we don't
                    // immediately backtrack over them on the next replan.
                    for (let p of subPath) {
                        let px = Math.floor(p.x);
                        let py = Math.floor(p.y);
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
                for (let target of edgeTargets) {
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
            let dirtyTiles = [];
            for (let y = room.y1; y <= room.y2; y++) {
                for (let x = room.x1; x <= room.x2; x++) {
                    if (state.isValidPosition(x, y) && state.dirtMap[y][x] === 1 && !state.hasKnownObstacleAt(x, y)) {
                        dirtyTiles.push({ x, y });
                    }
                }
            }

            if (dirtyTiles.length > 0) {
                // Predominant axis of the uncleaned region (width vs. height)
                let minX = Math.min(...dirtyTiles.map(t => t.x));
                let maxX = Math.max(...dirtyTiles.map(t => t.x));
                let minY = Math.min(...dirtyTiles.map(t => t.y));
                let maxY = Math.max(...dirtyTiles.map(t => t.y));
                const sweepHorizontal = (maxX - minX) >= (maxY - minY);

                // Build the S-pattern target sequence: parallel lines with
                // alternating direction so each line starts where the previous ended.
                let sweepTargets = [];
                if (sweepHorizontal) {
                    for (let y = minY; y <= maxY; y++) {
                        let line = dirtyTiles.filter(t => t.y === y).sort((a, b) => a.x - b.x);
                        if ((y - minY) % 2 === 1) line.reverse();
                        sweepTargets.push(...line);
                    }
                } else {
                    for (let x = minX; x <= maxX; x++) {
                        let line = dirtyTiles.filter(t => t.x === x).sort((a, b) => a.y - b.y);
                        if ((x - minX) % 2 === 1) line.reverse();
                        sweepTargets.push(...line);
                    }
                }

                for (let target of sweepTargets) {
                    // Skip tiles cleaned in a previous pass or covered by the path built so far
                    if (state.dirtMap[target.y][target.x] === 0 || plannedDirt[target.y][target.x] === 0) {
                        continue;
                    }

                    // Already standing on this tile; move to the next sweep target
                    if (cx === target.x && cy === target.y) {
                        continue;
                    }

                    let subPath = this.findPath(state, cx, cy, target.x, target.y, plannedDirt, room, false);

                    if (subPath.length > 0) {
                        fullPath.push(...subPath);
                        // Mark as mentally cleaned
                        for (let p of subPath) {
                            let px = Math.floor(p.x); let py = Math.floor(p.y);
                            if (plannedDirt[py] && plannedDirt[py][px] !== undefined) plannedDirt[py][px] = 0;
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

