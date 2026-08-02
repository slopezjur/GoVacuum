import { describe, it, expect } from 'vitest';
import { CONFIG } from '../js/robot_vacuum_config.js';
import { GameState } from '../js/robot_vacuum_game_state.js';
import { SensorSystem } from '../js/robot_vacuum_sensors.js';
import { VacuumRobot, STEERING_MODE } from '../js/robot_vacuum_robot.js';

const CFG = CONFIG.ROBOT.WALL_FOLLOW;
const DT = 0.05;

// Deterministic world with a custom map (state.map normally aliases CONFIG.MAP_DATA)
function makeState(mapRows) {
    const state = new GameState();
    state.map = mapRows;
    state.width = mapRows[0].length;
    state.height = mapRows.length;
    state.actualObjects = state.actualObjects.filter(o => o.type === CONFIG.OBJECT_TYPES.BASE);
    state.knownObjects = [];
    state.dirtMap = Array.from({ length: state.height }, () => Array(state.width).fill(1));
    return state;
}

function makeRobot(x, y, angle, path) {
    const robot = new VacuumRobot();
    robot.x = x; robot.y = y; robot.angle = angle;
    robot.setPath(path);
    return robot;
}

function runTicks(robot, state, sensors, seconds, shouldStop = null) {
    const ticks = Math.round(seconds / DT);
    for (let i = 0; i < ticks; i++) {
        robot.update(state, 'CLEAN_EDGE', () => {}, DT, STEERING_MODE.WALL_FOLLOW, sensors);
        if (shouldStop && shouldStop()) {break;}
    }
}

// Straight south wall: the right side of an east-facing robot
const STRAIGHT_WALL_MAP = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];

// South wall ends at x=3: an east-facing robot hits a convex corner
const CONVEX_CORNER_MAP = [
    [1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,1],
    [1,1,1,1,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1]
];

// A wall tooth protrudes into the lane at (5, 3)
const TOOTH_MAP = [
    [1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,1,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1]
];

// A doorway gap in the south wall at x=3..6 leads to a corridor below
const DOORWAY_MAP = [
    [1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,1],
    [1,1,1,0,0,0,0,1,1,1],
    [1,0,0,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1]
];

// A wall block protrudes into the room at x=4..5, rows 1-2
const PROTRUSION_MAP = [
    [1,1,1,1,1,1,1],
    [1,0,0,0,1,1,1],
    [1,0,0,0,1,1,1],
    [1,0,0,0,0,0,1],
    [1,1,1,1,1,1,1]
];

// Wall dead ahead at x=5: an east-facing robot hits a concave corner
const CONCAVE_CORNER_MAP = [
    [1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,1,1,1,1,1],
    [1,0,0,0,0,1,1,1,1,1],
    [1,0,0,0,0,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1]
];

describe('SensorSystem.measureSideDistance', () => {
    it('measures the right-side wall distance with the DDA marcher', () => {
        const state = makeState(STRAIGHT_WALL_MAP);
        const sensors = new SensorSystem();
        // Facing east at y=2.5, right-side ray hits the south wall boundary at y=4.0
        const d = sensors.measureSideDistance(state, { x: 2.5, y: 2.5, angle: 0 }, Math.PI / 2, 3);
        expect(d).toBeCloseTo(1.5, 5);
    });

    it('caps the reading at the given range when no wall is detected', () => {
        const state = makeState(STRAIGHT_WALL_MAP);
        const sensors = new SensorSystem();
        const d = sensors.measureSideDistance(state, { x: 2.5, y: 2.5, angle: 0 }, 0, 1.0);
        expect(d).toBe(1.0);
    });
});

describe('VacuumRobot wall-follow controller', () => {
    it('converges the lateral error to the target offset on a straight wall', () => {
        const state = makeState(STRAIGHT_WALL_MAP);
        const sensors = new SensorSystem();
        // Start 1.0 tile from the south wall (target offset is 0.5)
        const robot = makeRobot(1.5, 3.0, 0, [{ x: 14.5, y: 3.5 }]);

        runTicks(robot, state, sensors, 10);

        const dist = sensors.measureSideDistance(state, robot, Math.PI / 2, CFG.RANGE);
        expect(Math.abs(dist - CFG.TARGET_DISTANCE)).toBeLessThan(0.1);
        expect(Math.abs(robot.angle)).toBeLessThan(0.15); // settled parallel to the wall
        expect(robot.x).toBeGreaterThan(5);                // kept progressing along the route
        expect(robot.wallFollowEngaged).toBe(true);
        expect(robot.wallFollowFallback).toBe(false);
    });

    it('curves right when the wall is lost at a convex corner', () => {
        const state = makeState(CONVEX_CORNER_MAP);
        const sensors = new SensorSystem();
        // Hugging the south wall heading east; the wall ends at x=3 and the
        // route itself turns right around the corner (as the A* contour-hug does)
        const robot = makeRobot(2.5, 3.5, 0, [{ x: 4.5, y: 5.5 }]);

        runTicks(robot, state, sensors, 6, () => robot.angle > 0.25);

        // Positive angle = right turn in this screen-space frame (y grows downward)
        expect(robot.angle).toBeGreaterThan(0.25);
    });

    it('follows the route past a doorway gap instead of turning into the corridor', () => {
        const state = makeState(DOORWAY_MAP);
        const sensors = new SensorSystem();
        // Hugging the south wall heading east; the wall has a doorway gap at
        // x=3..6, but the route continues straight along the room
        const robot = makeRobot(1.5, 3.5, 0, [{ x: 8.5, y: 3.5 }]);

        let maxY = 0;
        for (let i = 0; i < Math.round(6 / DT); i++) {
            robot.update(state, 'CLEAN_EDGE', () => {}, DT, STEERING_MODE.WALL_FOLLOW, sensors);
            maxY = Math.max(maxY, robot.y);
        }

        expect(robot.x).toBeGreaterThan(5); // kept progressing along the route
        expect(maxY).toBeLessThan(3.65);    // never turned into the corridor
    });

    it('turns left in place at a concave corner when the route turns left', () => {
        const state = makeState(CONCAVE_CORNER_MAP);
        const sensors = new SensorSystem();
        // Hugging the south wall heading east, wall dead ahead at x=5,
        // and the route turns left (north) around the interior corner
        const robot = makeRobot(4.45, 3.5, 0, [{ x: 4.5, y: 1.5 }]);

        const engaged = robot.wallFollow(state, sensors, 0.05, -2.0, DT);

        expect(engaged).toBe(true);
        expect(robot.angle).toBeLessThan(0); // left turn
    });

    it('does not turn left at a front wall when the route goes straight', () => {
        const state = makeState(PROTRUSION_MAP);
        const sensors = new SensorSystem();
        // Wall block dead ahead, but the route continues straight:
        // the concave turn must stay out of the way (no pushy sensor)
        const robot = makeRobot(2.5, 2.5, 0, [{ x: 5.5, y: 2.5 }]);

        runTicks(robot, state, sensors, 2);

        expect(Math.abs(robot.angle)).toBeLessThan(0.2);
    });

    it('rounds a protruding wall corner to the right when the route turns right', () => {
        const state = makeState(PROTRUSION_MAP);
        const sensors = new SensorSystem();
        // Wall block ahead-right; the route turns right (south) around it —
        // a left in-place turn here would fight the route and stall the robot
        const robot = makeRobot(1.5, 2.5, 0, [{ x: 3.5, y: 3.5 }]);

        runTicks(robot, state, sensors, 4, () => robot.angle > 0.3);

        expect(robot.angle).toBeGreaterThan(0.3); // turned right with the route
    });

    it('never crosses into a wall tile while wall-following', () => {
        const state = makeState(TOOTH_MAP);
        const sensors = new SensorSystem();
        // Hugging the south wall heading east; the tooth at (5, 3) blocks the lane
        const robot = makeRobot(2.5, 3.5, 0, [{ x: 8.5, y: 3.5 }]);

        for (let i = 0; i < Math.round(3 / DT); i++) {
            robot.update(state, 'CLEAN_EDGE', () => {}, DT, STEERING_MODE.WALL_FOLLOW, sensors);
            expect(state.map[Math.floor(robot.y)][Math.floor(robot.x)]).toBe(0);
        }
    });

    it('never crosses into an obstacle tile while wall-following', () => {
        const state = makeState(STRAIGHT_WALL_MAP);
        const box = { x: 5.5, y: 3.5, type: CONFIG.OBJECT_TYPES.BOX }; // blocks the lane
        state.actualObjects.push(box);
        const sensors = new SensorSystem();
        const robot = makeRobot(2.5, 3.5, 0, [{ x: 8.5, y: 3.5 }]);

        for (let i = 0; i < Math.round(3 / DT); i++) {
            robot.update(state, 'CLEAN_EDGE', () => {}, DT, STEERING_MODE.WALL_FOLLOW, sensors);
            expect(Math.floor(robot.x) === 5 && Math.floor(robot.y) === 3).toBe(false);
        }
    });

    it('engages the pursuit fallback after the timeout in a zigzag corridor', () => {
        const state = makeState(STRAIGHT_WALL_MAP);
        const robot = makeRobot(2.5, 2.5, 0, [{ x: 8.5, y: 2.5 }]);
        // Scripted zigzag readings: the side distance oscillates between
        // in-range-but-off-target and lost-wall, so the error never converges.
        // Only the engaged (in-range) ticks count toward the timeout, so the
        // run lasts twice the timeout
        let tick = 0;
        const zigzagSensors = {
            measureSideDistance: (s, pose, relativeAngle) => {
                if (relativeAngle === 0) {return 3;} // nothing ahead
                return (tick % 10 < 5) ? CFG.TARGET_DISTANCE + 0.6 : CFG.RANGE + 1;
            }
        };

        const ticks = Math.round((CFG.FALLBACK_TIMEOUT * 2 + 2) / DT);
        for (let i = 0; i < ticks; i++) {
            tick = i;
            robot.update(state, 'CLEAN_EDGE', () => {}, DT, STEERING_MODE.WALL_FOLLOW, zigzagSensors);
        }

        // Fallback engaged: plain waypoint pursuit for the rest of the segment
        expect(robot.wallFollowFallback).toBe(true);
        robot.update(state, 'CLEAN_EDGE', () => {}, DT, STEERING_MODE.WALL_FOLLOW, zigzagSensors);
        expect(robot.wallFollowEngaged).toBe(false);

        // A new path segment re-arms the wall follower
        robot.setPath([{ x: 3.5, y: 2.5 }]);
        expect(robot.wallFollowFallback).toBe(false);
    });

    it('ignores wall-follow mode without a sensor system (waypoint pursuit)', () => {
        const state = makeState(STRAIGHT_WALL_MAP);
        const robot = makeRobot(2.5, 2.5, 0, [{ x: 8.5, y: 2.5 }]);

        robot.update(state, 'CLEAN_EDGE', () => {}, DT, STEERING_MODE.WALL_FOLLOW, null);

        expect(robot.wallFollowEngaged).toBe(false);
        expect(robot.x).toBeGreaterThan(2.5); // plain pursuit still moves
    });
});

describe('wall-follow dock handling', () => {
    // Default map with only the dock remaining (no random obstacles)
    function makeDockState() {
        const state = new GameState();
        state.actualObjects = state.actualObjects.filter(o => o.type === CONFIG.OBJECT_TYPES.BASE);
        state.knownObjects = [...state.actualObjects];
        return state;
    }

    it('lets the side ray pass over the dock instead of treating it as a wall', () => {
        const state = makeDockState();
        const sensors = new SensorSystem();
        // Facing west along the dock row: the ray passes over the dock at (1,1)
        // and stops when entering the west wall tile (x=0), at the x=1.0 boundary
        const d = sensors.measureSideDistance(state, { x: 3.5, y: 1.5, angle: Math.PI }, 0, 5);
        expect(d).toBeCloseTo(2.5, 5);
    });

    it('does not stall against the dock when leaving the base', () => {
        const state = makeDockState();
        const sensors = new SensorSystem();
        // Heading south out of the base front: the dock sits on the right within ray range
        const robot = makeRobot(2.5, 1.5, Math.PI / 2, [{ x: 2.5, y: 2.5 }, { x: 1.5, y: 2.5 }]);

        runTicks(robot, state, sensors, 3);

        expect(robot.wallFollowFallback).toBe(false);
        expect(robot.y).toBeGreaterThan(2.0); // kept moving, no stall against the dock
    });

    it('drives fully out of the dock before accepting the next waypoint', () => {
        const state = makeDockState();
        const sensors = new SensorSystem();
        // Base-exit path: the first waypoint is always the base front tile
        const robot = makeRobot(1.5, 1.5, 0, [{ x: 2.5, y: 1.5 }, { x: 2.5, y: 2.5 }]);

        let exitX = null; // robot x at the moment the base-front waypoint is consumed
        for (let i = 0; i < Math.round(3 / DT); i++) {
            robot.update(state, 'CLEAN_EDGE', () => {}, DT, STEERING_MODE.WALL_FOLLOW, sensors);
            if (exitX === null && robot.path.length === 1) {exitX = robot.x;}
        }

        expect(exitX).not.toBeNull();
        expect(exitX).toBeGreaterThan(2.4); // consumed at the exact arrival, not the radius shortcut
    });
});

describe('wall-follow final waypoint', () => {
    it('drives all the way onto the final tile instead of stopping short of it', () => {
        const state = makeState(STRAIGHT_WALL_MAP);
        const sensors = new SensorSystem();
        // Single final waypoint: radius acceptance must not consume it early,
        // or the tile's dirt is never cleaned and the replanner loops forever
        const robot = makeRobot(6.8, 3.5, 0, [{ x: 8.5, y: 3.5 }]);

        runTicks(robot, state, sensors, 5);

        expect(robot.path.length).toBe(0);
        expect(Math.floor(robot.x)).toBe(8); // physically ON the last tile
        expect(state.dirtMap[3][8]).toBe(0); // ...so it actually got cleaned
    });
});
