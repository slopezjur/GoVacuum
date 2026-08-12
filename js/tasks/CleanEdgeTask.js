import { BaseTask } from './BaseTask.js';
import { NavigationSystem } from '../robot_vacuum_navigation.js';
import { STATUS } from '../robot_vacuum_engine.js';
import { CONFIG } from '../robot_vacuum_config.js';
import { STEERING_MODE } from '../robot_vacuum_robot.js';

export class CleanEdgeTask extends BaseTask {
    constructor(engine, room) {
        super(engine, room);
        this.type = 'CLEAN_EDGE';
    }

    replan() {
        const sweepPath = NavigationSystem.generateRoomSweepPath(
            this.engine.state,
            this.room,
            this.engine.robot.x,
            this.engine.robot.y,
            true
        );

        if (sweepPath.length === 0) {
            // No more reachable edge tiles — either all cleaned or all blocked.
            // Transition to interior phase.
            this.engine.updateStatus(STATUS.PERIMETER_MAPPING);
            this.engine.transitionToTask('CLEAN_INNER', this.room);
            return;
        }
        this.engine.robot.setPath(sweepPath);
    }

    update(dt) {
        const steeringMode = CONFIG.ROBOT.WALL_FOLLOW.ENABLED
            ? STEERING_MODE.WALL_FOLLOW
            : STEERING_MODE.PURSUIT;

        this.engine.robot.update(
            this.engine.state,
            this.type,
            () => this.onComplete(),
            dt,
            steeringMode,
            this.engine.sensors
        );
    }

    onComplete() {
        this.replan();
    }
}
