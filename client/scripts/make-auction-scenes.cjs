// Dibuja los fondos de los lotes de la subasta en pixel art. Son originales: `node client/scripts/make-auction-scenes.cjs`.
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const OUT = path.join(__dirname, "../public/auction");
fs.mkdirSync(OUT, { recursive: true });
const W = 320;
const H = 180;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
function rng(seed) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}
function canvas() {
  const png = new PNG({ width: W, height: H });
  const set = (x, y, c) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const [r, g, b] = hex(c);
    const i = (y * W + x) * 4;
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = 255;
  };
  return { png, set };
}
/** Bandas de color con tramado clásico entre una y otra. */
function bands(set, colors, top, bottom) {
  for (let y = top; y < bottom; y++) {
    const t = ((y - top) / (bottom - top)) * (colors.length - 1);
    const a = Math.floor(t);
    const f = t - a;
    for (let x = 0; x < W; x++) set(x, y, colors[Math.min(colors.length - 1, f * 16 > BAYER[y % 4][x % 4] ? a + 1 : a)]);
  }
}
function ridge(set, base, amp, freq, phase, color, shade, r) {
  for (let x = 0; x < W; x++) {
    const h = base + Math.round(Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.7 + phase) * amp * 0.4);
    for (let y = h; y < H; y++) set(x, y, y - h < 3 ? shade : color);
    if (r && r() < 0.25) set(x, h - 1, shade);
  }
}
function disc(set, cx, cy, rad, color) {
  for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) if (x * x + y * y <= rad * rad) set(cx + x, cy + y, color);
}
/** La plataforma ovalada donde se presenta el lote. */
function platform(set, cx, cy, rx, ry, top, rim, dark) {
  for (let y = -ry - 3; y <= ry + 3; y++) {
    for (let x = -rx - 3; x <= rx + 3; x++) {
      const inside = (x * x) / (rx * rx) + (y * y) / (ry * ry);
      const below = (x * x) / (rx * rx) + ((y - 3) * (y - 3)) / (ry * ry);
      if (inside <= 1) set(cx + x, cy + y, inside > 0.72 ? rim : top);
      else if (below <= 1) set(cx + x, cy + y, dark);
    }
  }
}
function pine(set, x, base, h, dark, mid) {
  for (let i = 0; i < h; i++) {
    const w = Math.floor((i / h) * (h * 0.42)) + (i % 5 === 4 ? -1 : 0);
    for (let k = -w; k <= w; k++) set(x + k, base - h + i, k < 0 ? mid : dark);
  }
  for (let i = 0; i < 4; i++) {
    set(x, base + i, "#4a2c17");
    set(x + 1, base + i, "#2f1b0e");
  }
}
function forest() {
  const { png, set } = canvas();
  const r = rng(7);
  bands(set, ["#3f8fe0", "#5aaaee", "#86c8f4", "#bfe6f7"], 0, 110);
  for (const [x, y, s] of [[50, 26, 11], [66, 22, 14], [84, 27, 10], [226, 40, 10], [240, 35, 13], [256, 41, 9]]) {
    disc(set, x, y, s, "#ffffff");
    disc(set, x, y + 4, s - 2, "#e6f4fb");
  }
  ridge(set, 92, 9, 0.022, 1, "#6bb6a8", "#86cdb9");
  for (let x = -6; x < W; x += 13) pine(set, x, 108 + (x % 3), 26 + Math.round(r() * 10), "#2f7a55", "#3f9568");
  ridge(set, 112, 5, 0.03, 2, "#58b84e", "#7ed35f", r);
  for (let x = -4; x < W; x += 34) pine(set, x + Math.round(r() * 10), 124, 36 + Math.round(r() * 8), "#1f5f3f", "#2d7a4f");
  bands(set, ["#6fcf58", "#54b848", "#3ea03d"], 126, H);
  for (let i = 0; i < 260; i++) {
    const x = r() * W;
    const y = 128 + r() * 50;
    set(x, y, "#8fe06b");
    set(x, y - 1, "#8fe06b");
  }
  for (let i = 0; i < 26; i++) set(r() * W, 132 + r() * 44, i % 2 ? "#ffe45e" : "#ff8fb1");
  platform(set, 160, 150, 86, 15, "#c9e88d", "#a2d06a", "#6a9c3f");
  return png;
}
function volcano() {
  const { png, set } = canvas();
  const r = rng(11);
  bands(set, ["#2a0f1f", "#54162a", "#8f1f2c", "#d9472a", "#f58a2e"], 0, 112);
  for (let y = 28; y < 118; y++) {
    const half = 12 + (y - 28) * 1.05;
    for (let x = -half; x <= half; x++) set(160 + x, y, x < half * 0.2 ? "#3a2230" : "#2a1824");
  }
  for (let y = 20; y < 38; y++) for (let x = -14; x <= 14; x++) if (y > 28 || Math.abs(x) < 6) set(160 + x, y, y > 30 ? "#ffb02e" : "#ff6a1f");
  for (const [sx, drift] of [[152, -0.32], [163, 0.1], [171, 0.42]]) {
    for (let y = 30; y < 116; y++) {
      const x = sx + (y - 30) * drift;
      set(x, y, "#ff7a1f");
      set(x + 1, y, "#ffc23d");
    }
  }
  for (let i = 0; i < 70; i++) set(r() * W, r() * 90, r() > 0.5 ? "#ffb02e" : "#ff6a1f");
  for (const [x, y, s] of [[150, 14, 7], [162, 8, 9], [175, 13, 6]]) disc(set, x, y, s, "#4a3340");
  ridge(set, 106, 7, 0.04, 0.5, "#40202b", "#5a2c33", r);
  bands(set, ["#5a2c2f", "#46222a", "#351a24"], 122, H);
  for (let i = 0; i < 60; i++) {
    const x = r() * W;
    const y = 124 + r() * 54;
    const l = 4 + r() * 10;
    for (let k = 0; k < l; k++) set(x + k, y, i % 3 ? "#28131b" : "#ff7a1f");
  }
  platform(set, 160, 150, 86, 15, "#8a5a4a", "#6b4238", "#3d2226");
  return png;
}
function beach() {
  const { png, set } = canvas();
  const r = rng(21);
  bands(set, ["#5b4bb5", "#b65ba8", "#f27f8f", "#fdb47a", "#ffe08a"], 0, 86);
  disc(set, 236, 70, 22, "#fff0a8");
  disc(set, 236, 70, 17, "#ffd764");
  for (const [x, y, s] of [[58, 26, 8], [72, 23, 10], [86, 27, 7], [132, 44, 6], [144, 42, 8]]) disc(set, x, y, s, "#ffc2c7");
  bands(set, ["#ffbf7a", "#3fb4d8", "#2a93c9", "#1e78b5"], 86, 124);
  for (let i = 0; i < 190; i++) {
    const x = r() * W;
    const y = 88 + r() * 36;
    const l = 2 + r() * 9;
    for (let k = 0; k < l; k++) set(x + k, y, Math.abs(x - 236) < 28 ? "#fff0a8" : "#9fe3f0");
  }
  for (let x = 0; x < W; x++) {
    const y = 122 + Math.round(Math.sin(x * 0.07) * 2);
    set(x, y, "#ffffff");
    set(x, y + 1, "#d7f3f5");
  }
  bands(set, ["#fbe3a0", "#f5d185", "#e9bb6c"], 125, H);
  for (let i = 0; i < 200; i++) set(r() * W, 127 + r() * 52, i % 2 ? "#d7a658" : "#fff1c4");
  for (let i = 0; i < 18; i++) {
    const p = i / 18;
    set(28 + p * 16, 124 - p * 58, "#6b4426");
    set(29 + p * 16, 124 - p * 58, "#4f301a");
    set(28 + p * 16, 125 - p * 58, "#6b4426");
    set(29 + p * 16, 125 - p * 58, "#4f301a");
  }
  for (let a = 0; a < 6; a++) {
    for (let t = 0; t < 22; t++) {
      const an = a * 1.05 + 0.1;
      set(44 + Math.cos(an) * t, 66 - Math.sin(an) * t + (t * t) / 28, "#2f8f5b");
      set(44 + Math.cos(an) * t, 67 - Math.sin(an) * t + (t * t) / 28, "#1f6d45");
    }
  }
  platform(set, 160, 150, 86, 15, "#fff1c4", "#e7cc8b", "#b58f4f");
  return png;
}
function night() {
  const { png, set } = canvas();
  const r = rng(33);
  bands(set, ["#0a0a2e", "#14154a", "#231f6b", "#3a2f8f"], 0, 112);
  for (let i = 0; i < 130; i++) set(r() * W, r() * 96, r() > 0.7 ? "#ffffff" : "#9aa3e6");
  disc(set, 258, 36, 17, "#fff5c9");
  disc(set, 265, 31, 15, "#14154a");
  for (const [peak, half, h] of [[60, 72, 72], [150, 62, 88], [244, 80, 64]]) {
    for (let x = -half; x <= half; x++) {
      const top = 112 - h * (1 - Math.abs(x) / half);
      for (let y = top; y < 118; y++) set(peak + x, y, y - top < 9 + (x % 5) ? "#c8d0f5" : x < 0 ? "#3d3a8f" : "#2c2a70");
    }
  }
  ridge(set, 112, 4, 0.05, 3, "#26235f", "#3d3a8f", r);
  for (let x = -4; x < W; x += 21) pine(set, x, 124, 24 + Math.round(r() * 8), "#10143f", "#1a1f55");
  bands(set, ["#2f2c80", "#262368", "#1c1a52"], 124, H);
  for (let i = 0; i < 26; i++) {
    const x = r() * W;
    const y = 128 + r() * 48;
    set(x, y, "#b6ff7a");
    set(x + 1, y, "#6fdc55");
  }
  platform(set, 160, 150, 86, 15, "#6d6ad0", "#524fb0", "#2a2870");
  return png;
}

for (const [name, draw] of Object.entries({ bosque: forest, volcan: volcano, playa: beach, noche: night })) {
  fs.writeFileSync(path.join(OUT, `lote-${name}.png`), PNG.sync.write(draw()));
}
