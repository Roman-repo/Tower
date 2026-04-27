// Конфигурация игры
// Phase 3: Добавлены снайперская башня, быстрые враги и ландшафт
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Состояние игры
const gameState = {
    lives: 10,
    money: 100,
    wave: 1,
    enemies: [],
    towers: [],
    projectiles: [],
    particles: [],
    selectedTowerType: null,
    gameOver: false,
    isPaused: false, // Флаг паузы
    frameCount: 0,
    spawnTimer: 0,
    enemiesToSpawn: 0,
    spawnInterval: 60, // кадров между спавном врагов
    waveInProgress: false, // Идет ли сейчас спавн врагов
    currentWaveEnemies: [] // План врагов на текущую волну
};

// Типы башен
const TOWER_TYPES = {
    basic: { name: 'Башня', cost: 50, range: 150, damage: 20, cooldown: 40, color: '#3498db', projectileSpeed: 8 },
    fast: { name: 'Скорострел', cost: 120, range: 100, damage: 8, cooldown: 10, color: '#2ecc71', projectileSpeed: 12 },
    sniper: { name: 'Снайпер', cost: 200, range: 300, damage: 100, cooldown: 120, color: '#e74c3c', projectileSpeed: 15 }
};

// Путь врагов (waypoints)
const waypoints = [
    { x: 0, y: 100 },
    { x: 200, y: 100 },
    { x: 200, y: 400 },
    { x: 500, y: 400 },
    { x: 500, y: 200 },
    { x: 700, y: 200 },
    { x: 700, y: 500 },
    { x: 800, y: 500 } // Конец пути
];

// Типы врагов
const ENEMY_TYPES = {
    normal: { name: 'Обычный', color: '#e74c3c', speedMod: 1.0, healthMod: 1.0, reward: 15, radius: 15 },
    fast: { name: 'Быстрый', color: '#f1c40f', speedMod: 1.8, healthMod: 0.6, reward: 20, radius: 12 },
    tank: { name: 'Танк', color: '#8e44ad', speedMod: 0.6, healthMod: 2.5, reward: 30, radius: 20 },
    boss: { name: 'БОСС', color: '#c0392b', speedMod: 0.4, healthMod: 5.0, reward: 100, radius: 30 }
};

// Класс Врага
class Enemy {
    constructor(wave, typeKey = 'normal') {
        this.wpIndex = 0;
        this.x = waypoints[0].x;
        this.y = waypoints[0].y;
        
        const typeStats = ENEMY_TYPES[typeKey];
        this.typeKey = typeKey;
        this.radius = typeStats.radius;
        this.color = typeStats.color;
        
        // Сложность растет с волной
        const difficultyMult = 1 + (wave * 0.15);
        
        this.speed = (1.5 * typeStats.speedMod) + (wave * 0.05);
        this.maxHealth = Math.floor((50 * typeStats.healthMod) * difficultyMult);
        this.health = this.maxHealth;
        this.frozen = 0;
        this.reward = Math.floor(typeStats.reward * (1 + wave * 0.1));
    }

    update() {
        if (this.frozen > 0) this.frozen--;

        const target = waypoints[this.wpIndex + 1];
        if (!target) return; // Достиг конца

        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.hypot(dx, dy);
        
        let currentSpeed = this.speed;
        if (this.frozen > 0) currentSpeed *= 0.5; // Замедление

        if (dist < currentSpeed) {
            this.x = target.x;
            this.y = target.y;
            this.wpIndex++;
            if (this.wpIndex >= waypoints.length - 1) {
                this.reachedEnd();
            }
        } else {
            this.x += (dx / dist) * currentSpeed;
            this.y += (dy / dist) * currentSpeed;
        }
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Обводка для босса
        if (this.typeKey === 'boss') {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        
        // Полоска здоровья
        const hpPercent = this.health / this.maxHealth;
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x - 15, this.y - 25, 30, 4);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(this.x - 15, this.y - 25, 30 * hpPercent, 4);
        
        // Эффект заморозки
        if (this.frozen > 0) {
            ctx.strokeStyle = '#3498db';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 3, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    reachedEnd() {
        this.health = 0; // Удалить врага
        gameState.lives--;
        updateUI();
        if (gameState.lives <= 0) endGame();
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            gameState.money += this.reward;
            createParticles(this.x, this.y, this.color);
            updateUI();
        }
    }
}

// Класс Башни
class Tower {
    constructor(x, y, typeKey) {
        this.x = x;
        this.y = y;
        this.typeKey = typeKey;
        const stats = TOWER_TYPES[typeKey];
        this.range = stats.range;
        this.damage = stats.damage;
        this.cooldownMax = stats.cooldown;
        this.cooldown = 0;
        this.color = stats.color;
        this.projectileSpeed = stats.projectileSpeed;
        this.angle = 0;
    }

    update() {
        if (this.cooldown > 0) this.cooldown--;

        // Поиск цели
        if (this.cooldown <= 0) {
            const target = this.findTarget();
            if (target) {
                this.shoot(target);
                this.cooldown = this.cooldownMax;
            }
        }
    }

    findTarget() {
        for (const enemy of gameState.enemies) {
            const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
            if (dist <= this.range) {
                return enemy;
            }
        }
        return null;
    }

    shoot(target) {
        gameState.projectiles.push(new Projectile(this.x, this.y, target, this.damage, this.projectileSpeed, this.typeKey));
    }

    draw() {
        // Основание
        ctx.fillStyle = '#555';
        ctx.fillRect(this.x - 20, this.y - 20, 40, 40);
        
        // Пушка/Верх
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 15, 0, Math.PI * 2);
        ctx.fill();
        
        // Индикатор перезарядки
        if (this.cooldown > 0) {
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 18, -Math.PI/2, (-Math.PI/2) + (Math.PI*2 * (1 - this.cooldown/this.cooldownMax)));
            ctx.stroke();
        }
    }
}

// Класс Снаряда
class Projectile {
    constructor(x, y, target, damage, speed, typeKey) {
        this.x = x;
        this.y = y;
        this.target = target;
        this.damage = damage;
        this.speed = speed;
        this.active = true;
        this.typeKey = typeKey;
        
        // Предсказание движения (стреляем туда, где враг сейчас)
        const angle = Math.atan2(target.y - y, target.x - x);
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        // Проверка попадания (простая дистанция до цели)
        if (this.target.health > 0) {
            const dist = Math.hypot(this.target.x - this.x, this.target.y - this.y);
            if (dist < this.target.radius + 5) {
                this.target.takeDamage(this.damage);
                this.active = false;
                createParticles(this.x, this.y, '#fff', 3);
            }
        } else {
            // Цель мертва, снаряд исчезает или летит дальше (тут исчезает для простоты)
            this.active = false;
        }

        // Удаление если улетел за карту
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
            this.active = false;
        }
    }

    draw() {
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Частицы (эффекты)
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 2 + 1;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 1.0;
        this.decay = Math.random() * 0.05 + 0.02;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
    }
    draw() {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, 3, 3);
        ctx.globalAlpha = 1.0;
    }
}

function createParticles(x, y, color, count = 8) {
    for(let i=0; i<count; i++) {
        gameState.particles.push(new Particle(x, y, color));
    }
}

// Управление мышью
canvas.addEventListener('click', (e) => {
    if (!gameState.selectedTowerType || gameState.gameOver) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    placeTower(x, y);
});

// Отрисовка при наведении (превью)
canvas.addEventListener('mousemove', (e) => {
    if (!gameState.selectedTowerType) return;
    // Можно добавить подсветку зоны установки, но пока опустим для простоты
});

function selectTowerType(type) {
    if (gameState.money >= TOWER_TYPES[type].cost) {
        gameState.selectedTowerType = type;
        highlightButton(type);
    } else {
        alert("Недостаточно денег!");
    }
}

function cancelSelection() {
    gameState.selectedTowerType = null;
    clearHighlights();
}

function highlightButton(type) {
    clearHighlights();
    const btnId = type === 'basic' ? 'btn-tower' : type === 'fast' ? 'btn-fast' : 'btn-sniper';
    document.getElementById(btnId).style.background = '#27ae60';
}

function clearHighlights() {
    ['btn-tower', 'btn-fast', 'btn-sniper'].forEach(id => {
        document.getElementById(id).style.background = '#444';
    });
}

function placeTower(x, y) {
    const towerData = TOWER_TYPES[gameState.selectedTowerType];
    
    // Проверка денег
    if (gameState.money < towerData.cost) {
        cancelSelection();
        return;
    }

    // Проверка коллизий с путем (упрощенно: расстояние до линий пути)
    // Для простоты проверим только дистанцию до вейпоинтов и других башен
    let valid = true;
    
    // Не ставить на другие башни
    for (const t of gameState.towers) {
        if (Math.hypot(t.x - x, t.y - y) < 40) valid = false;
    }

    // Не ставить слишком близко к пути (проверка расстояния до отрезков)
    for (let i = 0; i < waypoints.length - 1; i++) {
        const p1 = waypoints[i];
        const p2 = waypoints[i+1];
        const dist = distToSegment({x, y}, p1, p2);
        if (dist < 30) valid = false; 
    }

    if (valid) {
        gameState.money -= towerData.cost;
        gameState.towers.push(new Tower(x, y, gameState.selectedTowerType));
        createParticles(x, y, '#fff', 10);
        updateUI();
        cancelSelection();
    } else {
        // Эффект ошибки (красная вспышка?)
        createParticles(x, y, '#f00', 5);
    }
}

// Математика: расстояние от точки до отрезка
function distToSegment(p, v, w) {
    const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

// Генерация состава волны (разные типы врагов)
function generateWaveComposition(waveNum) {
    const composition = [];
    const totalEnemies = 5 + Math.floor(waveNum * 1.5);
    
    // Босс каждые 10 волн
    if (waveNum % 10 === 0 && waveNum > 0) {
        composition.push({ type: 'boss', count: 1 });
    }
    
    // Танки появляются с 5 волны
    if (waveNum >= 5) {
        const tankCount = Math.floor(totalEnemies * 0.2);
        if (tankCount > 0) composition.push({ type: 'tank', count: tankCount });
    }
    
    // Быстрые враги с 3 волны
    if (waveNum >= 3) {
        const fastCount = Math.floor(totalEnemies * 0.3);
        if (fastCount > 0) composition.push({ type: 'fast', count: fastCount });
    }
    
    // Остальные - обычные
    const usedCount = composition.reduce((sum, item) => sum + item.count, 0);
    const normalCount = totalEnemies - usedCount;
    if (normalCount > 0) {
        composition.push({ type: 'normal', count: normalCount });
    }
    
    // Перемешиваем порядок спавна
    const spawnQueue = [];
    composition.forEach(item => {
        for (let i = 0; i < item.count; i++) {
            spawnQueue.push(item.type);
        }
    });
    
    // Тасуем массив (алгоритм Фишера-Йетса)
    for (let i = spawnQueue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [spawnQueue[i], spawnQueue[j]] = [spawnQueue[j], spawnQueue[i]];
    }
    
    return spawnQueue;
}

function startWave() {
    if (gameState.waveInProgress) return;
    
    gameState.currentWaveEnemies = generateWaveComposition(gameState.wave);
    gameState.enemiesToSpawn = gameState.currentWaveEnemies.length;
    gameState.spawnTimer = 0;
    gameState.waveInProgress = true;
    
    // Обновляем UI для отображения "Волна началась"
    updateUI();
}

function update() {
    if (gameState.gameOver || gameState.isPaused) return;

    gameState.frameCount++;

    // Логика спавна врагов
    if (gameState.enemiesToSpawn > 0) {
        gameState.spawnTimer++;
        if (gameState.spawnTimer >= gameState.spawnInterval) {
            const nextEnemyType = gameState.currentWaveEnemies.shift();
            gameState.enemies.push(new Enemy(gameState.wave, nextEnemyType));
            gameState.enemiesToSpawn--;
            gameState.spawnTimer = 0;
        }
    } else if (gameState.enemies.length === 0 && gameState.enemiesToSpawn === 0) {
        // Волна закончена
        gameState.waveInProgress = false;
        gameState.wave++;
        updateUI();
        
        // Автоматический старт следующей волны через паузу
        setTimeout(() => {
            if (!gameState.gameOver && !gameState.isPaused) {
                startWave();
            }
        }, 2000);
    }

    // Обновление сущностей
    gameState.enemies.forEach(e => e.update());
    gameState.enemies = gameState.enemies.filter(e => e.health > 0);

    gameState.towers.forEach(t => t.update());

    gameState.projectiles.forEach(p => p.update());
    gameState.projectiles = gameState.projectiles.filter(p => p.active);

    gameState.particles.forEach(p => p.update());
    gameState.particles = gameState.particles.filter(p => p.life > 0);
}

function drawMap() {
    // Очистка
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Рисуем путь
    ctx.strokeStyle = '#d3b88c'; // Цвет дороги
    ctx.lineWidth = 40;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(waypoints[0].x, waypoints[0].y);
    for (let i = 1; i < waypoints.length; i++) {
        ctx.lineTo(waypoints[i].x, waypoints[i].y);
    }
    ctx.stroke();
    
    // Тонкая линия по центру пути
    ctx.strokeStyle = '#c4a67a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // База (финиш)
    const lastWp = waypoints[waypoints.length-1];
    ctx.fillStyle = '#34495e';
    ctx.fillRect(lastWp.x - 20, lastWp.y - 20, 40, 40);
    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.fillText("BASE", lastWp.x - 15, lastWp.y + 4);
}

function draw() {
    drawMap();

    gameState.towers.forEach(t => t.draw());
    gameState.enemies.forEach(e => e.draw());
    gameState.projectiles.forEach(p => p.draw());
    gameState.particles.forEach(p => p.draw());

    // Рисуем радиус и превью при выборе башни
    if (gameState.selectedTowerType) {
        // Нужно получить координаты мыши, но в цикле draw их нет напрямую. 
        // Для простоты просто рисуем курсор-призрак не будем, 
        // так как event listener мыши не сохраняет глобальные координаты в этом примере.
        // (Можно добавить глобальную переменную mousePos в move event)
    }
}

// Глобальная переменная для мыши для отрисовки превью
let mousePos = { x: 0, y: 0 };
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mousePos.x = e.clientX - rect.left;
    mousePos.y = e.clientY - rect.top;
});

function drawPreview() {
    if (gameState.selectedTowerType) {
        const stats = TOWER_TYPES[gameState.selectedTowerType];
        
        // Радиус
        ctx.beginPath();
        ctx.arc(mousePos.x, mousePos.y, stats.range, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.stroke();

        // Башня-призрак
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = stats.color;
        ctx.beginPath();
        ctx.arc(mousePos.x, mousePos.y, 15, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

function gameLoop() {
    update();
    draw();
    drawPreview(); // Поверх всего
    requestAnimationFrame(gameLoop);
}

function updateUI() {
    document.getElementById('lives-display').innerText = gameState.lives;
    document.getElementById('money-display').innerText = gameState.money;
    document.getElementById('wave-display').innerText = gameState.wave;
    
    // Обновление статуса волны
    const waveStatusEl = document.getElementById('wave-status');
    if (waveStatusEl) {
        if (gameState.waveInProgress) {
            waveStatusEl.innerText = `Врагов: ${gameState.enemies.length + gameState.enemiesToSpawn}`;
        } else {
            waveStatusEl.innerText = 'Ожидание...';
        }
    }
}

function togglePause() {
    gameState.isPaused = !gameState.isPaused;
    
    const pauseBtn = document.getElementById('pause-btn');
    const pauseOverlay = document.getElementById('pause-overlay');
    
    if (gameState.isPaused) {
        pauseBtn.innerText = '▶ Продолжить';
        if (pauseOverlay) pauseOverlay.style.display = 'flex';
    } else {
        pauseBtn.innerText = '⏸ Пауза';
        if (pauseOverlay) pauseOverlay.style.display = 'none';
    }
}

function endGame() {
    gameState.gameOver = true;
    document.getElementById('final-wave').innerText = gameState.wave;
    document.getElementById('game-over').style.display = 'block';
}

// Обработка клавиши Pause (Пробел или Esc)
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Escape') {
        if (!gameState.gameOver) {
            togglePause();
        }
    }
});

// Старт
startWave();
updateUI();
gameLoop();
