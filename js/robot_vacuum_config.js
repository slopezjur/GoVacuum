/**
 * GLOBAL CONFIGURATION
 *
 * Single source of truth for every tunable value in the simulator.
 * Rates are expressed per second; the game loop scales them by delta time.
 */
export const CONFIG = Object.freeze({
    CANVAS: { MAP_WIDTH: 600, MAP_HEIGHT: 360, CAM_WIDTH: 1024, CAM_HEIGHT: 360 },
    ROBOT: {
        START_X: 1.5, START_Y: 1.5,
        BASE_X: 1, BASE_Y: 1,
        BASE_FRONT_X: 2, BASE_FRONT_Y: 1,
        DOCK_CLEARANCE: 1.5,     // tiles — radius around the dock where waypoints always require exact arrival (natural base exit)
        SPEED: 0.75,             // tiles per second
        TURN_SPEED: 1.5,         // radians per second
        FOV: 0.66,
        BRUSH_SPIN_SPEED: 21.6,  // radians per second
        BRUSH_STICK_COUNT: 3,
        // Right-side wall-follow controller (simulated IR wall sensor),
        // active only during CLEAN_EDGE. All rates are per second.
        WALL_FOLLOW: {
            ENABLED: false,              // master switch — disabled for now (steering behavior under review)
            TARGET_DISTANCE: 0.5,        // tiles — desired right-side wall offset (brush reach)
            GAIN: 2.0,                   // rad of heading offset per tile of lateral error
            DERIVATIVE_GAIN: 2.0,        // rad of damping per tile/s of error rate (prevents oscillation)
            MAX_CORRECTION: 0.7,         // rad clamp on the heading offset from the route direction
            RANGE: 1.2,                  // tiles — side-ray range; beyond it no wall is detected
            FRONT_RANGE: 0.6,            // tiles — obstacle ahead closer than this = concave corner
            LOST_WALL_GRACE: 1.0,        // s after losing the wall during which a convex corner is assumed
            MAX_ERROR_RATE: 4.0,         // tiles/s — clamp on the derivative term (ray distance jumps at obstacle edges)
            FALLBACK_TIMEOUT: 4.0,       // s without lateral convergence -> revert to waypoint pursuit
            CONVERGENCE_TOLERANCE: 0.15, // tiles — |error| under this counts as converged
            WAYPOINT_RADIUS: 0.75        // tiles — acceptance radius for INTERMEDIATE waypoints while wall-following
        }
    },
    SENSORS: {
        LIDAR_RANGE: 3,                      // tiles
        LIDAR_RAY_COUNT: 16,                 // rays per full 360° revolution
        LIDAR_ROTATION_SPEED: Math.PI * 2,   // radians per second (~1 sweep per second)
        BUMPER_DISTANCE: 0.35,               // robot body radius in tiles — contact registration
        RAY_TRAIL_TTL: 0.3,                  // seconds a cast ray stays visible
        HIT_FLASH_TTL: 0.5                   // seconds an object hit flash stays visible
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
});
