import { CONFIG } from './robot_vacuum_config.js';

/**
 * @class SensorSystem
 *
 * Realistic sensor suite: a directional rotating LiDAR plus a contact bumper.
 * The robot only knows about obstacles its sensors have actually seen;
 * discoveries are registered into state.knownObjects.
 *
 * LiDAR: the head spins at SENSORS.LIDAR_ROTATION_SPEED rad/s, casting
 * SENSORS.LIDAR_RAY_COUNT evenly spaced rays per revolution. Each frame only
 * the angular slice swept during that frame is cast (DDA grid march, range
 * SENSORS.LIDAR_RANGE). A ray terminating on an actualObjects tile registers
 * the object; walls terminate rays without registering anything.
 *
 * Bumper: an unregistered obstacle closer than SENSORS.BUMPER_DISTANCE to the
 * robot's center is registered instantly — the robot physically bumped into
 * something the LiDAR had not revealed yet.
 *
 * Cliff sensors are intentionally skipped: the map has no drops (future work).
 */
export class SensorSystem {
    constructor() {
        // Continuous (unwrapped) head angle; ray slot n sits at n * raySpacing
        this.headAngle = 0;
        // Visual debug state, consumed by Renderer2D via getSensorDebugInfo()
        this.rayTrail = [];   // { x1, y1, x2, y2, ttl }
        this.hitFlashes = []; // { x, y, ttl }
    }

    /**
     * Advance sensors by `dt` seconds and scan from the robot's pose.
     * Returns true when a newly discovered object intersects currentPath
     * (same contract as the old GameState.senseEnvironment).
     */
    scan(robot, state, currentPath, dt) {
        const newlyDiscovered = [];
        this.scanBumper(robot, state, newlyDiscovered);

        // LiDAR spins up only once the robot has left the base (same rule as the brush)
        const atBase = Math.floor(robot.x) === CONFIG.ROBOT.BASE_X && Math.floor(robot.y) === CONFIG.ROBOT.BASE_Y;
        if (!atBase) {
            this.scanLidar(robot, state, dt, newlyDiscovered);
        }
        this.decayDebugState(dt);

        // Trigger replan only if a new object directly obstructs the planned path
        if (newlyDiscovered.length > 0 && currentPath.length > 0) {
            for (const newObj of newlyDiscovered) {
                for (const p of currentPath) {
                    if (Math.floor(p.x) === Math.floor(newObj.x) && Math.floor(p.y) === Math.floor(newObj.y)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // Instant registration of any unregistered obstacle touching the robot's body
    scanBumper(robot, state, newlyDiscovered) {
        for (const obj of state.actualObjects) {
            if (state.knownObjects.includes(obj)) {continue;}
            if (Math.hypot(obj.x - robot.x, obj.y - robot.y) < CONFIG.SENSORS.BUMPER_DISTANCE) {
                this.register(state, obj, newlyDiscovered);
            }
        }
    }

    // Cast the angular slice of rays swept during this frame
    scanLidar(robot, state, dt, newlyDiscovered) {
        const raySpacing = (Math.PI * 2) / CONFIG.SENSORS.LIDAR_RAY_COUNT;
        const prevAngle = this.headAngle;
        this.headAngle += CONFIG.SENSORS.LIDAR_ROTATION_SPEED * dt;

        // Cast every ray slot crossed by the head during [prevAngle, headAngle)
        for (let slot = Math.ceil(prevAngle / raySpacing); slot * raySpacing < this.headAngle; slot++) {
            const angle = slot * raySpacing;
            const hit = this.castRay(state, robot.x, robot.y, angle);

            if (hit.object && !state.knownObjects.includes(hit.object)) {
                this.register(state, hit.object, newlyDiscovered);
            }

            this.rayTrail.push({
                x1: robot.x, y1: robot.y,
                x2: robot.x + Math.cos(angle) * hit.dist,
                y2: robot.y + Math.sin(angle) * hit.dist,
                ttl: CONFIG.SENSORS.RAY_TRAIL_TTL
            });
            if (hit.object && hit.object.type !== CONFIG.OBJECT_TYPES.BASE) {
                this.hitFlashes.push({ x: hit.object.x, y: hit.object.y, ttl: CONFIG.SENSORS.HIT_FLASH_TTL });
            }
        }
    }

    /**
     * Short-range distance reading at a robot-relative angle — simulates the
     * fixed IR wall sensor of a real vacuum (used by the wall-follow controller).
     * Reuses the LiDAR DDA marcher; terminates on walls AND objects.
     * `pose` is { x, y, angle }; `relativeAngle` is 0 = front, +PI/2 = right side
     * (screen-space frame, y grows downward — same convention as the brush).
     */
    measureSideDistance(state, pose, relativeAngle, range = CONFIG.ROBOT.WALL_FOLLOW.RANGE) {
        return this.castRay(state, pose.x, pose.y, pose.angle + relativeAngle, range).dist;
    }

    /**
     * DDA grid march along a ray. Terminates on the first wall or object tile,
     * or at `range`. Returns { dist, object|null }.
     */
    castRay(state, ox, oy, angle, range = CONFIG.SENSORS.LIDAR_RANGE) {
        const dirX = Math.cos(angle); const dirY = Math.sin(angle);
        let mapX = Math.floor(ox); let mapY = Math.floor(oy);

        const deltaDistX = dirX === 0 ? Infinity : Math.abs(1 / dirX);
        const deltaDistY = dirY === 0 ? Infinity : Math.abs(1 / dirY);
        const stepX = dirX < 0 ? -1 : 1;
        const stepY = dirY < 0 ? -1 : 1;
        let sideDistX = dirX === 0 ? Infinity : (dirX < 0 ? ox - mapX : mapX + 1 - ox) * deltaDistX;
        let sideDistY = dirY === 0 ? Infinity : (dirY < 0 ? oy - mapY : mapY + 1 - oy) * deltaDistY;

        let dist = 0;
        while (dist <= range) {
            let cellX = mapX; let cellY = mapY;
            if (sideDistX < sideDistY) {
                dist = sideDistX; sideDistX += deltaDistX; cellX += stepX;
            } else {
                dist = sideDistY; sideDistY += deltaDistY; cellY += stepY;
            }
            if (dist > range) {break;}
            mapX = cellX; mapY = cellY;

            if (mapX < 0 || mapX >= state.width || mapY < 0 || mapY >= state.height || state.map[mapY][mapX] === 1) {
                return { dist, object: null }; // wall: sight blocked, nothing registered
            }
            // The dock is flush with the floor: rays pass over it (it is not a wall)
            const obj = state.actualObjects.find(o => o.type !== CONFIG.OBJECT_TYPES.BASE && Math.floor(o.x) === mapX && Math.floor(o.y) === mapY);
            if (obj) {
                return { dist, object: obj };
            }
        }
        return { dist: range, object: null };
    }

    register(state, obj, newlyDiscovered) {
        state.knownObjects.push(obj);
        newlyDiscovered.push(obj);
    }

    decayDebugState(dt) {
        this.rayTrail = this.rayTrail.filter(r => (r.ttl -= dt) > 0);
        this.hitFlashes = this.hitFlashes.filter(f => (f.ttl -= dt) > 0);
    }

    /**
     * Debug visualization snapshot for the 2D renderer
     * (same pattern as VacuumRobot.getBrushConfig()).
     */
    getSensorDebugInfo() {
        return {
            rays: this.rayTrail,
            hitFlashes: this.hitFlashes,
            range: CONFIG.SENSORS.LIDAR_RANGE
        };
    }
}
