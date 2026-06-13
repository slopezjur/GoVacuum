/**
 * GLOBAL CONFIGURATION
 */
const CONFIG = {
    CANVAS: { MAP_WIDTH: 600, MAP_HEIGHT: 360, CAM_WIDTH: 1024, CAM_HEIGHT: 360 },
    ROBOT: {
        START_X: 1.5, START_Y: 1.5,
        BASE_X: 1, BASE_Y: 1,
        BASE_FRONT_X: 2, BASE_FRONT_Y: 1,
        SPEED: 0.0125,
        TURN_SPEED: 0.025,
        FOV: 0.66,
        SENSOR_GRID_RANGE: 1 // Chebyshev distance for 3x3 square scanning
    },
    MAP_DATA: [
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        [1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,1,1,0,0,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
    ],
    ROOMS: [
        { id: 0, name: 'Living Room', color: '#1e3a8a', x1: 1, y1: 1, x2: 6, y2: 5 },
        { id: 1, name: 'Bedroom', color: '#312e81', x1: 8, y1: 1, x2: 18, y2: 5 },
        { id: 2, name: 'Kitchen', color: '#064e3b', x1: 1, y1: 7, x2: 18, y2: 10 }
    ],
    OBJECT_TYPES: {
        BASE: { emoji: '⚡', isObstacle: true, yOffset3D: 0.3 },
        TEDDY: { emoji: '🧸', isObstacle: true, yOffset3D: 0.2 },
        BALL: { emoji: '⚽', isObstacle: true, yOffset3D: 0.2 },
        SOCK: { emoji: '🧦', isObstacle: true, yOffset3D: 0.2 },
        BOX: { emoji: '📦', isObstacle: true, yOffset3D: 0.2 }
    },
    COLORS: {
        WALL_LIGHT: '#475569', WALL_DARK: '#334155', CEILING: '#1e293b', FLOOR: '#0f172a',
        PATH: 'rgba(6, 182, 212, 0.5)', ROBOT: '#10b981', DIRT: 'rgba(255, 255, 255, 0.15)'
    }
};

