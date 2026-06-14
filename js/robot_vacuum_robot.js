/**
 * @class VacuumRobot
 */
class VacuumRobot {
    constructor() {
        this.x = CONFIG.ROBOT.START_X;
        this.y = CONFIG.ROBOT.START_Y;
        this.angle = 0;
        this.path = [];
        // Brush state
        this.brushAngle = 0;
        this.brushSpinning = false;
        this.updateVectors();
    }

    setPath(newPath) {
        this.path = newPath;
    }

    update(state, currentTask, onCompleteCallback) {
        if (this.path.length === 0) {
            // Stop brush when no path (idle or docked)
            this.brushSpinning = false;
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

        if (distance < CONFIG.ROBOT.SPEED) {
            this.x = target.x; this.y = target.y;
            this.path.shift();
            if (this.path.length === 0) onCompleteCallback();
        } else {
            this.rotateAndMove(dx, dy, isReversing);
        }

        // Update brush rotation when spinning (counter-clockwise for dust collection)
        if (this.brushSpinning) {
            this.brushAngle -= CONFIG.ROBOT.BRUSH_SPIN_SPEED;
        }

        this.updateVectors();
        state.cleanDirtAt(this.x, this.y);
    }

    rotateAndMove(dx, dy, isReversing) {
        let targetAngle = Math.atan2(dy, dx);
        // Reverse rotation
        if (isReversing) targetAngle = Math.atan2(-dy, -dx); // Invert target angle

        let diff = targetAngle - this.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        if (Math.abs(diff) > 0.08) {
            this.angle += Math.sign(diff) * CONFIG.ROBOT.TURN_SPEED; // Smooth rotation
        } else {
            this.angle = targetAngle;
            let driveSpeed = isReversing ? -CONFIG.ROBOT.SPEED : CONFIG.ROBOT.SPEED; // Reverse thrust
            this.x += Math.cos(this.angle) * driveSpeed;
            this.y += Math.sin(this.angle) * driveSpeed;
        }
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

