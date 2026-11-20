// Audio del video, 100 % original y generado aquí (sin derechos de terceros):
//  · Música: progresión suave Cmaj7 – Am7 – Fmaj7 – G6 a 92 pulsos por minuto, con
//    colchón de acordes, bajo, arpegio pulsado y un shaker muy suave.
//  · Efectos sincronizados con lo que pasa en pantalla: clic, teclas, transición
//    (whoosh), éxito (dos notas) y campana de las tarjetas de título.
import fs from "node:fs";

const SR = 44100;
const nota = (n) => 440 * Math.pow(2, (n - 69) / 12);   // número MIDI → Hz

export function generarAudio(duracion, eventos, salida) {
  const N = Math.ceil(duracion * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const sumar = (i, v, pan = 0) => { if (i >= 0 && i < N) { L[i] += v * (1 - Math.max(pan, 0)); R[i] += v * (1 + Math.min(pan, 0)); } };
  let semilla = 7; const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647) * 2 - 1;

  // ---------- Música ----------
  const bpm = 92, pulso = 60 / bpm, compas = pulso * 4;
  const acordes = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 64]];   // Cmaj7, Am7, Fmaj7, G6
  const bajos = [36, 33, 29, 31];
  const volMus = 0.55;
  for (let c = 0; c * compas < duracion; c++) {
    const ac = acordes[c % 4], t0 = c * compas;
    // Colchón: cada nota con dos osciladores levemente desafinados y envolvente lenta
    for (const n of ac) {
      const f = nota(n), f2 = f * 1.003;
      const ini = Math.floor(t0 * SR), largo = Math.floor((compas + 0.6) * SR);
      for (let k = 0; k < largo; k++) {
        const t = k / SR; const env = Math.min(t / 0.5, 1) * Math.min(1, Math.max(0, (compas + 0.6 - t) / 0.7));
        const v = (Math.sin(2 * Math.PI * f * t) + 0.6 * Math.sin(2 * Math.PI * f2 * t) + 0.12 * Math.sin(4 * Math.PI * f * t)) * env * 0.022 * volMus;
        sumar(ini + k, v, n % 2 ? 0.25 : -0.25);
      }
    }
    // Bajo en los pulsos 1 y 3
    for (const b of [0, 2]) {
      const f = nota(bajos[c % 4]), ini = Math.floor((t0 + b * pulso) * SR), largo = Math.floor(pulso * 1.8 * SR);
      for (let k = 0; k < largo; k++) { const t = k / SR; const env = Math.min(t / 0.01, 1) * Math.exp(-t * 2.2);
        sumar(ini + k, (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)) * env * 0.11 * volMus); }
    }
    // Arpegio pulsado en corcheas
    for (let s = 0; s < 8; s++) {
      const n = ac[[0, 1, 2, 3, 2, 1, 2, 3][s]] + 12, f = nota(n), ini = Math.floor((t0 + s * pulso / 2) * SR), largo = Math.floor(0.5 * SR);
      for (let k = 0; k < largo; k++) { const t = k / SR; const env = Math.min(t / 0.004, 1) * Math.exp(-t * 7);
        sumar(ini + k, (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(6 * Math.PI * f * t)) * env * 0.03 * volMus, s % 2 ? 0.35 : -0.35); }
    }
    // Shaker suave en los contratiempos
    for (let s = 0; s < 8; s++) {
      if (s % 2 === 0) continue;
      const ini = Math.floor((t0 + s * pulso / 2) * SR), largo = Math.floor(0.06 * SR); let ant = 0;
      for (let k = 0; k < largo; k++) { const t = k / SR, r = azar(); const hp = r - ant; ant = r; sumar(ini + k, hp * Math.exp(-t * 60) * 0.018 * volMus, 0.2); }
    }
  }
  // Entrada y salida suaves de la música
  for (let i = 0; i < N; i++) { const t = i / SR; const g = Math.min(1, t / 2.5) * Math.min(1, (duracion - t) / 3.5); L[i] *= g; R[i] *= g; }

  // ---------- Efectos ----------
  const efecto = {
    clic(i) { for (let k = 0; k < 0.05 * SR; k++) { const t = k / SR; sumar(i + k, (Math.sin(2 * Math.PI * 2300 * t) * Math.exp(-t * 140) * 0.32) + azar() * Math.exp(-t * 900) * 0.18); } },
    tecla(i) { const f = 1700 + azar() * 400; for (let k = 0; k < 0.025 * SR; k++) { const t = k / SR; sumar(i + k, (azar() * 0.6 + Math.sin(2 * Math.PI * f * t)) * Math.exp(-t * 320) * 0.07); } },
    whoosh(i) {
      const largo = 0.75 * SR; let lp = 0;
      for (let k = 0; k < largo; k++) { const t = k / largo; const env = Math.sin(Math.PI * t) ** 2; const a = 0.02 + 0.25 * Math.sin(Math.PI * t);
        lp += a * (azar() - lp); sumar(i + k, lp * env * 0.9, (t - 0.5) * 1.2); }
    },
    exito(i) {
      for (const [n, d] of [[88, 0], [95, 0.13]]) { const f = nota(n), ini = i + Math.floor(d * SR);
        for (let k = 0; k < 0.9 * SR; k++) { const t = k / SR; sumar(ini + k, (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)) * Math.min(t / 0.005, 1) * Math.exp(-t * 5) * 0.16); } }
    },
    campana(i) {
      for (const [n, v] of [[84, 0.15], [91, 0.08], [96, 0.05]]) { const f = nota(n);
        for (let k = 0; k < 1.8 * SR; k++) { const t = k / SR; sumar(i + k, Math.sin(2 * Math.PI * f * t) * Math.min(t / 0.003, 1) * Math.exp(-t * 2.6) * v); } }
    },
    pop(i) { for (let k = 0; k < 0.12 * SR; k++) { const t = k / SR; const f = 500 + 900 * Math.exp(-t * 40); sumar(i + k, Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 35) * 0.16); } },
  };
  for (const e of eventos) if (efecto[e.tipo]) efecto[e.tipo](Math.floor(e.t * SR));

  // ---------- Normalizar y escribir WAV 16 bits estéreo ----------
  let pico = 0; for (let i = 0; i < N; i++) pico = Math.max(pico, Math.abs(L[i]), Math.abs(R[i]));
  const g = pico > 0 ? 0.89 / pico : 1;
  const buf = Buffer.alloc(44 + N * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(Math.tanh(L[i] * g) * 32767))), 44 + i * 4);
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(Math.tanh(R[i] * g) * 32767))), 46 + i * 4);
  }
  fs.writeFileSync(salida, buf);
}
