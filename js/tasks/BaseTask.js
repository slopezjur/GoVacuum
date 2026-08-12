export class BaseTask {
    constructor(engine, room = null) {
        this.engine = engine;
        this.room = room;
        this.type = 'BASE';
    }

    replan() {
        throw new Error('replan() must be implemented by subclass');
    }

    update(dt) {
        throw new Error('update() must be implemented by subclass');
    }
}
