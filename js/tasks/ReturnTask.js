import { BaseTask } from './BaseTask.js';
import { NavigationSystem } from '../robot_vacuum_navigation.js';
import { STATUS } from '../robot_vacuum_engine.js';
import { CONFIG } from '../robot_vacuum_config.js';
import { STEERING_MODE } from '../robot_vacuum_robot.js';

export class ReturnTask extends BaseTask {
    constructor(engine) {
        super(engine, null);
        this.type = 'RETURN';
    }

    replan() {
        // Direct return path ignores dirt weights (ignoreDirtFlag = true)
        const returnPath = NavigationSystem.findPath(
            this.engine.state,
            Math.floor(this.engine.robot.x),
            Math.floor(this.engine.robot.y),
            CONFIG.ROBOT.BASE_FRONT_X,
            CONFIG.ROBOT.BASE_FRONT_Y,
            null,
            null,
            true
        );

        if (returnPath.length > 0 || (Math.floor(this.engine.robot.x) === CONFIG.ROBOT.BASE_FRONT_X && Math.floor(this.engine.robot.y) === CONFIG.ROBOT.BASE_FRONT_Y)) {
            returnPath.push({ x: CONFIG.ROBOT.BASE_X + 0.5, y: CONFIG.ROBOT.BASE_Y + 0.5 });
        }

        if (returnPath.length === 0) {
            // No route home: the robot is genuinely stuck behind obstacles
            this.engine.updateStatus(STATUS.RETURN_BLOCKED);
            this.engine.robot.setPath([]);
            this.engine.showStuckModal();
        } else {
            this.engine.hideStuckModal();
            this.engine.robot.setPath(returnPath);
        }
    }

    update(dt) {
        this.engine.robot.update(
            this.engine.state,
            this.type,
            () => this.onComplete(),
            dt,
            STEERING_MODE.PURSUIT,
            this.engine.sensors
        );
    }

    onComplete() {
        if (this.engine.robot.isAtBase()) {
            this.engine.updateStatus(STATUS.IDLE_AT_BASE);
            this.engine.transitionToTask('IDLE');
            // Full reset only when safely docked
            this.engine.state.clearMemory();
        } else {
            // Abort fallback
            this.engine.updateStatus(STATUS.RETURN_COMPLETED);
        }
    }
}
