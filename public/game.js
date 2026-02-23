// ========== SPACE DRIFT — GAME ENGINE ==========
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ----- Sizing -----
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ----- Socket.IO -----
const socket = io();
let controllerConnected = false;

socket.emit('join-as-game');

socket.on('room-created', (data) => {
    document.getElementById('room-code').textContent = data.roomId;
    // Build controller URL
    const url = `${location.protocol}//${location.hostname}:${location.port}/`;
    document.getElementById('controller-url').textContent = url;
});

socket.on('controller-connected', () => {
    controllerConnected = true;
    document.getElementById('ctrl-dot').classList.add('connected');
    document.getElementById('ctrl-label').textContent = 'Controller Connected';
    document.getElementById('overlay').classList.add('hidden');
    const statusDot = document.querySelector('#connection-status .status-dot');
    statusDot.classList.remove('waiting');
    document.getElementById('status-text').textContent = 'Controller connected!';
});

socket.on('controller-disconnected', () => {
    controllerConnected = false;
    document.getElementById('ctrl-dot').classList.remove('connected');
    document.getElementById('ctrl-label').textContent = 'Controller Lost';
});

// Remote joystick input
let remoteInput = { angle: 0, magnitude: 0 };
socket.on('joystick-input', (data) => {
    remoteInput = data;
});

socket.on('button-action', (data) => {
    if (data.action === 'fire') {
        shoot();
    } else if (data.action === 'boost') {
        activateBoost();
    }
});

// ----- Game State -----
let score = 0;
let lives = 3;
let gameOver = false;
let boostActive = false;
let boostTimer = 0;

const ship = {
    x: 0, y: 0,
    vx: 0, vy: 0,
    angle: -Math.PI / 2,
    radius: 18,
    thrust: 0,
    rotationSpeed: 0
};

let bullets = [];
let asteroids = [];
let particles = [];
let stars = [];

// Init stars
for (let i = 0; i < 200; i++) {
    stars.push({
        x: Math.random() * 3000 - 500,
        y: Math.random() * 3000 - 500,
        size: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.6 + 0.2
    });
}

function resetShip() {
    ship.x = canvas.width / 2;
    ship.y = canvas.height / 2;
    ship.vx = 0;
    ship.vy = 0;
    ship.angle = -Math.PI / 2;
}
resetShip();

// Spawn asteroids periodically
function spawnAsteroid() {
    const side = Math.floor(Math.random() * 4);
    let x, y;
    switch (side) {
        case 0: x = -50; y = Math.random() * canvas.height; break;
        case 1: x = canvas.width + 50; y = Math.random() * canvas.height; break;
        case 2: x = Math.random() * canvas.width; y = -50; break;
        case 3: x = Math.random() * canvas.width; y = canvas.height + 50; break;
    }
    const angle = Math.atan2(canvas.height / 2 - y, canvas.width / 2 - x) + (Math.random() - 0.5) * 1.2;
    const speed = Math.random() * 2 + 1;
    const radius = Math.random() * 25 + 15;
    asteroids.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius,
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 0.04,
        vertices: generateAsteroidShape(radius)
    });
}

function generateAsteroidShape(radius) {
    const points = [];
    const numVerts = Math.floor(Math.random() * 5) + 7;
    for (let i = 0; i < numVerts; i++) {
        const angle = (i / numVerts) * Math.PI * 2;
        const r = radius + (Math.random() - 0.5) * radius * 0.5;
        points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    }
    return points;
}

// ----- Keyboard Input -----
const keys = {};
window.addEventListener('keydown', (e) => { keys[e.key] = true; });
window.addEventListener('keyup', (e) => { keys[e.key] = false; });

// ----- Actions -----
function shoot() {
    const speed = 8;
    bullets.push({
        x: ship.x + Math.cos(ship.angle) * 22,
        y: ship.y + Math.sin(ship.angle) * 22,
        vx: Math.cos(ship.angle) * speed + ship.vx * 0.3,
        vy: Math.sin(ship.angle) * speed + ship.vy * 0.3,
        life: 60
    });
}

function activateBoost() {
    if (!boostActive) {
        boostActive = true;
        boostTimer = 90; // frames
    }
}

function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 1;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: Math.random() * 30 + 15,
            maxLife: 45,
            color,
            radius: Math.random() * 3 + 1
        });
    }
}

// ----- Update -----
function update() {
    if (gameOver) return;

    const accel = boostActive ? 0.35 : 0.18;
    const friction = 0.985;
    const maxSpeed = boostActive ? 8 : 5;

    // Keyboard input
    if (keys['ArrowLeft'] || keys['a']) ship.angle -= 0.06;
    if (keys['ArrowRight'] || keys['d']) ship.angle += 0.06;
    if (keys['ArrowUp'] || keys['w']) {
        ship.vx += Math.cos(ship.angle) * accel;
        ship.vy += Math.sin(ship.angle) * accel;
    }
    if (keys[' ']) { keys[' '] = false; shoot(); }

    // Remote joystick
    if (remoteInput.magnitude > 0.1) {
        ship.angle = remoteInput.angle;
        const force = remoteInput.magnitude * accel * 1.5;
        ship.vx += Math.cos(ship.angle) * force;
        ship.vy += Math.sin(ship.angle) * force;
    }

    // Physics
    ship.vx *= friction;
    ship.vy *= friction;
    const speed = Math.sqrt(ship.vx ** 2 + ship.vy ** 2);
    if (speed > maxSpeed) {
        ship.vx = (ship.vx / speed) * maxSpeed;
        ship.vy = (ship.vy / speed) * maxSpeed;
    }
    ship.x += ship.vx;
    ship.y += ship.vy;

    // Wrap around
    if (ship.x < -30) ship.x = canvas.width + 30;
    if (ship.x > canvas.width + 30) ship.x = -30;
    if (ship.y < -30) ship.y = canvas.height + 30;
    if (ship.y > canvas.height + 30) ship.y = -30;

    // Boost timer
    if (boostActive) {
        boostTimer--;
        if (boostTimer <= 0) boostActive = false;
        // Boost trail
        spawnParticles(
            ship.x - Math.cos(ship.angle) * 18,
            ship.y - Math.sin(ship.angle) * 18,
            '#8b5cf6', 2
        );
    }

    // Engine particles
    if (remoteInput.magnitude > 0.1 || keys['ArrowUp'] || keys['w']) {
        spawnParticles(
            ship.x - Math.cos(ship.angle) * 18,
            ship.y - Math.sin(ship.angle) * 18,
            '#00f0ff', 1
        );
    }

    // Bullets
    bullets.forEach((b) => {
        b.x += b.vx;
        b.y += b.vy;
        b.life--;
    });
    bullets = bullets.filter((b) => b.life > 0);

    // Asteroids
    asteroids.forEach((a) => {
        a.x += a.vx;
        a.y += a.vy;
        a.rotation += a.rotSpeed;
    });
    // Remove off-screen asteroids
    asteroids = asteroids.filter((a) => {
        return a.x > -200 && a.x < canvas.width + 200 && a.y > -200 && a.y < canvas.height + 200;
    });

    // Collision: bullets vs asteroids
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
        for (let ai = asteroids.length - 1; ai >= 0; ai--) {
            const b = bullets[bi];
            const a = asteroids[ai];
            if (!b || !a) continue;
            const dist = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
            if (dist < a.radius) {
                spawnParticles(a.x, a.y, '#f472b6', 12);
                score += Math.floor(50 / a.radius * 10);
                // Split into smaller
                if (a.radius > 18) {
                    for (let s = 0; s < 2; s++) {
                        const newR = a.radius * 0.55;
                        const ang = Math.random() * Math.PI * 2;
                        const sp = Math.random() * 2 + 1.5;
                        asteroids.push({
                            x: a.x, y: a.y,
                            vx: Math.cos(ang) * sp,
                            vy: Math.sin(ang) * sp,
                            radius: newR,
                            rotation: 0,
                            rotSpeed: (Math.random() - 0.5) * 0.06,
                            vertices: generateAsteroidShape(newR)
                        });
                    }
                }
                asteroids.splice(ai, 1);
                bullets.splice(bi, 1);
                break;
            }
        }
    }

    // Collision: ship vs asteroids
    for (let ai = asteroids.length - 1; ai >= 0; ai--) {
        const a = asteroids[ai];
        const dist = Math.sqrt((ship.x - a.x) ** 2 + (ship.y - a.y) ** 2);
        if (dist < ship.radius + a.radius * 0.7) {
            spawnParticles(ship.x, ship.y, '#ef4444', 20);
            lives--;
            asteroids.splice(ai, 1);
            if (lives <= 0) {
                gameOver = true;
                setTimeout(() => {
                    score = 0;
                    lives = 3;
                    gameOver = false;
                    asteroids = [];
                    bullets = [];
                    resetShip();
                }, 2500);
            } else {
                resetShip();
            }
            break;
        }
    }

    // Particles
    particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
    });
    particles = particles.filter((p) => p.life > 0);

    // HUD
    document.getElementById('score').textContent = score;
    const heartsArr = [];
    for (let i = 0; i < Math.max(lives, 0); i++) heartsArr.push('♥');
    document.getElementById('lives').textContent = heartsArr.join('');
}

// ----- Render -----
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background gradient
    const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 100, canvas.width / 2, canvas.height / 2, canvas.width);
    grad.addColorStop(0, '#0f0f2e');
    grad.addColorStop(1, '#050510');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Stars
    stars.forEach((s) => {
        ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
        ctx.beginPath();
        ctx.arc(s.x % canvas.width, s.y % canvas.height, s.size, 0, Math.PI * 2);
        ctx.fill();
    });

    // Particles
    particles.forEach((p) => {
        const alpha = p.life / p.maxLife;
        ctx.fillStyle = p.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * alpha, 0, Math.PI * 2);
        ctx.fill();
    });

    // Bullets
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#00f0ff';
    bullets.forEach((b) => {
        ctx.fillStyle = '#00f0ff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.shadowBlur = 0;

    // Asteroids
    asteroids.forEach((a) => {
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.rotation);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1.5;
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.beginPath();
        ctx.moveTo(a.vertices[0].x, a.vertices[0].y);
        for (let i = 1; i < a.vertices.length; i++) {
            ctx.lineTo(a.vertices[i].x, a.vertices[i].y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    });

    // Ship
    if (!gameOver) {
        ctx.save();
        ctx.translate(ship.x, ship.y);
        ctx.rotate(ship.angle);

        // Glow
        ctx.shadowBlur = boostActive ? 25 : 12;
        ctx.shadowColor = boostActive ? '#8b5cf6' : '#00f0ff';

        // Ship body
        ctx.fillStyle = boostActive ? '#c084fc' : '#00f0ff';
        ctx.strokeStyle = boostActive ? '#a855f7' : '#0891b2';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(22, 0);
        ctx.lineTo(-14, -12);
        ctx.lineTo(-8, 0);
        ctx.lineTo(-14, 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.restore();
    }

    // Game Over text
    if (gameOver) {
        ctx.fillStyle = '#ef4444';
        ctx.font = '900 48px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText('DESTROYED', canvas.width / 2, canvas.height / 2 - 10);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '600 16px Inter';
        ctx.fillText('Respawning...', canvas.width / 2, canvas.height / 2 + 30);
    }
}

// ----- Game Loop -----
let spawnTimer = 0;
function loop() {
    update();
    draw();
    spawnTimer++;
    if (spawnTimer % 90 === 0 && asteroids.length < 12) {
        spawnAsteroid();
    }
    requestAnimationFrame(loop);
}

// Start
for (let i = 0; i < 5; i++) spawnAsteroid();
loop();
