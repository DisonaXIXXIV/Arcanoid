const GAME = {
  width: 960,
  height: 620,
  state: "menu",
  score: 0,
  lives: 3,
  highScore: Number(localStorage.getItem("neonArkHighScore")) || 0,
  bricks: [],
  particles: [],
  stars: [],
  launched: false,
  level: 1,
};

const palette = ["#8b5cf6", "#c76cff", "#ff5da2", "#ff826b", "#ffd166"];
const BONUS_TYPES = {
  speed: { label: "СКОРОСТЬ ×2", short: "»»", color: "#54dfff", duration: 10000 },
  wide: { label: "ПЛАТФОРМА", short: "↔", color: "#70f0a8", duration: 20000 },
  score: { label: "ОЧКИ ×2", short: "×2", color: "#ffd166", duration: 10000 },
};
const BRICK_TYPES = {
  normal: { hits: 1, scoreMultiplier: 1 },
  stone: { hits: 2, scoreMultiplier: 2 },
  steel: { hits: 3, scoreMultiplier: 3 },
};
const LEVELS = [
  { cols: 5, rows: 4, normal: 20, stone: 0, steel: 0 },
  { cols: 6, rows: 5, normal: 22, stone: 8, steel: 0 },
  { cols: 8, rows: 5, normal: 26, stone: 10, steel: 4 },
  { cols: 10, rows: 5, normal: 27, stone: 15, steel: 8 },
  { cols: 10, rows: 6, normal: 28, stone: 20, steel: 12 },
];
const AUDIO = {
  context: null,
  master: null,
  musicBus: null,
  compressor: null,
  musicTimer: null,
  nextStepTime: 0,
  musicStep: 0,
  enabled: true,
  masterVolume: 0.55,
  musicVolume: 0.52,
};
const MUSIC = {
  bpm: 112,
  bass: [110, null, null, null, 87.31, null, null, null, 130.81, null, null, null, 98, null, null, null],
  arpeggio: [440, 523.25, 659.25, 523.25, 349.23, 440, 523.25, 440, 523.25, 659.25, 783.99, 659.25, 392, 493.88, 587.33, 493.88],
  scoreMelody: [880, 783.99, 1046.5, 987.77],
  chords: [
    [220, 261.63, 329.63],
    [174.61, 220, 261.63],
    [261.63, 329.63, 392],
    [196, 246.94, 293.66],
  ],
};
let paddle;
let ball;
let menuButtons = [];
const INPUT = { pointerId: null, targetX: null, touch: false };
let controls;

function setup() {
  const canvas = createCanvas(GAME.width, GAME.height);
  canvas.parent("game-container");
  canvas.attribute("tabindex", "0");
  canvas.elt.addEventListener("contextmenu", (event) => event.preventDefault());
  setupPointerControls(canvas.elt);
  pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
  textFont("Manrope");

  for (let i = 0; i < 70; i += 1) {
    GAME.stars.push({
      x: random(width),
      y: random(height),
      size: random(0.7, 2.2),
      alpha: random(35, 120),
      speed: random(0.03, 0.14),
    });
  }

  resetGame();
}

function draw() {
  drawBackground();

  if (GAME.state === "menu") drawMenu();
  if (GAME.state === "playing") drawGame();
  if (GAME.state === "paused") {
    drawGame(false);
    drawOverlay("ПАУЗА", INPUT.touch ? "Нажмите «Продолжить» под полем" : "Нажмите P, чтобы продолжить");
  }
  if (GAME.state === "levelcomplete") {
    drawGame(false);
    drawLevelComplete();
  }
  if (GAME.state === "won") {
    drawGame(false);
    drawEndScreen(true);
  }
  if (GAME.state === "gameover") {
    drawGame(false);
    drawEndScreen(false);
  }
  if (GAME.state === "exit") drawExitScreen();

  updateCursor();
  updateTouchControls();
}

function drawBackground() {
  background("#080b18");

  noStroke();
  for (let r = 500; r > 0; r -= 40) {
    fill(99, 63, 224, map(r, 500, 0, 0, 8));
    circle(width * 0.5, height * 0.55, r * 1.8);
  }

  for (const star of GAME.stars) {
    const pulse = sin(frameCount * star.speed + star.x) * 25;
    fill(180, 191, 255, star.alpha + pulse);
    circle(star.x, star.y, star.size);
  }

  stroke(255, 255, 255, 8);
  strokeWeight(1);
  for (let x = 0; x <= width; x += 48) line(x, 0, x, height);
  for (let y = 0; y <= height; y += 48) line(0, y, width, y);
}

function drawMenu() {
  const breathe = 1 + sin(frameCount * 0.025) * 0.015;

  push();
  translate(width / 2, 185);
  scale(breathe);
  textAlign(CENTER, CENTER);
  noStroke();
  fill(143, 103, 255, 26);
  circle(0, 0, 210);
  fill("#9299b5");
  textSize(13);
  textStyle(BOLD);
  text("КЛАССИКА В НОВОМ СВЕТЕ", 0, -75);
  fill("#f7f8ff");
  textSize(64);
  textStyle(BOLD);
  text("АРКАНОИД", 0, -17);
  fill("#9a72ff");
  rectMode(CENTER);
  rect(0, 38, 280, 5, 4);
  fill("#727a99");
  textStyle(NORMAL);
  textSize(15);
  text("Пять уровней. Одна платформа. Три жизни.", 0, 74);
  pop();

  menuButtons = [
    { label: "НАЧАТЬ ИГРУ", x: width / 2 - 144, y: 338, w: 288, h: 58, primary: true, action: startGame },
    { label: "ВЫЙТИ", x: width / 2 - 144, y: 410, w: 288, h: 52, primary: false, action: exitGame },
  ];

  menuButtons.forEach(drawButton);

  textAlign(CENTER, CENTER);
  noStroke();
  fill("#4f566f");
  textSize(11);
  textStyle(BOLD);
  text(`ЛУЧШИЙ СЧЁТ  ${String(GAME.highScore).padStart(6, "0")}`, width / 2, 500);
}

function drawButton(button) {
  const hovered = pointInRect(mouseX, mouseY, button);
  push();
  drawingContext.shadowBlur = hovered ? 28 : 16;
  drawingContext.shadowColor = button.primary ? "rgba(137, 91, 255, .55)" : "rgba(0,0,0,.35)";
  noStroke();
  fill(button.primary ? (hovered ? "#9b79ff" : "#825af0") : hovered ? "#252941" : "#171b2e");
  rect(button.x, button.y, button.w, button.h, 11);
  drawingContext.shadowBlur = 0;
  if (!button.primary) {
    noFill();
    stroke(255, 255, 255, hovered ? 35 : 16);
    rect(button.x, button.y, button.w, button.h, 11);
  }
  noStroke();
  fill(button.primary ? "#ffffff" : "#949ab1");
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(13);
  text(button.label, button.x + button.w / 2, button.y + button.h / 2 + 1);
  pop();
}

function resetGame() {
  GAME.score = 0;
  GAME.lives = 3;
  GAME.level = 1;
  GAME.particles = [];
  prepareLevel();
}

function prepareLevel() {
  clearPointerInput();
  GAME.powerUps = [];
  GAME.effects = { speed: 0, wide: 0, score: 0 };
  paddle = { x: width / 2, y: height - 54, w: 124, baseW: 124, h: 15, speed: 8.5 };
  ball = { x: width / 2, y: paddle.y - 15, r: 8, vx: 4.5, vy: -5.4, trail: [] };
  GAME.launched = false;
  createBricks();
}

function createBricks() {
  GAME.bricks = [];
  const config = LEVELS[GAME.level - 1];
  const cols = config.cols;
  const rows = config.rows;
  const gap = 8;
  const brickW = 76;
  const brickH = 22;
  const startX = (width - (cols * brickW + (cols - 1) * gap)) / 2;
  const startY = 124;
  const materials = createLevelMaterials(config);
  let materialIndex = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const type = materials[materialIndex];
      const maxHp = BRICK_TYPES[type].hits;
      GAME.bricks.push({
        x: startX + col * (brickW + gap),
        y: startY + row * (brickH + gap),
        w: brickW,
        h: brickH,
        color: palette[row % palette.length],
        type,
        hp: maxHp,
        maxHp,
        seed: row * cols + col,
        hitFlash: 0,
        alive: true,
        points: (rows - row) * 10,
      });
      materialIndex += 1;
    }
  }
}

function createLevelMaterials(config) {
  const materials = [
    ...Array(config.normal).fill("normal"),
    ...Array(config.stone).fill("stone"),
    ...Array(config.steel).fill("steel"),
  ];

  for (let i = materials.length - 1; i > 0; i -= 1) {
    const j = floor(random(i + 1));
    [materials[i], materials[j]] = [materials[j], materials[i]];
  }
  return materials;
}

function drawGame(shouldUpdate = true) {
  drawHud();
  drawBricks();
  drawPowerUps();
  drawParticles(shouldUpdate);
  drawPaddle();
  drawBall();

  if (shouldUpdate) updateGame();

  if (!GAME.launched && GAME.state === "playing") {
    fill(224, 227, 242, 150 + sin(frameCount * 0.08) * 70);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(11);
    textStyle(BOLD);
    text(INPUT.touch ? "НАЖМИТЕ «ЗАПУСТИТЬ» ПОД ПОЛЕМ" : "ПРОБЕЛ — ЗАПУСТИТЬ", width / 2, height - 90);
  }
}

function drawHud() {
  noStroke();
  fill(255, 255, 255, 9);
  rect(0, 0, width, 104);
  stroke(255, 255, 255, 15);
  line(0, 104, width, 104);

  noStroke();
  textStyle(BOLD);
  textAlign(LEFT, CENTER);
  fill("#69708b");
  textSize(10);
  text("СЧЁТ", 36, 23);
  fill("#f5f6ff");
  textSize(19);
  text(String(GAME.score).padStart(6, "0"), 36, 43);

  textAlign(CENTER, CENTER);
  fill("#69708b");
  textSize(10);
  text(`УРОВЕНЬ ${GAME.level} / ${LEVELS.length}`, width / 2, 23);
  fill("#f5f6ff");
  textSize(19);
  text(`БЛОКОВ: ${GAME.bricks.filter((brick) => brick.alive).length}`, width / 2, 43);

  textAlign(RIGHT, CENTER);
  fill("#69708b");
  textSize(10);
  text("ЖИЗНИ", width - 36, 23);
  for (let i = 0; i < 3; i += 1) {
    fill(i < GAME.lives ? "#ff5da2" : "#292d42");
    circle(width - 36 - (2 - i) * 18, 44, 8);
  }

  drawEffectIndicators();
}

function drawEffectIndicators() {
  const active = Object.entries(GAME.effects).filter(([, remaining]) => remaining > 0);
  if (active.length === 0) return;

  const chipW = 154;
  const chipH = 25;
  const gap = 8;
  const totalW = active.length * chipW + (active.length - 1) * gap;
  let x = (width - totalW) / 2;

  textAlign(LEFT, CENTER);
  textStyle(BOLD);
  textSize(9);
  for (const [type, remaining] of active) {
    const info = BONUS_TYPES[type];
    const seconds = max(0, ceil(remaining / 1000));
    noStroke();
    fill(colorWithAlpha(info.color, 24));
    rect(x, 70, chipW, chipH, 8);
    stroke(colorWithAlpha(info.color, 85));
    noFill();
    rect(x, 70, chipW, chipH, 8);
    noStroke();
    fill(info.color);
    text(info.short, x + 10, 83);
    fill("#dfe4f5");
    text(info.label, x + 34, 83);
    textAlign(RIGHT, CENTER);
    fill("#ffffff");
    text(`${seconds}с`, x + chipW - 10, 83);
    textAlign(LEFT, CENTER);
    x += chipW + gap;
  }
}

function drawBricks() {
  noStroke();
  for (const brick of GAME.bricks) {
    if (!brick.alive) continue;
    push();
    drawingContext.shadowBlur = 14;
    drawingContext.shadowColor = brick.color;
    fill(brick.color);
    rect(brick.x, brick.y, brick.w, brick.h, 5);
    drawBrickMaterial(brick);
    drawBrickCracks(brick);
    if (brick.hitFlash > 0) {
      noStroke();
      fill(255, 255, 255, map(brick.hitFlash, 0, 7, 0, 155));
      rect(brick.x, brick.y, brick.w, brick.h, 5);
    }
    pop();
  }
}

function drawBrickMaterial(brick) {
  if (brick.type === "normal") {
    noStroke();
    fill(255, 255, 255, 42);
    rect(brick.x + 3, brick.y + 3, brick.w - 6, 3, 2);
    return;
  }

  if (brick.type === "stone") {
    noStroke();
    fill(8, 10, 18, 32);
    beginShape();
    vertex(brick.x + 3, brick.y + 7);
    vertex(brick.x + 21, brick.y + 3);
    vertex(brick.x + 38, brick.y + 8);
    vertex(brick.x + 57, brick.y + 4);
    vertex(brick.x + brick.w - 3, brick.y + 9);
    vertex(brick.x + brick.w - 3, brick.y + brick.h - 3);
    vertex(brick.x + 3, brick.y + brick.h - 3);
    endShape(CLOSE);

    stroke(20, 20, 30, 80);
    strokeWeight(1);
    const offset = brick.seed % 7;
    line(brick.x + 8 + offset, brick.y + 6, brick.x + 18 + offset, brick.y + 4);
    line(brick.x + 45 - offset, brick.y + 16, brick.x + 59 - offset, brick.y + 18);
    noStroke();
    fill(255, 255, 255, 55);
    circle(brick.x + 12 + offset, brick.y + 15, 2);
    circle(brick.x + 54 + offset / 2, brick.y + 7, 1.5);
    return;
  }

  noStroke();
  fill(255, 255, 255, 74);
  rect(brick.x + 3, brick.y + 3, brick.w - 6, 4, 2);
  fill(5, 8, 16, 48);
  rect(brick.x + 3, brick.y + brick.h - 6, brick.w - 6, 3, 2);
  fill(225, 239, 255, 150);
  circle(brick.x + 8, brick.y + brick.h / 2, 3.5);
  circle(brick.x + brick.w - 8, brick.y + brick.h / 2, 3.5);
  stroke(225, 239, 255, 68);
  strokeWeight(1);
  line(brick.x + 16, brick.y + brick.h / 2, brick.x + brick.w - 16, brick.y + brick.h / 2);
}

function drawBrickCracks(brick) {
  const damage = brick.maxHp - brick.hp;
  if (damage <= 0) return;

  for (let i = 0; i < damage; i += 1) {
    const direction = (brick.seed + i) % 2 === 0 ? 1 : -1;
    const anchorX = brick.x + brick.w * (i === 0 ? 0.42 : 0.66);
    const anchorY = brick.y + 2;

    stroke(5, 7, 15, 205);
    strokeWeight(1.35);
    noFill();
    beginShape();
    vertex(anchorX, anchorY);
    vertex(anchorX + direction * 4, brick.y + 7);
    vertex(anchorX - direction * 2, brick.y + 12);
    vertex(anchorX + direction * 5, brick.y + brick.h - 2);
    endShape();
    line(
      anchorX - direction * 2,
      brick.y + 12,
      anchorX - direction * 10,
      brick.y + 16,
    );
    line(anchorX + direction * 4, brick.y + 7, anchorX + direction * 11, brick.y + 9);

    stroke(255, 255, 255, 55);
    strokeWeight(0.6);
    line(anchorX + 1, anchorY, anchorX + direction * 4 + 1, brick.y + 7);
  }
}

function drawPowerUps() {
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(12);
  for (const item of GAME.powerUps) {
    const info = BONUS_TYPES[item.type];
    push();
    drawingContext.shadowBlur = 18;
    drawingContext.shadowColor = info.color;
    noStroke();
    fill(colorWithAlpha(info.color, 215));
    rectMode(CENTER);
    rect(item.x, item.y, item.w, item.h, item.h / 2);
    fill("#07101a");
    text(info.short, item.x, item.y + 1);
    pop();
  }
}

function drawPaddle() {
  push();
  drawingContext.shadowBlur = 22;
  drawingContext.shadowColor = "#7b5cff";
  noStroke();
  fill("#8b6aff");
  rectMode(CENTER);
  rect(paddle.x, paddle.y, paddle.w, paddle.h, 9);
  fill(255, 255, 255, 110);
  rect(paddle.x, paddle.y - 4, paddle.w - 15, 3, 4);
  pop();
}

function drawBall() {
  noStroke();
  for (let i = 0; i < ball.trail.length; i += 1) {
    const p = ball.trail[i];
    fill(179, 221, 255, map(i, 0, ball.trail.length, 0, 75));
    circle(p.x, p.y, map(i, 0, ball.trail.length, 2, ball.r * 1.6));
  }
  push();
  drawingContext.shadowBlur = 22;
  drawingContext.shadowColor = "#a7e8ff";
  fill("#f6fdff");
  circle(ball.x, ball.y, ball.r * 2);
  pop();
}

function updateGame() {
  movePaddle();
  updateEffects();
  updatePowerUps();
  updateBrickAnimations();

  if (!GAME.launched) {
    ball.x = paddle.x;
    ball.y = paddle.y - 16;
    ball.trail = [];
    return;
  }

  ball.trail.push({ x: ball.x, y: ball.y });
  if (ball.trail.length > 9) ball.trail.shift();

  const speedMultiplier = GAME.effects.speed > 0 ? 2 : 1;
  ball.x += ball.vx * speedMultiplier;
  ball.y += ball.vy * speedMultiplier;

  if (ball.x - ball.r <= 16 || ball.x + ball.r >= width - 16) {
    ball.vx *= -1;
    ball.x = constrain(ball.x, 16 + ball.r, width - 16 - ball.r);
    playImpactSound("wall");
  }
  if (ball.y - ball.r <= 104) {
    ball.vy = abs(ball.vy);
    ball.y = 104 + ball.r;
    playImpactSound("wall");
  }

  const paddleTop = paddle.y - paddle.h / 2;
  if (
    ball.vy > 0 &&
    ball.y + ball.r >= paddleTop &&
    ball.y - ball.r <= paddle.y + paddle.h / 2 &&
    ball.x >= paddle.x - paddle.w / 2 &&
    ball.x <= paddle.x + paddle.w / 2
  ) {
    const hit = (ball.x - paddle.x) / (paddle.w / 2);
    const speed = Math.min(Math.hypot(ball.vx, ball.vy) + 0.08, 8.5);
    ball.vx = speed * hit * 0.85;
    if (abs(ball.vx) < 1.4) ball.vx = (hit < 0 ? -1 : 1) * 1.4;
    ball.vy = -sqrt(max(3, speed * speed - ball.vx * ball.vx));
    ball.y = paddleTop - ball.r;
    spawnParticles(ball.x, paddleTop, "#a7e8ff", 5);
    playImpactSound("paddle");
  }

  for (const brick of GAME.bricks) {
    if (!brick.alive || !circleRectCollision(ball, brick)) continue;
    bounceFromBrick(brick);
    brick.hp -= 1;
    brick.hitFlash = 7;
    playBrickSound(brick.type, brick.hp <= 0);
    spawnParticles(ball.x, ball.y, brick.color, brick.hp <= 0 ? 12 : 5);

    if (brick.hp <= 0) {
      brick.alive = false;
      const scoreMultiplier = GAME.effects.score > 0 ? 2 : 1;
      const materialMultiplier = BRICK_TYPES[brick.type].scoreMultiplier;
      GAME.score += brick.points * materialMultiplier * scoreMultiplier;
      updateHighScore();
      maybeDropPowerUp(brick);
    }
    break;
  }

  if (GAME.bricks.every((brick) => !brick.alive)) {
    GAME.state = GAME.level >= LEVELS.length ? "won" : "levelcomplete";
    updateHighScore();
    playLevelCompleteSound(GAME.state === "won");
  }

  if (ball.y - ball.r > height) loseLife();
}

function updateBrickAnimations() {
  for (const brick of GAME.bricks) {
    if (brick.hitFlash > 0) brick.hitFlash -= 1;
  }
}

function movePaddle() {
  const targetWidth = GAME.effects.wide > 0 ? paddle.baseW * 1.55 : paddle.baseW;
  paddle.w = lerp(paddle.w, targetWidth, 0.16);
  let direction = 0;
  if (keyIsDown(LEFT_ARROW)) direction -= 1;
  if (keyIsDown(RIGHT_ARROW)) direction += 1;
  if (direction !== 0) {
    INPUT.targetX = null;
    paddle.x += direction * paddle.speed;
  } else if (INPUT.targetX !== null) {
    paddle.x = INPUT.targetX;
  }
  paddle.x = constrain(paddle.x, 22 + paddle.w / 2, width - 22 - paddle.w / 2);
}

function maybeDropPowerUp(brick) {
  if (random() > 0.27) return;
  const types = Object.keys(BONUS_TYPES);
  GAME.powerUps.push({
    x: brick.x + brick.w / 2,
    y: brick.y + brick.h / 2,
    w: 42,
    h: 22,
    vy: 2.35,
    type: random(types),
  });
}

function updatePowerUps() {
  for (let i = GAME.powerUps.length - 1; i >= 0; i -= 1) {
    const item = GAME.powerUps[i];
    item.y += item.vy;

    const caught =
      item.y + item.h / 2 >= paddle.y - paddle.h / 2 &&
      item.y - item.h / 2 <= paddle.y + paddle.h / 2 &&
      item.x + item.w / 2 >= paddle.x - paddle.w / 2 &&
      item.x - item.w / 2 <= paddle.x + paddle.w / 2;

    if (caught) {
      activateBonus(item.type);
      playBonusSound();
      spawnParticles(item.x, item.y, BONUS_TYPES[item.type].color, 14);
      GAME.powerUps.splice(i, 1);
    } else if (item.y - item.h / 2 > height) {
      GAME.powerUps.splice(i, 1);
    }
  }
}

function activateBonus(type) {
  GAME.effects[type] = BONUS_TYPES[type].duration;
}

function updateEffects() {
  for (const type of Object.keys(GAME.effects)) {
    if (GAME.effects[type] <= 0) continue;
    GAME.effects[type] = max(0, GAME.effects[type] - deltaTime);
  }
}

function circleRectCollision(circleBody, rectangle) {
  const nearX = constrain(circleBody.x, rectangle.x, rectangle.x + rectangle.w);
  const nearY = constrain(circleBody.y, rectangle.y, rectangle.y + rectangle.h);
  return dist(circleBody.x, circleBody.y, nearX, nearY) <= circleBody.r;
}

function bounceFromBrick(brick) {
  const overlapLeft = ball.x + ball.r - brick.x;
  const overlapRight = brick.x + brick.w - (ball.x - ball.r);
  const overlapTop = ball.y + ball.r - brick.y;
  const overlapBottom = brick.y + brick.h - (ball.y - ball.r);
  const minOverlap = min(overlapLeft, overlapRight, overlapTop, overlapBottom);
  if (minOverlap === overlapLeft) {
    ball.vx = -abs(ball.vx);
    ball.x = brick.x - ball.r;
  } else if (minOverlap === overlapRight) {
    ball.vx = abs(ball.vx);
    ball.x = brick.x + brick.w + ball.r;
  } else if (minOverlap === overlapTop) {
    ball.vy = -abs(ball.vy);
    ball.y = brick.y - ball.r;
  } else {
    ball.vy = abs(ball.vy);
    ball.y = brick.y + brick.h + ball.r;
  }
}

function loseLife() {
  GAME.lives -= 1;
  playLifeLostSound(GAME.lives <= 0);
  if (GAME.lives <= 0) {
    GAME.state = "gameover";
    updateHighScore();
    return;
  }
  GAME.launched = false;
  ball.x = paddle.x;
  ball.y = paddle.y - 16;
  ball.vx = random([-4.6, 4.6]);
  ball.vy = -5.4;
  ball.trail = [];
}

function spawnParticles(x, y, color, amount) {
  for (let i = 0; i < amount; i += 1) {
    GAME.particles.push({
      x,
      y,
      vx: random(-2.4, 2.4),
      vy: random(-2.4, 2.4),
      life: 28,
      color,
      size: random(2, 5),
    });
  }
}

function drawParticles(shouldUpdate) {
  noStroke();
  for (let i = GAME.particles.length - 1; i >= 0; i -= 1) {
    const p = GAME.particles[i];
    fill(colorWithAlpha(p.color, map(p.life, 0, 28, 0, 220)));
    circle(p.x, p.y, p.size);
    if (!shouldUpdate) continue;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.04;
    p.life -= 1;
    if (p.life <= 0) GAME.particles.splice(i, 1);
  }
}

function colorWithAlpha(hex, alpha) {
  const c = color(hex);
  c.setAlpha(alpha);
  return c;
}

function drawOverlay(title, subtitle) {
  noStroke();
  fill(5, 7, 19, 205);
  rect(0, 0, width, height, 22);
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  fill("#f7f8ff");
  textSize(52);
  text(title, width / 2, height / 2 - 22);
  fill("#858ca6");
  textSize(14);
  text(subtitle, width / 2, height / 2 + 35);
}

function drawEndScreen(won) {
  noStroke();
  fill(5, 7, 19, 225);
  rect(0, 0, width, height, 22);

  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  fill(won ? "#ffd166" : "#ff5d9e");
  textSize(12);
  text(won ? "ИДЕАЛЬНАЯ ЗАЧИСТКА" : "ШАР ПОТЕРЯН", width / 2, 176);
  fill("#f7f8ff");
  textSize(54);
  text(won ? "ПОБЕДА!" : "ИГРА ОКОНЧЕНА", width / 2, 232);
  fill("#737b96");
  textSize(13);
  text(won ? "ВСЕ 5 УРОВНЕЙ ПРОЙДЕНЫ · ВАШ СЧЁТ" : "ВАШ СЧЁТ", width / 2, 295);
  fill("#ffffff");
  textSize(32);
  text(String(GAME.score).padStart(6, "0"), width / 2, 332);

  menuButtons = [
    { label: "ИГРАТЬ СНОВА", x: width / 2 - 144, y: 385, w: 288, h: 56, primary: true, action: startGame },
    { label: "ГЛАВНОЕ МЕНЮ", x: width / 2 - 144, y: 454, w: 288, h: 50, primary: false, action: goMenu },
  ];
  menuButtons.forEach(drawButton);
}

function drawLevelComplete() {
  noStroke();
  fill(5, 7, 19, 225);
  rect(0, 0, width, height, 22);

  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  fill("#70f0a8");
  textSize(12);
  text("ПОЛЕ ЗАЧИЩЕНО", width / 2, 190);
  fill("#f7f8ff");
  textSize(48);
  text(`УРОВЕНЬ ${GAME.level} ПРОЙДЕН`, width / 2, 246);
  fill("#737b96");
  textSize(13);
  text("ТЕКУЩИЙ СЧЁТ", width / 2, 302);
  fill("#ffffff");
  textSize(28);
  text(String(GAME.score).padStart(6, "0"), width / 2, 338);

  menuButtons = [
    {
      label: `УРОВЕНЬ ${GAME.level + 1}`,
      x: width / 2 - 144,
      y: 392,
      w: 288,
      h: 56,
      primary: true,
      action: nextLevel,
    },
    { label: "ГЛАВНОЕ МЕНЮ", x: width / 2 - 144, y: 461, w: 288, h: 50, primary: false, action: goMenu },
  ];
  menuButtons.forEach(drawButton);
}

function nextLevel() {
  if (GAME.level >= LEVELS.length) return;
  GAME.level += 1;
  GAME.particles = [];
  prepareLevel();
  GAME.state = "playing";
  menuButtons = [];
}

function drawExitScreen() {
  textAlign(CENTER, CENTER);
  noStroke();
  fill("#8c65ff");
  textSize(12);
  textStyle(BOLD);
  text("СЕАНС ЗАВЕРШЁН", width / 2, 235);
  fill("#f7f8ff");
  textSize(50);
  text("ДО НОВОЙ ИГРЫ", width / 2, 292);
  fill("#747b96");
  textStyle(NORMAL);
  textSize(14);
  text("Можно закрыть эту вкладку или вернуться в меню.", width / 2, 345);

  menuButtons = [
    { label: "ВЕРНУТЬСЯ", x: width / 2 - 124, y: 392, w: 248, h: 54, primary: true, action: goMenu },
  ];
  menuButtons.forEach(drawButton);
}

function startGame() {
  resetGame();
  GAME.state = "playing";
  menuButtons = [];
}

function goMenu() {
  clearPointerInput();
  GAME.state = "menu";
  menuButtons = [];
}

function exitGame() {
  GAME.state = "exit";
  menuButtons = [];
}

function updateHighScore() {
  if (GAME.score <= GAME.highScore) return;
  GAME.highScore = GAME.score;
  localStorage.setItem("neonArkHighScore", String(GAME.highScore));
}

function initAudio() {
  if (!AUDIO.context) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    AUDIO.context = new AudioContextClass();
    AUDIO.master = AUDIO.context.createGain();
    AUDIO.musicBus = AUDIO.context.createGain();
    AUDIO.compressor = AUDIO.context.createDynamicsCompressor();
    AUDIO.master.gain.value = AUDIO.enabled ? AUDIO.masterVolume : 0;
    AUDIO.musicBus.gain.value = AUDIO.musicVolume;
    AUDIO.compressor.threshold.value = -14;
    AUDIO.compressor.knee.value = 20;
    AUDIO.compressor.ratio.value = 6;
    AUDIO.compressor.attack.value = 0.003;
    AUDIO.compressor.release.value = 0.22;
    AUDIO.musicBus.connect(AUDIO.master);
    AUDIO.master.connect(AUDIO.compressor);
    AUDIO.compressor.connect(AUDIO.context.destination);
  }

  if (AUDIO.context.state === "suspended") AUDIO.context.resume();
  if (AUDIO.musicTimer === null) AUDIO.musicTimer = setInterval(scheduleMusic, 25);
}

function playTone(frequency, duration, type, volume, endFrequency = frequency, delay = 0) {
  if (!AUDIO.enabled) return;
  initAudio();
  if (!AUDIO.context || !AUDIO.master) return;

  const start = AUDIO.context.currentTime + delay;
  const end = start + duration;
  const oscillator = AUDIO.context.createOscillator();
  const gain = AUDIO.context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(max(20, frequency), start);
  oscillator.frequency.exponentialRampToValueAtTime(max(20, endFrequency), end);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  oscillator.connect(gain);
  gain.connect(AUDIO.master);
  oscillator.start(start);
  oscillator.stop(end + 0.015);
}

function playMusicTone(frequency, duration, type, volume, endFrequency, startTime) {
  if (!AUDIO.enabled || !AUDIO.context || !AUDIO.musicBus) return;

  const end = startTime + duration;
  const oscillator = AUDIO.context.createOscillator();
  const gain = AUDIO.context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(Math.max(20, frequency), startTime);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), end);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + Math.min(0.012, duration * 0.2));
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  oscillator.connect(gain);
  gain.connect(AUDIO.musicBus);
  oscillator.start(startTime);
  oscillator.stop(end + 0.02);
}

function scheduleMusic() {
  if (!AUDIO.context) return;

  if (!AUDIO.enabled || GAME.state !== "playing") {
    AUDIO.nextStepTime = 0;
    AUDIO.musicStep = 0;
    return;
  }

  const now = AUDIO.context.currentTime;
  if (AUDIO.nextStepTime === 0 || AUDIO.nextStepTime < now - 0.2) {
    AUDIO.nextStepTime = now + 0.05;
  }

  const stepDuration = 60 / MUSIC.bpm / 2;
  while (AUDIO.nextStepTime < now + 0.14) {
    scheduleMusicStep(AUDIO.musicStep, AUDIO.nextStepTime, stepDuration);
    AUDIO.nextStepTime += stepDuration;
    AUDIO.musicStep = (AUDIO.musicStep + 1) % 16;
  }
}

function scheduleMusicStep(step, startTime, stepDuration) {
  const arpeggioNote = MUSIC.arpeggio[step];
  playMusicTone(arpeggioNote, stepDuration * 0.68, "triangle", 0.12, arpeggioNote * 0.995, startTime);

  const bassNote = MUSIC.bass[step];
  if (bassNote) {
    playMusicTone(bassNote, stepDuration * 1.75, "sine", 0.2, bassNote * 0.985, startTime);
  }

  if (step === 0 || step === 8) {
    playMusicTone(82, 0.12, "sine", 0.19, 42, startTime);
  }

  if (GAME.effects.speed > 0 && step % 2 === 1) {
    const pulse = step % 4 === 1 ? 1320 : 990;
    playMusicTone(pulse, 0.04, "square", 0.07, pulse * 0.72, startTime);
  }

  if (GAME.effects.wide > 0 && step % 4 === 0) {
    const chord = MUSIC.chords[step / 4];
    chord.forEach((note) => {
      playMusicTone(note, stepDuration * 3.7, "sine", 0.055, note * 1.004, startTime);
    });
  }

  if (GAME.effects.score > 0 && step % 4 === 1) {
    const note = MUSIC.scoreMelody[(step - 1) / 4];
    playMusicTone(note, stepDuration * 1.25, "triangle", 0.105, note * 1.06, startTime);
  }
}

function playImpactSound(surface) {
  if (surface === "paddle") {
    playTone(245, 0.075, "triangle", 0.22, 355);
    return;
  }
  playTone(175, 0.045, "sine", 0.12, 135);
}

function playBrickSound(type, destroyed) {
  const sounds = {
    normal: { frequency: 330, end: 250, wave: "triangle" },
    stone: { frequency: 155, end: 92, wave: "square" },
    steel: { frequency: 620, end: 410, wave: "triangle" },
  };
  const sound = sounds[type];
  playTone(sound.frequency, type === "stone" ? 0.085 : 0.065, sound.wave, 0.16, sound.end);
  if (destroyed) playTone(sound.frequency * 1.35, 0.08, "sine", 0.11, sound.frequency * 1.8, 0.025);
}

function playBonusSound() {
  playTone(520, 0.1, "sine", 0.15, 610);
  playTone(680, 0.1, "sine", 0.14, 790, 0.07);
  playTone(880, 0.15, "triangle", 0.13, 1080, 0.14);
}

function playLifeLostSound(isGameOver) {
  playTone(230, 0.16, "sawtooth", 0.12, 120);
  playTone(145, isGameOver ? 0.34 : 0.2, "triangle", 0.13, 72, 0.12);
}

function playLevelCompleteSound(isFinalLevel) {
  const notes = isFinalLevel ? [523, 659, 784, 1047] : [440, 554, 659];
  notes.forEach((note, index) => {
    playTone(note, 0.18, "triangle", 0.11, note * 1.04, index * 0.1);
  });
}

function toggleSound() {
  initAudio();
  AUDIO.enabled = !AUDIO.enabled;
  if (AUDIO.master && AUDIO.context) {
    AUDIO.master.gain.setTargetAtTime(AUDIO.enabled ? AUDIO.masterVolume : 0, AUDIO.context.currentTime, 0.015);
  }
  const hint = document.querySelector(".sound-hint");
  if (hint) hint.textContent = `P — пауза · M — звук: ${AUDIO.enabled ? "вкл" : "выкл"}`;
  updateTouchControls();
}

function clearPointerInput() {
  INPUT.pointerId = null;
  INPUT.targetX = null;
}

function togglePause() {
  if (GAME.state === "playing") GAME.state = "paused";
  else if (GAME.state === "paused") GAME.state = "playing";
  clearPointerInput();
  updateTouchControls();
}

function primaryAction() {
  if (GAME.state === "playing" && !GAME.launched) {
    // Position the ball even if the action arrives before the next draw frame.
    movePaddle();
    ball.x = paddle.x;
    ball.y = paddle.y - 16;
    GAME.launched = true;
  } else if (GAME.state === "levelcomplete") nextLevel();
  else if (GAME.state === "paused") togglePause();
  else if (["menu", "won", "gameover"].includes(GAME.state)) startGame();
  else if (GAME.state === "exit") goMenu();
  updateTouchControls();
}

function updateTouchControls() {
  if (!controls) return;
  const labels = {
    menu: "Начать игру", playing: GAME.launched ? "Шар в игре" : "Запустить",
    paused: "Продолжить", levelcomplete: "Следующий уровень",
    won: "Играть снова", gameover: "Играть снова", exit: "В меню",
  };
  const setLabel = (element, label) => {
    if (element.textContent !== label) element.textContent = label;
  };
  setLabel(controls.action, labels[GAME.state]);
  controls.action.disabled = GAME.state === "playing" && GAME.launched;
  setLabel(controls.pause, GAME.state === "paused" ? "Продолжить" : "Пауза");
  controls.pause.disabled = !["playing", "paused"].includes(GAME.state);
  setLabel(controls.sound, `Звук: ${AUDIO.enabled ? "вкл" : "выкл"}`);
  controls.sound.setAttribute("aria-pressed", String(AUDIO.enabled));
}

function setupPointerControls(canvas) {
  controls = {
    action: document.getElementById("action-button"),
    pause: document.getElementById("pause-button"),
    sound: document.getElementById("sound-button"),
  };
  INPUT.touch = window.matchMedia("(any-pointer: coarse)").matches;
  for (const [button, action] of [
    [controls.action, primaryAction], [controls.pause, togglePause], [controls.sound, toggleSound],
  ]) {
    button.addEventListener("click", () => {
      initAudio();
      action();
    });
  }

  for (const surface of [canvas, document.getElementById("touch-pad")]) {
    // CSS scales the canvas; pointer coordinates must use its displayed size.
    const position = (event) => {
      const bounds = surface.getBoundingClientRect();
      return {
        x: (event.clientX - bounds.left) / bounds.width * GAME.width,
        y: (event.clientY - bounds.top) / bounds.height * GAME.height,
      };
    };
    surface.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || INPUT.pointerId !== null) return;
      event.preventDefault();
      initAudio();
      if (event.pointerType !== "mouse") {
        INPUT.touch = true;
        document.documentElement.classList.add("touch-input");
      }
      const point = position(event);
      if (surface === canvas && ["menu", "levelcomplete", "won", "gameover", "exit"].includes(GAME.state)) {
        const button = menuButtons.find((item) => pointInRect(point.x, point.y, item));
        if (button) button.action();
        return;
      }
      if (GAME.state !== "playing" || (surface === canvas && event.pointerType === "mouse")) return;
      INPUT.pointerId = event.pointerId;
      INPUT.targetX = point.x;
      surface.setPointerCapture(event.pointerId);
    });
    surface.addEventListener("pointermove", (event) => {
      if (event.pointerId !== INPUT.pointerId || GAME.state !== "playing") return;
      INPUT.targetX = position(event).x;
    });
    const release = (event) => {
      if (event.pointerId !== INPUT.pointerId) return;
      // Apply the last position before clearing a quick gesture between frames.
      if (GAME.state === "playing") movePaddle();
      clearPointerInput();
    };
    surface.addEventListener("pointerup", release);
    surface.addEventListener("pointercancel", release);
    surface.addEventListener("lostpointercapture", release);
  }
  const pauseOnLeave = () => {
    clearPointerInput();
    if (GAME.state === "playing") togglePause();
  };
  window.addEventListener("blur", pauseOnLeave);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseOnLeave();
  });
}

function keyPressed() {
  initAudio();
  if (keyCode === 32 && document.activeElement?.tagName === "BUTTON") return true;
  if ([LEFT_ARROW, RIGHT_ARROW, 32].includes(keyCode)) return false;

  if (key === "m" || key === "M" || key === "ь" || key === "Ь") {
    toggleSound();
    return false;
  }

  if (["p", "P", "з", "З"].includes(key)) togglePause();
  return true;
}

function keyReleased() {
  // Let focused HTML buttons handle Space through their native click event.
  if (document.activeElement?.tagName === "BUTTON") return true;
  if (keyCode === 32 && GAME.state === "levelcomplete") {
    nextLevel();
    return false;
  }
  if (keyCode === 32 && GAME.state === "playing" && !GAME.launched) {
    GAME.launched = true;
    return false;
  }
  return true;
}

function pointInRect(x, y, rectangle) {
  return x >= rectangle.x && x <= rectangle.x + rectangle.w && y >= rectangle.y && y <= rectangle.y + rectangle.h;
}

function updateCursor() {
  const isHovering = menuButtons.some((button) => pointInRect(mouseX, mouseY, button));
  cursor(isHovering ? HAND : ARROW);
}

document.querySelector(".brand").addEventListener("click", (event) => {
  event.preventDefault();
  goMenu();
});
