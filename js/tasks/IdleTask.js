import { BaseTask } from './BaseTask.js';

export class IdleTask extends BaseTask {
    constructor(engine) {
        super(engine, null);
        this.type = 'IDLE';
    }

    replan() {
        // Idle task does not move the robot
        this.engine.robot.setPath([]);
    }

    update(dt) {
        // No-op
    }
}
