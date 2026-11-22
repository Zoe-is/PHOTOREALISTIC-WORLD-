import * as THREE from 'three';
import { createRng } from './math';

export interface MaterialTextureSet {
  cobbleMap: THREE.CanvasTexture;
  cobbleBump: THREE.CanvasTexture;
  asphaltMap: THREE.CanvasTexture;
  asphaltBump: THREE.CanvasTexture;
  woodMap: THREE.CanvasTexture;
  woodBump: THREE.CanvasTexture;
  stuccoMap: THREE.CanvasTexture;
  stuccoBump: THREE.CanvasTexture;
  brickMap: THREE.CanvasTexture;
  brickBump: THREE.CanvasTexture;
  roofTileMap: THREE.CanvasTexture;
  roofTileBump: THREE.CanvasTexture;
  stoneMap: THREE.CanvasTexture;
  stoneBump: THREE.CanvasTexture;
  grassGroundMap: THREE.CanvasTexture;
  grassGroundBump: THREE.CanvasTexture;
  rockCliffMap: THREE.CanvasTexture;
  rockCliffBump: THREE.CanvasTexture;
  sandMap: THREE.CanvasTexture;
  sandBump: THREE.CanvasTexture;
  barkMap: THREE.CanvasTexture;
  barkBump: THREE.CanvasTexture;
  leafClusterMap: THREE.CanvasTexture;
  puddleNoiseMap: THREE.CanvasTexture;
  terrainDetailBump: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  dispose: () => void;
}

function createCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(maxAnisotropy: number): MaterialTextureSet {
  const aniso = Math.max(1, maxAnisotropy);
  const allTextures: THREE.Texture[] = [];

  // 1. Weathered Cobblestone Plaza (1024x1024 with moss in joints & surface micro-pitting)
  const [cobC, cobCtx] = createCanvas(1024);
  const [cobBC, cobBCtx] = createCanvas(1024);
  const rng1 = createRng(101);
  cobCtx.fillStyle = '#332f2a';
  cobCtx.fillRect(0, 0, 1024, 1024);
  cobBCtx.fillStyle = '#141414';
  cobBCtx.fillRect(0, 0, 1024, 1024);

  const rows = 12;
  const cols = 12;
  const cellW = 1024 / cols;
  const cellH = 1024 / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (cellW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * cellW + offset + 3.5;
      const y = r * cellH + 3.5;
      const w = cellW - 7;
      const h = cellH - 7;
      const base = Math.floor(84 + rng1() * 38);
      const warm = Math.floor((rng1() - 0.35) * 20);
      cobCtx.fillStyle = `rgb(${base + warm}, ${base + Math.floor(warm * 0.55)}, ${base - 6})`;
      cobCtx.beginPath();
      cobCtx.roundRect(x, y, w, h, 10);
      cobCtx.fill();

      // Micro-grain & weathering speckles on each stone
      for (let g = 0; g < 16; g++) {
        const sx = x + rng1() * w;
        const sy = y + rng1() * h;
        cobCtx.fillStyle =
          rng1() > 0.5 ? 'rgba(20,18,15,0.22)' : 'rgba(235,230,220,0.14)';
        cobCtx.fillRect(sx, sy, 2 + rng1() * 3, 2 + rng1() * 3);
      }

      // Subtle moss tucked along occasional mortar edges
      if (rng1() < 0.28) {
        cobCtx.fillStyle = 'rgba(66, 88, 44, 0.38)';
        cobCtx.fillRect(x - 2, y + h - 2, w * 0.55, 4);
      }

      const bVal = Math.floor(160 + rng1() * 80);
      cobBCtx.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
      cobBCtx.beginPath();
      cobBCtx.roundRect(x, y, w, h, 10);
      cobBCtx.fill();
    }
  }
  const cobbleMap = finalizeTexture(cobC, true, aniso, 10, 10);
  const cobbleBump = finalizeTexture(cobBC, false, aniso, 10, 10);
  allTextures.push(cobbleMap, cobbleBump);

  // 2. Weathered Road Asphalt (1024x1024 with aggregate grit, tar cracks, tire tracks & markings)
  const [aspC, aspCtx] = createCanvas(1024);
  const [aspBC, aspBCtx] = createCanvas(1024);
  const rng2 = createRng(202);
  aspCtx.fillStyle = '#2c2f33';
  aspCtx.fillRect(0, 0, 1024, 1024);
  aspBCtx.fillStyle = '#787878';
  aspBCtx.fillRect(0, 0, 1024, 1024);

  // Tire wear lanes (slightly darker/smoother)
  aspCtx.fillStyle = 'rgba(20, 22, 25, 0.28)';
  aspCtx.fillRect(140, 0, 180, 1024);
  aspCtx.fillRect(704, 0, 180, 1024);

  for (let i = 0; i < 24000; i++) {
    const px = rng2() * 1024;
    const py = rng2() * 1024;
    const g = Math.floor(32 + rng2() * 48);
    aspCtx.fillStyle = `rgb(${g},${g + 1},${g + 3})`;
    aspCtx.fillRect(px, py, 2.2, 2.2);
    const bg = Math.floor(75 + rng2() * 135);
    aspBCtx.fillStyle = `rgb(${bg},${bg},${bg})`;
    aspBCtx.fillRect(px, py, 2, 2);
  }
  // Tar-sealed hairline cracks
  aspCtx.strokeStyle = 'rgba(16, 17, 20, 0.72)';
  aspCtx.lineWidth = 2.2;
  for (let c = 0; c < 6; c++) {
    let cx = rng2() * 1024;
    let cy = rng2() * 1024;
    aspCtx.beginPath();
    aspCtx.moveTo(cx, cy);
    for (let s = 0; s < 10; s++) {
      cx += (rng2() - 0.5) * 90;
      cy += (rng2() - 0.5) * 90;
      aspCtx.lineTo(cx, cy);
    }
    aspCtx.stroke();
  }
  // Subtle edge lines & weathered amber dashed center line
  aspCtx.fillStyle = 'rgba(220, 218, 206, 0.65)';
  aspCtx.fillRect(32, 0, 16, 1024);
  aspCtx.fillRect(976, 0, 16, 1024);
  aspCtx.fillStyle = 'rgba(226, 176, 68, 0.82)';
  for (let y = 32; y < 1024; y += 192) {
    aspCtx.fillRect(504, y, 16, 100);
  }
  const asphaltMap = finalizeTexture(aspC, true, aniso, 1, 1);
  const asphaltBump = finalizeTexture(aspBC, false, aniso, 1, 1);
  allTextures.push(asphaltMap, asphaltBump);

  // 3. Weathered Timber Planks (1024x1024 with wood knots, grain & salt patina)
  const [woodC, woodCtx] = createCanvas(1024);
  const [woodBC, woodBCtx] = createCanvas(1024);
  const rng3 = createRng(303);
  woodCtx.fillStyle = '#5c412d';
  woodCtx.fillRect(0, 0, 1024, 1024);
  woodBCtx.fillStyle = '#383838';
  woodBCtx.fillRect(0, 0, 1024, 1024);
  const plankCount = 10;
  const plankH = 1024 / plankCount;
  for (let p = 0; p < plankCount; p++) {
    const y = p * plankH;
    const baseR = 96 + Math.floor(rng3() * 34);
    const baseG = 68 + Math.floor(rng3() * 24);
    const baseB = 46 + Math.floor(rng3() * 18);
    woodCtx.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
    woodCtx.fillRect(0, y + 3, 1024, plankH - 6);
    woodBCtx.fillStyle = `rgb(${155 + Math.floor(rng3() * 50)},155,155)`;
    woodBCtx.fillRect(0, y + 3, 1024, plankH - 6);

    for (let s = 0; s < 55; s++) {
      const sy = y + 6 + rng3() * (plankH - 12);
      woodCtx.fillStyle = rng3() > 0.5 ? 'rgba(32,18,10,0.22)' : 'rgba(205,165,125,0.12)';
      woodCtx.fillRect(0, sy, 1024, 2);
      woodBCtx.fillStyle = 'rgba(105,105,105,0.38)';
      woodBCtx.fillRect(0, sy, 1024, 1.5);
    }
    // Wood knot
    const kx = 120 + rng3() * 780;
    const ky = y + plankH * (0.3 + rng3() * 0.4);
    woodCtx.fillStyle = 'rgba(42,24,14,0.45)';
    woodCtx.beginPath();
    woodCtx.ellipse(kx, ky, 18, 8, 0, 0, Math.PI * 2);
    woodCtx.fill();

    woodCtx.fillStyle = '#241810';
    woodCtx.fillRect(0, y, 1024, 4);
    woodBCtx.fillStyle = '#141414';
    woodBCtx.fillRect(0, y, 1024, 4);
  }
  const woodMap = finalizeTexture(woodC, true, aniso, 2, 2);
  const woodBump = finalizeTexture(woodBC, false, aniso, 2, 2);
  allTextures.push(woodMap, woodBump);

  // 4. Weathered Mineral Stucco Plaster (512x512 with subtle rain grime & trowel marks)
  const [stuccoC, stuccoCtx] = createCanvas(512);
  const [stuccoBC, stuccoBCtx] = createCanvas(512);
  const rng4 = createRng(404);
  stuccoCtx.fillStyle = '#eae6de';
  stuccoCtx.fillRect(0, 0, 512, 512);
  stuccoBCtx.fillStyle = '#808080';
  stuccoBCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 12000; i++) {
    const x = rng4() * 512;
    const y = rng4() * 512;
    const v = Math.floor(215 + rng4() * 34);
    stuccoCtx.fillStyle = `rgb(${v},${v - 3},${v - 7})`;
    stuccoCtx.fillRect(x, y, 3, 3);
    const bv = Math.floor(90 + rng4() * 95);
    stuccoBCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
    stuccoBCtx.fillRect(x, y, 3, 3);
  }
  // Subtle weathering blotches
  for (let b = 0; b < 35; b++) {
    const bx = rng4() * 512;
    const by = rng4() * 512;
    const g = stuccoCtx.createRadialGradient(bx, by, 2, bx, by, 35);
    g.addColorStop(0, 'rgba(110,102,90,0.08)');
    g.addColorStop(1, 'rgba(110,102,90,0)');
    stuccoCtx.fillStyle = g;
    stuccoCtx.fillRect(bx - 35, by - 35, 70, 70);
  }
  const stuccoMap = finalizeTexture(stuccoC, true, aniso, 2, 2);
  const stuccoBump = finalizeTexture(stuccoBC, false, aniso, 2, 2);
  allTextures.push(stuccoMap, stuccoBump);

  // 5. Weathered Coastal Brick & Mortar (512x512)
  const [brkC, brkCtx] = createCanvas(512);
  const [brkBC, brkBCtx] = createCanvas(512);
  const rngBrick = createRng(445);
  brkCtx.fillStyle = '#9c9589';
  brkCtx.fillRect(0, 0, 512, 512);
  brkBCtx.fillStyle = '#2a2a2a';
  brkBCtx.fillRect(0, 0, 512, 512);
  const bRows = 16;
  const bCols = 8;
  const bH = 512 / bRows;
  const bW = 512 / bCols;
  for (let r = 0; r < bRows; r++) {
    const off = (r % 2) * (bW * 0.5);
    for (let c = -1; c <= bCols; c++) {
      const bx = c * bW + off + 2;
      const by = r * bH + 2;
      const rCol = Math.floor(138 + rngBrick() * 44);
      const gCol = Math.floor(72 + rngBrick() * 26);
      const bCol = Math.floor(56 + rngBrick() * 20);
      brkCtx.fillStyle = `rgb(${rCol},${gCol},${bCol})`;
      brkCtx.fillRect(bx, by, bW - 4, bH - 4);
      const bv = Math.floor(165 + rngBrick() * 70);
      brkBCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
      brkBCtx.fillRect(bx, by, bW - 4, bH - 4);
    }
  }
  const brickMap = finalizeTexture(brkC, true, aniso, 3, 2);
  const brickBump = finalizeTexture(brkBC, false, aniso, 3, 2);
  allTextures.push(brickMap, brickBump);

  // 6. Terracotta Barrel Roof Tiles (512x512)
  const [roofC, roofCtx] = createCanvas(512);
  const [roofBC, roofBCtx] = createCanvas(512);
  const rng5 = createRng(505);
  roofCtx.fillStyle = '#8b412c';
  roofCtx.fillRect(0, 0, 512, 512);
  roofBCtx.fillStyle = '#484848';
  roofBCtx.fillRect(0, 0, 512, 512);
  const tileCols = 12;
  const tileRows = 12;
  const tw = 512 / tileCols;
  const th = 512 / tileRows;
  for (let r = 0; r < tileRows; r++) {
    for (let c = 0; c < tileCols; c++) {
      const tx = c * tw;
      const ty = r * th;
      const grad = roofCtx.createLinearGradient(tx, ty, tx + tw, ty);
      const tone = Math.floor((rng5() - 0.5) * 32);
      grad.addColorStop(0, `rgb(${128 + tone},${58 + tone},${40})`);
      grad.addColorStop(0.5, `rgb(${176 + tone},${86 + tone},${58})`);
      grad.addColorStop(1, `rgb(${114 + tone},${50 + tone},${34})`);
      roofCtx.fillStyle = grad;
      roofCtx.fillRect(tx + 1, ty + 1, tw - 2, th - 2);
      roofCtx.fillStyle = 'rgba(28,12,8,0.4)';
      roofCtx.fillRect(tx, ty + th - 3, tw, 3);
      if (rng5() < 0.14) {
        roofCtx.fillStyle = 'rgba(72, 92, 50, 0.35)';
        roofCtx.fillRect(tx + 4, ty + 4, tw * 0.5, th * 0.4);
      }

      const bGrad = roofBCtx.createLinearGradient(tx, ty, tx + tw, ty);
      bGrad.addColorStop(0, '#505050');
      bGrad.addColorStop(0.5, '#e2e2e2');
      bGrad.addColorStop(1, '#3e3e3e');
      roofBCtx.fillStyle = bGrad;
      roofBCtx.fillRect(tx + 1, ty + 1, tw - 2, th - 2);
    }
  }
  const roofTileMap = finalizeTexture(roofC, true, aniso, 3, 3);
  const roofTileBump = finalizeTexture(roofBC, false, aniso, 3, 3);
  allTextures.push(roofTileMap, roofTileBump);

  // 7. Cut Stone Masonry (512x512)
  const [stoneC, stoneCtx] = createCanvas(512);
  const [stoneBC, stoneBCtx] = createCanvas(512);
  const rng6 = createRng(606);
  stoneCtx.fillStyle = '#68625b';
  stoneCtx.fillRect(0, 0, 512, 512);
  stoneBCtx.fillStyle = '#202020';
  stoneBCtx.fillRect(0, 0, 512, 512);
  const sRows = 8;
  const sH = 512 / sRows;
  for (let r = 0; r < sRows; r++) {
    let curX = (r % 2) * -48;
    while (curX < 512) {
      const bw = 72 + Math.floor(rng6() * 52);
      const v = Math.floor(136 + rng6() * 44);
      stoneCtx.fillStyle = `rgb(${v + 5},${v},${v - 8})`;
      stoneCtx.fillRect(curX + 3, r * sH + 3, bw - 6, sH - 6);
      for (let sp = 0; sp < 14; sp++) {
        stoneCtx.fillStyle = 'rgba(30,28,25,0.16)';
        stoneCtx.fillRect(curX + 6 + rng6() * (bw - 12), r * sH + 6 + rng6() * (sH - 12), 3, 2);
      }
      const bv = Math.floor(150 + rng6() * 80);
      stoneBCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
      stoneBCtx.fillRect(curX + 3, r * sH + 3, bw - 6, sH - 6);
      curX += bw;
    }
  }
  const stoneMap = finalizeTexture(stoneC, true, aniso, 2, 2);
  const stoneBump = finalizeTexture(stoneBC, false, aniso, 2, 2);
  allTextures.push(stoneMap, stoneBump);

  // 8. Rich Organic Meadow Grass & Soil Ground Texture (512x512)
  const [grassC, grassCtx] = createCanvas(512);
  const [grassBC, grassBCtx] = createCanvas(512);
  const rngG = createRng(808);
  grassCtx.fillStyle = '#385426';
  grassCtx.fillRect(0, 0, 512, 512);
  grassBCtx.fillStyle = '#707070';
  grassBCtx.fillRect(0, 0, 512, 512);
  // Rich earth/clover blotches
  for (let i = 0; i < 90; i++) {
    const gx = rngG() * 512;
    const gy = rngG() * 512;
    const rad = 18 + rngG() * 40;
    const grad = grassCtx.createRadialGradient(gx, gy, 2, gx, gy, rad);
    grad.addColorStop(0, rngG() > 0.35 ? 'rgba(46, 74, 30, 0.35)' : 'rgba(84, 72, 46, 0.25)');
    grad.addColorStop(1, 'rgba(46, 74, 30, 0)');
    grassCtx.fillStyle = grad;
    grassCtx.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
  }
  // Thousands of fine blades & dry straw flecks
  for (let i = 0; i < 9500; i++) {
    const x = rngG() * 512;
    const y = rngG() * 512;
    const len = 4 + rngG() * 7;
    const tilt = (rngG() - 0.5) * 4;
    const r = rngG() > 0.14 ? 48 + Math.floor(rngG() * 48) : 112 + Math.floor(rngG() * 35);
    const g = rngG() > 0.14 ? 76 + Math.floor(rngG() * 54) : 102 + Math.floor(rngG() * 25);
    const b = 30 + Math.floor(rngG() * 26);
    grassCtx.strokeStyle = `rgb(${r},${g},${b})`;
    grassCtx.lineWidth = 1.4;
    grassCtx.beginPath();
    grassCtx.moveTo(x, y);
    grassCtx.lineTo(x + tilt, y - len);
    grassCtx.stroke();

    const bv = Math.floor(110 + rngG() * 115);
    grassBCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
    grassBCtx.fillRect(x, y, 2, 2);
  }
  const grassGroundMap = finalizeTexture(grassC, true, aniso, 1, 1);
  const grassGroundBump = finalizeTexture(grassBC, false, aniso, 1, 1);
  allTextures.push(grassGroundMap, grassGroundBump);

  // 9. Stratified Coastal Cliff Rock (512x512)
  const [rockC, rockCtx] = createCanvas(512);
  const [rockBC, rockBCtx] = createCanvas(512);
  const rngR = createRng(909);
  rockCtx.fillStyle = '#5c5852';
  rockCtx.fillRect(0, 0, 512, 512);
  rockBCtx.fillStyle = '#7c7c7c';
  rockBCtx.fillRect(0, 0, 512, 512);
  // Sedimentary rock bands
  for (let y = 0; y < 512; y += 6) {
    const shade = Math.floor(76 + rngR() * 46);
    rockCtx.fillStyle = `rgba(${shade + 4}, ${shade}, ${shade - 5}, 0.55)`;
    rockCtx.fillRect(0, y, 512, 4 + rngR() * 5);
    const bv = Math.floor(85 + rngR() * 125);
    rockBCtx.fillStyle = `rgba(${bv},${bv},${bv},0.65)`;
    rockBCtx.fillRect(0, y, 512, 4 + rngR() * 5);
  }
  // Diagonal rock fractures & moss
  for (let f = 0; f < 32; f++) {
    let fx = rngR() * 512;
    let fy = rngR() * 512;
    rockCtx.strokeStyle = 'rgba(28,26,24,0.55)';
    rockCtx.lineWidth = 1.5 + rngR() * 1.5;
    rockBCtx.strokeStyle = 'rgba(20,20,20,0.8)';
    rockBCtx.lineWidth = 2;
    rockCtx.beginPath();
    rockBCtx.beginPath();
    rockCtx.moveTo(fx, fy);
    rockBCtx.moveTo(fx, fy);
    for (let s = 0; s < 5; s++) {
      fx += (rngR() - 0.3) * 40;
      fy += (rngR() - 0.5) * 28;
      rockCtx.lineTo(fx, fy);
      rockBCtx.lineTo(fx, fy);
    }
    rockCtx.stroke();
    rockBCtx.stroke();
  }
  const rockCliffMap = finalizeTexture(rockC, true, aniso, 1, 1);
  const rockCliffBump = finalizeTexture(rockBC, false, aniso, 1, 1);
  allTextures.push(rockCliffMap, rockCliffBump);

  // 10. Rippled Coastal Sand (512x512)
  const [sndC, sndCtx] = createCanvas(512);
  const [sndBC, sndBCtx] = createCanvas(512);
  const rngS = createRng(1111);
  sndCtx.fillStyle = '#ccb68e';
  sndCtx.fillRect(0, 0, 512, 512);
  sndBCtx.fillStyle = '#808080';
  sndBCtx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y++) {
    const wave = Math.sin(y * 0.14) * 10;
    const tone = Math.floor(196 + wave + (rngS() - 0.5) * 8);
    sndCtx.fillStyle = `rgb(${tone},${tone - 18},${tone - 48})`;
    sndCtx.fillRect(0, y, 512, 1);
    const bv = Math.floor(128 + wave * 4);
    sndBCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
    sndBCtx.fillRect(0, y, 512, 1);
  }
  for (let i = 0; i < 6500; i++) {
    const sx = rngS() * 512;
    const sy = rngS() * 512;
    sndCtx.fillStyle = rngS() > 0.5 ? 'rgba(248,240,224,0.3)' : 'rgba(130,112,86,0.22)';
    sndCtx.fillRect(sx, sy, 2, 2);
  }
  const sandMap = finalizeTexture(sndC, true, aniso, 1, 1);
  const sandBump = finalizeTexture(sndBC, false, aniso, 1, 1);
  allTextures.push(sandMap, sandBump);

  // 11. Deeply Furrowed Tree Bark (512x512)
  const [brkTC, brkTCtx] = createCanvas(512);
  const [brkTBC, brkTBCtx] = createCanvas(512);
  const rngB = createRng(1212);
  brkTCtx.fillStyle = '#473426';
  brkTCtx.fillRect(0, 0, 512, 512);
  brkTBCtx.fillStyle = '#707070';
  brkTBCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 420; i++) {
    const bx = rngB() * 512;
    const by = rngB() * 512;
    const bh = 36 + rngB() * 90;
    const bw = 3 + rngB() * 7;
    const dark = rngB() > 0.45;
    brkTCtx.fillStyle = dark ? 'rgba(26,18,12,0.55)' : 'rgba(110,84,62,0.35)';
    brkTCtx.fillRect(bx, by, bw, bh);
    const bv = dark ? 40 : 185;
    brkTBCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
    brkTBCtx.fillRect(bx, by, bw, bh);
  }
  const barkMap = finalizeTexture(brkTC, true, aniso, 2, 3);
  const barkBump = finalizeTexture(brkTBC, false, aniso, 2, 3);
  allTextures.push(barkMap, barkBump);

  // 12. Alpha-tested Leaf Cluster Sprig Texture (512x512 RGBA) for organic tree canopies
  const [leafC, leafCtx] = createCanvas(512);
  const rngL = createRng(1313);
  leafCtx.clearRect(0, 0, 512, 512);
  // Central twigs
  leafCtx.strokeStyle = '#4a3525';
  leafCtx.lineWidth = 6;
  leafCtx.beginPath();
  leafCtx.moveTo(256, 480);
  leafCtx.quadraticCurveTo(250, 260, 256, 60);
  leafCtx.moveTo(256, 340);
  leafCtx.lineTo(130, 200);
  leafCtx.moveTo(256, 280);
  leafCtx.lineTo(390, 150);
  leafCtx.stroke();

  // Overlapping organic shaded leaves
  for (let i = 0; i < 160; i++) {
    const angle = rngL() * Math.PI * 2;
    const dist = Math.pow(rngL(), 0.65) * 205;
    const lx = 256 + Math.cos(angle) * dist;
    const ly = 256 + Math.sin(angle) * dist;
    const rot = angle + (rngL() - 0.5) * 1.1;
    const rx = 20 + rngL() * 18;
    const ry = 10 + rngL() * 8;
    const lightBoost = (1 - dist / 220) * 18 + (ly < 256 ? 12 : -8);
    const r = Math.min(255, Math.max(20, Math.floor(62 + lightBoost + rngL() * 24)));
    const g = Math.min(255, Math.max(30, Math.floor(96 + lightBoost + rngL() * 34)));
    const b = Math.min(255, Math.max(15, Math.floor(38 + rngL() * 18)));
    leafCtx.save();
    leafCtx.translate(lx, ly);
    leafCtx.rotate(rot);
    leafCtx.fillStyle = `rgb(${r},${g},${b})`;
    leafCtx.beginPath();
    leafCtx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    leafCtx.fill();
    // Subtle leaf midrib
    leafCtx.strokeStyle = `rgba(${r + 22},${g + 26},${b + 12},0.45)`;
    leafCtx.lineWidth = 1.2;
    leafCtx.beginPath();
    leafCtx.moveTo(-rx * 0.7, 0);
    leafCtx.lineTo(rx * 0.7, 0);
    leafCtx.stroke();
    leafCtx.restore();
  }
  const leafClusterMap = finalizeTexture(leafC, true, aniso, 1, 1);
  leafClusterMap.wrapS = THREE.ClampToEdgeWrapping;
  leafClusterMap.wrapT = THREE.ClampToEdgeWrapping;
  allTextures.push(leafClusterMap);

  // 13. Organic Puddle Mask Texture (512x512)
  const [pudC, pudCtx] = createCanvas(512);
  const rngP = createRng(1414);
  pudCtx.fillStyle = '#000000';
  pudCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 24; i++) {
    const px = rngP() * 512;
    const py = rngP() * 512;
    const rx = 32 + rngP() * 68;
    const grad = pudCtx.createRadialGradient(px, py, rx * 0.15, px, py, rx);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.65, 'rgba(210,210,210,0.65)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    pudCtx.fillStyle = grad;
    pudCtx.fillRect(px - rx, py - rx, rx * 2, rx * 2);
  }
  const puddleNoiseMap = finalizeTexture(pudC, false, aniso, 1, 1);
  allTextures.push(puddleNoiseMap);

  // 14. Terrain micro-detail bump map
  const [terrBC, terrBCtx] = createCanvas(256);
  const rng7 = createRng(707);
  terrBCtx.fillStyle = '#808080';
  terrBCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6000; i++) {
    const v = Math.floor(65 + rng7() * 130);
    terrBCtx.fillStyle = `rgb(${v},${v},${v})`;
    terrBCtx.fillRect(rng7() * 256, rng7() * 256, 2 + rng7() * 2, 2 + rng7() * 2);
  }
  const terrainDetailBump = finalizeTexture(terrBC, false, aniso, 48, 48);
  allTextures.push(terrainDetailBump);

  // 15. Soft radial contact shadow disc
  const [shadC, shadCtx] = createCanvas(128);
  const grad = shadCtx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.74)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.3)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shadCtx.fillStyle = grad;
  shadCtx.fillRect(0, 0, 128, 128);
  const contactShadowMap = new THREE.CanvasTexture(shadC);
  contactShadowMap.needsUpdate = true;
  allTextures.push(contactShadowMap);

  return {
    cobbleMap,
    cobbleBump,
    asphaltMap,
    asphaltBump,
    woodMap,
    woodBump,
    stuccoMap,
    stuccoBump,
    brickMap,
    brickBump,
    roofTileMap,
    roofTileBump,
    stoneMap,
    stoneBump,
    grassGroundMap,
    grassGroundBump,
    rockCliffMap,
    rockCliffBump,
    sandMap,
    sandBump,
    barkMap,
    barkBump,
    leafClusterMap,
    puddleNoiseMap,
    terrainDetailBump,
    contactShadowMap,
    dispose: () => {
      for (const t of allTextures) t.dispose();
    },
  };
}
