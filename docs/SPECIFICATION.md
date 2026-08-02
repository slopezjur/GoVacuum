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
