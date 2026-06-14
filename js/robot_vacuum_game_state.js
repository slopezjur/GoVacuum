/**
 * @class GameState
 */
class GameState {
    constructor() {
        this.map = CONFIG.MAP_DATA;
        this.width = this.map[0].length;
        this.height = this.map.length;
        this.rooms = CONFIG.ROOMS;

        this.actualObjects = this.generateInitialObjects();

        // ROBOT MEMORY: Objects and Dirt map
        this.knownObjects = [ this.actualObjects.find(o => o.type === CONFIG.OBJECT_TYPES.BASE) ];
        this.dirtMap = this.initializeDirtMap();

        // Track tiles cleaned per target room for accurate status messages
        this.roomTilesCleanedCount = {};
        this.currentTargetRoomId = null;
    }

    initializeDirtMap() {
        return Array.from({ length: this.height }, () => Array(this.width).fill(1));
    }

    resetDirtForRoom(room) {
        for (let y = room.y1; y <= room.y2; y++) {
            for (let x = room.x1; x <= room.x2; x++) {
                if (this.isValidPosition(x, y)) {
                    this.dirtMap[y][x] = 1;
                }
            }
        }
    }

    resetDirtForAllRooms() {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (this.isValidPosition(x, y)) {
                    this.dirtMap[y][x] = 1;
                }
            }
        }
    }

    generateInitialObjects() {
        const objects = [{ x: 1.5, y: 1.5, type: CONFIG.OBJECT_TYPES.BASE }];
        const obstacleTypes = [CONFIG.OBJECT_TYPES.TEDDY, CONFIG.OBJECT_TYPES.BALL, CONFIG.OBJECT_TYPES.SOCK];

        this.rooms.forEach(room => {
            let placed = 0, attempts = 0;
            while(placed < 4 && attempts < 50) {
                // Prevent placing objects blocking doorways/corridors
                let safeX1 = room.x1 + 1; let safeX2 = room.x2 - 1;
                let safeY1 = room.y1 + 1; let safeY2 = room.y2 - 1;

                let ox = Math.floor(safeX1 + Math.random() * (safeX2 - safeX1 + 1));
                let oy = Math.floor(safeY1 + Math.random() * (safeY2 - safeY1 + 1));

                if (this.canPlaceObjectAt(ox, oy, objects)) {
                    const randomType = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
                    objects.push({ x: ox + 0.5, y: oy + 0.5, type: randomType });
                    placed++;
                }
                attempts++;
            }
        });
        return objects;
    }

    canPlaceObjectAt(gridX, gridY, objectsArray) {
        let distToBase = Math.hypot((gridX + 0.5) - CONFIG.ROBOT.START_X, (gridY + 0.5) - CONFIG.ROBOT.START_Y);
        let isOccupied = objectsArray.some(o => Math.floor(o.x) === gridX && Math.floor(o.y) === gridY);
        let isBaseBlock = (gridX === CONFIG.ROBOT.BASE_X && gridY === CONFIG.ROBOT.BASE_Y) ||
                          (gridX === CONFIG.ROBOT.BASE_FRONT_X && gridY === CONFIG.ROBOT.BASE_FRONT_Y);

        return this.isValidPosition(gridX, gridY) && !isOccupied && distToBase >= 3 && !isBaseBlock;
    }

    toggleObstacleAt(gridX, gridY) {
        // Prevent placing objects on base or walls
        if (!this.isValidPosition(gridX, gridY) ||
            (gridX === CONFIG.ROBOT.BASE_X && gridY === CONFIG.ROBOT.BASE_Y) ||
            (gridX === CONFIG.ROBOT.BASE_FRONT_X && gridY === CONFIG.ROBOT.BASE_FRONT_Y)) {
            return false;
        }

        const existingIndex = this.actualObjects.findIndex(o => Math.floor(o.x) === gridX && Math.floor(o.y) === gridY);

        if (existingIndex !== -1) {
            // Remove object
            let removedObj = this.actualObjects.splice(existingIndex, 1)[0];
            this.knownObjects = this.knownObjects.filter(o => o !== removedObj);
            return true;
        } else {
            // Add random object
            const obstacleTypes = [CONFIG.OBJECT_TYPES.TEDDY, CONFIG.OBJECT_TYPES.BALL, CONFIG.OBJECT_TYPES.SOCK, CONFIG.OBJECT_TYPES.BOX];
            const randomType = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
            this.actualObjects.push({ x: gridX + 0.5, y: gridY + 0.5, type: randomType });
            return true;
        }
    }

    // Simulate LiDAR / Camera sensors
    senseEnvironment(robotX, robotY, currentPath) {
        let newlyDiscovered = [];
        let gridRx = Math.floor(robotX); let gridRy = Math.floor(robotY);

        this.actualObjects.forEach(obj => {
            if (!this.knownObjects.includes(obj)) {
                let gridOx = Math.floor(obj.x); let gridOy = Math.floor(obj.y);

                // Chebyshev distance: accurate grid-based 360 view
                if (Math.abs(gridOx - gridRx) <= CONFIG.ROBOT.SENSOR_GRID_RANGE &&
                    Math.abs(gridOy - gridRy) <= CONFIG.ROBOT.SENSOR_GRID_RANGE) {
                    this.knownObjects.push(obj);
                    newlyDiscovered.push(obj);
                }
            }
        });

        // Trigger replan only if a new object directly obstructs the planned path
        if (newlyDiscovered.length > 0 && currentPath.length > 0) {
            for (let newObj of newlyDiscovered) {
                for (let p of currentPath) {
                    if (Math.floor(p.x) === Math.floor(newObj.x) && Math.floor(p.y) === Math.floor(newObj.y)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    clearMemory() {
        // Format robot memory completely: clear obstacles and reset dirt map
        const baseObj = this.actualObjects.find(o => o.type === CONFIG.OBJECT_TYPES.BASE);
        this.knownObjects = baseObj ? [baseObj] : [];
        this.dirtMap = this.initializeDirtMap();
    }

    cleanDirtAt(x, y) {
        const gridX = Math.floor(x); const gridY = Math.floor(y);
        if(this.isValidPosition(gridX, gridY) && this.dirtMap[gridY][gridX] === 1) {
            this.dirtMap[gridY][gridX] = 0;

            // Only count tiles that belong to the current target room
            if (this.currentTargetRoomId !== null && this.currentTargetRoomId !== undefined) {
                const targetRoom = this.rooms.find(r => r.id === this.currentTargetRoomId);
                if (targetRoom && gridX >= targetRoom.x1 && gridX <= targetRoom.x2 && gridY >= targetRoom.y1 && gridY <= targetRoom.y2) {
                    if (!this.roomTilesCleanedCount[this.currentTargetRoomId]) {
                        this.roomTilesCleanedCount[this.currentTargetRoomId] = 0;
                    }
                    this.roomTilesCleanedCount[this.currentTargetRoomId]++;
                }
            }
            return true;
        }
        return false;
    }

    getTilesCleanedInCurrentTargetRoom() {
        if (this.currentTargetRoomId === null || this.currentTargetRoomId === undefined) return 0;
        return this.roomTilesCleanedCount[this.currentTargetRoomId] || 0;
    }

    getTotalTilesInRoom(roomId) {
        const room = this.rooms.find(r => r.id === roomId);
        if (!room) return 0;
        let count = 0;
        for (let y = room.y1; y <= room.y2; y++) {
            for (let x = room.x1; x <= room.x2; x++) {
                if (this.isValidPosition(x, y)) count++;
            }
        }
        return count;
    }

    getCleanedRatioForCurrentTargetRoom() {
        if (this.currentTargetRoomId === null || this.currentTargetRoomId === undefined) return 0;
        const total = this.getTotalTilesInRoom(this.currentTargetRoomId);
        if (total === 0) return 0;
        const cleaned = this.getTilesCleanedInCurrentTargetRoom();
        return cleaned / total;
    }

    isValidPosition(x, y) {
        return x >= 0 && x < this.width && y >= 0 && y < this.height && this.map[y][x] === 0;
    }

    hasKnownObstacleAt(x, y) {
        return this.knownObjects.some(o => Math.floor(o.x) === x && Math.floor(o.y) === y && o.type.isObstacle);
    }
}