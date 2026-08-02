# 🤖 GoVacuum — Autonomous Vacuum Cleaner Simulator

Welcome to **GoVacuum**, a highly-optimized, modular web simulator that models the behaviors, mapping, and routing algorithms of an autonomous vacuum cleaner robot. It is built strictly on **ES6 Vanilla JavaScript, CSS3, and HTML5**, utilizing zero external frameworks or runtime dependencies, and implementing clean code and **SOLID principles** throughout.

The simulator features a dual visual display:
*   **2D Map View (Robot's SLAM Memory):** Displays the robot's real-time internal memory of room structures, dirt mapping, pathfinding waypoints, dynamically discovered objects (featuring a "fog of war" visual rendering), and the robot's cleaning brush visualization on its right side that spins during active cleaning tasks.
*   **3D First-Person View (Panoramic Camera):** Renders a classic retro-style 3D perspective using custom **Raycasting (DDA algorithm)**, representing what the robot's panoramic camera sees.

---

## 🚀 Quickstart

**Play online:** https://slopezjur.github.io/GoVacuum/

**Run locally:**

Prerequisite: [Node.js](https://nodejs.org/) (LTS) — the only requirement. No libraries need to be installed to launch the project: the bundled dev server (`serve.mjs`) uses Node.js built-in modules only.

```bash
npm run serve
```

Then open **http://localhost:3000** in any modern browser (Chrome, Firefox, Safari, Edge).

> Opening `index.html` directly (`file://`) does not work: the app uses native ES modules, which browsers block on `file://` pages. Any static HTTP server works — e.g. `python -m http.server 3000` as an alternative.

**How to play:**
1. Use the top control bar to command the robot to sweep the **Living Room**, **Bedroom**, or **Kitchen**.
2. Click anywhere on the 2D Map View canvas — or focus it and use the arrow keys + Enter — to dynamically add or remove obstacles and watch the robot recalculate its path on the fly!

---

## 🧪 Development

Development tooling requires a one-time install of the dev dependencies (**ESLint** and **Vitest**, declared in `package.json`):

```bash
npm install     # one-time: installs ESLint and Vitest
npm test        # run the Vitest suite (navigation engine + game state)
npm run lint    # static analysis with ESLint
npm run serve   # launch the project locally on http://localhost:3000
```

---

## 📚 Documentation

*   [docs/SPECIFICATION.md](docs/SPECIFICATION.md) — Functional specification of the two-phase room cleaning algorithm (perimeter sweep + inner infill, A* weights, completion criteria).
*   [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Project structure and core implementation details (pathfinding, docking, brush management, SLAM memory model, raycasting camera, fail-safes).
*   [docs/GoVacuumInit.md](docs/GoVacuumInit.md) — Original system specification and blueprint guidelines.

## 📄 License

See [LICENSE](LICENSE).
