# 🤖 GoVacuum — Autonomous Vacuum Cleaner Simulator

Welcome to **GoVacuum**, a highly-optimized, modular web simulator that models the behaviors, mapping, and routing algorithms of an autonomous vacuum cleaner robot. It is built strictly on **ES6 Vanilla JavaScript, CSS3, and HTML5**, utilizing zero external frameworks or dependencies, and implementing clean code and **SOLID principles** throughout.

The simulator features a dual visual display:
*   **2D Map View (Robot's SLAM Memory):** Displays the robot's real-time internal memory of room structures, dirt mapping, pathfinding waypoints, and dynamically discovered objects (featuring a "fog of war" visual rendering).
*   **3D First-Person View (Panoramic Camera):** Renders a classic retro-style 3D perspective using custom **Raycasting (DDA algorithm)**, representing what the robot's panoramic camera sees.

---

## 🛠️ Project Structure

The project has been architected strictly following the **Single Responsibility Principle (SRP)**. The files are organized as follows:

```bash
GoVacuum/
├── index.html                      # Main HTML document and UI structure (control panels & canvases)
├── css/
│   └── robot_vacuum_game.css       # Core styling, responsive layouts, stuck modal styling
├── js/
│   ├── robot_vacuum_config.js      # Global immutable configuration constants (CONFIG object)
│   ├── robot_vacuum_game_state.js  # Core simulation state: actual vs. known obstacles, dirt map
│   ├── robot_vacuum_navigation.js  # Static class for Dijkstra BFS pathfinding and sweep generation
│   ├── robot_vacuum_robot.js       # Robot physical model (interpolation, smooth rotation, raycasting vectors)
│   ├── robot_vacuum_renderer_2d.js # Canvas-based 2D overhead map renderer (handles CSS scaling)
│   ├── robot_vacuum_renderer_3d.js # Canvas-based 3D Raycasting engine & Sprite z-buffer renderer
│   ├── robot_vacuum_engine.js      # GameLoop manager and task coordinator (IDLE/EDGE/INNER/RETURN)
│   └── robot_vacuum_game.js        # Bootstrapper module wiring UI button inputs to the GameEngine
└── docs/
    └── GoVacuumInit.txt            # Original system specification and blueprint guidelines
```

---

## 🚀 Core Technologies & Implementation Details

### 1. Weighted Dijkstra Pathfinding & Routing
*   **Path Planning (`robot_vacuum_navigation.js`):** Employs a Dijkstra-like weighted BFS to compute the most cost-efficient path over a 20x12 grid.
*   **Weighted Search:** Unvisited "dirty" tiles cost `1` to traverse, whereas already cleaned tiles cost `5` to discourage wasteful backtracking. Leaving the target room during cleaning adds a massive penalty (`+50`) to create "mental walls."
*   **Perimeter & Interior Sweeping:** Runs a clockwise perimeter trace (`CLEAN_EDGE`), followed by a greedy nearest-neighbor S-pattern grid sweep (`CLEAN_INNER`).

### 2. Physical Navigation & Docking Symmetry
*   **Base Station Exit Constraint:** To prevent the robot from executing unnatural turn rotations inside the charging dock, paths starting at the base station `(BASE_X, BASE_Y)` are restricted to step onto the base front `(BASE_FRONT_X, BASE_FRONT_Y)` first. The robot rolls out forward before turning.
*   **Docking Sequence:** When returning to base, once the robot reaches the base front tile, the engine appends a final waypoint on the base itself. The robot then smoothly **reverses into the dock** with negative speed. Once docked, its memory is wiped to prepare for the next mission.

### 3. Dual-SLAM Sensed Memory Model
*   **Chebyshev Sensors:** The robot starts with zero knowledge of the room's obstacles. On each frame, its simulated LiDAR scans a 3x3 square around its location using Chebyshev distance.
*   **Dynamic Rerouting:** Obstacles (emojis) are revealed on the 2D overview map with `1.0` opacity once scanned (or `0.4` ghost opacity under "fog-of-war" if unseen). If the user clicks on the 2D map to dynamically spawn obstacles directly in the robot's active path, `senseEnvironment()` registers the obstruction and triggers an immediate route replan.

### 4. 3D Raycasting Camera
*   **Digital Differential Analysis (DDA):** Casts a series of rays within the robot's Field of View (FOV) across the grid columns.
*   **Z-Buffer Sprite Projection:** Calculates perpendicular wall distance, wall height slice, fake-texture alignment, and depth-shading. Interactive objects (🧸, ⚽, 🧦, 📦) are sorted back-to-front by squared distance, projected onto the screen via a camera matrix, and drawn as scaled billboard sprites using a depth z-buffer.

### 5. Emergency Recovery Fail-safe
*   **Anti-Stuck Protection:** If obstacles block all paths to the robot's target, movement is stopped, and a **"Robot Stuck"** modal is displayed. Users can choose to perform an **emergency reset** (safely respawning the robot at the base) or close the modal and click to manually clear the blocking obstacles.

---

## 🎮 How to Play / Run Locally
Access to https://slopezjur.github.io/GoVacuum/ or
1. Clone this repository to your local machine.
2. Double-click `index.html` to open it in any modern browser (Chrome, Firefox, Safari, Edge).
3. Use the top control bar to command the robot to sweep the **Living Room**, **Bedroom**, or **Kitchen**.
4. Click anywhere on the 2D Map View canvas to dynamically add or remove obstacles and watch the robot recalculate its path on the fly!
