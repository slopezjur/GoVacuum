/**
 * @class NavigationSystem
 */
class NavigationSystem {

    static getEdgeTargets(room) {
        const edgeTargets = [];
        for (let x = room.x1; x <= room.x2; x++) edgeTargets.push({ x, y: room.y1 });
        for (let y = room.y1 + 1; y <= room.y2; y++) edgeTargets.push({ x: room.x2, y });
        for (let x = room.x2 - 1; x >= room.x1; x--) edgeTargets.push({ x, y: room.y2 });
        for (let y = room.y2 - 1; y > room.y1; y--) edgeTargets.push({ x: room.x1, y });
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

    static resolveEdgeStartIndex(room, robotX, robotY) {
        const cx = Math.floor(robotX);
        const cy = Math.floor(robotY);
        const edgeTargets = this.getEdgeTargets(room);
        let closestIdx = 0;
        let minDist = Infinity;

        for (let i = 0; i < edgeTargets.length; i++) {
            const d = Math.abs(edgeTargets[i].x - cx) + Math.abs(edgeTargets[i].y - cy);
            if (d < minDist) {
                minDist = d;
                closestIdx = i;
            }
        }

        return closestIdx;
    }

    // DIJKSTRA Algorithm (Weighted BFS)
    static findPath(state, startX, startY, endX, endY, plannedDirtMap = null, roomBounds = null, ignoreDirtFlag = false, edgePhase = false) {
        if (startX === endX && startY === endY) return [];

        // Force base exit constraint: if starting from the base, the first tile of any path MUST be the base front tile
        if (startX === CONFIG.ROBOT.BASE_X && startY === CONFIG.ROBOT.BASE_Y) {
            const bfx = CONFIG.ROBOT.BASE_FRONT_X;
            const bfy = CONFIG.ROBOT.BASE_FRONT_Y;
            if (bfx === endX && bfy === endY) {
                return [{ x: bfx + 0.5, y: bfy + 0.5 }];
            }
            const subPath = this.findPath(state, bfx, bfy, endX, endY, plannedDirtMap, roomBounds, ignoreDirtFlag, edgePhase);
            if (subPath.length > 0) {
                return [{ x: bfx + 0.5, y: bfy + 0.5 }, ...subPath];
            }
            return [];
        }

        let openSet = [{ x: startX, y: startY, g: 0, path: [] }];
        let minG = new Map();
        minG.set(`${startX},${startY}`, 0);

        const directions = [[0,-1], [1,0], [0,1], [-1,0]];

        while (openSet.length > 0) {
            // Process lowest cost path
            openSet.sort((a, b) => a.g - b.g);
            let current = openSet.shift();

            if (current.x === endX && current.y === endY) return current.path;

            for (let dir of directions) {
                let nx = current.x + dir[0]; let ny = current.y + dir[1];

                if (!state.isValidPosition(nx, ny) || state.hasKnownObstacleAt(nx, ny)) {
                    if (!(nx === endX && ny === endY && !state.hasKnownObstacleAt(nx, ny))) continue;
                }

                // Weights logic
                let stepCost = 1;
                if (!ignoreDirtFlag) {
                    let isDirty = plannedDirtMap ? plannedDirtMap[ny][nx] === 1 : state.dirtMap[ny][nx] === 1;
                    stepCost = isDirty ? 1 : 5; // Clean tiles are expensive to step on
                }

                // Heavy penalty for leaving the target room during a sweep
                if (roomBounds && (nx < roomBounds.x1 || nx > roomBounds.x2 || ny < roomBounds.y1 || ny > roomBounds.y2)) {
                    stepCost += 50;
                }

                // During edge phase, strongly prefer staying on the room perimeter
                if (edgePhase && roomBounds && !this.isRoomEdgeTile(roomBounds, nx, ny)) {
                    stepCost += 30;
                }

                let nextG = current.g + stepCost;

                let key = `${nx},${ny}`;
                if (!minG.has(key) || nextG < minG.get(key)) {
                    minG.set(key, nextG);
                    openSet.push({
                        x: nx, y: ny,
                        g: nextG,
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
            // ----------------------------------------------------
            // CLOCKWISE EDGE SWEEP: one perimeter leg per replan
            // ----------------------------------------------------
            let edgeTargets = this.getEdgeTargets(room);
            const startIdx = edgeStartIndex ?? this.resolveEdgeStartIndex(room, currentX, currentY);
            edgeTargets = [...edgeTargets.slice(startIdx), ...edgeTargets.slice(0, startIdx)];

            for (let target of edgeTargets) {
                // Skip if already cleaned, blocked, or invalid
                if (!state.isValidPosition(target.x, target.y) ||
                    plannedDirt[target.y][target.x] === 0 ||
                    state.hasKnownObstacleAt(target.x, target.y)) {
                    continue;
                }

                // Already standing on this edge tile; move to the next perimeter target
                if (cx === target.x && cy === target.y) {
                    continue;
                }

                let subPath = this.findPath(state, cx, cy, target.x, target.y, plannedDirt, room, false, true);

                if (subPath.length > 0) {
                    fullPath.push(...subPath);
                    break;
                }

                // Unreachable edge tile: skip it and try the next perimeter target
                plannedDirt[target.y][target.x] = 0;
            }
        } else {
            // ----------------------------------------------------
            // INNER FILL SWEEP (Greedy nearest neighbor)
            // ----------------------------------------------------
            while(true) {
                let targets = [];
                for (let y = room.y1; y <= room.y2; y++) {
                    for (let x = room.x1; x <= room.x2; x++) {
                        if (state.isValidPosition(x, y) && plannedDirt[y][x] === 1 && !state.hasKnownObstacleAt(x, y)) {
                            targets.push({ x, y });
                        }
                    }
                }

                if(targets.length === 0) break;

                // Prioritize absolute proximity. Tie-breaker ensures horizontal striping.
                targets.sort((a, b) => {
                    let distA = Math.abs(a.x - cx) + Math.abs(a.y - cy);
                    let distB = Math.abs(b.x - cx) + Math.abs(b.y - cy);

                    let scoreA = distA + (Math.abs(a.y - cy) * 0.1);
                    let scoreB = distB + (Math.abs(b.y - cy) * 0.1);

                    return scoreA - scoreB;
                });

                let nextTarget = targets.shift();

                let subPath = this.findPath(state, cx, cy, nextTarget.x, nextTarget.y, plannedDirt, room, false);

                if (subPath.length > 0) {
                    fullPath.push(...subPath);
                    // Mark as mentally cleaned
                    for(let p of subPath) {
                        let px = Math.floor(p.x); let py = Math.floor(p.y);
                        if (plannedDirt[py] && plannedDirt[py][px] !== undefined) plannedDirt[py][px] = 0;
                    }
                    cx = nextTarget.x; cy = nextTarget.y;
                } else {
                    // Tile isolated by obstacles, give up on it
                    plannedDirt[nextTarget.y][nextTarget.x] = 0;
                }
            }
        }
        return fullPath;
    }
}

