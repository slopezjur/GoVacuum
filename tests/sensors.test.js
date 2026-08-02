import { describe, it, expect, beforeEach } from 'vitest';
import { CONFIG } from '../js/robot_vacuum_config.js';
import { GameState } from '../js/robot_vacuum_game_state.js';
import { SensorSystem } from '../js/robot_vacuum_sensors.js';

// dt large enough for the LiDAR head to complete a full 360° sweep
const FULL_SWEEP_DT = (Math.PI * 2) / CONFIG.SENSORS.LIDAR_ROTATION_SPEED;

let state;
let sensors;
let robot;

beforeEach(() => {
    state = new GameState();
    // Deterministic world: drop all randomly placed obstacles, keep only the base
    state.actualObjects = state.actualObjects.filter(o => o.type === CONFIG.OBJECT_TYPES.BASE);
    state.knownObjects = [...state.actualObjects];
    sensors = new SensorSystem();
    robot = { x: 2.5, y: 2.5 };
});

describe('SensorSystem LiDAR', () => {
    it('registers an object hit by a ray within range', () => {
        const teddy = { x: 4.5, y: 2.5, type: CONFIG.OBJECT_TYPES.TEDDY }; // 2 tiles east
        state.actualObjects.push(teddy);
        sensors.scan(robot, state, [], FULL_SWEEP_DT);
        expect(state.knownObjects).toContain(teddy);
    });

    it('leaves objects outside LiDAR range unknown', () => {
        // 3.5 tiles east, beyond LIDAR_RANGE (3); no wall before it on row y=3
        robot = { x: 2.5, y: 3.5 };
        const ball = { x: 6.0, y: 3.5, type: CONFIG.OBJECT_TYPES.BALL };
        state.actualObjects.push(ball);
        sensors.scan(robot, state, [], FULL_SWEEP_DT);
        expect(state.knownObjects).not.toContain(ball);
    });

    it('leaves objects behind walls unknown', () => {
        // Wall at x=7 (MAP_DATA row 1) blocks sight to the bedroom object
        robot = { x: 5.5, y: 1.5 };
        const sock = { x: 8.5, y: 1.5, type: CONFIG.OBJECT_TYPES.SOCK };
        state.actualObjects.push(sock);
        sensors.scan(robot, state, [], FULL_SWEEP_DT);
        expect(state.knownObjects).not.toContain(sock);
    });

    it('does not sweep while the robot is docked at the base', () => {
        robot = { x: CONFIG.ROBOT.START_X, y: CONFIG.ROBOT.START_Y };
        const ball = { x: 3.5, y: 1.5, type: CONFIG.OBJECT_TYPES.BALL }; // in range, line of sight
        state.actualObjects.push(ball);
        sensors.scan(robot, state, [], FULL_SWEEP_DT);
        expect(state.knownObjects).not.toContain(ball);
        // Spins up once the robot leaves the base
        robot = { x: 2.5, y: 1.5 };
        sensors.scan(robot, state, [], FULL_SWEEP_DT);
        expect(state.knownObjects).toContain(ball);
    });
});

describe('SensorSystem bumper', () => {
    it('registers an obstacle on contact, even with no LiDAR sweep', () => {
        const box = { x: 2.8, y: 2.5, type: CONFIG.OBJECT_TYPES.BOX }; // 0.3 tiles away
        state.actualObjects.push(box);
        sensors.scan(robot, state, [], 0);
        expect(state.knownObjects).toContain(box);
    });

    it('ignores obstacles beyond bumper distance', () => {
        const box = { x: 3.5, y: 2.5, type: CONFIG.OBJECT_TYPES.BOX };
        state.actualObjects.push(box);
        sensors.scan(robot, state, [], 0);
        expect(state.knownObjects).not.toContain(box);
    });
});

describe('SensorSystem replan flag', () => {
    it('fires when a discovery intersects the active path', () => {
        const teddy = { x: 4.5, y: 2.5, type: CONFIG.OBJECT_TYPES.TEDDY };
        state.actualObjects.push(teddy);
        const path = [{ x: 3.5, y: 2.5 }, { x: 4.5, y: 2.5 }];
        expect(sensors.scan(robot, state, path, FULL_SWEEP_DT)).toBe(true);
    });

    it('stays clear when discoveries do not intersect the path', () => {
        const teddy = { x: 4.5, y: 2.5, type: CONFIG.OBJECT_TYPES.TEDDY };
        state.actualObjects.push(teddy);
        const path = [{ x: 2.5, y: 3.5 }, { x: 2.5, y: 4.5 }];
        expect(sensors.scan(robot, state, path, FULL_SWEEP_DT)).toBe(false);
    });

    it('stays clear when nothing new is discovered', () => {
        const teddy = { x: 4.5, y: 2.5, type: CONFIG.OBJECT_TYPES.TEDDY };
        state.actualObjects.push(teddy);
        state.knownObjects.push(teddy); // already known
        const path = [{ x: 4.5, y: 2.5 }];
        expect(sensors.scan(robot, state, path, FULL_SWEEP_DT)).toBe(false);
    });
});
