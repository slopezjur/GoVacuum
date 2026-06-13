/**
 * @class Renderer2D
 */
class Renderer2D {
    constructor(canvasId, inputCallback) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.gridWidth = CONFIG.MAP_DATA[0].length;
        this.gridHeight = CONFIG.MAP_DATA.length;
        this.setupInputs(inputCallback);
    }

    setupInputs(callback) {
        // Single click toggle
        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();

            // Handle CSS object-fit scaling and letterboxing
            const scale = Math.min(rect.width / this.canvas.width, rect.height / this.canvas.height);
            const renderedWidth = this.canvas.width * scale;
            const renderedHeight = this.canvas.height * scale;
            const offsetX = (rect.width - renderedWidth) / 2;
            const offsetY = (rect.height - renderedHeight) / 2;

            // Mouse relative to rendered area
            const mouseX = e.clientX - rect.left - offsetX;
            const mouseY = e.clientY - rect.top - offsetY;

            // Ignore clicks on letterbox bars
            if (mouseX < 0 || mouseX >= renderedWidth || mouseY < 0 || mouseY >= renderedHeight) return;

            // Exact tile size
            const tileW = renderedWidth / this.gridWidth;
            const tileH = renderedHeight / this.gridHeight;
            const gridX = Math.floor(mouseX / tileW);
            const gridY = Math.floor(mouseY / tileH);

            callback(gridX, gridY);
        });
    }

    render(state, robot) {
        // Internal drawing tile size
        this.tileSize = this.canvas.width / this.gridWidth;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawFloorsAndDirt(state);
        this.drawRoomLabels(state);
        this.drawBase();
        this.drawWalls(state);
        this.drawPath(robot.path, robot.x, robot.y);
        this.drawObjects(state.actualObjects, state.knownObjects);
        this.drawRobot(robot);
    }

    drawFloorsAndDirt(state) {
        for (let y = 0; y < state.height; y++) {
            for (let x = 0; x < state.width; x++) {
                if (state.map[y][x] === 0) {
                    let room = state.rooms.find(r => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2);
                    this.ctx.fillStyle = room ? room.color : CONFIG.COLORS.CEILING;
                    this.ctx.fillRect(x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);

                    if (state.dirtMap[y][x] === 1) {
                        this.ctx.fillStyle = CONFIG.COLORS.DIRT;
                        for (let i = 0; i < 4; i++) {
                            let dx = (i % 2 * this.tileSize * 0.4) + (this.tileSize * 0.2);
                            let dy = (Math.floor(i / 2) * this.tileSize * 0.4) + (this.tileSize * 0.2);
                            this.ctx.fillRect(x * this.tileSize + dx, y * this.tileSize + dy, 4, 4);
                        }
                    }
                }
            }
        }
    }

    drawRoomLabels(state) {
        this.ctx.fillStyle = 'rgba(255,255,255,0.6)';
        this.ctx.font = "bold 24px Inter";
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        state.rooms.forEach(r => {
            const centerX = ((r.x1 + r.x2 + 1) / 2) * this.tileSize;
            const centerY = ((r.y1 + r.y2 + 1) / 2) * this.tileSize;
            this.ctx.fillText(r.name, centerX, centerY);
        });
    }

    drawBase() {
        const bx = CONFIG.ROBOT.BASE_X * this.tileSize; const by = CONFIG.ROBOT.BASE_Y * this.tileSize;
        this.ctx.fillStyle = '#065f46'; this.ctx.fillRect(bx, by, this.tileSize, this.tileSize);
        this.ctx.fillStyle = '#34d399';
        // Draw green dock connector (facing EAST)
        this.ctx.fillRect(bx + this.tileSize * 0.6, by + this.tileSize * 0.2, this.tileSize * 0.4, this.tileSize * 0.6);
    }

    drawWalls(state) {
        this.ctx.fillStyle = CONFIG.COLORS.WALL_LIGHT;
        for (let y = 0; y < state.height; y++) {
            for (let x = 0; x < state.width; x++) {
                if (state.map[y][x] === 1) this.ctx.fillRect(x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);
            }
        }
    }

    drawPath(path, rx, ry) {
        if (path.length === 0) return;
        this.ctx.strokeStyle = CONFIG.COLORS.PATH; this.ctx.lineWidth = 4;
        this.ctx.beginPath(); this.ctx.moveTo(rx * this.tileSize, ry * this.tileSize);
        path.forEach(p => this.ctx.lineTo(p.x * this.tileSize, p.y * this.tileSize));
        this.ctx.stroke();
    }

    // Draw unknown objects with lower opacity
    drawObjects(actualObjects, knownObjects) {
        this.ctx.font = `${Math.floor(this.tileSize * 0.6)}px sans-serif`;
        this.ctx.textAlign = "center"; this.ctx.textBaseline = "middle";
        actualObjects.forEach(o => {
            if (o.type !== CONFIG.OBJECT_TYPES.BASE) {
                // Ghost render for objects the robot hasn't detected yet
                this.ctx.globalAlpha = knownObjects.includes(o) ? 1.0 : 0.4;
                this.ctx.fillText(o.type.emoji, o.x * this.tileSize, o.y * this.tileSize);
                this.ctx.globalAlpha = 1.0;
            }
        });
    }

    drawRobot(robot) {
        const cx = robot.x * this.tileSize; const cy = robot.y * this.tileSize;
        this.ctx.fillStyle = CONFIG.COLORS.ROBOT;
        this.ctx.beginPath(); this.ctx.arc(cx, cy, this.tileSize / 3, 0, Math.PI * 2); this.ctx.fill();
        this.ctx.strokeStyle = '#fff'; this.ctx.lineWidth = 2;
        this.ctx.beginPath(); this.ctx.moveTo(cx, cy);
        this.ctx.lineTo((robot.x + robot.dirX * 0.8) * this.tileSize, (robot.y + robot.dirY * 0.8) * this.tileSize);
        this.ctx.stroke();
    }
}

