import { CONFIG } from './robot_vacuum_config.js';

/**
 * @class Renderer2D
 *
 * Overhead map renderer. Also owns the map's input handling:
 * mouse click toggles an obstacle on the hovered tile, and a keyboard
 * cursor (arrow keys + Enter/Space) provides an accessible equivalent.
 */
export class Renderer2D {
    constructor(canvasId, inputCallback) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {throw new Error(`Renderer2D: canvas #${canvasId} not found`);}
        this.ctx = this.canvas.getContext('2d');
        // Canvas backing resolution is single-sourced from CONFIG
        this.canvas.width = CONFIG.CANVAS.MAP_WIDTH;
        this.canvas.height = CONFIG.CANVAS.MAP_HEIGHT;
        this.gridWidth = CONFIG.MAP_DATA[0].length;
        this.gridHeight = CONFIG.MAP_DATA.length;
        // Keyboard cursor starts at the robot's base front tile
        this.cursor = { x: CONFIG.ROBOT.BASE_FRONT_X, y: CONFIG.ROBOT.BASE_FRONT_Y, visible: false };
        this.setupInputs(inputCallback);
    }

    setupInputs(callback) {
        // Single click toggle
        this.canvas.addEventListener('click', (e) => {
            const tile = this.eventToGrid(e);
            if (tile) {callback(tile.x, tile.y);}
        });

        // Keyboard equivalent: arrows move the cursor tile, Enter/Space toggles it
        this.canvas.addEventListener('keydown', (e) => {
            const moves = {
                ArrowUp: [0, -1], ArrowDown: [0, 1],
                ArrowLeft: [-1, 0], ArrowRight: [1, 0]
            };
            if (moves[e.key]) {
                e.preventDefault();
                const [dx, dy] = moves[e.key];
                this.cursor.x = Math.max(0, Math.min(this.gridWidth - 1, this.cursor.x + dx));
                this.cursor.y = Math.max(0, Math.min(this.gridHeight - 1, this.cursor.y + dy));
                this.cursor.visible = true;
            } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.cursor.visible = true;
                callback(this.cursor.x, this.cursor.y);
            }
        });

        // Hide the keyboard cursor when the pointer takes over
        this.canvas.addEventListener('pointerdown', () => { this.cursor.visible = false; });
        this.canvas.addEventListener('blur', () => { this.cursor.visible = false; });
    }

    // Convert a mouse event to grid coordinates, handling CSS object-fit
    // scaling and letterboxing. Returns null when the click lands on a letterbox bar.
    eventToGrid(e) {
        const rect = this.canvas.getBoundingClientRect();

        const scale = Math.min(rect.width / this.canvas.width, rect.height / this.canvas.height);
        const renderedWidth = this.canvas.width * scale;
        const renderedHeight = this.canvas.height * scale;
        const offsetX = (rect.width - renderedWidth) / 2;
        const offsetY = (rect.height - renderedHeight) / 2;

        // Mouse relative to rendered area
        const mouseX = e.clientX - rect.left - offsetX;
        const mouseY = e.clientY - rect.top - offsetY;

        // Ignore clicks on letterbox bars
        if (mouseX < 0 || mouseX >= renderedWidth || mouseY < 0 || mouseY >= renderedHeight) {return null;}

        // Exact tile size
        const tileW = renderedWidth / this.gridWidth;
        const tileH = renderedHeight / this.gridHeight;
        return {
            x: Math.floor(mouseX / tileW),
            y: Math.floor(mouseY / tileH)
        };
    }

    render(state, robot, sensors) {
        // Internal drawing tile size
        this.tileSize = this.canvas.width / this.gridWidth;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawFloorsAndDirt(state);
        this.drawRoomLabels(state);
        this.drawBase();
        this.drawWalls(state);
        this.drawPath(robot.path, robot.x, robot.y);
        this.drawObjects(state.actualObjects, state.knownObjects);
        this.drawSensors(sensors.getSensorDebugInfo());
        this.drawRobot(robot);
        this.drawKeyboardCursor();
    }

    // Rotating LiDAR ray fan + flashes where rays hit an object
    drawSensors(debugInfo) {
        debugInfo.rays.forEach(r => {
            this.ctx.strokeStyle = `rgba(6, 182, 212, ${0.35 * (r.ttl / CONFIG.SENSORS.RAY_TRAIL_TTL)})`;
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(r.x1 * this.tileSize, r.y1 * this.tileSize);
            this.ctx.lineTo(r.x2 * this.tileSize, r.y2 * this.tileSize);
            this.ctx.stroke();
        });

        debugInfo.hitFlashes.forEach(f => {
            const life = f.ttl / CONFIG.SENSORS.HIT_FLASH_TTL;
            this.ctx.strokeStyle = `rgba(249, 115, 22, ${0.9 * life})`;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(
                f.x * this.tileSize, f.y * this.tileSize,
                this.tileSize * 0.5 * (1.2 - life), 0, Math.PI * 2
            );
            this.ctx.stroke();
        });
    }

    drawFloorsAndDirt(state) {
        for (let y = 0; y < state.height; y++) {
            for (let x = 0; x < state.width; x++) {
                if (state.map[y][x] === 0) {
                    const room = state.rooms.find(r => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2);
                    this.ctx.fillStyle = room ? room.color : CONFIG.COLORS.CEILING;
                    this.ctx.fillRect(x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);

                    if (state.dirtMap[y][x] === 1) {
                        this.ctx.fillStyle = CONFIG.COLORS.DIRT;
                        for (let i = 0; i < 4; i++) {
                            const dx = (i % 2 * this.tileSize * 0.4) + (this.tileSize * 0.2);
                            const dy = (Math.floor(i / 2) * this.tileSize * 0.4) + (this.tileSize * 0.2);
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
                if (state.map[y][x] === 1) {this.ctx.fillRect(x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);}
            }
        }
    }

    drawPath(path, rx, ry) {
        if (path.length === 0) {return;}
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

        // Draw robot body circle
        this.ctx.fillStyle = CONFIG.COLORS.ROBOT;
        this.ctx.beginPath(); this.ctx.arc(cx, cy, this.tileSize / 3, 0, Math.PI * 2); this.ctx.fill();

        // Always draw the brush on the right side at 45 degrees from the robot's facing direction
        const brushConfig = robot.getBrushConfig();
        if (brushConfig) {
            // Offset position: right-front at +45 degrees from the robot's facing direction
            const offsetAngle = robot.angle + Math.PI / 4; // Right side plus 45 degrees
            const offsetDistance = this.tileSize * 0.325;
            const brushCx = cx + Math.cos(offsetAngle) * offsetDistance;
            const brushCy = cy + Math.sin(offsetAngle) * offsetDistance;
            const brushRadius = this.tileSize * 0.22;
            const pinLength = this.tileSize * 0.12;

            // Draw arm connecting robot to brush
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.moveTo(cx, cy);
            this.ctx.lineTo(brushCx, brushCy);
            this.ctx.stroke();

            // Semi-transparent white brush pins (spinning when active)
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            this.ctx.lineWidth = 2;

            for (let i = 0; i < brushConfig.stickCount; i++) {
                // Use brushConfig.angle when spinning (animated), otherwise use a static angle
                const pinAngle = brushConfig.spinning
                    ? brushConfig.angle + (i * Math.PI * 2) / brushConfig.stickCount
                    : -Math.PI / 4 + (i * Math.PI * 2) / brushConfig.stickCount;
                const innerR = brushRadius * 0.35;

                const startX = brushCx + Math.cos(pinAngle) * innerR;
                const startY = brushCy + Math.sin(pinAngle) * innerR;
                const endX = brushCx + Math.cos(pinAngle) * (innerR + pinLength);
                const endY = brushCy + Math.sin(pinAngle) * (innerR + pinLength);

                this.ctx.beginPath();
                this.ctx.moveTo(startX, startY);
                this.ctx.lineTo(endX, endY);
                this.ctx.stroke();
            }
        }
    }

    // Outline of the tile currently driven by the keyboard
    drawKeyboardCursor() {
        if (!this.cursor.visible) {return;}
        this.ctx.strokeStyle = 'rgba(6, 182, 212, 0.9)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(
            this.cursor.x * this.tileSize + 1,
            this.cursor.y * this.tileSize + 1,
            this.tileSize - 2,
            this.tileSize - 2
        );
    }
}
