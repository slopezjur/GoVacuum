/**
 * @class Renderer3D
 */
class Renderer3D {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.width = CONFIG.CANVAS.CAM_WIDTH; this.height = CONFIG.CANVAS.CAM_HEIGHT;
        this.zBuffer = new Array(this.width);
    }

    render(state, robot) {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.drawBackground();
        this.castRays(state, robot);
        // 3D Camera renders all physical objects (actualObjects)
        this.drawSprites(state.actualObjects, robot);
    }

    drawBackground() {
        this.ctx.fillStyle = CONFIG.COLORS.CEILING; this.ctx.fillRect(0, 0, this.width, this.height / 2);
        this.ctx.fillStyle = CONFIG.COLORS.FLOOR; this.ctx.fillRect(0, this.height / 2, this.width, this.height / 2);
    }

    castRays(state, robot) {
        for (let x = 0; x < this.width; x++) {
            let cameraX = 2 * x / this.width - 1;
            let rayDirX = robot.dirX + robot.planeX * cameraX; let rayDirY = robot.dirY + robot.planeY * cameraX;
            let mapX = Math.floor(robot.x); let mapY = Math.floor(robot.y);
            let sideDistX, sideDistY, deltaDistX = Math.abs(1 / rayDirX), deltaDistY = Math.abs(1 / rayDirY);
            let perpWallDist, stepX, stepY, hit = 0, side;

            if (rayDirX < 0) { stepX = -1; sideDistX = (robot.x - mapX) * deltaDistX; }
            else { stepX = 1; sideDistX = (mapX + 1.0 - robot.x) * deltaDistX; }
            if (rayDirY < 0) { stepY = -1; sideDistY = (robot.y - mapY) * deltaDistY; }
            else { stepY = 1; sideDistY = (mapY + 1.0 - robot.y) * deltaDistY; }

            while (hit === 0) {
                if (sideDistX < sideDistY) { sideDistX += deltaDistX; mapX += stepX; side = 0; }
                else { sideDistY += deltaDistY; mapY += stepY; side = 1; }
                if (mapX < 0 || mapY < 0 || mapX >= state.width || mapY >= state.height) break;
                if (state.map[mapY][mapX] > 0) hit = 1;
            }

            perpWallDist = (side === 0) ? (sideDistX - deltaDistX) : (sideDistY - deltaDistY);
            this.zBuffer[x] = perpWallDist;

            let lineHeight = Math.floor(this.height / perpWallDist);
            let drawStart = Math.max(0, -lineHeight / 2 + this.height / 2);
            let drawEnd = Math.min(this.height - 1, lineHeight / 2 + this.height / 2);

            let wallX = side === 0 ? robot.y + perpWallDist * rayDirY : robot.x + perpWallDist * rayDirX;
            wallX -= Math.floor(wallX); let texX = Math.floor(wallX * 64);
            let color = (texX % 16 < 8) ? CONFIG.COLORS.WALL_LIGHT : CONFIG.COLORS.WALL_DARK;
            if (side === 1) color = (texX % 16 < 8) ? CONFIG.COLORS.WALL_DARK : CONFIG.COLORS.CEILING;

            this.ctx.fillStyle = color; this.ctx.fillRect(x, drawStart, 1, drawEnd - drawStart);
        }
    }

    drawSprites(objectsToRender, robot) {
        let sortedObjects = [...objectsToRender].map(obj => ({
            ...obj, distance: Math.pow(robot.x - obj.x, 2) + Math.pow(robot.y - obj.y, 2)
        })).sort((a, b) => b.distance - a.distance);

        this.ctx.textAlign = "center"; this.ctx.textBaseline = "middle";

        sortedObjects.forEach(obj => {
            let spriteX = obj.x - robot.x; let spriteY = obj.y - robot.y;
            let invDet = 1.0 / (robot.planeX * robot.dirY - robot.dirX * robot.planeY);
            let transformX = invDet * (robot.dirY * spriteX - robot.dirX * spriteY);
            let transformY = invDet * (-robot.planeY * spriteX + robot.planeX * spriteY);

            let spriteScreenX = Math.floor((this.width / 2) * (1 + transformX / transformY));
            let spriteHeight = Math.abs(Math.floor(this.height / transformY));

            if (transformY > 0 && spriteScreenX > -spriteHeight && spriteScreenX < this.width + spriteHeight) {
                if (transformY < this.zBuffer[Math.max(0, Math.min(this.width - 1, spriteScreenX))]) {
                    this.ctx.font = `${Math.floor(spriteHeight * (obj.type.isBase ? 1.0 : 0.8))}px sans-serif`;
                    this.ctx.fillText(obj.type.emoji, spriteScreenX, (this.height / 2) + (spriteHeight * obj.type.yOffset3D));
                }
            }
        });
    }
}

