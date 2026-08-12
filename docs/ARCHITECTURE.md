# 🛠️ Architecture & Implementation Details

The project has been architected strictly following the **Single Responsibility Principle (SRP)**.

## Project Structure

```bash
GoVacuum/
├── index.html                      # Main HTML document and UI structure (control panels & canvases)
├── package.json                    # npm scripts (test / lint / serve) and dev dependencies
├── eslint.config.js                # ESLint 9 flat config
├── serve.mjs                       # Zero-dependency static dev server (Node.js built-ins only)
├── css/
│   └── robot_vacuum_game.css       # Core styling, responsive layouts, stuck modal styling
├── js/
│   ├── robot_vacuum_config.js      # Global immutable configuration constants (CONFIG object, including BRUSH_SPIN_SPEED and BRUSH_STICK_COUNT)
│   ├── robot_vacuum_game_state.js  # Core simulation state: actual vs. known obstacles, dirt map
│   ├── robot_vacuum_navigation.js  # Static class for A* pathfinding (binary min-heap) and sweep generation
│   ├── robot_vacuum_robot.js       # Robot physical model (delta-time interpolation, smooth rotation, raycasting vectors, brush state management)
│   ├── robot_vacuum_renderer_2d.js # Canvas-based 2D overhead map renderer (handles CSS scaling, brush visualization, keyboard cursor)
│   ├── robot_vacuum_renderer_3d.js # Canvas-based 3D Raycasting engine & Sprite z-buffer renderer
│   ├── robot_vacuum_engine.js      # GameLoop manager and task coordinator (IDLE/EDGE/INNER/RETURN)
│   └── robot_vacuum_game.js        # Bootstrapper module wiring UI button inputs to the GameEngine
├── tests/
│   └── navigation.test.js          # Vitest suite for the navigation engine and game state
└── docs/
    ├── SPECIFICATION.md            # Functional specification of the room cleaning algorithm
    ├── ARCHITECTURE.md             # This document
    └── GoVacuumInit.md             # Original system specification and blueprint guidelines
```

All JavaScript is loaded as **native ES modules** (`<script type="module">`), with explicit `import`/`export` dependencies — no globals and no script-order coupling.

The game loop is **frame-rate independent**: all robot rates in `CONFIG.ROBOT` are expressed per second and scaled by the animation-frame delta time, so behavior is identical on 60 Hz and high-refresh displays.

---

## 🚀 Core Technologies & Implementation Details

### 1. A* Pathfinding & Routing
*   **Path Planning (`robot_vacuum_navigation.js`):** Employs an **A\* (A-Star)** search with Manhattan-distance heuristic and a `h * 1.001` tie-break multiplier to favor straight trajectories over the 20x12 grid. Nodes are expanded from a binary min-heap and reconstructed once via parent pointers.
*   **Dynamic Weight Matrix:** Unvisited "dirty" tiles cost `1`, already cleaned tiles cost `5` (avoid re-stepping unless it is a mandatory bottleneck), leaving the target room adds `+50` ("mental walls"), and known obstacles are impassable (infinite cost).
*   **Perimeter & Interior Sweeping:** Runs a **counter-clockwise** perimeter trace (`CLEAN_EDGE`, right-wall following so the right-side brush always faces the wall), followed by a **Boustrophedon S-pattern** interior sweep (`CLEAN_INNER`) traced along the longest axis of the uncleaned region.

### 2. Physical Navigation & Docking Symmetry
*   **Base Station Exit Constraint:** To prevent the robot from executing unnatural turn rotations inside the charging dock, paths starting at the base station `(BASE_X, BASE_Y)` are restricted to step onto the base front `(BASE_FRONT_X, BASE_FRONT_Y)` first. The robot rolls out forward before turning.
*   **Docking Sequence:** When returning to base, once the robot reaches the base front tile, the engine appends a final waypoint on the base itself. The robot then smoothly **reverses into the dock** with negative speed. Once docked, its memory is wiped to prepare for the next mission.

### 3. Cleaning Brush Management
*   **Brush Configuration (`CONFIG.ROBOT.BRUSH_SPIN_SPEED`, `CONFIG.ROBOT.BRUSH_STICK_COUNT`):** The vacuum features a cleaning brush with configurable rotation speed (10.8 rad/s, delta-time scaled) and 3 visible pins/sticks.
*   **Brush State Control:** The robot tracks `brushAngle` (rotation) and `brushSpinning` (on/off state). The brush spins during active cleaning tasks and stops while docked or reverse-parking.
*   **2D Visualization:** The brush is rendered on the right side of the robot at a +45° offset from the facing direction, visible as rotating white pins within a subtle circular boundary. Always present in the 2D view — static when idle, spinning during cleaning.

### 4. Dual-SLAM Sensed Memory Model
*   **Chebyshev Sensors:** The robot starts with zero knowledge of the room's obstacles. On each frame, its simulated LiDAR scans a 3x3 square around its location using Chebyshev distance.
*   **Dynamic Rerouting:** Obstacles (emojis) are revealed on the 2D overview map with `1.0` opacity once scanned (or `0.4` ghost opacity under "fog-of-war" if unseen). If the user clicks on the 2D map to dynamically spawn or remove obstacles directly in the robot's active path, the engine registers the environment change and triggers an **unconditional immediate route replan**. This ensures the A* algorithm can instantly exploit newly unblocked shortcuts (when obstacles are removed) as well as detour around new blockages.

### 5. 3D Raycasting Camera
*   **Digital Differential Analysis (DDA):** Casts a series of rays within the robot's Field of View (FOV) across the grid columns.
*   **Z-Buffer Sprite Projection:** Calculates perpendicular wall distance, wall height slice, fake-texture alignment, and depth-shading. Interactive objects (🧸, ⚽, 🧦, 📦) are sorted back-to-front by squared distance, projected onto the screen via a camera matrix, and drawn as scaled billboard sprites using a depth z-buffer.

### 6. Emergency Recovery Fail-safe
*   **Anti-Stuck Protection:** If obstacles block all paths to the robot's target, movement is stopped, and a **"Robot Stuck"** modal is displayed. Users can choose to perform an **emergency reset** (safely respawning the robot at the base) or close the modal and click to manually clear the blocking obstacles.

### 7. Debugging & State Inspection
*   **Stop/Debug Mode:** The simulation features an integrated debug hook that pauses the `requestAnimationFrame` delta-time step. When activated, it halts physics and sensor scans, splitting the 3D viewport to dump the real-time `GameState` (robot coordinates, active task, remaining A* waypoints, and `knownObjects` memory) as formatted JSON. This allows developers to inspect the exact heuristic decisions made by the navigation engine at any given frame.
