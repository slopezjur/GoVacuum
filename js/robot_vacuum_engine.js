import { CONFIG } from './robot_vacuum_config.js';
import { GameState } from './robot_vacuum_game_state.js';
import { NavigationSystem } from './robot_vacuum_navigation.js';
import { SensorSystem } from './robot_vacuum_sensors.js';
import { VacuumRobot, STEERING_MODE } from './robot_vacuum_robot.js';
import { Renderer2D } from './robot_vacuum_renderer_2d.js';
import { Renderer3D } from './robot_vacuum_renderer_3d.js';

// User-facing status messages, centralized for maintainability (and future i18n)
const STATUS = {
    INIT: 'System Initialized.',
    MAP_RESET: 'Status: Map reset to default values.',
    PERIMETER_MAPPING: 'Status: Room perimeter mapped. Cleaning interior...',
    PERIMETER_CLEANED: 'Status: Room perimeter cleaned. Cleaning interior...',
    IDLE_AT_BASE: 'Status: Idle at Base. Memory cleared.',
    RETURN_COMPLETED: 'Status: Return sequence completed.',
    RETURN_BLOCKED: 'Status: Path to base blocked. Attempting local recovery.',
    ABORT_RETURN: 'Status: Aborting. Returning to base.',
    TRACING_PERIMETER: (room) => `Status: Tracing perimeter of ${room.name}...`,
    ALREADY_CLEAN: (room) => `Status: Room ${room.name} was already clean. Returning.`,
    COMPLETELY_CLEAN: (room) => `Status: Room ${room.name} completely cleaned. Returning.`,
    ROOM_BLOCKED: (room) => `Status: Room ${room.name} blocked. Returning.`,
    PARTIALLY_CLEAN: (room) => `Status: Room ${room.name} partially cleaned. Returning.`,
    ALMOST_CLEAN: (room) => `Status: Room ${room.name} almost completely cleaned. Returning.`
};

// Cap delta time so a backgrounded tab doesn't teleport the robot on resume
const MAX_FRAME_DT = 0.1;

/**
 * @class GameEngine
 */
export class GameEngine {
    constructor() {
        this.state = new GameState();
        this.robot = new VacuumRobot();
        this.sensors = new SensorSystem();
        this.renderer2D = new Renderer2D('mapCanvas', (x, y) => this.handleMapToggle(x, y));
        this.renderer3D = new Renderer3D('camCanvas');
        this.uiStatus = document.getElementById('statusText');
        this.stuckModal = document.getElementById('stuckModal');

        // Current task state: IDLE, CLEAN_EDGE, CLEAN_INNER, RETURN
        this.currentTask = { type: 'IDLE', room: null };

        this.isPaused = false;
        this.lastFrameTime = null;
        this.focusBeforeModal = null;
    }

    start() {
        this.lastFrameTime = performance.now();
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    resetGame() {
        this.state = new GameState();
        this.emergencyReset();
        this.updateStatus(STATUS.MAP_RESET);
    }

    emergencyReset() {
        this.robot = new VacuumRobot();
        this.currentTask = { type: 'IDLE', room: null };
        this.hideStuckModal();
    }

    toggleDebug() {
        this.isPaused = !this.isPaused;
        const debugBtn = document.getElementById('debugBtn');
        const camContainer = document.getElementById('camContainer');
        const debugPanel = document.getElementById('debugPanel');
        const debugOutput = document.getElementById('debugOutput');

        if (this.isPaused) {
            if (debugBtn) debugBtn.innerText = 'Resume';
            if (camContainer) camContainer.classList.add('debug-active');
            if (debugPanel) debugPanel.style.display = 'flex';
            
            if (debugOutput) {
                const dump = {
                    task: this.currentTask,
                    robot: {
                        x: this.robot.x,
                        y: this.robot.y,
                        angle: this.robot.angle,
                        path: this.robot.path
                    },
                    knownObjects: this.state.knownObjects
                };
                debugOutput.value = JSON.stringify(dump, null, 2);
            }
        } else {
            if (debugBtn) debugBtn.innerText = 'Stop/Debug';
            if (camContainer) camContainer.classList.remove('debug-active');
            if (debugPanel) debugPanel.style.display = 'none';
            this.lastFrameTime = performance.now();
        }
    }

    handleMapToggle(x, y) {
        const changed = this.state.toggleObstacleAt(x, y);
        if (changed) {
            // Re-check via the sensor system: a dt of 0 casts no new LiDAR rays,
            // so only the bumper can register a just-placed obstacle
            this.sensors.scan(this.robot, this.state, this.robot.path, 0);
            
            // Unconditionally replan if the map changed and we are active, 
            // so the robot immediately takes advantage of newly unblocked optimal routes.
            if (this.currentTask.type !== 'IDLE') {
                this.replanRoute();
            }
        }
    }

    replanRoute() {
        if (this.currentTask.type === 'CLEAN_EDGE') {
            // Phase 1: Perimeter Sweep — keep the edgeStartIndex locked for the whole
            // mission. Recomputing it on every replan would restart the sweep from the
            // geometrically closest edge tile, which after an obstacle detour is usually
            // a tile BEHIND the robot, making it sweep the perimeter backwards (from the
            // left side). The sweep generator itself resumes at the first still-dirty
            // edge tile in counter-clockwise (right-wall) order.
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
                this.updateStatus(STATUS.PERIMETER_MAPPING);
                this.replanRoute();
                return;
            }
            this.robot.setPath(sweepPath);

        } else if (this.currentTask.type === 'CLEAN_INNER') {
            // Phase 2: Interior Sweep (S-Pattern Infill)
            const sweepPath = NavigationSystem.generateRoomSweepPath(this.state, this.currentTask.room, this.robot.x, this.robot.y, false);

            if (sweepPath.length === 0) {
                this.handlePhaseCompletion('CLEAN_INNER');
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
                // No route home: the robot is genuinely stuck behind obstacles
                this.updateStatus(STATUS.RETURN_BLOCKED);
                this.robot.setPath([]);
                this.showStuckModal();
            } else {
                this.hideStuckModal();
                this.robot.setPath(returnPath);
            }
        }
    }

    gameLoop(now) {
        // Frame-rate independent step; clamped against tab-switch spikes
        const dt = Math.min((now - this.lastFrameTime) / 1000, MAX_FRAME_DT);
        this.lastFrameTime = now;

        if (this.isPaused) {
            requestAnimationFrame((t) => this.gameLoop(t));
            return;
        }

        // Activate simulated sensors (rotating LiDAR + bumper)
        const pathBlocked = this.sensors.scan(this.robot, this.state, this.robot.path, dt);
        if (pathBlocked && this.currentTask.type !== 'IDLE') {
            this.replanRoute();
        }

        // Edge cleaning steers by continuous right-side wall feedback (when the
        // feature is enabled); every other task uses plain waypoint pursuit
        const steeringMode = this.currentTask.type === 'CLEAN_EDGE' && CONFIG.ROBOT.WALL_FOLLOW.ENABLED
            ? STEERING_MODE.WALL_FOLLOW
            : STEERING_MODE.PURSUIT;
        this.robot.update(this.state, this.currentTask.type, () => this.onTaskComplete(), dt, steeringMode, this.sensors);
        this.renderer2D.render(this.state, this.robot, this.sensors);
        this.renderer3D.render(this.state, this.robot);
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    onTaskComplete() {
        if (this.currentTask.type === 'CLEAN_EDGE' || this.currentTask.type === 'CLEAN_INNER') {
            // Re-evaluate current phase, it will auto-transition if needed
            this.replanRoute();
        } else if (this.currentTask.type === 'RETURN') {
            if (this.robot.isAtBase()) {
                this.updateStatus(STATUS.IDLE_AT_BASE);
                this.currentTask = { type: 'IDLE', room: null };
                // Full reset only when safely docked
                this.state.clearMemory();
            } else {
                // Abort fallback
                this.updateStatus(STATUS.RETURN_COMPLETED);
            }
        }
    }

    updateStatus(msg) {
        this.uiStatus.innerText = msg;
    }

    showStuckModal() {
        if (!this.stuckModal || this.stuckModal.style.display === 'block') {return;}
        this.focusBeforeModal = document.activeElement;
        this.stuckModal.style.display = 'block';
        // Move focus into the dialog so keyboard/screen-reader users land on it
        const firstButton = this.stuckModal.querySelector('button');
        if (firstButton) {firstButton.focus();}
    }

    hideStuckModal() {
        if (!this.stuckModal || this.stuckModal.style.display !== 'block') {return;}
        this.stuckModal.style.display = 'none';
        // Restore focus to whatever the user was doing before the modal appeared
        if (this.focusBeforeModal && typeof this.focusBeforeModal.focus === 'function') {
            this.focusBeforeModal.focus();
        }
        this.focusBeforeModal = null;
    }

    handlePhaseCompletion(nextPhase) {
        const room = this.currentTask.room;
        if (!room) {return;}

        // If transitioning from CLEAN_EDGE to CLEAN_INNER naturally (edge done, interior remains),
        // just start the interior phase without showing a completion message yet.
        if (nextPhase === 'CLEAN_INNER' && this.currentTask.type === 'CLEAN_EDGE') {
            this.currentTask.type = 'CLEAN_INNER';
            this.updateStatus(STATUS.PERIMETER_CLEANED);
            this.replanRoute();
            return;
        }

        // Final status — only shown when returning to base (after both phases complete)
        const ratio = this.state.getCleanedRatioForCurrentTargetRoom();
        const cleaned = this.state.getTilesCleanedInCurrentTargetRoom();
        const originalDirty = this.state.roomOriginalDirtyCount || 0;

        if (originalDirty === 0) {
            // Room had no dirt to begin with
            this.updateStatus(STATUS.ALREADY_CLEAN(room));
        } else if (ratio >= 0.99) {
            // Fully cleaned all dirty tiles in the room
            this.updateStatus(STATUS.COMPLETELY_CLEAN(room));
        } else if (cleaned === 0) {
            // No tiles in target room were cleaned, but there was dirt — so transit path blocked
            this.updateStatus(STATUS.ROOM_BLOCKED(room));
        } else if (ratio < 0.5) {
            // Less than half of dirty tiles cleaned
            this.updateStatus(STATUS.PARTIALLY_CLEAN(room));
        } else {
            // More than half but not all
            this.updateStatus(STATUS.ALMOST_CLEAN(room));
        }

        // Reset target room so future counts don't leak
        this.state.currentTargetRoomId = null;
        this.currentTask = { type: 'RETURN', room: null };
        this.replanRoute();
    }

    commandCleanRoom(roomId) {
        const room = this.state.rooms.find(r => r.id === roomId);
        if (!room) {return;}

        // Clear memory on new task if starting from base
        if (this.currentTask.type === 'IDLE') {
            this.state.clearMemory();
        }

        // Reset cleaned count for this new task
        this.state.roomTilesCleanedCount = {};

        // Count how many tiles were dirty in the target room BEFORE we reset dirt
        let dirtyCount = 0;
        for (let y = room.y1; y <= room.y2; y++) {
            for (let x = room.x1; x <= room.x2; x++) {
                if (this.state.isValidPosition(x, y) && this.state.dirtMap[y][x] === 1) {
                    dirtyCount++;
                }
            }
        }
        this.state.roomOriginalDirtyCount = dirtyCount;

        // Now reset room dirt for the new cleaning task
        this.state.resetDirtForRoom(room);
        this.state.currentTargetRoomId = room.id;

        // Start with Edge Sweep Phase (lock counter-clockwise start index for the whole perimeter pass)
        this.currentTask = {
            type: 'CLEAN_EDGE',
            room: room,
            edgeStartIndex: NavigationSystem.resolveEdgeStartIndex(this.state, room, this.robot.x, this.robot.y)
        };
        this.replanRoute();
        if (this.currentTask.type === 'CLEAN_EDGE') {
            this.updateStatus(STATUS.TRACING_PERIMETER(room));
        }
    }

    commandReturnToBase() {
        this.currentTask = { type: 'RETURN', room: null };
        this.replanRoute();
        if (this.currentTask.type === 'RETURN') {
            this.updateStatus(STATUS.ABORT_RETURN);
        }
    }
}
