// Звуковые эффекты — синтез через Web Audio API, без аудиофайлов.
// Использование: Sfx.init() после первого нажатия клавиши (требование браузеров),
// затем Sfx.play('имя'). Sfx.toggleMute() — выключить/включить звук.

const Sfx = (() => {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    // Буфер белого шума длиной 1 с — для ударов о камень/сталь
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Музыка идёт через тот же мастер-гейн, чтобы M глушила и её
    if (typeof Music !== 'undefined') Music.init(ctx, master);
  }

  function ready() {
    return ctx !== null && !muted;
  }

  // Тон с огибающей (атака → экспоненциальное затухание) и опциональным скольжением частоты
  function tone({ type = 'sine', freq = 440, freqEnd = null, dur = 0.1, vol = 0.3, delay = 0, attack = 0.005 }) {
    if (!ready()) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Шумовой всплеск через фильтр
  function noise({ dur = 0.1, vol = 0.3, filterFreq = 1000, filterType = 'lowpass', delay = 0 }) {
    if (!ready()) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // Последовательность нот
  function arpeggio(freqs, { type = 'square', dur = 0.09, vol = 0.15, step = 0.06 } = {}) {
    freqs.forEach((f, i) => tone({ type, freq: f, dur, vol, delay: i * step }));
  }

  const sounds = {
    // Столкновения
    wall:   () => tone({ type: 'square', freq: 320, freqEnd: 260, dur: 0.04, vol: 0.10 }),
    paddle: () => {
      tone({ type: 'triangle', freq: 240, freqEnd: 160, dur: 0.09, vol: 0.35 });
      noise({ dur: 0.04, vol: 0.08, filterFreq: 600 });
    },

    // Кирпичи: "Hit" — повреждение, "Break" — разрушение
    brickNormalBreak: () => tone({ type: 'triangle', freq: 700, freqEnd: 350, dur: 0.10, vol: 0.30 }),
    brickStoneHit: () => {
      noise({ dur: 0.08, vol: 0.35, filterFreq: 900 });
      tone({ type: 'sine', freq: 180, freqEnd: 90, dur: 0.10, vol: 0.30 });
    },
    brickStoneBreak: () => {
      noise({ dur: 0.18, vol: 0.45, filterFreq: 1400 });
      tone({ type: 'sine', freq: 160, freqEnd: 60, dur: 0.20, vol: 0.35 });
    },
    brickSteelHit: () => {
      // Металлический звон — два негармоничных тона + щелчок
      tone({ type: 'sine', freq: 1800, freqEnd: 1700, dur: 0.16, vol: 0.20 });
      tone({ type: 'sine', freq: 2750, freqEnd: 2600, dur: 0.10, vol: 0.10 });
      noise({ dur: 0.03, vol: 0.15, filterFreq: 4000, filterType: 'highpass' });
    },
    brickSteelBreak: () => {
      tone({ type: 'sawtooth', freq: 1200, freqEnd: 300, dur: 0.18, vol: 0.20 });
      noise({ dur: 0.22, vol: 0.40, filterFreq: 3000, filterType: 'highpass' });
    },

    // Бонусы
    powerup:    () => arpeggio([523, 659, 784, 1047]),
    powerupEnd: () => arpeggio([784, 523], { dur: 0.10, vol: 0.12, step: 0.09 }),

    // События игры
    launch:   () => tone({ type: 'sine', freq: 300, freqEnd: 600, dur: 0.08, vol: 0.20 }),
    loseLife: () => tone({ type: 'sawtooth', freq: 400, freqEnd: 80, dur: 0.45, vol: 0.30 }),
    levelWin: () => arpeggio([523, 659, 784, 1047, 1319], { type: 'triangle', dur: 0.18, vol: 0.25, step: 0.10 }),
    victory:  () => arpeggio([523, 659, 784, 1047, 784, 1047, 1319, 1568], { type: 'triangle', dur: 0.22, vol: 0.25, step: 0.12 }),
    gameOver: () => arpeggio([392, 330, 262, 196], { type: 'sawtooth', dur: 0.30, vol: 0.20, step: 0.22 }),

    // Меню
    menuMove:   () => tone({ type: 'square', freq: 600, dur: 0.03, vol: 0.08 }),
    menuSelect: () => tone({ type: 'square', freq: 800, freqEnd: 1200, dur: 0.08, vol: 0.12 }),
  };

  function play(name) {
    const fn = sounds[name];
    if (fn) fn();
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.02);
    return muted;
  }

  return { init, play, toggleMute, isMuted: () => muted };
})();
