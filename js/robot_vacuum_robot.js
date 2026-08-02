import { CONFIG } from './robot_vacuum_config.js';

// Local steering modes: waypoint pursuit (default) vs. right-side wall-follow
export const STEERING_MODE = Object.freeze({ PURSUIT: 'PURSUIT', WALL_FOLLOW: 'WALL_FOLLOW' });

/**
 * @class VacuumRobot
 */
export class VacuumRobot {
    constructor() {
        this.x = CONFIG.ROBOT.START_X;
        this.y = CONFIG.ROBOT.START_Y;
        this.angle = 0;
        this.path = [];
        // Brush state
        this.brushAngle = 0;
        this.brushSpinning = false;
        // Wall-follow controller state (see wallFollow())
        this.wallFollowEngaged = false;   // controller steered the current tick
        this.wallFollowFallback = false;  // safety fallback: pursuit for this path segment
        this.wallFollowErrorTime = 0;     // seconds since the lateral error last converged
        this.timeSinceWall = Infinity;    // seconds since the right wall was last detected
        this.prevWallError = null;        // previous lateral error (derivative term)
        this.lastSideRay = null;          // debug overlay: last side-sensor ray segment
        this.updateVectors();
    }

    setPath(newPath) {
        this.path = newPath;
        // New route segment: re-arm the wall-follow safety fallback
        this.wallFollowFallback = false;
        this.wallFollowErrorTime = 0;
        this.timeSinceWall = Infinity;
        this.prevWallError = null;
        this.lastSideRay = null;
    }

    /**
     * Advance the simulation by `dt` seconds along the current path.
     * All rates in CONFIG.ROBOT are per-second, so movement is frame-rate independent.
     * With steeringMode === WALL_FOLLOW (CLEAN_EDGE) and a sensor system available,
     * local steering is modulated by the right-side wall distance; the A* path
     * remains the high-level route.
     */
    update(state, currentTask, onCompleteCallback, dt, steeringMode = STEERING_MODE.PURSUIT, sensors = null) {
        if (this.path.length === 0) {
            // Stop brush when no path (idle or docked)
            this.brushSpinning = false;
            this.wallFollowEngaged = false;
            this.lastSideRay = null;
            return;
        }

        const target = this.path[0];
        const dx = target.x - this.x; const dy = target.y - this.y;
        const distance = Math.hypot(dx, dy);

        // Determine if we are in reverse-parking mode
        let isReversing = false;
        if (currentTask === 'RETURN' && this.path.length === 1 && Math.floor(target.x) === CONFIG.ROBOT.BASE_X && Math.floor(target.y) === CONFIG.ROBOT.BASE_Y) {
            isReversing = true;
        }

        // Brush spins when moving out of base (any non-IDLE task) and not reversing
        // Brush stops during reverse-parking and when at base/idle
        this.brushSpinning = currentTask !== 'IDLE' && !isReversing && !this.isAtBase();

        const stepDistance = CONFIG.ROBOT.SPEED * dt;
        const wallFollowAllowed = steeringMode === STEERING_MODE.WALL_FOLLOW && sensors && !isReversing && !this.wallFollowFallback;
        if (distance < stepDistance) {
            this.x = target.x; this.y = target.y;
            this.path.shift();
            if (this.path.length === 0) {onCompleteCallback();}
        } else if (wallFollowAllowed && !this.isNearBase() && this.path.length > 1 && distance < CONFIG.ROBOT.WALL_FOLLOW.WAYPOINT_RADIUS) {
            // Wall-following keeps a lateral offset from the exact waypoint line:
            // accept INTERMEDIATE waypoints without snapping the robot onto them.
            // The final waypoint always requires exact arrival — the robot must
            // physically step on the last tile or its dirt is never cleaned.
            // No early acceptance near the dock either: the base exit maneuver
            // must complete (drive fully out front) before turning
            this.path.shift();
            if (this.path.length === 0) {onCompleteCallback();}
        } else {
            this.wallFollowEngaged = false;
            if (wallFollowAllowed) {
                this.wallFollowEngaged = this.wallFollow(state, sensors, dx, dy, dt);
            }
            if (!this.wallFollowEngaged) {
                this.lastSideRay = null;
                this.rotateAndMove(dx, dy, isReversing, dt);
            }
        }

        // Update brush rotation when spinning (counter-clockwise for dust collection)
        if (this.brushSpinning) {
            this.brushAngle -= CONFIG.ROBOT.BRUSH_SPIN_SPEED * dt;
        }

        this.updateVectors();
        state.cleanDirtAt(this.x, this.y);
    }

    rotateAndMove(dx, dy, isReversing, dt) {
        let targetAngle = Math.atan2(dy, dx);
        // Reverse rotation
        if (isReversing) {targetAngle = Math.atan2(-dy, -dx);} // Invert target angle

        let diff = targetAngle - this.angle;
        while (diff < -Math.PI) {diff += Math.PI * 2;}
        while (diff > Math.PI) {diff -= Math.PI * 2;}

        if (Math.abs(diff) > 0.08) {
            this.angle += Math.sign(diff) * CONFIG.ROBOT.TURN_SPEED * dt; // Smooth rotation
        } else {
            this.angle = targetAngle;
            const driveSpeed = (isReversing ? -CONFIG.ROBOT.SPEED : CONFIG.ROBOT.SPEED) * dt; // Reverse thrust
            this.x += Math.cos(this.angle) * driveSpeed;
            this.y += Math.sin(this.angle) * driveSpeed;
        }
    }

    /**
     * Wall-follow controller (simulated right-side IR wall sensor).
     * The lateral wall error becomes a clamped heading OFFSET on top of the
     * route direction: the robot keeps progressing toward the current waypoint
     * while converging to a constant wall offset. Waypoint arrival is still
     * handled by update(). Every move is collision-clamped — the robot body
     * can never enter a wall or obstacle tile.
     * Returns true when the controller steered this tick, false when no wall
     * is nearby and the caller should use plain waypoint pursuit instead.
     */
    wallFollow(state, sensors, dx, dy, dt) {
        const cfg = CONFIG.ROBOT.WALL_FOLLOW;
        const pose = { x: this.x, y: this.y, angle: this.angle };
        // Right side is +90° in this screen-space frame (y grows downward),
        // same convention as the brush placement in Renderer2D
        const sideDist = sensors.measureSideDistance(state, pose, Math.PI / 2, cfg.RANGE);
        const frontDist = sensors.measureSideDistance(state, pose, 0, cfg.RANGE);

        this.lastSideRay = {
            x1: this.x, y1: this.y,
            x2: this.x + Math.cos(this.angle + Math.PI / 2) * sideDist,
            y2: this.y + Math.sin(this.angle + Math.PI / 2) * sideDist
        };

        if (sideDist < cfg.RANGE) {this.timeSinceWall = 0;}

        // Relative route direction: positive = the route turns right
        let routeDiff = Math.atan2(dy, dx) - this.angle;
        while (routeDiff < -Math.PI) {routeDiff += Math.PI * 2;}
        while (routeDiff > Math.PI) {routeDiff -= Math.PI * 2;}

        // Concave corner: wall dead ahead — turn left in place, but ONLY when
        // the route itself turns left (genuine interior corner). When the route
        // goes straight or right, the front wall is a protrusion the route
        // rounds on its own: the planned route has priority over the sensor
        if (frontDist < cfg.FRONT_RANGE && routeDiff < -0.1) {
            this.prevWallError = null;
            this.angle -= CONFIG.ROBOT.TURN_SPEED * dt;
            this.trackWallFollowConvergence(false, dt);
            return true;
        }

        // Straight wall: PD-controlled lateral error as a heading offset over
        // the route direction — converges to a constant wall offset without
        // oscillating and without losing progress along the A* route
        if (sideDist < cfg.RANGE) {
            const error = sideDist - cfg.TARGET_DISTANCE;
            const rawRate = this.prevWallError === null ? 0 : (error - this.prevWallError) / dt;
            const errorRate = Math.max(-cfg.MAX_ERROR_RATE, Math.min(cfg.MAX_ERROR_RATE, rawRate));
            this.prevWallError = error;
            const offset = Math.max(-cfg.MAX_CORRECTION,
                Math.min(cfg.MAX_CORRECTION, cfg.GAIN * error + cfg.DERIVATIVE_GAIN * errorRate));
            const desiredAngle = Math.atan2(dy, dx) + offset;
            let diff = desiredAngle - this.angle;
            while (diff < -Math.PI) {diff += Math.PI * 2;}
            while (diff > Math.PI) {diff -= Math.PI * 2;}
            if (Math.abs(diff) > 0.08) {
                this.angle += Math.sign(diff) * CONFIG.ROBOT.TURN_SPEED * dt;
            } else {
                this.angle = desiredAngle;
            }
            const moved = this.moveForward(state, CONFIG.ROBOT.SPEED * dt);
            this.trackWallFollowConvergence(moved && Math.abs(error) <= cfg.CONVERGENCE_TOLERANCE, dt);
            return true;
        }

        // Convex corner: the right wall was just lost (distance jumped past
        // range) — curve right at reduced speed to wrap around the corner,
        // but ONLY when the route itself turns right. When the route goes
        // straight, the gap in the wall is a doorway/corridor: the planned
        // route has priority over the missing wall
        if (this.timeSinceWall < cfg.LOST_WALL_GRACE && routeDiff > 0.1) {
            this.timeSinceWall += dt;
            this.prevWallError = null;
            this.angle += CONFIG.ROBOT.TURN_SPEED * dt;
            this.moveForward(state, CONFIG.ROBOT.SPEED * 0.5 * dt);
            this.trackWallFollowConvergence(false, dt);
            return true;
        }

        // No wall nearby (open transit): leave steering to waypoint pursuit
        this.prevWallError = null;
        return false;
    }

    // Safety fallback: if the lateral error stays out of tolerance for
    // FALLBACK_TIMEOUT seconds (oscillation in tight geometry), revert to
    // plain waypoint pursuit until the next path segment is assigned
    trackWallFollowConvergence(converged, dt) {
        if (this.wallFollowFallback) {return;}
        this.wallFollowErrorTime = converged ? 0 : this.wallFollowErrorTime + dt;
        if (this.wallFollowErrorTime >= CONFIG.ROBOT.WALL_FOLLOW.FALLBACK_TIMEOUT) {
            this.wallFollowFallback = true;
        }
    }

    // Advance along the current heading, refusing to enter a wall or obstacle
    // tile — the robot body cannot pass through physical geometry.
    // Returns false when the move was blocked.
    moveForward(state, dist) {
        const nx = this.x + Math.cos(this.angle) * dist;
        const ny = this.y + Math.sin(this.angle) * dist;
        const gx = Math.floor(nx); const gy = Math.floor(ny);
        if (!state.isValidPosition(gx, gy)) {return false;}
        // The robot body can physically occupy the dock tile (it starts/docks there)
        const blocked = state.actualObjects.some(o =>
            o.type.isObstacle && o.type !== CONFIG.OBJECT_TYPES.BASE && Math.floor(o.x) === gx && Math.floor(o.y) === gy);
        if (blocked) {return false;}
        this.x = nx; this.y = ny;
        return true;
    }

    updateVectors() {
        // Core Raycasting vectors
        this.dirX = Math.cos(this.angle); this.dirY = Math.sin(this.angle);
        this.planeX = -Math.sin(this.angle) * CONFIG.ROBOT.FOV;
        this.planeY = Math.cos(this.angle) * CONFIG.ROBOT.FOV;
    }

    isAtBase() {
        return Math.floor(this.x) === CONFIG.ROBOT.BASE_X && Math.floor(this.y) === CONFIG.ROBOT.BASE_Y;
    }

    // True while the robot is still inside the dock clearance zone:
    // waypoints in this area always require exact arrival so the base
    // exit/entry maneuvers complete naturally
    isNearBase() {
        return Math.hypot(this.x - (CONFIG.ROBOT.BASE_X + 0.5), this.y - (CONFIG.ROBOT.BASE_Y + 0.5)) < CONFIG.ROBOT.DOCK_CLEARANCE;
    }

    /**
     * Debug snapshot of the wall-follow side-sensor ray for the 2D overlay
     * (same pattern as getBrushConfig()). Null when wall-follow is inactive.
     */
    getWallFollowDebugInfo() {
        return this.lastSideRay;
    }

    /**
     * Get brush visualization parameters for 2D rendering.
     * Returns an object with brush position, angle, stick count, and whether it's spinning (for opacity effect).
     */
    getBrushConfig() {
        return {
            x: this.x,
            y: this.y,
            angle: this.brushAngle,
            stickCount: CONFIG.ROBOT.BRUSH_STICK_COUNT,
            spinning: this.brushSpinning
        };
    }
}
