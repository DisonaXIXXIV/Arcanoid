// Арканоид на p5.js
// Управление: стрелки влево/вправо — движение платформы, пробел — запуск мяча,
// стрелки вверх/вниз + Enter — навигация по меню, Esc — пауза.

const W = 640;
const H = 480;

// Состояния игры
const STATE = {
  MENU: 'menu',
  PLAY: 'play',
  PAUSE: 'pause',
  GAMEOVER: 'gameover',
  WIN: 'win',
  VICTORY: 'victory',
  EXIT: 'exit',
};

let state = STATE.MENU;
let menuIndex = 0;
let menuSamples = {}; // образцы кирпичей для легенды в меню (создаются один раз)
const menuItems = ['Начать', 'Выйти'];

let score = 0;
let lives = 3;
let level = 1;

let paddle, ball, bricks;

const BRICK_COLS = 10;
const BRICK_W = 56;
const BRICK_H = 20;
const BRICK_GAP = 6;
const BRICK_TOP = 70;
const ROW_COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6'];
const ROW_POINTS = [60, 50, 40, 30, 20, 10];

// Типы кирпичей: сколько попаданий нужно, чтобы разбить
const BRICK_TYPES = {
  NORMAL: { label: 'Обычный', hp: 1 },
  STONE:  { label: 'Каменный', hp: 2 },
  STEEL:  { label: 'Стальной', hp: 3 },
};

// ---------- Уровни ----------
// layout: строки по BRICK_COLS символов, 'X' — кирпич, '.' — пусто
// weights: вероятности типов кирпичей на этом уровне
const LEVELS = [
  { // 1 — 20 кирпичей, только обычные
    layout: [
      '..XXXXXX..',
      '.XXXXXXXX.',
      '..XXXXXX..',
    ],
    weights: { NORMAL: 1 },
  },
  { // 2 — 30 кирпичей, появляются каменные
    layout: [
      '.XXXXXXXX.',
      'XXXXXXXXXX',
      '.XXXXXXXX.',
      '..XX..XX..',
    ],
    weights: { NORMAL: 0.8, STONE: 0.2 },
  },
  { // 3 — 40 кирпичей, появляются стальные
    layout: [
      'XXXXXXXXXX',
      'XXXXXXXXXX',
      'XX.XXXX.XX',
      'XX.XXXX.XX',
      '..XX..XX..',
    ],
    weights: { NORMAL: 0.6, STONE: 0.3, STEEL: 0.1 },
  },
  { // 4 — 50 кирпичей
    layout: [
      'XX.XXXX.XX',
      'XXXXXXXXXX',
      'XXXXXXXXXX',
      'XXXXXXXXXX',
      'XX.XXXX.XX',
      '.X.X..X.X.',
    ],
    weights: { NORMAL: 0.5, STONE: 0.3, STEEL: 0.2 },
  },
  { // 5 — 60 кирпичей, полная стена
    layout: [
      'XXXXXXXXXX',
      'XXXXXXXXXX',
      'XXXXXXXXXX',
      'XXXXXXXXXX',
      'XXXXXXXXXX',
      'XXXXXXXXXX',
    ],
    weights: { NORMAL: 0.4, STONE: 0.35, STEEL: 0.25 },
  },
];

// ---------- Бонусы ----------

const PADDLE_W = 100;
const PADDLE_W_WIDE = 160;
const POWERUP_CHANCE = 0.25; // шанс выпадения из кирпича
const POWERUP_FALL_SPEED = 2.5;
const POWERUP_SIZE = 26;

const POWERUPS = {
  SPEED:  { label: 'Ускорение x2', letter: 'S', color: '#e74c3c', duration: 10000, musicLayer: 'arp' },
  WIDE:   { label: 'Широкая платформа', letter: 'W', color: '#3498db', duration: 20000, musicLayer: 'pad' },
  DOUBLE: { label: 'Очки x2', letter: '2', color: '#f1c40f', duration: 10000, musicLayer: 'bells' },
};

let fallingPowerups = []; // капсулы, которые ещё падают
let activeEffects = {};   // тип -> оставшееся время (мс)

function setup() {
  createCanvas(W, H);
  textFont('monospace');
  resetGame();
}

function resetGame() {
  score = 0;
  lives = 3;
  level = 1;
  startLevel();
}

function startLevel() {
  paddle = {
    w: PADDLE_W,
    h: 14,
    x: W / 2 - PADDLE_W / 2,
    y: H - 40,
    speed: 7,
  };
  clearEffects();
  resetBall();
  buildBricks();
}

function resetBall() {
  ball = {
    r: 7,
    x: paddle.x + paddle.w / 2,
    y: paddle.y - 8,
    vx: 0,
    vy: 0,
    speed: 4 + level * 0.5, // базовая скорость без бонусов
    launched: false,
  };
}

function buildBricks() {
  bricks = [];
  const totalW = BRICK_COLS * BRICK_W + (BRICK_COLS - 1) * BRICK_GAP;
  const startX = (W - totalW) / 2;
  const lvl = LEVELS[level - 1];
  for (let r = 0; r < lvl.layout.length; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      if (lvl.layout[r][c] !== 'X') continue;
      bricks.push(makeBrick(
        startX + c * (BRICK_W + BRICK_GAP),
        BRICK_TOP + r * (BRICK_H + BRICK_GAP),
        ROW_COLORS[r % ROW_COLORS.length],
        ROW_POINTS[r % ROW_POINTS.length],
        randomBrickType(lvl.weights)
      ));
    }
  }
}

function randomBrickType(weights) {
  let roll = random();
  for (const [type, w] of Object.entries(weights)) {
    roll -= w;
    if (roll <= 0) return type;
  }
  return 'NORMAL';
}

function makeBrick(x, y, color, points, type) {
  const hp = BRICK_TYPES[type].hp;
  const b = {
    x, y, w: BRICK_W, h: BRICK_H,
    color, points, type,
    hp, maxHp: hp,
    alive: true,
    cracks: [],   // массив трещин, каждая — ломаная из точек {x, y} (относительно кирпича)
    texture: [],  // пятна для каменной текстуры
  };
  if (type === 'STONE') {
    // Случайные тёмные/светлые пятна, генерируются один раз
    for (let i = 0; i < 7; i++) {
      b.texture.push({
        x: random(4, b.w - 4),
        y: random(3, b.h - 3),
        rx: random(3, 8),
        ry: random(2, 4),
        dark: random() < 0.7,
      });
    }
  }
  return b;
}

// Добавляет новую трещину: ломаная от края кирпича внутрь
function addCrack(b) {
  const pts = [];
  // Стартуем с случайной стороны
  const side = floor(random(4));
  let x, y;
  if (side === 0) { x = random(b.w); y = 0; }
  else if (side === 1) { x = b.w; y = random(b.h); }
  else if (side === 2) { x = random(b.w); y = b.h; }
  else { x = 0; y = random(b.h); }
  pts.push({ x, y });

  // Направление к центру с шумом
  const cx = b.w / 2 + random(-b.w / 4, b.w / 4);
  const cy = b.h / 2 + random(-b.h / 4, b.h / 4);
  const segments = floor(random(3, 6));
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const nx = lerp(x, cx, t) + random(-5, 5);
    const ny = lerp(y, cy, t) + random(-3, 3);
    pts.push({ x: constrain(nx, 0, b.w), y: constrain(ny, 0, b.h) });
  }
  // Небольшое ответвление
  if (random() < 0.6 && pts.length >= 3) {
    const from = pts[floor(random(1, pts.length - 1))];
    pts.branch = [
      { x: from.x, y: from.y },
      { x: constrain(from.x + random(-10, 10), 0, b.w), y: constrain(from.y + random(-6, 6), 0, b.h) },
    ];
  }
  b.cracks.push(pts);
}

// Попадание по кирпичу; возвращает true, если кирпич разбит
function hitBrick(b) {
  b.hp--;
  if (b.hp <= 0) {
    b.alive = false;
    return true;
  }
  addCrack(b);
  return false;
}

// ---------- Логика бонусов ----------

function isActive(type) {
  return activeEffects[type] > 0;
}

// Текущая скорость мяча с учётом бонуса
function ballSpeed() {
  return ball.speed * (isActive('SPEED') ? 2 : 1);
}

function clearEffects() {
  fallingPowerups = [];
  for (const type of Object.keys(activeEffects)) deactivate(type);
  activeEffects = {};
}

function spawnPowerup(brick) {
  const types = Object.keys(POWERUPS);
  fallingPowerups.push({
    type: random(types),
    x: brick.x + brick.w / 2,
    y: brick.y + brick.h / 2,
  });
}

function activate(type) {
  const wasActive = isActive(type);
  activeEffects[type] = POWERUPS[type].duration;
  if (wasActive) return; // просто обновили таймер
  Music.setLayer(POWERUPS[type].musicLayer, true);

  switch (type) {
    case 'SPEED':
      ball.vx *= 2;
      ball.vy *= 2;
      break;
    case 'WIDE': {
      const cx = paddle.x + paddle.w / 2;
      paddle.w = PADDLE_W_WIDE;
      paddle.x = constrain(cx - paddle.w / 2, 0, W - paddle.w);
      break;
    }
  }
}

function deactivate(type) {
  Music.setLayer(POWERUPS[type].musicLayer, false);
  switch (type) {
    case 'SPEED':
      ball.vx /= 2;
      ball.vy /= 2;
      break;
    case 'WIDE': {
      const cx = paddle.x + paddle.w / 2;
      paddle.w = PADDLE_W;
      paddle.x = constrain(cx - paddle.w / 2, 0, W - paddle.w);
      break;
    }
  }
}

function updatePowerups() {
  // Таймеры активных эффектов (тикают только во время игры)
  for (const type of Object.keys(activeEffects)) {
    activeEffects[type] -= deltaTime;
    if (activeEffects[type] <= 0) {
      delete activeEffects[type];
      deactivate(type);
      Sfx.play('powerupEnd');
    }
  }

  // Падающие капсулы
  for (let i = fallingPowerups.length - 1; i >= 0; i--) {
    const p = fallingPowerups[i];
    p.y += POWERUP_FALL_SPEED;

    const caught =
      p.y + POWERUP_SIZE / 2 >= paddle.y &&
      p.y - POWERUP_SIZE / 2 <= paddle.y + paddle.h &&
      p.x + POWERUP_SIZE / 2 >= paddle.x &&
      p.x - POWERUP_SIZE / 2 <= paddle.x + paddle.w;

    if (caught) {
      activate(p.type);
      Sfx.play('powerup');
      fallingPowerups.splice(i, 1);
    } else if (p.y - POWERUP_SIZE / 2 > H) {
      fallingPowerups.splice(i, 1);
    }
  }
}

// ---------- Основной цикл ----------

let lastMusicState = null;

// Реакция музыки на смену состояния игры
function updateMusic() {
  Music.tick();
  if (state === lastMusicState) return;
  lastMusicState = state;
  switch (state) {
    case STATE.MENU:
      Music.resetLayers();
      Music.setDuck(false);
      Music.start();
      break;
    case STATE.PLAY:
      Music.setDuck(false);
      Music.start();
      break;
    case STATE.PAUSE:
    case STATE.WIN:
      Music.setDuck(true);
      break;
    case STATE.GAMEOVER:
    case STATE.VICTORY:
    case STATE.EXIT:
      Music.stop();
      break;
  }
}

function draw() {
  background(17);
  updateMusic();
  switch (state) {
    case STATE.MENU: drawMenu(); break;
    case STATE.PLAY: updateGame(); drawGame(); break;
    case STATE.PAUSE: drawGame(); drawOverlay('ПАУЗА', 'Esc — продолжить, Enter — в меню'); break;
    case STATE.GAMEOVER: drawGame(); drawOverlay('ИГРА ОКОНЧЕНА', `Очки: ${score}   Enter — в меню`); break;
    case STATE.WIN: drawGame(); drawOverlay('УРОВЕНЬ ПРОЙДЕН!', `Очки: ${score}   Enter — уровень ${level + 1}`); break;
    case STATE.VICTORY: drawGame(); drawOverlay('ПОБЕДА!', `Все ${LEVELS.length} уровней пройдены. Очки: ${score}   Enter — в меню`); break;
    case STATE.EXIT: drawExit(); break;
  }
}

// ---------- Меню ----------

function drawMenu() {
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(48);
  text('АРКАНОИД', W / 2, 80);

  textSize(24);
  for (let i = 0; i < menuItems.length; i++) {
    const selected = i === menuIndex;
    fill(selected ? '#f1c40f' : 180);
    text((selected ? '> ' : '  ') + menuItems[i] + (selected ? ' <' : '  '), W / 2, 160 + i * 42);
  }

  // Легенда бонусов (слева)
  textSize(14);
  fill(150);
  text('Бонусы:', W / 4, 265);
  const types = Object.keys(POWERUPS);
  for (let i = 0; i < types.length; i++) {
    const p = POWERUPS[types[i]];
    const y = 293 + i * 26;
    drawCapsule(W / 4 - 110, y, types[i]);
    fill(150);
    textSize(13);
    textAlign(LEFT, CENTER);
    text(`${p.label} — ${p.duration / 1000} c`, W / 4 - 90, y);
    textAlign(CENTER, CENTER);
  }

  // Легенда кирпичей (справа)
  textSize(14);
  fill(150);
  text('Кирпичи:', W * 3 / 4, 265);
  const btypes = Object.keys(BRICK_TYPES);
  for (let i = 0; i < btypes.length; i++) {
    const def = BRICK_TYPES[btypes[i]];
    const y = 293 + i * 26;
    if (!menuSamples[btypes[i]]) menuSamples[btypes[i]] = makeBrick(W * 3 / 4 - 100, y - BRICK_H / 2, '#3498db', 0, btypes[i]);
    drawBrick(menuSamples[btypes[i]]);
    noStroke();
    fill(150);
    textSize(13);
    textAlign(LEFT, CENTER);
    text(`${def.label} — ${def.hp} уд.`, W * 3 / 4 - 36, y);
    textAlign(CENTER, CENTER);
  }

  fill(120);
  textSize(14);
  text('← → — движение   Пробел — запуск   Esc — пауза   M — звук', W / 2, H - 30);
}

function drawExit() {
  textAlign(CENTER, CENTER);
  fill(200);
  textSize(28);
  text('Спасибо за игру!', W / 2, H / 2 - 20);
  textSize(16);
  fill(120);
  text('Enter — вернуться в меню', W / 2, H / 2 + 24);
}

// ---------- Игра ----------

function updateGame() {
  // Платформа
  if (keyIsDown(LEFT_ARROW)) paddle.x -= paddle.speed;
  if (keyIsDown(RIGHT_ARROW)) paddle.x += paddle.speed;
  paddle.x = constrain(paddle.x, 0, W - paddle.w);

  updatePowerups();

  // Мяч на платформе до запуска
  if (!ball.launched) {
    ball.x = paddle.x + paddle.w / 2;
    ball.y = paddle.y - ball.r - 1;
    return;
  }

  ball.x += ball.vx;
  ball.y += ball.vy;

  // Стены
  if (ball.x - ball.r <= 0) { ball.x = ball.r; ball.vx = abs(ball.vx); Sfx.play('wall'); }
  if (ball.x + ball.r >= W) { ball.x = W - ball.r; ball.vx = -abs(ball.vx); Sfx.play('wall'); }
  if (ball.y - ball.r <= 0) { ball.y = ball.r; ball.vy = abs(ball.vy); Sfx.play('wall'); }

  // Платформа
  if (
    ball.vy > 0 &&
    ball.y + ball.r >= paddle.y &&
    ball.y - ball.r <= paddle.y + paddle.h &&
    ball.x >= paddle.x &&
    ball.x <= paddle.x + paddle.w
  ) {
    // Угол отскока зависит от точки удара
    const hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2); // -1..1
    const angle = hit * radians(60);
    const s = ballSpeed();
    ball.vx = s * sin(angle);
    ball.vy = -s * cos(angle);
    ball.y = paddle.y - ball.r - 1;
    Sfx.play('paddle');
  }

  // Кирпичи
  for (const b of bricks) {
    if (!b.alive) continue;
    if (
      ball.x + ball.r > b.x &&
      ball.x - ball.r < b.x + b.w &&
      ball.y + ball.r > b.y &&
      ball.y - ball.r < b.y + b.h
    ) {
      if (hitBrick(b)) {
        // Прочные кирпичи дают больше очков
        score += b.points * b.maxHp * (isActive('DOUBLE') ? 2 : 1);
        if (random() < POWERUP_CHANCE) spawnPowerup(b);
        Sfx.play({ NORMAL: 'brickNormalBreak', STONE: 'brickStoneBreak', STEEL: 'brickSteelBreak' }[b.type]);
      } else {
        Sfx.play({ STONE: 'brickStoneHit', STEEL: 'brickSteelHit' }[b.type]);
      }

      // Определяем сторону удара по глубине проникновения
      const overlapLeft = ball.x + ball.r - b.x;
      const overlapRight = b.x + b.w - (ball.x - ball.r);
      const overlapTop = ball.y + ball.r - b.y;
      const overlapBottom = b.y + b.h - (ball.y - ball.r);
      const minX = min(overlapLeft, overlapRight);
      const minY = min(overlapTop, overlapBottom);
      if (minX < minY) ball.vx = -ball.vx;
      else ball.vy = -ball.vy;
      break;
    }
  }

  // Победа
  if (bricks.every(b => !b.alive)) {
    state = level >= LEVELS.length ? STATE.VICTORY : STATE.WIN;
    Sfx.play(state === STATE.VICTORY ? 'victory' : 'levelWin');
    return;
  }

  // Потеря мяча
  if (ball.y - ball.r > H) {
    lives--;
    if (lives <= 0) {
      state = STATE.GAMEOVER;
      Sfx.play('gameOver');
    } else {
      clearEffects();
      resetBall();
      Sfx.play('loseLife');
    }
  }
}

function launchBall() {
  if (ball.launched) return;
  ball.launched = true;
  Sfx.play('launch');
  const angle = random(-PI / 6, PI / 6);
  const s = ballSpeed();
  ball.vx = s * sin(angle);
  ball.vy = -s * cos(angle);
}

function drawCapsule(x, y, type) {
  const p = POWERUPS[type];
  noStroke();
  fill(p.color);
  rect(x - POWERUP_SIZE / 2, y - POWERUP_SIZE / 2, POWERUP_SIZE, POWERUP_SIZE, 6);
  fill(17);
  textSize(15);
  textAlign(CENTER, CENTER);
  text(p.letter, x, y + 1);
}

function drawBrick(b) {
  push();
  translate(b.x, b.y);

  // Основной цвет — общий для всех типов
  noStroke();
  fill(b.color);
  rect(0, 0, b.w, b.h, 3);

  if (b.type === 'STONE') {
    // Шероховатая каменная текстура: пятна поверх основного цвета
    for (const t of b.texture) {
      fill(t.dark ? color(0, 0, 0, 55) : color(255, 255, 255, 45));
      ellipse(t.x, t.y, t.rx * 2, t.ry * 2);
    }
    // Грубая тёмная кромка
    noFill();
    stroke(0, 0, 0, 90);
    strokeWeight(2);
    rect(1, 1, b.w - 2, b.h - 2, 3);
  } else if (b.type === 'STEEL') {
    // Металлический блик — светлая диагональная полоса
    noStroke();
    fill(255, 255, 255, 70);
    beginShape();
    vertex(b.w * 0.15, 0);
    vertex(b.w * 0.45, 0);
    vertex(b.w * 0.30, b.h);
    vertex(b.w * 0.0, b.h);
    endShape(CLOSE);
    fill(255, 255, 255, 35);
    beginShape();
    vertex(b.w * 0.55, 0);
    vertex(b.w * 0.65, 0);
    vertex(b.w * 0.50, b.h);
    vertex(b.w * 0.40, b.h);
    endShape(CLOSE);
    // Фаска: светлый верх/лево, тёмный низ/право
    strokeWeight(2);
    stroke(255, 255, 255, 110);
    line(2, 1.5, b.w - 2, 1.5);
    line(1.5, 2, 1.5, b.h - 2);
    stroke(0, 0, 0, 120);
    line(2, b.h - 1.5, b.w - 2, b.h - 1.5);
    line(b.w - 1.5, 2, b.w - 1.5, b.h - 2);
    // Заклёпки по углам
    noStroke();
    for (const [rx, ry] of [[5, 5], [b.w - 5, 5], [5, b.h - 5], [b.w - 5, b.h - 5]]) {
      fill(0, 0, 0, 110);
      circle(rx + 0.7, ry + 0.7, 4);
      fill(255, 255, 255, 160);
      circle(rx, ry, 3);
    }
  }

  // Трещины: тёмная линия + светлая подсветка рядом для объёма
  if (b.cracks.length > 0) {
    noFill();
    for (const crack of b.cracks) {
      for (const [col, weight, off] of [[color(255, 255, 255, 70), 1.5, 0.8], [color(0, 0, 0, 200), 1.5, 0]]) {
        stroke(col);
        strokeWeight(weight);
        beginShape();
        for (const p of crack) vertex(p.x + off, p.y + off);
        endShape();
        if (crack.branch) line(crack.branch[0].x + off, crack.branch[0].y + off, crack.branch[1].x + off, crack.branch[1].y + off);
      }
    }
  }

  pop();
}

function drawGame() {
  // Кирпичи
  for (const b of bricks) {
    if (b.alive) drawBrick(b);
  }
  noStroke();

  // Падающие бонусы
  for (const p of fallingPowerups) drawCapsule(p.x, p.y, p.type);

  // Платформа
  fill(isActive('WIDE') ? POWERUPS.WIDE.color : 220);
  rect(paddle.x, paddle.y, paddle.w, paddle.h, 6);

  // Мяч
  fill(isActive('SPEED') ? POWERUPS.SPEED.color : 255);
  circle(ball.x, ball.y, ball.r * 2);

  // HUD — первая строка
  fill(255);
  textSize(16);
  textAlign(LEFT, TOP);
  text(`Очки: ${score}`, 12, 10);
  textAlign(CENTER, TOP);
  text(`Уровень ${level}/${LEVELS.length}`, W / 2, 10);
  textAlign(RIGHT, TOP);
  text('Жизни: ' + '●'.repeat(lives), W - 12, 10);

  // HUD — вторая строка: активные бонусы
  drawActiveEffects();

  if (Sfx.isMuted()) {
    fill(120);
    textSize(12);
    textAlign(LEFT, BOTTOM);
    text('звук выкл (M)', 8, H - 6);
  }

  if (state === STATE.PLAY && !ball.launched) {
    fill(160);
    textSize(14);
    textAlign(CENTER, CENTER);
    text('Пробел — запустить мяч', W / 2, H / 2 + 40);
  }
}

function drawActiveEffects() {
  const types = Object.keys(activeEffects);
  if (types.length === 0) return;

  textSize(13);
  textAlign(LEFT, CENTER);
  const y = 44;
  const barW = 80;
  const barH = 6;
  const gap = 40;

  // Считаем общую ширину, чтобы отцентровать (иконка + полоска + текст "20с" + отступ)
  const itemW = 18 + 6 + barW + 4 + 28 + gap;
  let x = W / 2 - (types.length * itemW - gap) / 2;

  for (const type of types) {
    const p = POWERUPS[type];
    const left = activeEffects[type];
    const frac = constrain(left / p.duration, 0, 1);

    // Иконка
    noStroke();
    fill(p.color);
    rect(x, y - 9, 18, 18, 4);
    fill(17);
    textAlign(CENTER, CENTER);
    text(p.letter, x + 9, y + 1);

    // Полоска времени + секунды
    fill(60);
    rect(x + 24, y - barH / 2, barW, barH, 3);
    fill(p.color);
    rect(x + 24, y - barH / 2, barW * frac, barH, 3);
    fill(220);
    textAlign(LEFT, CENTER);
    text(`${ceil(left / 1000)}c`, x + 24 + barW + 4, y);

    x += itemW;
  }
}

function drawOverlay(title, subtitle) {
  fill(0, 0, 0, 170);
  rect(0, 0, W, H);
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(36);
  text(title, W / 2, H / 2 - 20);
  textSize(16);
  fill(200);
  text(subtitle, W / 2, H / 2 + 24);
}

// ---------- Ввод ----------

function keyPressed() {
  // Аудиоконтекст можно создать только после действия пользователя
  Sfx.init();

  if (key === 'm' || key === 'M' || key === 'ь' || key === 'Ь') {
    Sfx.toggleMute();
    return;
  }

  switch (state) {
    case STATE.MENU:
      if (keyCode === UP_ARROW) { menuIndex = (menuIndex - 1 + menuItems.length) % menuItems.length; Sfx.play('menuMove'); }
      else if (keyCode === DOWN_ARROW) { menuIndex = (menuIndex + 1) % menuItems.length; Sfx.play('menuMove'); }
      else if (keyCode === ENTER) {
        Sfx.play('menuSelect');
        if (menuIndex === 0) { resetGame(); state = STATE.PLAY; }
        else state = STATE.EXIT;
      }
      break;

    case STATE.PLAY:
      if (key === ' ') launchBall();
      else if (keyCode === ESCAPE) state = STATE.PAUSE;
      break;

    case STATE.PAUSE:
      if (keyCode === ESCAPE) state = STATE.PLAY;
      else if (keyCode === ENTER) state = STATE.MENU;
      break;

    case STATE.GAMEOVER:
      if (keyCode === ENTER) state = STATE.MENU;
      break;

    case STATE.WIN:
      if (keyCode === ENTER) { level++; startLevel(); state = STATE.PLAY; }
      break;

    case STATE.VICTORY:
      if (keyCode === ENTER) state = STATE.MENU;
      break;

    case STATE.EXIT:
      if (keyCode === ENTER) state = STATE.MENU;
      break;
  }
  // Не даём стрелкам/пробелу скроллить страницу
  if ([UP_ARROW, DOWN_ARROW, LEFT_ARROW, RIGHT_ARROW, 32].includes(keyCode)) return false;
}
