# 🤖 GoVacuum — Autonomous Vacuum Cleaner Simulator

Welcome to **GoVacuum**, a highly-optimized, modular web simulator that models the behaviors, mapping, and routing algorithms of an autonomous vacuum cleaner robot. It is built strictly on **ES6 Vanilla JavaScript, CSS3, and HTML5**, utilizing zero external frameworks or dependencies, and implementing clean code and **SOLID principles** throughout.

The simulator features a dual visual display:
*   **2D Map View (Robot's SLAM Memory):** Displays the robot's real-time internal memory of room structures, dirt mapping, pathfinding waypoints, dynamically discovered objects (featuring a "fog of war" visual rendering), and the robot's cleaning brush visualization on its right side that spins during active cleaning tasks.
*   **3D First-Person View (Panoramic Camera):** Renders a classic retro-style 3D perspective using custom **Raycasting (DDA algorithm)**, representing what the robot's panoramic camera sees.

---

# FUNCTIONAL SPECIFICATION: ROOM CLEANING ALGORITHM (GOVACUUM CPP)

## 1. CORE OBJECTIVE
Design the control and navigation algorithm for a robot vacuum to clean a specific room on the map, guaranteeing 100% coverage of accessible tiles with the **minimum number of steps and turns possible**. 

The cleaning cycle is strictly divided into two sequential phases:
1. **Oriented Perimeter Phase (`CLEAN_EDGE`)**
2. **Inner Infill Phase (`CLEAN_INNER`)**

---

## 2. PHASE 1: ORIENTED PERIMETER SWEEP (`CLEAN_EDGE`)

The goal is to cover all tiles along the room's boundary. The robot must position and orient itself so that its **side brush** is always pointing toward the wall or room boundary.

### A. Side-Brush Orientation Rule (Side-Brush Constraint)
* Assuming the robot has its side brush mounted on its **right side** (Right-Hand Side Brush):
  * The perimeter path must be executed strictly in a **counter-clockwise (CCW)** direction so that the wall always remains on the robot's right.
  * *(If the side brush were on the left side, the mandatory direction would be clockwise / CW).*
* The robot's orientation vector ($\theta$) during perimeter advancement is non-negotiable and dictates the target tile sequence.

### B. Perimeter Obstacle Management (Contour Hugging / Wall-Follower)
* If the sensor detects a dynamic or static obstacle blocking the planned perimeter tile:
  1. The obstacle is immediately registered in the map memory (`knownObjects`).
  2. The robot **must not abort the perimeter phase or randomly jump to another area**.
  3. The algorithm will apply a **contour-following** logic: it will treat the outer face of the obstacle as a "new temporary wall."
  4. Using A*, it will recalculate a short path that hugs and skirts around the obstacle while keeping the side brush oriented toward the obstacle's surface until rejoining the next valid tile of the original perimeter.

---

## 3. PHASE 2: EFFICIENT INNER COVERAGE (`CLEAN_INNER`)

Once the perimeter loop is closed, the robot will clean the remaining uncleaned inner tiles (`dirtMap[y][x] === 1`). Using *Greedy* searches (random nearest neighbor) that generate isolated islands or inefficient paths is prohibited.

### A. Boustrophedon Pattern (S-Pattern / Lawnmower)
* The interior must be swept following a **continuous parallel line pattern ("S" or "Z" pattern)**.
* **Axis Alignment:** The algorithm must calculate the predominant dimension of the uncleaned interior area (width vs. height). Parallel lines must run along the **longest axis** to minimize the number of 180° turns (each turn consumes time and energy).

### B. Island Handling and Cellular Decomposition
* If a dynamic obstacle cuts across an S-pattern sweep line:
  1. The robot will skirt around the obstacle to resume the line if geometry allows.
  2. If the obstacle divides the interior into two or more isolated "sub-zones," the robot will complete 100% of the current sub-zone before transitioning to the next.

---

## 4. NAVIGATION ENGINE & PATH EFFICIENCY (PATHFINDING & WEIGHTS)

To minimize unnecessary steps and avoid stepping on already cleaned areas during transition movements:

1. **Navigation Algorithm:** Use of **A* (A-Star)** with Manhattan distance and a heuristic tie-breaker multiplier (`h * 1.001`) to prioritize straight-line trajectories.
2. **Dynamic Weight Matrix:**
   * Uncleaned tile within the room: **Cost = 1**
   * Already cleaned tile (within the room): **Cost = 5** (penalty to avoid re-stepping unless it is a mandatory bottleneck to reach another dirty area).
   * Tile outside the assigned room boundaries: **Cost = +50** (prevents the robot from leaking out of the room during cleaning).
   * Known obstacle: **Cost = Infinity (Impassable)**

---

## 5. COMPLETION CRITERIA
The `CLEAN_INNER` phase concludes when the sum of reachable tiles with a dirt value of `1` in the room is exactly `0`. At that point, the robot will report the task as completed and transition to the `RETURN` or `IDLE` state.

---

## 🛠️ Project Structure

The project has been architected strictly following the **Single Responsibility Principle (SRP)**. The files are organized as follows:

```bash
GoVacuum/
├── index.html                      # Main HTML document and UI structure (control panels & canvases)
├── package.json                    # npm scripts (test / lint / serve) and dev dependencies
├── eslint.config.js                # ESLint 9 flat config
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
    └── GoVacuumInit.md             # Original system specification and blueprint guidelines
```

All JavaScript is loaded as **native ES modules** (`<script type="module">`), with explicit `import`/`export` dependencies — no globals and no script-order coupling.

---

## 🚀 Core Technologies & Implementation Details

### 1. A* Pathfinding & Routing
*   **Path Planning (`robot_vacuum_navigation.js`):** Employs an **A\* (A-Star)** search with Manhattan-distance heuristic and a `h * 1.001` tie-break multiplier to favor straight trajectories over the 20x12 grid.
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
*   **Dynamic Rerouting:** Obstacles (emojis) are revealed on the 2D overview map with `1.0` opacity once scanned (or `0.4` ghost opacity under "fog-of-war" if unseen). If the user clicks on the 2D map to dynamically spawn obstacles directly in the robot's active path, `senseEnvironment()` registers the obstruction and triggers an immediate route replan.

### 5. 3D Raycasting Camera
*   **Digital Differential Analysis (DDA):** Casts a series of rays within the robot's Field of View (FOV) across the grid columns.
*   **Z-Buffer Sprite Projection:** Calculates perpendicular wall distance, wall height slice, fake-texture alignment, and depth-shading. Interactive objects (🧸, ⚽, 🧦, 📦) are sorted back-to-front by squared distance, projected onto the screen via a camera matrix, and drawn as scaled billboard sprites using a depth z-buffer.

### 6. Emergency Recovery Fail-safe
*   **Anti-Stuck Protection:** If obstacles block all paths to the robot's target, movement is stopped, and a **"Robot Stuck"** modal is displayed. Users can choose to perform an **emergency reset** (safely respawning the robot at the base) or close the modal and click to manually clear the blocking obstacles.

---

## 🎮 How to Play / Run Locally
Access to https://slopezjur.github.io/GoVacuum/ or
1. Clone this repository to your local machine.
2. Serve the folder with any static file server (ES modules cannot load from `file://`):
   ```bash
   npm run serve        # zero-dependency static server (serve.mjs)
   # or: python -m http.server 8000
   ```
3. Open the printed URL (e.g. `http://localhost:3000`) in any modern browser (Chrome, Firefox, Safari, Edge).
4. Use the top control bar to command the robot to sweep the **Living Room**, **Bedroom**, or **Kitchen**.
5. Click anywhere on the 2D Map View canvas — or focus it and use the arrow keys + Enter — to dynamically add or remove obstacles and watch the robot recalculate its path on the fly!

## 🧪 Development

```bash
npm install     # one-time: installs ESLint and Vitest
npm test        # run the Vitest suite (navigation engine + game state)
npm run lint    # static analysis with ESLint
```

The game loop is **frame-rate independent**: all robot rates in `CONFIG.ROBOT` are expressed per second and scaled by the animation-frame delta time, so behavior is identical on 60 Hz and high-refresh displays.