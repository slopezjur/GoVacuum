import { GameEngine } from './robot_vacuum_engine.js';

// Bootstrap game and wire UI controls
const app = new GameEngine();
app.start();

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
bindButton('resetMapBtn', () => app.resetGame());
bindButton('returnToBaseBtn', () => app.commandReturnToBase());
bindButton('emergencyResetBtn', () => app.emergencyReset());
bindButton('closeModalBtn', () => app.hideStuckModal());
