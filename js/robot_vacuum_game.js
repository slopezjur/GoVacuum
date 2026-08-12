import { GameEngine } from './robot_vacuum_engine.js';

import { GameState } from './robot_vacuum_game_state.js';
import { VacuumRobot } from './robot_vacuum_robot.js';
import { SensorSystem } from './robot_vacuum_sensors.js';
import { Renderer2D } from './robot_vacuum_renderer_2d.js';
import { Renderer3D } from './robot_vacuum_renderer_3d.js';

// Bootstrap game and wire UI controls
let app;

function initEngine() {
    const state = new GameState();
    const robot = new VacuumRobot();
    const sensors = new SensorSystem();
    const renderer2D = new Renderer2D('mapCanvas', (x, y) => app.handleMapToggle(x, y));
    const renderer3D = new Renderer3D('camCanvas');
    
    let focusBeforeModal = null;
    const uiCallbacks = {
        onStatusUpdate: (msg) => {
            const uiStatus = document.getElementById('statusText');
            if (uiStatus) uiStatus.innerText = msg;
        },
        onShowStuckModal: () => {
            const modal = document.getElementById('stuckModal');
            if (!modal || modal.style.display === 'block') return;
            focusBeforeModal = document.activeElement;
            modal.style.display = 'block';
            const firstButton = modal.querySelector('button');
            if (firstButton) firstButton.focus();
        },
        onHideStuckModal: () => {
            const modal = document.getElementById('stuckModal');
            if (!modal || modal.style.display !== 'block') return;
            modal.style.display = 'none';
            if (focusBeforeModal && typeof focusBeforeModal.focus === 'function') {
                focusBeforeModal.focus();
            }
            focusBeforeModal = null;
        },
        onDebugToggle: (isPaused, debugDump) => {
            const debugBtn = document.getElementById('debugBtn');
            const camContainer = document.getElementById('camContainer');
            const debugPanel = document.getElementById('debugPanel');
            const debugOutput = document.getElementById('debugOutput');

            if (isPaused) {
                if (debugBtn) debugBtn.innerText = 'Resume';
                if (camContainer) camContainer.classList.add('debug-active');
                if (debugPanel) debugPanel.style.display = 'flex';
                if (debugOutput) debugOutput.value = JSON.stringify(debugDump, null, 2);
            } else {
                if (debugBtn) debugBtn.innerText = 'Stop/Debug';
                if (camContainer) camContainer.classList.remove('debug-active');
                if (debugPanel) debugPanel.style.display = 'none';
            }
        }
    };

    app = new GameEngine(state, robot, sensors, renderer2D, renderer3D, uiCallbacks);
    app.start();
}

initEngine();

// Signal to the boot watchdog in index.html that the module bootstrap succeeded
window.__GOVACUUM_BOOTED__ = true;

/**
 * Bind a click handler to a button, failing loudly in dev tools if the
 * element is missing instead of throwing an opaque TypeError.
 */
function bindButton(id, handler) {
    const element = document.getElementById(id);
    if (!element) {
        console.error(`UI bootstrap failed: #${id} not found`);
        return;
    }
    element.addEventListener('click', handler);
}

bindButton('cleanLivingRoomBtn', () => app.commandCleanRoom(0));
bindButton('cleanBedroomBtn', () => app.commandCleanRoom(1));
bindButton('cleanKitchenBtn', () => app.commandCleanRoom(2));
bindButton('debugBtn', () => app.toggleDebug());
bindButton('resetMapBtn', () => app.resetGame());
bindButton('returnToBaseBtn', () => app.commandReturnToBase());
bindButton('emergencyResetBtn', () => app.emergencyReset());
bindButton('closeModalBtn', () => app.hideStuckModal());
