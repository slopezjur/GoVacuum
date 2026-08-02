import { describe, it, expect, beforeEach } from 'vitest';
import { CONFIG } from '../js/robot_vacuum_config.js';
import { GameState } from '../js/robot_vacuum_game_state.js';
import { NavigationSystem } from '../js/robot_vacuum_navigation.js';

const LIVING_ROOM = CONFIG.ROOMS[0];

let state;

beforeEach(() => {
    state = new GameState();
    // Deterministic world: drop all randomly placed obstacles, keep only the base
    state.actualObjects = state.actualObjects.filter(o => o.type === CONFIG.OBJECT_TYPES.BASE);
    state.knownObjects = [...state.actualObjects];
});

describe('findPath', () => {
    it('returns an empty path when start equals goal', () => {
        expect(NavigationSystem.findPath(state, 3, 3, 3, 3)).toEqual([]);
    });

    it('finds a straight path across open floor', () => {
        const path = NavigationSystem.findPath(state, 2, 2, 5, 2, null, null, true);
        expect(path).toHaveLength(3);
        expect(path.at(-1)).toEqual({ x: 5.5, y: 2.5 });
    });

    it('does not include the start tile in the path', () => {
        const path = NavigationSystem.findPath(state, 2, 2, 4, 3, null, null, true);
        expect(path.some(p => Math.floor(p.x) === 2 && Math.floor(p.y) === 2)).toBe(false);
    });

    it('routes around known obstacles', () => {
        // Wall off (3,2) and (3,3) so a direct east route from (2,2) is blocked
        state.knownObjects.push(
            { x: 3.5, y: 2.5, type: CONFIG.OBJECT_TYPES.BOX },
            { x: 3.5, y: 3.5, type: CONFIG.OBJECT_TYPES.BOX }
        );
        const path = NavigationSystem.findPath(state, 2, 2, 5, 2, null, null, true);
        expect(path.length).toBeGreaterThan(0);
        expect(path.some(p => Math.floor(p.x) === 3 && [2, 3].includes(Math.floor(p.y)))).toBe(false);
    });

    it('returns [] when the goal is fully enclosed by obstacles', () => {
        // Surround (5,5) on all four sides
        state.knownObjects.push(
            { x: 4.5, y: 5.5, type: CONFIG.OBJECT_TYPES.BOX },
            { x: 6.5, y: 5.5, type: CONFIG.OBJECT_TYPES.BOX },
            { x: 5.5, y: 4.5, type: CONFIG.OBJECT_TYPES.BOX }
            // (5,6) is a wall in MAP_DATA
        );
        expect(NavigationSystem.findPath(state, 2, 2, 5, 5, null, null, true)).toEqual([]);
    });

    it('forces the first step out of the base through the base front tile', () => {
        const path = NavigationSystem.findPath(state, CONFIG.ROBOT.BASE_X, CONFIG.ROBOT.BASE_Y, 5, 5, null, null, true);
        expect(path[0]).toEqual({
            x: CONFIG.ROBOT.BASE_FRONT_X + 0.5,
            y: CONFIG.ROBOT.BASE_FRONT_Y + 0.5
        });
    });

    it('prefers dirty tiles over already-cleaned ones (weight 1 vs 5)', () => {
        // Clean the direct row y=2 from x=2..5; the long way around stays dirty
        for (let x = 2; x <= 5; x++) {state.dirtMap[2][x] = 0;}
        const path = NavigationSystem.findPath(state, 2, 2, 5, 2);
        // A detour through dirty tiles costs 4; the direct clean route costs 3*5=15
        expect(path.some(p => Math.floor(p.y) !== 2)).toBe(true);
    });

    it('applies the +50 penalty for leaving the room bounds during a sweep', () => {
        const path = NavigationSystem.findPath(state, 1, 1, 6, 5, null, LIVING_ROOM, true);
        const leavesRoom = path.some(p => {
            const x = Math.floor(p.x); const y = Math.floor(p.y);
            return x < LIVING_ROOM.x1 || x > LIVING_ROOM.x2 || y < LIVING_ROOM.y1 || y > LIVING_ROOM.y2;
        });
        expect(leavesRoom).toBe(false);
    });
});

describe('getEdgeTargets', () => {
    it('covers every perimeter tile exactly once', () => {
        const targets = NavigationSystem.getEdgeTargets(LIVING_ROOM);
        const width = LIVING_ROOM.x2 - LIVING_ROOM.x1 + 1;
        const height = LIVING_ROOM.y2 - LIVING_ROOM.y1 + 1;
        expect(targets).toHaveLength(2 * (width + height) - 4);
        const keys = new Set(targets.map(t => `${t.x},${t.y}`));
        expect(keys.size).toBe(targets.length);
    });

    it('traces the perimeter counter-clockwise (right-wall following)', () => {
        const targets = NavigationSystem.getEdgeTargets(LIVING_ROOM);
        // Starts top-left and first walks DOWN the left edge
        expect(targets[0]).toEqual({ x: LIVING_ROOM.x1, y: LIVING_ROOM.y1 });
        expect(targets[1]).toEqual({ x: LIVING_ROOM.x1, y: LIVING_ROOM.y1 + 1 });
    });

    it('only contains edge tiles', () => {
        for (const t of NavigationSystem.getEdgeTargets(LIVING_ROOM)) {
            expect(NavigationSystem.isRoomEdgeTile(LIVING_ROOM, t.x, t.y)).toBe(true);
        }
    });
});

describe('generateRoomSweepPath', () => {
    it('edge phase produces a path covering dirty perimeter tiles', () => {
        const path = NavigationSystem.generateRoomSweepPath(state, LIVING_ROOM, 2.5, 2.5, true, 0);
        expect(path.length).toBeGreaterThan(0);
        // Every visited tile must be a valid, obstacle-free position
        for (const p of path) {
            expect(state.isValidPosition(Math.floor(p.x), Math.floor(p.y))).toBe(true);
        }
    });

    it('edge phase returns [] when all edge tiles are already clean', () => {
        for (const t of NavigationSystem.getEdgeTargets(LIVING_ROOM)) {
            state.dirtMap[t.y][t.x] = 0;
        }
        const path = NavigationSystem.generateRoomSweepPath(state, LIVING_ROOM, 2.5, 2.5, true, 0);
        expect(path).toEqual([]);
    });

    it('inner phase covers the remaining dirty interior tiles', () => {
        // Simulate a completed perimeter pass
        for (const t of NavigationSystem.getEdgeTargets(LIVING_ROOM)) {
            state.dirtMap[t.y][t.x] = 0;
        }
        const path = NavigationSystem.generateRoomSweepPath(state, LIVING_ROOM, 2.5, 2.5, false);
        expect(path.length).toBeGreaterThan(0);
    });

    it('inner phase returns [] when nothing is dirty', () => {
        state.dirtMap = state.dirtMap.map(row => row.map(() => 0));
        const path = NavigationSystem.generateRoomSweepPath(state, LIVING_ROOM, 2.5, 2.5, false);
        expect(path).toEqual([]);
    });
});

describe('GameState obstacle toggling', () => {
    it('refuses to place obstacles on the base or its front tile', () => {
        expect(state.toggleObstacleAt(CONFIG.ROBOT.BASE_X, CONFIG.ROBOT.BASE_Y)).toBe(false);
        expect(state.toggleObstacleAt(CONFIG.ROBOT.BASE_FRONT_X, CONFIG.ROBOT.BASE_FRONT_Y)).toBe(false);
    });

    it('refuses to place obstacles on walls', () => {
        expect(state.toggleObstacleAt(0, 0)).toBe(false);
    });

    it('toggles an obstacle on and off a free tile', () => {
        expect(state.toggleObstacleAt(4, 4)).toBe(true);
        expect(state.hasKnownObstacleAt(4, 4)).toBe(false); // not yet sensed
        expect(state.toggleObstacleAt(4, 4)).toBe(true);      // second toggle removes it
        expect(state.actualObjects.some(o => Math.floor(o.x) === 4 && Math.floor(o.y) === 4)).toBe(false);
    });
});
