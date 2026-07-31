Prompt: GoVacuum (Version 2.0 – Master)

Role and behavior:
Act as a Software Architect and Senior Frontend Developer. Your goal is to design and maintain a vacuum‑cleaner robot simulator implemented as a small web app using HTML, CSS and vanilla JavaScript (ES6). Apply strict Clean Code and SOLID principles to keep the codebase modular and scalable. All comments in code (JS, HTML, CSS) must be written in English only.

High‑level architectural principles:

    Modular architecture (separation of concerns):
        - Clearly separate game state and domain logic (map data, robot position, objects, dirt) from rendering logic (2D canvas, 3D raycasting) and from orchestration logic (GameEngine and UI wiring).

    Object‑oriented design:
        - Use ES6 classes for the main concepts:
          GameState, NavigationSystem, VacuumRobot, Renderer2D, Renderer3D, GameEngine.

    Single Responsibility Principle (SRP):
        - Each class and function has a single clear purpose.
        - Keep functions short, self‑documenting, and focused.

    Controlled state management:
        - Centralize game state inside GameState (map, dirtMap, objects).
        - Avoid unnecessary globals. The only allowed globals are:
          1) a read‑only CONFIG object, and
          2) a single GameEngine instance (app) created by the bootstrap script to wire UI events.

    Clean naming:
        - Use descriptive, explicit English names for variables, methods and classes
          (for example: checkCollisionWithObstacle, generateRoomSweepPath).

    Extensibility (Open/Closed Principle):
        - Extract all tunable values (sizes, speeds, FOV, colors, map layout, object types) into an immutable CONFIG object.
        - Adding new room types, obstacle types or visual tweaks should not require changing core algorithms.

Current project structure (file‑level architecture):

    Entry HTML:
        - robot_vacuum_game-gemini.html
          * Declares the UI layout:
              - Top bar with control buttons and status text.
              - First panel: 2D “Map View” canvas.
              - Second panel: 3D “First‑Person View” canvas.
              - Embedded modal for “Robot Stuck” emergencies.
          * Includes CSS and JS via external files (no inline scripts).

    Styles:
        - css/robot_vacuum_game.css
          * Global page styling: dark gradient background, layout, panel styles.
          * Top bar, buttons (normal, warning, danger) and status text styling.
          * Canvas styling (object‑fit, cursor, backgrounds).
          * Modal styling for the stuck‑robot warning.

    JavaScript (loaded as classic scripts in this order):

        1) js/robot_vacuum_config.js
           - Defines the global, immutable CONFIG object:
             * CANVAS sizes (MAP_WIDTH, MAP_HEIGHT, CAM_WIDTH, CAM_HEIGHT).
             * ROBOT parameters (START_X, START_Y, BASE_X, BASE_Y, BASE_FRONT_X, BASE_FRONT_Y,
               SPEED: 0.0125, TURN_SPEED: 0.025, FOV: 0.66, SENSOR_GRID_RANGE: 1).
             * MAP_DATA: 20x12 grid with walls and three rooms.
             * ROOMS: Living Room, Bedroom, Kitchen with boundaries and colors.
             * OBJECT_TYPES: BASE ⚡ and interactive obstacles 🧸⚽🧦📦.
             * COLORS: palette for walls, ceiling, floor, robot, dirt and path.

        2) js/robot_vacuum_game_state.js
           - Class GameState:
             * Holds the map matrix, rooms array, and dimensions (width/height).
             * Dual state (SLAM‑style):
                 - actualObjects: the full “real world” list of obstacles and base.
                 - knownObjects: the robot’s current memory of obstacles it has sensed.
                 - dirtMap: grid of tiles marked dirty (1) or clean (0).
             * Methods:
                 - initializeDirtMap(): create full‑dirty grid.
                 - resetDirtForRoom(room): reset dirt only inside a given room.
                 - generateInitialObjects(): randomly place obstacles in each room,
                   avoiding doors, corridors and the base/entry tiles.
                 - canPlaceObjectAt(x, y, objects): enforce safe placement rules.
                 - toggleObstacleAt(gridX, gridY): add/remove an obstacle when the user clicks.
                 - senseEnvironment(robotX, robotY, currentPath):
                     · Use Chebyshev distance (|dx| <= 1 && |dy| <= 1) to scan a 3x3 grid
                       around the robot.
                     · Any newly discovered actualObject within this square is pushed
                       into knownObjects.
                     · If any new object falls exactly on a tile belonging to the current
                       robot path, return true to request a route replanning.
                 - clearMemory(): reset knownObjects to only the base and mark all tiles as dirty.
                 - cleanDirtAt(x, y): mark the tile under the robot as clean.
                 - isValidPosition(x, y): check inside bounds and not a wall.
                 - hasKnownObstacleAt(x, y): true if knownObjects contains a solid obstacle on that tile.

        3) js/robot_vacuum_navigation.js
           - Class NavigationSystem (pure static utility for path planning):
             * findPath(state, startX, startY, endX, endY, plannedDirtMap, roomBounds, ignoreDirtFlag):
                 - Uses a Dijkstra‑style weighted BFS over the grid.
                 - Blocks walls and known obstacles (from GameState.hasKnownObstacleAt).
                 - Force base exit constraint: If pathfinding starts at the base station (BASE_X, BASE_Y),
                   the first step of the path MUST be the base front tile (BASE_FRONT_X, BASE_FRONT_Y).
                   This prevents the robot from turning inside the charging base.
                 - If ignoreDirtFlag is false:
                     · Dirty tiles cost 1.
                     · Clean tiles cost 5 (discourage unnecessary revisits).
                 - If roomBounds is set (during room cleaning):
                     · Leaving the room adds +50 cost, encouraging solutions inside the room.
                 - Returns an array of waypoints {x, y} in world coordinates (center of tiles).
             * generateRoomSweepPath(state, room, currentX, currentY, isEdgePhase):
                 - Edge phase (isEdgePhase = true):
                     · Build a clockwise loop along the room rectangle:
                       top edge → right edge → bottom edge → left edge.
                     · Reorder the loop to start from the edge tile closest to the robot.
                     · For each candidate edge tile:
                           · Skip if invalid, already “mentally cleaned” or blocked by a known obstacle.
                           · Call findPath to reach it; append subpaths and mark those tiles as clean in a plannedDirt buffer.
                 - Inner phase (isEdgePhase = false):
                     · Greedy loop that repeatedly:
                         · Gathers all valid, dirty, unobstructed tiles in the room.
                         · Sorts them by a score favoring proximity and horizontal striping.
                         · Picks the best tile, finds a path to it, and marks that path as clean in plannedDirt.
                         · If a tile is unreachable due to obstacles, mark it clean in plannedDirt and move on.
                 - Returns the full sweep path for the given phase.

        4) js/robot_vacuum_robot.js
           - Class VacuumRobot:
             * Holds continuous position (x, y), heading angle, current path, and raycasting vectors.
             * Methods:
                 - setPath(newPath): replace the current waypoint list.
                 - update(state, currentTask, onCompleteCallback):
                     · If no path, do nothing.
                     · Move smoothly towards the current waypoint using interpolation and Math.hypot.
                     · When near enough to a waypoint, snap to it and pop from the path.
                     · For RETURN tasks, when approaching the base tile itself, drive in reverse
                       to simulate backing into the dock.
                     · After movement, update raycasting vectors and notify GameState to clean dirt
                       at the new position.
                 - rotateAndMove(dx, dy, isReversing):
                     · Rotate smoothly towards the target angle (or its inverse when reversing),
                       limited by CONFIG.ROBOT.TURN_SPEED.
                     · Only when aligned enough, update x/y with forward or negative speed.
                 - updateVectors():
                     · Recompute dirX/dirY and planeX/planeY for the 3D raycaster based on angle and FOV.
                 - isAtBase():
                     · True when the robot stands exactly on the base tile (BASE_X, BASE_Y).

        5) js/robot_vacuum_renderer_2d.js
           - Class Renderer2D:
             * Owns the 2D “Map View” canvas and draws the robot’s internal model of the world.
             * setupInputs(callback):
                 - Listens to click events on the canvas.
                 - Correctly handles CSS object‑fit letterboxing:
                     · Compute scale, rendered width/height and offsets.
                     · Ignore clicks outside the rendered area.
                     · Translate mouse position to grid coordinates (gridX, gridY).
                 - Invokes the provided callback with the clicked tile.
             * render(state, robot):
                 - Draw floors and colored rooms with dirt particles for dirty tiles.
                 - Overlay room labels centered within each room.
                 - Draw the base pad with a green dock connector.
                 - Draw walls as solid tiles.
                 - Draw the current path as a teal line from robot to waypoints.
                 - Draw obstacles:
                     · Objects from actualObjects:
                           · If object is not the base:
                                 · Use opacity 0.4 when it is not yet in knownObjects
                                   (“fog of war”).
                                 · Use opacity 1.0 when known to the robot.
                 - Draw the robot as a circle with a heading indicator.

        6) js/robot_vacuum_renderer_3d.js
           - Class Renderer3D:
             * Owns the 3D “First‑Person View” canvas and acts as a physical camera.
             * Uses a classic raycasting engine:
                 - For each screen column:
                     · Cast a ray based on robot.dir and plane.
                     · Step through the grid using DDA until hitting a wall or leaving the map.
                     · Compute perpendicular wall distance, line height and vertical slice.
                     · Choose wall color based on a simple fake texture pattern and which side
                       was hit.
                     · Store depth in zBuffer for sprite occlusion.
             * drawSprites(objectsToRender, robot):
                 - Receives actualObjects (the real world, not just knownObjects).
                 - Sorts objects back‑to‑front by squared distance.
                 - Projects each sprite using the camera matrix, checks against zBuffer,
                   and draws an emoji (⚡🧸⚽🧦📦) scaled by depth and vertically offset by type.

        7) js/robot_vacuum_engine.js
           - Class GameEngine:
             * Creates and wires together GameState, VacuumRobot, Renderer2D, Renderer3D and UI elements.
             * Holds currentTask:
                 - "IDLE", "CLEAN_EDGE", "CLEAN_INNER", or "RETURN".
             * Core methods:
                 - start(): kicks off the requestAnimationFrame loop.
                 - resetGame(): recreates GameState, resets robot and status.
                 - emergencyReset(): resets robot and task to IDLE and hides the modal.
                 - handleMapToggle(x, y):
                     · Delegates to GameState.toggleObstacleAt.
                     · Immediately runs senseEnvironment() and triggers replanRoute()
                       if the current path is now blocked.
                 - replanRoute():
                     · For CLEAN_EDGE: generate edge sweep path; if empty, switch to CLEAN_INNER.
                     · For CLEAN_INNER: generate interior sweep path; if empty, switch to RETURN.
                     · For RETURN: compute shortest path back to BASE_FRONT, then append a final
                       step onto BASE itself for reverse parking.
                     · If no path for RETURN, call showStuckWarning().
                 - showStuckWarning(): stop movement and display the stuck modal.
                 - gameLoop():
                     · On each frame:
                           · Run senseEnvironment() from GameState. If it reports a blocked path
                             and the robot is not IDLE, call replanRoute().
                           · Step the robot forward with VacuumRobot.update().
                           · Render 2D and 3D views.
                           · Schedule the next frame.
                 - onTaskComplete():
                     · For CLEAN_EDGE and CLEAN_INNER: immediately re‑evaluate and
                       potentially transition phase.
                     · For RETURN:
                           · If robot reached the base, update status to “Idle at Base”,
                             set task to IDLE and clear robot memory (clearMemory()).
                           · Otherwise, treat as an aborted return but do not wipe memory.
                 - updateStatus(msg): write human‑readable status into the UI.
                 - commandCleanRoom(roomId):
                     · Find the target room by id.
                     · If current task is IDLE, clear robot memory first.
                     · Reset dirt for that room.
                     · Switch task to CLEAN_EDGE and call replanRoute(), updating status.
                 - commandReturnToBase():
                     · Switch task to RETURN, recalculate path and update status.

        8) js/robot_vacuum_game.js
           - Bootstrap module:
             * Creates the single GameEngine instance:
                   const app = new GameEngine();
                   app.start();
             * Attaches DOM event listeners to buttons:
                   - "Clean Living Room" → app.commandCleanRoom(0)
                   - "Clean Bedroom"     → app.commandCleanRoom(1)
                   - "Clean Kitchen"     → app.commandCleanRoom(2)
                   - "Reset Map"         → app.resetGame()
                   - "Return to Base"    → app.commandReturnToBase()
                   - Modal "Reset at Base" → app.emergencyReset()
                   - Modal "Close & Clear Manually" → hides the stuck modal.

Functional and visual behavior:

    User interface:
        - Top bar with:
            · "Clean Living Room", "Clean Bedroom", "Clean Kitchen".
            · "Reset Map" (warning) and "Return to Base" (danger).
            · Status text in monospace showing the current state (idle, cleaning, returning).
        - Main content:
            · Upper panel: 2D Map View (robot’s memory).
            · Lower panel: 3D First‑Person View (physical camera).
        - Emergency modal:
            · Pops up when the robot cannot find any valid route to its objective.
            · Offers:
                · "Reset at Base" to respawn the robot safely at the dock.
                · "Close & Clear Manually" to let the user fix obstacles on the map.

    Environment and map:
        - 20x12 grid with solid walls around the perimeter.
        - Three adjacent rooms (Living Room, Bedroom, Kitchen) with wide doors (no narrow corridors).
        - Each room has a distinct floor color and a centered label.
        - All walkable floor tiles start “dirty”, represented as small particles in the 2D map.

    Dynamic elements and obstacles:
        - Charging base:
            · Located at (BASE_X=1, BASE_Y=1) with a front tile at (2,1).
            · Rendered as a green pad in 2D and a ⚡ sprite in 3D.
            · Physically considered an obstacle for pathfinding (no shortcuts over the base),
              except for the special docking sequence.
        - Room objects:
            · Randomly generated obstacles (🧸, ⚽, 🧦, 📦) inside each room.
            · Respect a minimum exclusion distance from the base and its entry tile.
            · Never spawn inside doors or narrow corridors.
            · Can be added or removed interactively by clicking on the 2D map.

    Navigation and cleaning mechanics:
        - State‑aware map interaction:
            · A single click on the 2D canvas toggles an obstacle on the clicked tile (if valid),
              using scaled coordinates to stay robust against CSS scaling.
            · After each change, the engine runs senseEnvironment() and can trigger an immediate
              route recalculation if the current path is now blocked.
        - Dual memory model (SLAM‑like):
            · actualObjects: ground‑truth obstacles and base.
            · knownObjects: only what the robot has seen with its sensors.
            · Renderer2D visualizes both: unknown objects are ghosted at 0.4 opacity,
              known ones at 1.0.
            · Renderer3D always renders all actualObjects as they physically exist.
        - Sensors:
            · On every frame, the robot scans a 3x3 square around itself using Chebyshev distance
              (|dx| <= 1 && |dy| <= 1).
            · Any actualObject inside that square gets promoted into knownObjects.
            · If any new known obstacle lies exactly on a waypoint in the active path,
              the engine immediately replans.
        - Weighted Dijkstra navigation:
            · Based on NavigationSystem.findPath().
            · Dirt‑aware weights (dirty=1, clean=5) minimize double passes without crazy detours.
            · Strong penalty for leaving the target room during cleaning (+50), which puts
              “mental walls” at room boundaries.
        - Room cleaning strategy:
            · When a room is commanded:
                1) GameState.resetDirtForRoom(room) marks all its tiles as dirty again.
                2) GameEngine sets currentTask to CLEAN_EDGE and calls replanRoute().
                3) Edge phase: trace a clockwise loop of the room perimeter, hugging obstacles.
                4) Inner phase: fill the interior using a greedy nearest‑dirty heuristic, using
                   a mental dirt board to avoid re‑planning the same area.
                5) When the inner phase returns an empty path (either fully clean or blocked),
                   the engine switches to RETURN.
        - Return‑to‑base and parking:
            · For RETURN tasks, NavigationSystem.findPath() runs with ignoreDirtFlag = true,
              treating all walkable tiles equally to minimize route length.
            · The target is the front tile of the base (BASE_FRONT_X, BASE_FRONT_Y).
            · When the robot reaches that tile, the engine appends a final waypoint on the base
              itself and VacuumRobot drives backward into the dock by reversing its angle
              and using negative speed.
            · The robot always exits and enters the base station in the same direction (exiting forward-facing from the base onto the base front, and docking backward-facing). To ensure this symmetry, no turn rotations are allowed inside the base station tile, and any newly planned path starting on the base MUST transition to the base front tile first.
            · Once fully docked, memory is formatted (clearMemory) so the next mission starts
              with a full‑unknown world and fully dirty dirtMap.

    Anti‑stuck behavior:
        - If NavigationSystem cannot find any route to the target for a given task
          (cleaning a room or returning to base), the engine:
            · Stops the robot by clearing its path.
            · Shows the stuck modal in the 2D panel.
            · Lets the user either reset the robot at the base or close the modal and
              manually clear obstacles on the map.
