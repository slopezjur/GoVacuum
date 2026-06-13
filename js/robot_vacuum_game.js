// Bootstrap game and wire UI controls
const app = new GameEngine();
app.start();

document.getElementById('cleanLivingRoomBtn').addEventListener('click', () => app.commandCleanRoom(0));
document.getElementById('cleanBedroomBtn').addEventListener('click', () => app.commandCleanRoom(1));
document.getElementById('cleanKitchenBtn').addEventListener('click', () => app.commandCleanRoom(2));
document.getElementById('resetMapBtn').addEventListener('click', () => app.resetGame());
document.getElementById('returnToBaseBtn').addEventListener('click', () => app.commandReturnToBase());
document.getElementById('emergencyResetBtn').addEventListener('click', () => app.emergencyReset());
document.getElementById('closeModalBtn').addEventListener('click', () => {
    const modal = document.getElementById('stuckModal');
    if (modal) {
        modal.style.display = 'none';
    }
});
