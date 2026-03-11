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

function createDirt() {
  const size = 512;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, "#6f5a41");
  gradient.addColorStop(0.55, "#5b4732");
  gradient.addColorStop(1, "#473724");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  drawNoise(ctx, size, 0.18);

  ctx.globalAlpha = 0.32;
  for (let i = 0; i < 180; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = Math.random() * 10 + 2;
    ctx.fillStyle = i % 3 === 0 ? "#7f684b" : i % 2 === 0 ? "#4f3d28" : "#8d7657";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return canvas;
}

function createGrass() {
  const size = 512;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, "#59724f");
  gradient.addColorStop(0.5, "#44613f");
  gradient.addColorStop(1, "#344d31");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  drawNoise(ctx, size, 0.12);

  ctx.globalAlpha = 0.38;
  ctx.strokeStyle = "#7ba267";
  ctx.lineWidth = 2;
  for (let i = 0; i < 320; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const height = Math.random() * 12 + 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.random() * 4 - 2, y - height);
    ctx.stroke();
  }

  ctx.strokeStyle = "#2d4129";
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 140; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const width = Math.random() * 10 + 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y + Math.random() * 6 - 3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return canvas;
}

function drawTopoContours(ctx, size, options = {}) {
  const spacing = Math.max(12, Number(options.spacing) || 26);
  const wiggle = Math.max(2, Number(options.wiggle) || 6);
  const lineWidth = Math.max(0.8, Number(options.lineWidth) || 1.4);
  const offset = Number(options.offset) || 0;
  ctx.save();
  ctx.globalAlpha = options.alpha ?? 0.34;
  ctx.strokeStyle = options.lineColor || "#dbe4d8";
  ctx.lineWidth = lineWidth;

  for (let band = -spacing; band <= size + spacing; band += spacing) {
    ctx.beginPath();
    for (let x = -6; x <= size + 6; x += 6) {
      const waveA = Math.sin(x * 0.026 + band * 0.068 + offset) * wiggle;
      const waveB = Math.cos(x * 0.071 - band * 0.034 + offset * 1.8) * wiggle * 0.42;
      const y = band + waveA + waveB;
      if (x <= 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  ctx.restore();
}

function createTopoRock() {
  const size = 512;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#45515a");
  gradient.addColorStop(0.5, "#303943");
  gradient.addColorStop(1, "#1b242c");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  drawNoise(ctx, size, 0.14);

  ctx.globalAlpha = 0.22;
  for (let index = 0; index < 150; index += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = Math.random() * 12 + 2;
    ctx.fillStyle = index % 2 === 0 ? "#61707a" : "#202930";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  drawTopoContours(ctx, size, {
    lineColor: "#d8e0e4",
    alpha: 0.26,
    spacing: 28,
    wiggle: 7,
    lineWidth: 1.5,
    offset: 0.6
  });

  return canvas;
}

function createTopoSand() {
  const size = 512;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, "#b89468");
  gradient.addColorStop(0.55, "#8d6a46");
  gradient.addColorStop(1, "#68482e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  drawNoise(ctx, size, 0.12);

  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#d7b78f";
  for (let index = 0; index < 220; index += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const width = Math.random() * 18 + 4;
    const height = Math.random() * 5 + 1;
    ctx.fillRect(x, y, width, height);
  }
  ctx.globalAlpha = 1;

  drawTopoContours(ctx, size, {
    lineColor: "#f0ddc2",
    alpha: 0.28,
    spacing: 24,
    wiggle: 5,
    lineWidth: 1.25,
    offset: 1.3
  });

  return canvas;
}

function createTopoGrass() {
  const size = 512;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#5f7b55");
  gradient.addColorStop(0.52, "#415e40");
  gradient.addColorStop(1, "#2d4130");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  drawNoise(ctx, size, 0.1);

  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "#86a16f";
  ctx.lineWidth = 2;
  for (let index = 0; index < 220; index += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const height = Math.random() * 12 + 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.random() * 5 - 2.5, y - height);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  drawTopoContours(ctx, size, {
    lineColor: "#dce8d1",
    alpha: 0.18,
    spacing: 26,
    wiggle: 6,
    lineWidth: 1.1,
    offset: 0.2
  });

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

function createM4Silhouette() {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width * 0.12, height * 0.55);

  const bodyGradient = ctx.createLinearGradient(0, -120, 0, 120);
  bodyGradient.addColorStop(0, "rgba(208, 196, 170, 0.96)");
  bodyGradient.addColorStop(0.45, "rgba(128, 120, 104, 0.98)");
  bodyGradient.addColorStop(1, "rgba(46, 44, 40, 0.98)");

  const strokeColor = "rgba(18, 18, 16, 0.92)";
  ctx.shadowColor = "rgba(232, 214, 165, 0.28)";
  ctx.shadowBlur = 24;
  ctx.fillStyle = bodyGradient;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 12;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const fillAndStroke = () => {
    ctx.fill();
    ctx.stroke();
  };

  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(78, -52);
  ctx.lineTo(124, -50);
  ctx.lineTo(128, -6);
  ctx.lineTo(74, 20);
  ctx.lineTo(16, 24);
  ctx.closePath();
  fillAndStroke();

  ctx.beginPath();
  ctx.rect(118, -38, 184, 72);
  fillAndStroke();

  ctx.beginPath();
  ctx.moveTo(212, -72);
  ctx.lineTo(258, -72);
  ctx.lineTo(278, -38);
  ctx.lineTo(194, -38);
  ctx.closePath();
  fillAndStroke();

  ctx.beginPath();
  ctx.moveTo(226, 28);
  ctx.lineTo(280, 28);
  ctx.lineTo(302, 118);
  ctx.lineTo(252, 118);
  ctx.closePath();
  fillAndStroke();

  ctx.beginPath();
  ctx.moveTo(292, -18);
  ctx.lineTo(518, -18);
  ctx.lineTo(542, -8);
  ctx.lineTo(542, 10);
  ctx.lineTo(292, 10);
  ctx.closePath();
  fillAndStroke();

  ctx.beginPath();
  ctx.rect(346, -30, 116, 42);
  fillAndStroke();

  ctx.beginPath();
  ctx.rect(532, -7, 192, 12);
  fillAndStroke();

  ctx.beginPath();
  ctx.moveTo(722, -4);
  ctx.lineTo(830, -4);
  ctx.lineTo(830, 2);
  ctx.lineTo(722, 2);
  ctx.closePath();
  fillAndStroke();

  ctx.beginPath();
  ctx.rect(824, -14, 26, 28);
  fillAndStroke();

  ctx.beginPath();
  ctx.rect(870, -8, 52, 4);
  fillAndStroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255, 245, 218, 0.34)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(126, -18);
  ctx.lineTo(286, -18);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(336, -8);
  ctx.lineTo(706, -8);
  ctx.stroke();

  ctx.restore();
  return canvas;
}

export function createProceduralTexture(name) {
  let canvas = null;
  if (name === "checkerboard") {
    canvas = createCheckerboard();
  } else if (name === "checkerboard-bw") {
    canvas = createCheckerboardBw();
  } else if (name === "dirt") {
    canvas = createDirt();
  } else if (name === "grass") {
    canvas = createGrass();
  } else if (name === "topo-rock") {
    canvas = createTopoRock();
  } else if (name === "topo-sand") {
    canvas = createTopoSand();
  } else if (name === "topo-grass") {
    canvas = createTopoGrass();
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
  } else if (name === "m4-silhouette") {
    canvas = createM4Silhouette();
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
