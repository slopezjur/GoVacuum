import { BaseTask } from './BaseTask.js';
import { NavigationSystem } from '../robot_vacuum_navigation.js';
import { STATUS } from '../robot_vacuum_engine.js';
import { STEERING_MODE } from '../robot_vacuum_robot.js';

export class CleanInnerTask extends BaseTask {
    constructor(engine, room) {
        super(engine, room);
        this.type = 'CLEAN_INNER';
    }

    replan() {
        const sweepPath = NavigationSystem.generateRoomSweepPath(
            this.engine.state,
            this.room,
            this.engine.robot.x,
            this.engine.robot.y,
            false
        );

        if (sweepPath.length === 0) {
            this.engine.handlePhaseCompletion('RETURN');
            return;
        }
        this.engine.robot.setPath(sweepPath);
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
        this.replan();
    }
}
