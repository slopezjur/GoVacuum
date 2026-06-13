/**
 * @class GameEngine
 */
class GameEngine {
    constructor() {
        this.state = new GameState();
        this.robot = new VacuumRobot();
        this.renderer2D = new Renderer2D('mapCanvas', (x, y) => this.handleMapToggle(x, y));
        this.renderer3D = new Renderer3D('camCanvas');
        this.uiStatus = document.getElementById('statusText');

        // Current task state: IDLE, CLEAN_EDGE, CLEAN_INNER, RETURN
        this.currentTask = { type: 'IDLE', room: null };
    }

    start() {
        this.gameLoop();
    }

    resetGame() {
        this.state = new GameState();
        this.emergencyReset();
        this.updateStatus("Status: Map reset to default values.");
    }

    emergencyReset() {
        this.robot = new VacuumRobot();
        this.currentTask = { type: 'IDLE', room: null };
    }

    handleMapToggle(x, y) {
        const changed = this.state.toggleObstacleAt(x, y);
        if (changed) {
            const triggerReplan = this.state.senseEnvironment(this.robot.x, this.robot.y, this.robot.path);
            if (triggerReplan && this.currentTask.type !== 'IDLE') this.replanRoute();
        }
    }

    replanRoute() {
        if (this.currentTask.type === 'CLEAN_EDGE') {
            // Phase 1: Perimeter Sweep — dynamically update edgeStartIndex so replans
            // always start searching from the robot's current perimeter position.
            this.currentTask.edgeStartIndex = NavigationSystem.resolveEdgeStartIndex(
                this.currentTask.room, this.robot.x, this.robot.y
            );

            const sweepPath = NavigationSystem.generateRoomSweepPath(
                this.state,
                this.currentTask.room,
                this.robot.x,
                this.robot.y,
                true,
                this.currentTask.edgeStartIndex
            );

            if (sweepPath.length === 0) {
                // No more reachable edge tiles — either all cleaned or all blocked.
                // Check if there are genuinely uncleaned edge tiles remaining;
                // if not, transition to interior phase.
                this.currentTask.type = 'CLEAN_INNER';
                this.updateStatus(`Status: Room perimeter mapped. Cleaning interior...`);
                this.replanRoute();
                return;
            }
            this.robot.setPath(sweepPath);

        } else if (this.currentTask.type === 'CLEAN_INNER') {
            // Phase 2: Interior Sweep (S-Pattern Infill)
            const sweepPath = NavigationSystem.generateRoomSweepPath(this.state, this.currentTask.room, this.robot.x, this.robot.y, false);

            if (sweepPath.length === 0) {
                this.updateStatus(`Status: Room ${this.currentTask.room.name} blocked. Returning.`);
                this.currentTask = { type: 'RETURN', room: null };
                this.replanRoute();
                return;
            }
            this.robot.setPath(sweepPath);

        } else if (this.currentTask.type === 'RETURN') {
            // Direct return path ignores dirt weights (ignoreDirtFlag = true)
            const returnPath = NavigationSystem.findPath(this.state, Math.floor(this.robot.x), Math.floor(this.robot.y), CONFIG.ROBOT.BASE_FRONT_X, CONFIG.ROBOT.BASE_FRONT_Y, null, null, true);

            if (returnPath.length > 0 || (Math.floor(this.robot.x) === CONFIG.ROBOT.BASE_FRONT_X && Math.floor(this.robot.y) === CONFIG.ROBOT.BASE_FRONT_Y)) {
                returnPath.push({x: CONFIG.ROBOT.BASE_X + 0.5, y: CONFIG.ROBOT.BASE_Y + 0.5});
            }

            if (returnPath.length === 0) {
                this.updateStatus("Status: Path to base blocked. Attempting local recovery.");
                this.robot.setPath([]);
            } else {
                this.robot.setPath(returnPath);
            }
        }
    }

    gameLoop() {
        // Activate simulated LiDAR
        const pathBlocked = this.state.senseEnvironment(this.robot.x, this.robot.y, this.robot.path);
        if (pathBlocked && this.currentTask.type !== 'IDLE') {
            this.replanRoute();
        }

        this.robot.update(this.state, this.currentTask.type, () => this.onTaskComplete());
        this.renderer2D.render(this.state, this.robot);
        this.renderer3D.render(this.state, this.robot);
        requestAnimationFrame(() => this.gameLoop());
    }

    onTaskComplete() {
        if (this.currentTask.type === 'CLEAN_EDGE' || this.currentTask.type === 'CLEAN_INNER') {
            // Re-evaluate current phase, it will auto-transition if needed
            this.replanRoute();
        } else if (this.currentTask.type === 'RETURN') {
            if (this.robot.isAtBase()) {
                this.updateStatus("Status: Idle at Base. Memory cleared.");
                this.currentTask = { type: 'IDLE', room: null };
                // Full reset only when safely docked
                this.state.clearMemory();
            } else {
                // Abort fallback
                this.updateStatus("Status: Return sequence completed.");
            }
        }
    }

    updateStatus(msg) {
        this.uiStatus.innerText = msg;
    }

    commandCleanRoom(roomId) {
        const room = this.state.rooms.find(r => r.id === roomId);
        if (!room) return;

        // Clear memory on new task if starting from base
        if (this.currentTask.type === 'IDLE') {
            this.state.clearMemory();
        }

        // Reset room dirt
        this.state.resetDirtForRoom(room);

        // Start with Edge Sweep Phase (lock clockwise start index for the whole perimeter pass)
        this.currentTask = {
            type: 'CLEAN_EDGE',
            room: room,
            edgeStartIndex: NavigationSystem.resolveEdgeStartIndex(room, this.robot.x, this.robot.y)
        };
        this.replanRoute();
        if (this.currentTask.type === 'CLEAN_EDGE') {
            this.updateStatus(`Status: Tracing perimeter of ${room.name}...`);
        }
    }

    commandReturnToBase() {
        this.currentTask = { type: 'RETURN', room: null };
        this.replanRoute();
        this.updateStatus("Status: Aborting. Returning to base.");
    }
}