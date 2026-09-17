// Сенсорное управление (работает и мышью):
//   ведение пальцем       — движение платформы (в любом месте экрана: в портретной
//                           ориентации удобно вести ниже поля, не закрывая его),
//   отпускание пальца        — запуск мяча,
//   тап по экранной кнопке   — пауза, звук, пункты меню и кнопки оверлеев,
//   тап по пустому месту     — подтверждение на экранах «игра окончена» и т.п.
//
// Геометрия кнопок описана в sketch.js (uiButtons), здесь — только работа с указателем.
// Координаты события переводятся из размера холста на экране в игровые W x H.

const TouchInput = (() => {
  let touchMode = !!(window.matchMedia && window.matchMedia('(any-pointer: coarse)').matches);
  let el = null;
  let dragId = null;   // указатель, который тянет платформу
  let tapId = null;    // указатель, нажатый мимо кнопок (тап = подтверждение)
  let btnId = null;    // указатель, удерживающий кнопку
  let heldBtn = null;  // сама кнопка — для подсветки при нажатии

  // Показывать подсказки для пальца вместо клавиш
  function isTouch() {
    return touchMode;
  }

  function heldButton() {
    return heldBtn;
  }

  // Нажали клавишу — значит клавиатура есть, возвращаем клавиатурные подсказки
  function noteKeyboard() {
    touchMode = false;
  }

  // Состояния, где тап по пустому месту работает как Enter
  function tapConfirms() {
    return [STATE.GAMEOVER, STATE.WIN, STATE.VICTORY, STATE.EXIT].includes(state);
  }

  // CSS растягивает холст, поэтому пересчитываем координаты по его размеру на экране
  function toGame(e) {
    const r = el.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * W,
      y: (e.clientY - r.top) / r.height * H,
    };
  }

  function inside(b, p) {
    return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  }

  function capture(e) {
    // Чтобы палец, уехавший за пределы элемента, не терял игру из виду
    const target = e.target && e.target.setPointerCapture ? e.target : el;
    try { target.setPointerCapture(e.pointerId); } catch (err) { /* не критично */ }
  }

  function reset() {
    dragId = null;
    tapId = null;
    btnId = null;
    heldBtn = null;
  }

  function onDown(e) {
    Sfx.init(); // аудиоконтекст создаётся только после действия пользователя
    if (e.pointerType !== 'mouse') touchMode = true;
    if (e.button !== 0) return;
    e.preventDefault();
    const p = toGame(e);

    const btn = uiButtons().find(b => inside(b, p));
    if (btn) {
      if (btnId !== null) return; // кнопку уже держит другой палец
      btnId = e.pointerId;
      heldBtn = btn;
      capture(e);
      return;
    }

    if (state === STATE.PLAY) {
      if (dragId !== null) return; // платформу уже ведёт другой палец
      dragId = e.pointerId;
      movePaddleTo(p.x);
      capture(e);
    } else if (tapId === null) {
      tapId = e.pointerId;
    }
  }

  function onMove(e) {
    if (e.pointerId === dragId) {
      if (state !== STATE.PLAY) { dragId = null; return; }
      movePaddleTo(toGame(e).x);
    } else if (e.pointerId === btnId && heldBtn && !inside(heldBtn, toGame(e))) {
      heldBtn = null; // палец ушёл с кнопки — нажатие не сработает
    }
  }

  function onUp(e) {
    const commit = e.type === 'pointerup'; // pointercancel отменяет действие
    const p = toGame(e);

    if (e.pointerId === btnId) {
      const btn = heldBtn;
      btnId = null;
      heldBtn = null;
      if (commit && btn && inside(btn, p)) btn.action();
      return;
    }

    if (e.pointerId === dragId) {
      dragId = null;
      if (commit && state === STATE.PLAY && !ball.launched) launchBall();
      return;
    }

    if (e.pointerId === tapId) {
      tapId = null;
      if (commit && tapConfirms()) confirmAction();
    }
  }

  function attach(canvasEl) {
    el = canvasEl; // по холсту пересчитываются координаты, но жесты ловим со всей страницы
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);

    // Свернули браузер или переключили вкладку — ставим игру на паузу
    const leave = () => {
      reset();
      if (state === STATE.PLAY) togglePause();
    };
    window.addEventListener('blur', leave);
    document.addEventListener('visibilitychange', () => { if (document.hidden) leave(); });
  }

  return { attach, isTouch, heldButton, noteKeyboard, reset };
})();
