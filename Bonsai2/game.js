const STATE_MENU = 'MENU';
const STATE_PLAY = 'PLAY';
const STATE_WIN = 'WIN';
const STATE_OVER = 'OVER';

const GW = 800;
const GH = 600;

const COLS = 12;
const ROWS = 5;
const BW = 52;
const BH = 18;
const GAP = 5;
const BALL_R = 6;
const BALL_SPEED = 4.5;
const PADDLE_SPEED = 7;
const MAX_LIVES = 3;

const EXIT_X = GW - 24;
const EXIT_Y = GH - 24;
const EXIT_R = 18;

const COLORS = [
  [231, 70, 88],
  [238, 179, 34],
  [67, 206, 77],
  [48, 169, 240],
  [128, 90, 213],
];

let state = STATE_MENU;
let score = 0;
let lives = MAX_LIVES;
let bricks = [];
let paddle = { x: 0, y: 0, w: 130, h: 14 };
let ball = { x: 0, y: 0, dx: 0, dy: 0 };
let gScale = 1;
let gOffsetX = 0;
let gOffsetY = 0;
let vpLeft = 0;
let vpTop = 0;
let touchActive = false;
let mouseActive = false;
let startTouchX = 0;
let startTouchY = 0;
let lastTouchX = 0;
let lastTouchY = 0;
let lastMouseX = 0;
let lastMouseY = 0;
let pressedKeys = new Set();

function setup() {
  createCanvas(windowWidth, windowHeight);
  noStroke();
  updateCanvasRect();
  fitToWindow();
  resetGame();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  updateCanvasRect();
  fitToWindow();
}

function updateCanvasRect() {
  const c = document.querySelector('canvas');
  const r = c.getBoundingClientRect();
  vpLeft = r.left;
  vpTop = r.top;
}

function fitToWindow() {
  gScale = Math.min(windowWidth / GW, windowHeight / GH);
  gOffsetX = (windowWidth - GW * gScale) / 2;
  gOffsetY = (windowHeight - GH * gScale) / 2;
}

function logicalX(px) {
  return (px - gOffsetX) / gScale;
}

function logicalY(py) {
  return (py - gOffsetY) / gScale;
}

function eventPos(e) {
  const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
  return { x: t.clientX - vpLeft, y: t.clientY - vpTop };
}

function resetGame() {
  score = 0;
  lives = MAX_LIVES;
  createBricks();
  paddle.x = (GW - paddle.w) / 2;
  paddle.y = GH - 44;
  launchBall();
}

function createBricks() {
  bricks = [];
  const left = (GW - (COLS * BW + (COLS - 1) * GAP)) / 2;
  const top = 64;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      bricks.push({
        x: left + c * (BW + GAP),
        y: top + r * (BH + GAP),
        w: BW,
        h: BH,
        alive: true,
        color: COLORS[r % COLORS.length],
      });
    }
  }
}

function launchBall() {
  const angle = random(-0.4, 0.4) - Math.PI / 2;
  ball.x = paddle.x + paddle.w / 2;
  ball.y = paddle.y - BALL_R - 6;
  ball.dx = Math.cos(angle) * BALL_SPEED;
  ball.dy = Math.sin(angle) * BALL_SPEED;
}

function draw() {
  background(13, 13, 26);
  push();
  translate(gOffsetX, gOffsetY);
  scale(gScale);

  if (state === STATE_PLAY) update();
  drawBricks();
  drawPaddle();
  if (state === STATE_PLAY) drawBall();
  drawHUD();
  drawExitButton();
  drawScreenText();

  pop();
}

function update() {
  movePaddle();
  stepBall();
}

function movePaddle() {
  if (touchActive) {
    paddle.x = constrain(logicalX(lastTouchX) - paddle.w / 2, 0, GW - paddle.w);
  } else if (mouseActive) {
    paddle.x = constrain(logicalX(lastMouseX) - paddle.w / 2, 0, GW - paddle.w);
  } else {
    const left = keyIsDown(LEFT_ARROW) || keyIsDown(65);
    const right = keyIsDown(RIGHT_ARROW) || keyIsDown(68);
    const dir = (left ? -1 : 0) + (right ? 1 : 0);
    if (dir !== 0) {
      paddle.x = constrain(paddle.x + dir * PADDLE_SPEED, 0, GW - paddle.w);
    }
  }
}

function stepBall() {
  ball.x += ball.dx;
  ball.y += ball.dy;

  if (ball.x < BALL_R) {
    ball.x = BALL_R;
    ball.dx = Math.abs(ball.dx);
  }
  if (ball.x > GW - BALL_R) {
    ball.x = GW - BALL_R;
    ball.dx = -Math.abs(ball.dx);
  }
  if (ball.y < BALL_R) {
    ball.y = BALL_R;
    ball.dy = Math.abs(ball.dy);
  }

  if (
    ball.dy > 0 &&
    ball.y + BALL_R >= paddle.y &&
    ball.y + BALL_R <= paddle.y + paddle.h + 6 &&
    ball.x >= paddle.x - 6 &&
    ball.x <= paddle.x + paddle.w + 6
  ) {
    const t = constrain((ball.x - paddle.x - paddle.w / 2) / (paddle.w / 2), -1, 1);
    const angle = t * (Math.PI / 3) - Math.PI / 2;
    ball.dx = Math.cos(angle) * BALL_SPEED;
    ball.dy = Math.sin(angle) * BALL_SPEED;
    ball.y = paddle.y - BALL_R;
    return;
  }

  for (const b of bricks) {
    if (!b.alive || !ballHitsBrick(b)) continue;
    b.alive = false;
    score += 10;
    bounceFromBrick(b);
    break;
  }

  if (ball.y - BALL_R > GH) {
    loseLife();
    return;
  }

  if (bricks.every((b) => !b.alive)) {
    state = STATE_WIN;
  }
}

function ballHitsBrick(b) {
  return (
    ball.x + BALL_R > b.x &&
    ball.x - BALL_R < b.x + b.w &&
    ball.y + BALL_R > b.y &&
    ball.y - BALL_R < b.y + b.h
  );
}

function bounceFromBrick(b) {
  const prevX = ball.x - ball.dx;
  const prevY = ball.y - ball.dy;

  if (prevY + BALL_R < b.y) {
    ball.dy = -Math.abs(ball.dy);
    ball.y = b.y - BALL_R;
  } else if (prevY - BALL_R > b.y + b.h) {
    ball.dy = Math.abs(ball.dy);
    ball.y = b.y + b.h + BALL_R;
  } else if (prevX + BALL_R < b.x) {
    ball.dx = -Math.abs(ball.dx);
    ball.x = b.x - BALL_R;
  } else {
    ball.dx = Math.abs(ball.dx);
    ball.x = b.x + b.w + BALL_R;
  }
}

function loseLife() {
  lives -= 1;
  if (lives <= 0) {
    state = STATE_OVER;
  } else {
    launchBall();
  }
}

function drawBricks() {
  for (const b of bricks) {
    if (!b.alive) continue;
    fill(b.color[0], b.color[1], b.color[2]);
    rect(b.x, b.y, b.w, b.h, 5);
  }
}

function drawPaddle() {
  fill(80, 190, 255);
  rect(paddle.x, paddle.y, paddle.w, paddle.h, 7);
}

function drawBall() {
  fill(255);
  circle(ball.x, ball.y, BALL_R * 2);
}

function drawHUD() {
  if (state !== STATE_PLAY) return;
  fill(140, 140, 160);
  textSize(18);
  textAlign(LEFT, TOP);
  text('Жизни:', 16, 16);
  for (let i = 0; i < MAX_LIVES; i++) {
    fill(i < lives ? 90 : 80, i < lives ? 200 : 80, i < lives ? 120 : 100);
    circle(84 + i * 22, 24, 14);
  }
  fill(255);
  textSize(24);
  textAlign(RIGHT, TOP);
  text('Очки: ' + score, GW - 16, 20);
  fill(120, 120, 140);
  textSize(14);
  textAlign(CENTER, BOTTOM);
  text('← → / A D · касание — управление · X — выход', GW / 2, GH - 8);
}

function drawExitButton() {
  fill(30, 30, 50, 180);
  circle(EXIT_X, EXIT_Y, EXIT_R * 2);
  fill(160, 160, 180);
  textSize(14);
  textAlign(CENTER, CENTER);
  text('X', EXIT_X, EXIT_Y + 1);
}

function drawScreenText() {
  if (state === STATE_PLAY) return;
  fill(10, 10, 20, 160);
  rect(0, 0, GW, GH);
  textAlign(CENTER, CENTER);
  fill(255);

  let title = 'АРКАНОИД';
  let sub = 'Пробел или касание — начать';
  let hint = '← → / A D — управление · X — выход';
  if (state === STATE_WIN) {
    title = 'ПОБЕДА!';
    sub = 'Все блоки уничтожены. Очки: ' + score;
    hint = 'Пробел или касание — новая игра · X — выход';
  } else if (state === STATE_OVER) {
    title = 'ИГРА ОСТАНОВЛЕНА';
    sub = 'Очки: ' + score;
    hint = 'Пробел или касание — заново · X — выход';
  }

  textSize(54);
  text(title, GW / 2, GH / 2 - 40);
  textSize(20);
  fill(220, 220, 240);
  text(sub, GW / 2, GH / 2 + 10);
  textSize(15);
  fill(150, 150, 170);
  text(hint, GW / 2, GH / 2 + 55);
}

function isEsc(k) {
  return k === ESCAPE || k === 27;
}

function isSpaceOrEnter(k) {
  return k === ' ' || k === 32 || k === ENTER || k === 13 || k === 'Enter';
}

function onInput(px, py) {
  const x = logicalX(px);
  const y = logicalY(py);
  if (dist(x, y, EXIT_X, EXIT_Y) <= EXIT_R + 4) {
    resetGame();
    state = STATE_MENU;
    return;
  }
  if (state === STATE_MENU || state === STATE_WIN || state === STATE_OVER) {
    resetGame();
    state = STATE_PLAY;
  }
}

function touchStarted(e) {
  touchActive = true;
  const p = eventPos(e);
  startTouchX = p.x;
  startTouchY = p.y;
  lastTouchX = p.x;
  lastTouchY = p.y;
}

function touchMoved(e) {
  touchActive = true;
  const p = eventPos(e);
  lastTouchX = p.x;
  lastTouchY = p.y;
}

function touchEnded(e) {
  const dx = lastTouchX - startTouchX;
  const dy = lastTouchY - startTouchY;
  if (dx * dx + dy * dy < 144) {
    onInput(startTouchX, startTouchY);
  }
  touchActive = false;
  mouseActive = false;
}

function mousePressed(e) {
  if (touchActive) return;
  const p = eventPos(e);
  lastMouseX = p.x;
  lastMouseY = p.y;
  mouseActive = true;
  onInput(p.x, p.y);
}

function mouseDragged(e) {
  if (touchActive || !mouseActive || state !== STATE_PLAY) return;
  const p = eventPos(e);
  lastMouseX = p.x;
  lastMouseY = p.y;
  paddle.x = constrain(logicalX(p.x) - paddle.w / 2, 0, GW - paddle.w);
}

function mouseReleased(e) {
  mouseActive = false;
}

function keyPressed() {
  if (pressedKeys.has(keyCode)) return;
  pressedKeys.add(keyCode);

  if (isEsc(key)) {
    if (state === STATE_PLAY) {
      resetGame();
      state = STATE_MENU;
    } else {
      stop();
    }
    return;
  }
  if (isSpaceOrEnter(key)) {
    if (state === STATE_MENU || state === STATE_WIN || state === STATE_OVER) {
      resetGame();
      state = STATE_PLAY;
    }
  }
}

function keyReleased() {
  pressedKeys.delete(keyCode);
}
