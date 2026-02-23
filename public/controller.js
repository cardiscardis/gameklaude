// ========== MOBILE CONTROLLER ==========
const socket = io();

// DOM
const joinScreen = document.getElementById('join-screen');
const controllerScreen = document.getElementById('controller-screen');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const errorMsg = document.getElementById('error-msg');
const roomLabel = document.getElementById('room-label');
const joystickBase = document.getElementById('joystick-base');
const joystickStick = document.getElementById('joystick-stick');
const btnFire = document.getElementById('btn-fire');
const btnBoost = document.getElementById('btn-boost');

// ---- Join Room ----
joinBtn.addEventListener('click', joinRoom);
roomInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinRoom();
});

function joinRoom() {
    const code = roomInput.value.trim().toUpperCase();
    if (code.length < 4) {
        errorMsg.textContent = 'Please enter a valid room code.';
        return;
    }
    errorMsg.textContent = '';
    socket.emit('join-as-controller', { roomId: code });
}

socket.on('joined-room', (data) => {
    joinScreen.classList.add('hidden');
    controllerScreen.classList.remove('hidden');
    roomLabel.textContent = `ROOM ${data.roomId}`;
    // Lock orientation hint
    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => { });
    }
});

socket.on('error-msg', (data) => {
    errorMsg.textContent = data.message;
});

socket.on('game-disconnected', () => {
    controllerScreen.classList.add('hidden');
    joinScreen.classList.remove('hidden');
    errorMsg.textContent = 'Game disconnected. Reconnect with a new code.';
});

// ---- Joystick ----
let joystickActive = false;
let joystickCenter = { x: 0, y: 0 };
const maxDistance = 55; // max stick travel from center
let emitInterval = null;
let currentJoystickData = { angle: 0, magnitude: 0 };

function getJoystickCenter() {
    const rect = joystickBase.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
    };
}

joystickBase.addEventListener('touchstart', (e) => {
    e.preventDefault();
    joystickActive = true;
    joystickCenter = getJoystickCenter();
    joystickStick.classList.add('active');
    handleJoystickMove(e.touches[0]);

    // Emit at ~30fps
    if (!emitInterval) {
        emitInterval = setInterval(() => {
            if (joystickActive) {
                socket.emit('joystick-input', currentJoystickData);
            }
        }, 33);
    }
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    if (!joystickActive) return;
    e.preventDefault();
    // Find the touch that started on the joystick
    for (let i = 0; i < e.touches.length; i++) {
        handleJoystickMove(e.touches[i]);
        break;
    }
}, { passive: false });

document.addEventListener('touchend', (e) => {
    if (!joystickActive) return;
    // Check if joystick touch is still active
    let stillTouching = false;
    for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        const dx = t.clientX - joystickCenter.x;
        const dy = t.clientY - joystickCenter.y;
        if (Math.sqrt(dx * dx + dy * dy) < 120) {
            stillTouching = true;
            break;
        }
    }
    if (!stillTouching) {
        joystickActive = false;
        joystickStick.classList.remove('active');
        joystickStick.style.transform = 'translate(0px, 0px)';
        currentJoystickData = { angle: 0, magnitude: 0 };
        socket.emit('joystick-input', currentJoystickData);
        if (emitInterval) {
            clearInterval(emitInterval);
            emitInterval = null;
        }
    }
});

function handleJoystickMove(touch) {
    let dx = touch.clientX - joystickCenter.x;
    let dy = touch.clientY - joystickCenter.y;
    let distance = Math.sqrt(dx * dx + dy * dy);

    // Clamp to max distance
    if (distance > maxDistance) {
        dx = (dx / distance) * maxDistance;
        dy = (dy / distance) * maxDistance;
        distance = maxDistance;
    }

    // Move stick visually
    joystickStick.style.transform = `translate(${dx}px, ${dy}px)`;

    // Calculate angle and magnitude (0 to 1)
    const angle = Math.atan2(dy, dx);
    const magnitude = distance / maxDistance;

    currentJoystickData = { angle, magnitude };
}

// ---- Buttons ----
function setupButton(btn, action) {
    btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add('pressed');
        socket.emit('button-action', { action });
        // Haptic feedback
        if (navigator.vibrate) {
            navigator.vibrate(action === 'fire' ? 30 : 60);
        }
    }, { passive: false });

    btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.remove('pressed');
    }, { passive: false });

    btn.addEventListener('touchcancel', () => {
        btn.classList.remove('pressed');
    });
}

setupButton(btnFire, 'fire');
setupButton(btnBoost, 'boost');

// ---- Prevent default behaviors ----
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());

// Auto-focus input
roomInput.focus();
