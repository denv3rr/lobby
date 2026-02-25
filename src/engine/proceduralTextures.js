import * as THREE from "three";

function createCanvas(size = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function drawNoise(ctx, size, alpha = 0.08) {
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const value = Math.floor(Math.random() * 255);
    image.data[i] = value;
    image.data[i + 1] = value;
    image.data[i + 2] = value;
    image.data[i + 3] = Math.floor(255 * alpha);
  }
  ctx.putImageData(image, 0, 0);
}

function createCheckerboard() {
  const size = 512;
  const cells = 16;
  const cellSize = size / cells;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      const isLight = (x + y) % 2 === 0;
      ctx.fillStyle = isLight ? "#d8d8d2" : "#222222";
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }
  drawNoise(ctx, size, 0.04);
  return canvas;
}

function createCheckerboardBw() {
  const size = 512;
  const cells = 16;
  const cellSize = size / cells;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      const isLight = (x + y) % 2 === 0;
      ctx.fillStyle = isLight ? "#ffffff" : "#000000";
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }

  return canvas;
}

function createNeonGrid() {
  const size = 512;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, "#05060a");
  gradient.addColorStop(1, "#0b0f16");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "rgba(72, 255, 226, 0.38)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= 16; i += 1) {
    const p = (size / 16) * i;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(240, 74, 255, 0.16)";
  for (let i = 0; i <= 8; i += 1) {
    const p = (size / 8) * i;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
  }

  return canvas;
}

function createConcrete() {
  const size = 512;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#6f6d66";
  ctx.fillRect(0, 0, size, size);
  drawNoise(ctx, size, 0.16);

  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = "#3f3e3a";
  for (let i = 0; i < 30; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const w = Math.random() * 100 + 20;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + Math.random() * 8 - 4);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return canvas;
}

function createMarble() {
  const size = 512;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#d9d4c8");
  gradient.addColorStop(0.45, "#c9c3b6");
  gradient.addColorStop(1, "#b9b4aa");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "rgba(84, 78, 71, 0.22)";
  for (let i = 0; i < 34; i += 1) {
    const startX = Math.random() * size;
    const startY = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (let j = 0; j < 4; j += 1) {
      ctx.lineTo(startX + Math.random() * 80 - 40, startY + j * 26);
    }
    ctx.stroke();
  }

  drawNoise(ctx, size, 0.06);
  return canvas;
}

function createRomanPlaster() {
  const size = 512;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, "#8a2f2a");
  gradient.addColorStop(1, "#60201f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  drawNoise(ctx, size, 0.12);

  ctx.strokeStyle = "rgba(255, 227, 186, 0.06)";
  for (let i = 0; i < 24; i += 1) {
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + Math.random() * 12 - 6);
    ctx.stroke();
  }

  return canvas;
}

function createWater() {
  const size = 512;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, "#2ea2be");
  gradient.addColorStop(0.55, "#1f6b82");
  gradient.addColorStop(1, "#0d394d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "rgba(220, 245, 255, 0.2)";
  for (let i = 0; i < 50; i += 1) {
    const y = (size / 50) * i;
    ctx.beginPath();
    ctx.moveTo(0, y + Math.sin(i * 0.6) * 2);
    ctx.bezierCurveTo(size * 0.25, y + 6, size * 0.75, y - 6, size, y + 2);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 60; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 14 + 3;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(245,255,255,0.6)");
    g.addColorStop(1, "rgba(245,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return canvas;
}

function createPompeiiFresco() {
  const size = 512;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  const base = ctx.createLinearGradient(0, 0, 0, size);
  base.addColorStop(0, "#8c312a");
  base.addColorStop(0.5, "#742722");
  base.addColorStop(1, "#5d1f1c");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "rgba(240, 215, 170, 0.22)";
  ctx.fillRect(0, size * 0.12, size, size * 0.035);
  ctx.fillRect(0, size * 0.84, size, size * 0.03);

  ctx.strokeStyle = "rgba(36, 10, 8, 0.32)";
  for (let i = 0; i < 28; i += 1) {
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + Math.random() * 10 - 5);
    ctx.stroke();
  }

  drawNoise(ctx, size, 0.08);
  return canvas;
}

function createMosaic() {
  const size = 512;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const cells = 32;
  const cell = size / cells;

  ctx.fillStyle = "#d4cec2";
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      const tint = (x + y) % 3;
      if (tint === 0) ctx.fillStyle = "#cbc3b6";
      if (tint === 1) ctx.fillStyle = "#bfb6a7";
      if (tint === 2) ctx.fillStyle = "#ded7cb";
      ctx.fillRect(x * cell, y * cell, cell - 1, cell - 1);
    }
  }

  ctx.strokeStyle = "rgba(70, 63, 56, 0.22)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= cells; i += 1) {
    const p = i * cell;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  return canvas;
}

function createBackroomsWallpaper() {
  const size = 512;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, "#c7bf74");
  gradient.addColorStop(1, "#b6ae63");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.globalAlpha = 0.2;
  for (let y = 0; y < size; y += 34) {
    ctx.fillStyle = "rgba(150, 144, 92, 0.4)";
    ctx.fillRect(0, y, size, 4);
  }
  for (let x = 0; x < size; x += 44) {
    ctx.fillStyle = "rgba(172, 162, 106, 0.25)";
    ctx.fillRect(x, 0, 3, size);
  }
  ctx.globalAlpha = 1;

  drawNoise(ctx, size, 0.08);
  return canvas;
}

function createBackroomsCarpet() {
  const size = 512;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#8c7d3a";
  ctx.fillRect(0, 0, size, size);
  drawNoise(ctx, size, 0.2);

  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#6f6431";
  for (let i = 0; i < 1400; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;

  return canvas;
}

function createOfficeCeiling() {
  const size = 512;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const tiles = 8;
  const tile = size / tiles;

  ctx.fillStyle = "#d9d9d2";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(120, 120, 116, 0.45)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= tiles; i += 1) {
    const p = i * tile;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(248, 248, 226, 0.5)";
  for (let y = 0; y < tiles; y += 2) {
    for (let x = 0; x < tiles; x += 2) {
      ctx.fillRect(x * tile + tile * 0.15, y * tile + tile * 0.15, tile * 0.7, tile * 0.7);
    }
  }
  return canvas;
}

function createFlame() {
  const size = 512;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, size, 0, 0);
  gradient.addColorStop(0, "#140303");
  gradient.addColorStop(0.2, "#3a0f05");
  gradient.addColorStop(0.45, "#8f2608");
  gradient.addColorStop(0.68, "#e04e11");
  gradient.addColorStop(0.9, "#ff9a1f");
  gradient.addColorStop(1, "#ffd66a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.globalAlpha = 0.45;
  for (let i = 0; i < 140; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = Math.random() * 28 + 8;
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, "rgba(255,226,142,0.8)");
    g.addColorStop(0.4, "rgba(255,138,40,0.5)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return canvas;
}

export function createProceduralTexture(name) {
  let canvas = null;
  if (name === "checkerboard") {
    canvas = createCheckerboard();
  } else if (name === "checkerboard-bw") {
    canvas = createCheckerboardBw();
  } else if (name === "pompeii-fresco") {
    canvas = createPompeiiFresco();
  } else if (name === "mosaic") {
    canvas = createMosaic();
  } else if (name === "marble") {
    canvas = createMarble();
  } else if (name === "roman-plaster") {
    canvas = createRomanPlaster();
  } else if (name === "water") {
    canvas = createWater();
  } else if (name === "backrooms-wallpaper") {
    canvas = createBackroomsWallpaper();
  } else if (name === "backrooms-carpet") {
    canvas = createBackroomsCarpet();
  } else if (name === "office-ceiling") {
    canvas = createOfficeCeiling();
  } else if (name === "neon-grid") {
    canvas = createNeonGrid();
  } else if (name === "flame") {
    canvas = createFlame();
  } else {
    canvas = createConcrete();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}
