import { CONFIG } from './robot_vacuum_config.js';
import { GameState } from './robot_vacuum_game_state.js';
import { NavigationSystem } from './robot_vacuum_navigation.js';
import { SensorSystem } from './robot_vacuum_sensors.js';
import { VacuumRobot, STEERING_MODE } from './robot_vacuum_robot.js';
import { Renderer2D } from './robot_vacuum_renderer_2d.js';
import { Renderer3D } from './robot_vacuum_renderer_3d.js';
import { IdleTask } from './tasks/IdleTask.js';
import { CleanEdgeTask } from './tasks/CleanEdgeTask.js';
import { CleanInnerTask } from './tasks/CleanInnerTask.js';
import { ReturnTask } from './tasks/ReturnTask.js';
// User-facing status messages, centralized for maintainability (and future i18n)
export const STATUS = {
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
    constructor(state, robot, sensors, renderer2D, renderer3D, uiCallbacks) {
        this.state = state;
        this.robot = robot;
        this.sensors = sensors;
        this.renderer2D = renderer2D;
        this.renderer3D = renderer3D;
        this.uiCallbacks = uiCallbacks;

        // Current task state: IDLE, CLEAN_EDGE, CLEAN_INNER, RETURN
        this.currentTask = new IdleTask(this);

        this.isPaused = false;
        this.lastFrameTime = null;
    }

    start() {
        this.lastFrameTime = performance.now();
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    resetGame() {
        this.state.reset();
        this.emergencyReset();
        this.updateStatus(STATUS.MAP_RESET);
    }

    emergencyReset() {
        this.robot.reset();
        this.transitionToTask('IDLE');
        this.hideStuckModal();
    }

    toggleDebug() {
        this.isPaused = !this.isPaused;
        
        const debugDump = {
            status: "Debug Dump",
            task: this.currentTask,
            robot: {
                x: this.robot.x,
                y: this.robot.y,
                angle: this.robot.angle,
                path: this.robot.path
            },
            knownObjects: this.state.knownObjects
        };

        if (this.uiCallbacks && this.uiCallbacks.onDebugToggle) {
            this.uiCallbacks.onDebugToggle(this.isPaused, debugDump);
        }

        if (!this.isPaused) {
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

    transitionToTask(type, room = null) {
        if (type === 'IDLE') this.currentTask = new IdleTask(this);
        else if (type === 'CLEAN_EDGE') this.currentTask = new CleanEdgeTask(this, room);
        else if (type === 'CLEAN_INNER') this.currentTask = new CleanInnerTask(this, room);
        else if (type === 'RETURN') this.currentTask = new ReturnTask(this);

        if (this.currentTask.type !== 'IDLE') {
            this.currentTask.replan();
        }
    }

    replanRoute() {
        if (this.currentTask.type !== 'IDLE') {
            this.currentTask.replan();
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

        this.currentTask.update(dt);
        this.renderer2D.render(this.state, this.robot, this.sensors);
        this.renderer3D.render(this.state, this.robot);
        requestAnimationFrame((t) => this.gameLoop(t));
    }



    updateStatus(msg) {
        if (this.uiCallbacks && this.uiCallbacks.onStatusUpdate) {
            this.uiCallbacks.onStatusUpdate(msg);
        }
    }

    showStuckModal() {
        if (this.uiCallbacks && this.uiCallbacks.onShowStuckModal) {
            this.uiCallbacks.onShowStuckModal();
        }
    }

    hideStuckModal() {
        if (this.uiCallbacks && this.uiCallbacks.onHideStuckModal) {
            this.uiCallbacks.onHideStuckModal();
        }
    }

    handlePhaseCompletion(nextPhase) {
        const room = this.currentTask.room;
        if (!room) {return;}

        // If transitioning from CLEAN_EDGE to CLEAN_INNER naturally (edge done, interior remains),
        // just start the interior phase without showing a completion message yet.
        if (nextPhase === 'CLEAN_INNER' && this.currentTask.type === 'CLEAN_EDGE') {
            this.updateStatus(STATUS.PERIMETER_CLEANED);
            this.transitionToTask('CLEAN_INNER', room);
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
        this.state.roomOriginalDirtyCount = 0;

        // Ensure we always return to base
        this.transitionToTask('RETURN');
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

        // Start with Edge Sweep Phase
        this.transitionToTask('CLEAN_EDGE', room);
        
        if (this.currentTask.type === 'CLEAN_EDGE') {
            this.updateStatus(STATUS.TRACING_PERIMETER(room));
        }
    }

    commandReturnToBase() {
        this.transitionToTask('RETURN');
        if (this.currentTask.type === 'RETURN') {
            this.updateStatus(STATUS.ABORT_RETURN);
        }
    }
}
