// Фоновая музыка — пошаговый секвенсор на Web Audio API.
// 8 тактов в ля миноре, 128 BPM, зациклено. Слои включаются/выключаются
// через отдельные gain-узлы: Music.setLayer('arp', true).
//
// Слои:
//   bass, drums, melody — базовые, всегда играют
//   arp   — быстрый арпеджио + хай-хэты 16-ми   (бонус «Ускорение»)
//   pad   — тянущиеся аккорды                    (бонус «Широкая платформа»)
//   bells — колокольчики на слабых долях          (бонус «Очки x2»)

const Music = (() => {
  const BPM = 128;
  const BARS = 8;
  const STEPS_PER_BAR = 16;           // 16-е ноты
  const TOTAL_STEPS = BARS * STEPS_PER_BAR;
  const STEP_DUR = 60 / BPM / 4;      // длительность 16-й в секундах
  const LOOKAHEAD_MS = 25;            // как часто планировщик просыпается
  const SCHEDULE_AHEAD = 0.12;        // на сколько секунд вперёд планируем

  let ctx = null;
  let out = null;                     // общий выход музыки
  let noiseBuffer = null;
  const layerGain = {};               // имя слоя -> GainNode
  const layerOn = { bass: true, drums: true, melody: true, arp: false, pad: false, bells: false };
  const LAYER_VOL = { bass: 1, drums: 1, melody: 1, arp: 1, pad: 1, bells: 1 };

  let timer = null;
  let playing = false;
  let wantPlaying = false;
  let step = 0;
  let nextStepTime = 0;
  let ducked = false;

  // ---------- Ноты ----------

  const NOTE_INDEX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  function midi(name) {
    const m = name.match(/^([A-G]#?)(-?\d)$/);
    return NOTE_INDEX[m[1]] + (parseInt(m[2], 10) + 1) * 12;
  }
  function freq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  // Аккорды по тактам: Am F C G | Am F C E  (E мажор — доминанта, тянет обратно в Am)
  const CHORDS = [
    ['A', 'C', 'E'], ['F', 'A', 'C'], ['C', 'E', 'G'], ['G', 'B', 'D'],
    ['A', 'C', 'E'], ['F', 'A', 'C'], ['C', 'E', 'G'], ['E', 'G#', 'B'],
  ];
  const BASS_ROOTS = ['A2', 'F2', 'C3', 'G2', 'A2', 'F2', 'C3', 'E2'].map(midi);

  // Мелодия: [шаг, нота, длительность в шагах]
  const MELODY = [
    // такт 1 (Am)
    [0, 'E5', 4], [4, 'C5', 2], [6, 'D5', 2], [8, 'E5', 4], [12, 'A4', 4],
    // такт 2 (F)
    [16, 'C5', 4], [20, 'A4', 2], [22, 'C5', 2], [24, 'F5', 6],
    // такт 3 (C)
    [32, 'E5', 4], [36, 'G5', 4], [40, 'E5', 2], [42, 'D5', 2], [44, 'C5', 4],
    // такт 4 (G)
    [48, 'D5', 4], [52, 'B4', 2], [54, 'D5', 2], [56, 'G5', 4], [60, 'D5', 4],
    // такт 5 (Am)
    [64, 'E5', 4], [68, 'C5', 2], [70, 'D5', 2], [72, 'E5', 4], [76, 'A5', 4],
    // такт 6 (F)
    [80, 'G5', 4], [84, 'F5', 2], [86, 'E5', 2], [88, 'F5', 6],
    // такт 7 (C)
    [96, 'E5', 4], [100, 'D5', 2], [102, 'C5', 2], [104, 'G4', 4], [108, 'C5', 4],
    // такт 8 (E) — подводка к началу
    [112, 'B4', 4], [116, 'G#4', 4], [120, 'B4', 3], [123, 'D5', 1], [124, 'E5', 2], [126, 'D5', 2],
  ].map(([s, n, d]) => [s, midi(n), d]);
  const melodyByStep = {};
  for (const [s, m, d] of MELODY) melodyByStep[s] = [m, d];

  // Бас: рисунок восьмыми внутри такта (смещение от корня в полутонах, null — пауза)
  const BASS_PATTERN = [0, null, 0, null, 12, null, 0, null, 0, null, 7, null, 12, null, 0, null];

  // Арпеджио: индексы нот аккорда (3 = корень на октаву выше и т.д.)
  const ARP_PATTERN = [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 5, 4, 3, 2];

  // ---------- Инициализация ----------

  function init(audioCtx, destination) {
    if (ctx) return;
    ctx = audioCtx;
    out = ctx.createGain();
    out.gain.value = 0;
    out.connect(destination);

    for (const name of Object.keys(layerOn)) {
      const g = ctx.createGain();
      g.gain.value = layerOn[name] ? LAYER_VOL[name] : 0;
      g.connect(out);
      layerGain[name] = g;
    }

    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  // ---------- Инструменты ----------

  function note(layer, { type = 'square', f, t, dur, vol = 0.2, attack = 0.005, release = 0.03, lp = null, detune = 0 }) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = f;
    osc.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, Math.max(t + attack, t + dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let chain = osc;
    if (lp) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lp;
      chain.connect(filter);
      chain = filter;
    }
    chain.connect(g).connect(layerGain[layer]);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Ударный с экспоненциальным затуханием (для колокольчиков и т.п.)
  function pluck(layer, { type = 'sine', f, t, dur, vol = 0.2 }) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = f;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(layerGain[layer]);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noiseHit(layer, { t, dur, vol, filterType = 'highpass', filterFreq = 6000 }) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(layerGain[layer]);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function kick(t) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g).connect(layerGain.drums);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  function snare(t) {
    noiseHit('drums', { t, dur: 0.12, vol: 0.35, filterType: 'bandpass', filterFreq: 1800 });
    pluck('drums', { type: 'triangle', f: 200, t, dur: 0.08, vol: 0.25 });
  }

  function hat(layer, t, vol) {
    noiseHit(layer, { t, dur: 0.03, vol, filterType: 'highpass', filterFreq: 8000 });
  }

  // ---------- Планировщик ----------

  function scheduleStep(s, t) {
    const bar = Math.floor(s / STEPS_PER_BAR);
    const inBar = s % STEPS_PER_BAR;
    const chord = CHORDS[bar];
    const chordMidi = chord.map(n => midi(n + '4'));

    // Ударные (базовый слой): бочка на 1 и 3, малый на 2 и 4, хэты по восьмым
    if (inBar === 0 || inBar === 8) kick(t);
    if (inBar === 10 && bar % 2 === 1) kick(t); // синкопа в конце чётных тактов
    if (inBar === 4 || inBar === 12) snare(t);
    if (inBar % 4 === 2) hat('drums', t, 0.12);

    // Бас
    const bassOff = BASS_PATTERN[inBar];
    if (bassOff !== null) {
      note('bass', { type: 'square', f: freq(BASS_ROOTS[bar] + bassOff), t, dur: STEP_DUR * 1.8, vol: 0.28, lp: 500 });
    }

    // Мелодия
    if (melodyByStep[s]) {
      const [m, d] = melodyByStep[s];
      note('melody', { type: 'square', f: freq(m), t, dur: STEP_DUR * d * 0.9, vol: 0.13, attack: 0.01, release: 0.05, lp: 2600 });
    }

    // Арпеджио + хэты 16-ми (слой arp)
    const arpIdx = ARP_PATTERN[inBar];
    const arpMidi = chordMidi[arpIdx % 3] + 12 * Math.floor(arpIdx / 3) + 12;
    pluck('arp', { type: 'square', f: freq(arpMidi), t, dur: STEP_DUR * 0.9, vol: 0.07 });
    if (inBar % 2 === 1) hat('arp', t, 0.08);

    // Пад: тянущийся аккорд на весь такт (слой pad)
    if (inBar === 0) {
      chordMidi.forEach((m, i) => {
        note('pad', { type: 'triangle', f: freq(m - 12), t, dur: STEP_DUR * STEPS_PER_BAR, vol: 0.09, attack: 0.25, release: 0.4, lp: 1200, detune: i === 1 ? 6 : -6 });
        note('pad', { type: 'sawtooth', f: freq(m), t, dur: STEP_DUR * STEPS_PER_BAR, vol: 0.03, attack: 0.3, release: 0.4, lp: 900 });
      });
    }

    // Колокольчики на слабых восьмых (слой bells)
    if (inBar % 4 === 2) {
      const i = (Math.floor(inBar / 4) + bar) % 3;
      pluck('bells', { type: 'sine', f: freq(chordMidi[i] + 24), t, dur: STEP_DUR * 3, vol: 0.14 });
      pluck('bells', { type: 'sine', f: freq(chordMidi[i] + 24) * 3, t, dur: STEP_DUR * 1.2, vol: 0.03 }); // обертон для "стеклянности"
    }
  }

  function scheduler() {
    while (nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
      scheduleStep(step, nextStepTime);
      nextStepTime += STEP_DUR;
      step = (step + 1) % TOTAL_STEPS;
    }
  }

  // ---------- Публичное API ----------

  function start() {
    wantPlaying = true;
    tick();
  }

  function stop() {
    wantPlaying = false;
    if (!playing) return;
    playing = false;
    clearInterval(timer);
    timer = null;
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
  }

  // Вызывать каждый кадр: запускает музыку, как только контекст готов
  function tick() {
    if (!ctx || !wantPlaying || playing) return;
    playing = true;
    step = 0;
    nextStepTime = ctx.currentTime + 0.05;
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setTargetAtTime(ducked ? 0.3 : 1, ctx.currentTime, 0.1);
    timer = setInterval(scheduler, LOOKAHEAD_MS);
  }

  function setLayer(name, on) {
    layerOn[name] = on;
    if (!ctx) return;
    const g = layerGain[name].gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setTargetAtTime(on ? LAYER_VOL[name] : 0, ctx.currentTime, on ? 0.05 : 0.15);
  }

  function resetLayers() {
    for (const name of ['arp', 'pad', 'bells']) setLayer(name, false);
  }

  // Приглушить (пауза)
  function setDuck(on) {
    ducked = on;
    if (!ctx || !playing) return;
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setTargetAtTime(on ? 0.3 : 1, ctx.currentTime, 0.1);
  }

  return {
    init, start, stop, tick, setLayer, resetLayers, setDuck,
    isPlaying: () => playing,
    activeLayers: () => Object.keys(layerOn).filter(k => layerOn[k]),
  };
})();
