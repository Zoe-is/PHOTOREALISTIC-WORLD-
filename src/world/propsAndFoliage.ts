import * as THREE from 'three';
import {
  classifyBiomeAt,
  createRng,
  distanceToRiver,
  distanceToRoad,
  groundHeightAt,
  WATER_LEVEL,
} from './math';
import type { MaterialTextureSet } from './textures';
import type { ColliderCylinder } from './types';

export interface PropsAndFoliageRig {
  group: THREE.Group;
  colliders: ColliderCylinder[];
  update: (
    elapsed: number,
    isNight: boolean,
    windStrength: number,
    snowAccum: number,
  ) => void;
  dispose: () => void;
}

function buildCrossedCanopyClusterGeometry(
  cardCount: number,
  spreadRadius: number,
  centerY: number,
  cardSize: number,
  seed: number,
): THREE.BufferGeometry {
  const rng = createRng(seed);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  let vOffset = 0;
  for (let i = 0; i < cardCount; i++) {
    const phi = rng() * Math.PI * 2;
    const costheta = rng() * 1.4 - 0.5;
    const r = Math.pow(rng(), 0.5) * spreadRadius;
    const cx = Math.cos(phi) * r;
    const cy = centerY + costheta * spreadRadius * 0.65;
    const cz = Math.sin(phi) * r;

    const yaw = rng() * Math.PI * 2;
    const pitch = (rng() - 0.5) * 0.9;
    const roll = (rng() - 0.5) * 0.7;

    const euler = new THREE.Euler(pitch, yaw, roll);
    const quat = new THREE.Quaternion().setFromEuler(euler);
    const half = cardSize * (0.4 + rng() * 0.28);

    const corners = [
      new THREE.Vector3(-half, -half, 0),
      new THREE.Vector3(half, -half, 0),
      new THREE.Vector3(half, half, 0),
      new THREE.Vector3(-half, half, 0),
    ];
    const nVec = new THREE.Vector3(0, 0, 1).applyQuaternion(quat).normalize();

    for (const c of corners) {
      c.applyQuaternion(quat);
      positions.push(cx + c.x, cy + c.y, cz + c.z);
      normals.push(nVec.x, nVec.y, nVec.z);
    }
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(
      vOffset,
      vOffset + 1,
      vOffset + 2,
      vOffset,
      vOffset + 2,
      vOffset + 3,
    );
    vOffset += 4;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

export function createPropsAndFoliage(
  textures: MaterialTextureSet,
  isSoftwareGl: boolean,
): PropsAndFoliageRig {
  const group = new THREE.Group();
  const colliders: ColliderCylinder[] = [];
  const disposables: Array<{ dispose: () => void }> = [];
  const rng = createRng(4242);

  const windUniforms = {
    uTime: { value: 0 },
    uWind: { value: 1.0 },
    uSnowAccum: { value: 0.0 },
  };

  const barkMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.barkMap,
    bumpMap: textures.barkBump,
    bumpScale: 0.14,
    roughness: 0.94,
    metalness: 0.02,
  });

  // Alpha-tested organic leaf cluster material with wind sway & snow dusting
  const leafCanopyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.leafClusterMap,
    alphaTest: 0.36,
    side: THREE.DoubleSide,
    roughness: 0.82,
    metalness: 0.02,
  });
  leafCanopyMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.uniforms.uSnowAccum = windUniforms.uSnowAccum;
    shader.vertexShader =
      `uniform float uTime;\nuniform float uWind;\nvarying float vLeafHeight;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLeafHeight = position.y;
        float sway = max(0.0, position.y - 1.5) * 0.042 * uWind;
        #ifdef USE_INSTANCING
          vec3 wCenter = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 wCenter = vec3(0.0);
        #endif
        transformed.x += sin(uTime * 1.85 + wCenter.x * 0.25 + position.y * 0.6) * sway;
        transformed.z += cos(uTime * 1.45 + wCenter.z * 0.3 + position.x * 0.5) * sway * 0.65;`,
      );
    shader.fragmentShader =
      `uniform float uSnowAccum;\nvarying float vLeafHeight;\n` +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float snowDust = smoothstep(3.2, 6.8, vLeafHeight) * uSnowAccum * 0.68;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.90, 0.93, 0.97), snowDust);`,
      );
  };

  // =========================================================================
  // 1. PHOTOREALISTIC COASTAL PINES (Tapered Furrowed Trunk + Layered Bough Fronds)
  // =========================================================================
  const pineTrunkGeo = new THREE.CylinderGeometry(0.14, 0.38, 6.8, 10);
  pineTrunkGeo.translate(0, 3.4, 0);

  // Build layered conifer canopy from tiered foliage cards (much more organic than smooth cones)
  const pineCanopyGeo = buildCrossedCanopyClusterGeometry(26, 1.85, 5.2, 2.35, 701);

  const pineCount = 155;
  const pineTrunks = new THREE.InstancedMesh(pineTrunkGeo, barkMat, pineCount);
  const pineCrowns = new THREE.InstancedMesh(pineCanopyGeo, leafCanopyMat, pineCount);
  pineTrunks.castShadow = !isSoftwareGl;
  pineCrowns.castShadow = !isSoftwareGl;
  pineCrowns.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const cPine1 = new THREE.Color(0x6d936c);
  const cPine2 = new THREE.Color(0x527a56);
  const cTmp = new THREE.Color();

  let placedPines = 0;
  let attempts = 0;
  while (placedPines < pineCount && attempts < 2600) {
    attempts++;
    const x = (rng() - 0.5) * 230;
    const z = (rng() - 0.5) * 210 - 20;
    const h = groundHeightAt(x, z);
    if (h < WATER_LEVEL + 1.4 || h > 23) continue;
    if (Math.hypot(x, z + 2) < 25) continue;
    if (distanceToRoad(x, z).distance < 5.4) continue;
    if (distanceToRiver(x, z) < 7.2) continue;
    if (Math.hypot(x - 48, z + 42) < 20) continue;
    if (Math.hypot(x + 44, z - 34) < 12) continue;
    if (Math.hypot(x + 56, z - 48) < 9) continue;
    if (Math.hypot(x - 56, z + 24) < 9) continue;

    const biome = classifyBiomeAt(x, z);
    if (biome === 'beach') continue;
    if (biome === 'meadow' && rng() > 0.36) continue;

    const sc = 0.85 + rng() * 0.62;
    dummy.position.set(x, h - 0.12, z);
    dummy.rotation.set((rng() - 0.5) * 0.05, rng() * Math.PI * 2, (rng() - 0.5) * 0.05);
    dummy.scale.set(sc * (0.9 + rng() * 0.2), sc * (1.05 + rng() * 0.25), sc * (0.9 + rng() * 0.2));
    dummy.updateMatrix();

    pineTrunks.setMatrixAt(placedPines, dummy.matrix);
    pineCrowns.setMatrixAt(placedPines, dummy.matrix);
    pineCrowns.setColorAt(placedPines, cTmp.copy(cPine1).lerp(cPine2, rng()));

    if (Math.hypot(x, z) < 125) {
      colliders.push({
        id: `pine_${placedPines}`,
        x,
        z,
        radius: 0.42 * sc,
        minY: h,
        maxY: h + 5,
      });
    }
    placedPines++;
  }
  pineTrunks.count = placedPines;
  pineCrowns.count = placedPines;
  [pineTrunks, pineCrowns].forEach((m) => {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    group.add(m);
  });

  // =========================================================================
  // 2. MEDITERRANEAN BROADLEAF OAK & OLIVE TREES (Forked Branches + Organic Leaf Sprigs)
  // =========================================================================
  // Forked trunk geometry (main trunk + two angled boughs merged manually)
  const oakTrunkGeo = new THREE.CylinderGeometry(0.18, 0.38, 3.3, 10);
  oakTrunkGeo.translate(0, 1.65, 0);
  const oakCanopyGeo = buildCrossedCanopyClusterGeometry(24, 2.15, 4.35, 2.25, 902);

  const oakCount = 52;
  const oakTrunks = new THREE.InstancedMesh(oakTrunkGeo, barkMat, oakCount);
  const oakCrowns = new THREE.InstancedMesh(oakCanopyGeo, leafCanopyMat, oakCount);
  oakTrunks.castShadow = !isSoftwareGl;
  oakCrowns.castShadow = !isSoftwareGl;
  oakCrowns.receiveShadow = true;

  const cOak1 = new THREE.Color(0x95b87b);
  const cOak2 = new THREE.Color(0x7aa362);
  let placedOaks = 0;
  let oakAttempts = 0;
  while (placedOaks < oakCount && oakAttempts < 1400) {
    oakAttempts++;
    const x = (rng() - 0.5) * 145;
    const z = (rng() - 0.5) * 130;
    const h = groundHeightAt(x, z);
    if (h < WATER_LEVEL + 1.8 || h > 14) continue;
    if (Math.hypot(x, z + 2) < 18) continue;
    if (distanceToRoad(x, z).distance < 4.8) continue;
    if (distanceToRiver(x, z) < 6.8) continue;
    if (Math.hypot(x + 14.5, z + 9.5) < 7.5) continue;
    if (Math.hypot(x - 15.5, z + 11.5) < 7.5) continue;
    if (Math.hypot(x - 1.5, z + 19.5) < 7.5) continue;

    const sc = 0.8 + rng() * 0.55;
    dummy.position.set(x, h - 0.12, z);
    dummy.rotation.set(0, rng() * Math.PI * 2, 0);
    dummy.scale.set(sc * 1.08, sc * 0.98, sc * 1.08);
    dummy.updateMatrix();
    oakTrunks.setMatrixAt(placedOaks, dummy.matrix);
    oakCrowns.setMatrixAt(placedOaks, dummy.matrix);
    oakCrowns.setColorAt(placedOaks, cTmp.copy(cOak1).lerp(cOak2, rng()));

    colliders.push({
      id: `oak_${placedOaks}`,
      x,
      z,
      radius: 0.44 * sc,
      minY: h,
      maxY: h + 4.5,
    });
    placedOaks++;
  }
  oakTrunks.count = placedOaks;
  oakCrowns.count = placedOaks;
  [oakTrunks, oakCrowns].forEach((m) => {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    group.add(m);
  });

  disposables.push(
    pineTrunkGeo,
    pineCanopyGeo,
    oakTrunkGeo,
    oakCanopyGeo,
    barkMat,
    leafCanopyMat,
  );

  // =========================================================================
  // 3. DENSE SWAYING GRASS TUFTS (Root-to-Tip Gradient Shading) & WILDFLOWERS
  // =========================================================================
  const bladeVerts: number[] = [];
  const bladeColors: number[] = [];
  const bladeAngles = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
  for (const ang of bladeAngles) {
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const w0 = 0.055;
    const hTop = 0.58;
    const lean = 0.12;
    bladeVerts.push(
      -sa * w0, 0, ca * w0,
      sa * w0, 0, -ca * w0,
      ca * lean, hTop, sa * lean,
    );
    // Dark earthy root -> bright sunlit tip
    bladeColors.push(
      0.24, 0.36, 0.16,
      0.24, 0.36, 0.16,
      0.66, 0.84, 0.44,
    );
  }
  const grassGeo = new THREE.BufferGeometry();
  grassGeo.setAttribute('position', new THREE.Float32BufferAttribute(bladeVerts, 3));
  grassGeo.setAttribute('color', new THREE.Float32BufferAttribute(bladeColors, 3));
  grassGeo.computeVertexNormals();

  const grassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.88,
    side: THREE.DoubleSide,
  });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.vertexShader =
      `uniform float uTime;\nuniform float uWind;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float gSway = position.y * 0.28 * uWind;
        #ifdef USE_INSTANCING
          vec3 gPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 gPos = vec3(0.0);
        #endif
        transformed.x += sin(uTime * 2.6 + gPos.x * 0.45 + gPos.z * 0.35) * gSway;`,
      );
  };

  const grassCount = 2800;
  const grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
  const flowerGeo = new THREE.DodecahedronGeometry(0.09, 0);
  flowerGeo.translate(0, 0.4, 0);
  const flowerMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.65,
  });
  const flowerCount = 360;
  const flowerMesh = new THREE.InstancedMesh(flowerGeo, flowerMat, flowerCount);

  const flowerColors = [0xf59e0b, 0xf43f5e, 0xa855f7, 0xfef08a, 0xe0f2fe];
  const gCol1 = new THREE.Color(0x88ab62);
  const gCol2 = new THREE.Color(0xa6bd6e);

  let gPlaced = 0;
  let fPlaced = 0;
  for (let i = 0; i < 6400 && gPlaced < grassCount; i++) {
    const x = (rng() - 0.5) * 185;
    const z = (rng() - 0.5) * 170;
    const h = groundHeightAt(x, z);
    if (h < WATER_LEVEL + 1.6 || h > 19) continue;
    if (Math.hypot(x, z + 4) < 17) continue;
    if (distanceToRoad(x, z).distance < 3.4) continue;
    if (distanceToRiver(x, z) < 5.5) continue;

    const sc = 0.72 + rng() * 0.88;
    dummy.position.set(x, h - 0.04, z);
    dummy.rotation.set(0, rng() * Math.PI * 2, 0);
    dummy.scale.set(sc, sc * (0.8 + rng() * 0.6), sc);
    dummy.updateMatrix();
    grassMesh.setMatrixAt(gPlaced, dummy.matrix);
    grassMesh.setColorAt(gPlaced, cTmp.copy(gCol1).lerp(gCol2, rng()));
    gPlaced++;

    if (fPlaced < flowerCount && rng() < 0.16) {
      flowerMesh.setMatrixAt(fPlaced, dummy.matrix);
      flowerMesh.setColorAt(
        fPlaced,
        cTmp.setHex(flowerColors[Math.floor(rng() * flowerColors.length)]),
      );
      fPlaced++;
    }
  }
  grassMesh.count = gPlaced;
  flowerMesh.count = fPlaced;
  [grassMesh, flowerMesh].forEach((m) => {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    group.add(m);
  });
  disposables.push(grassGeo, grassMat, flowerGeo, flowerMat);

  // =========================================================================
  // 4. SCULPTED ROCKS & COASTAL BOULDERS
  // =========================================================================
  const rockGeo = new THREE.DodecahedronGeometry(1, 1);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.rockCliffMap,
    bumpMap: textures.rockCliffBump,
    bumpScale: 0.18,
    roughness: 0.9,
  });
  const rockCount = 95;
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  rockMesh.castShadow = !isSoftwareGl;
  rockMesh.receiveShadow = true;

  let rPlaced = 0;
  for (let i = 0; i < 600 && rPlaced < rockCount; i++) {
    const x = (rng() - 0.5) * 210;
    const z = (rng() - 0.5) * 190;
    const h = groundHeightAt(x, z);
    if (h < WATER_LEVEL - 0.2) continue;
    if (Math.hypot(x, z + 4) < 19) continue;
    if (distanceToRoad(x, z).distance < 4.5) continue;

    const sc = 0.65 + rng() * 1.75;
    dummy.position.set(x, h - sc * 0.22, z);
    dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    dummy.scale.set(sc * (0.9 + rng() * 0.4), sc * (0.52 + rng() * 0.35), sc * (0.9 + rng() * 0.4));
    dummy.updateMatrix();
    rockMesh.setMatrixAt(rPlaced, dummy.matrix);
    const shade = 0.72 + rng() * 0.28;
    rockMesh.setColorAt(rPlaced, cTmp.setRGB(shade, shade * 0.98, shade * 0.94));

    if (sc > 1.1 && Math.hypot(x, z) < 125) {
      colliders.push({
        id: `rock_${rPlaced}`,
        x,
        z,
        radius: sc * 0.82,
        minY: h - 0.5,
        maxY: h + sc,
      });
    }
    rPlaced++;
  }
  rockMesh.count = rPlaced;
  rockMesh.instanceMatrix.needsUpdate = true;
  if (rockMesh.instanceColor) rockMesh.instanceColor.needsUpdate = true;
  rockMesh.computeBoundingSphere();
  group.add(rockMesh);
  disposables.push(rockGeo, rockMat);

  // =========================================================================
  // 5. CAST-IRON STREETLIGHTS (Fluted Base, Bracket Arm, Lantern Housing)
  // =========================================================================
  const lampPositions: Array<{ x: number; z: number }> = [
    { x: -7.5, z: -3.5 },
    { x: 7.5, z: -3.5 },
    { x: -7.5, z: 3.0 },
    { x: 7.5, z: 3.0 },
    { x: 25.5, z: 5.8 },
    { x: 46.5, z: 4.5 },
    { x: -24, z: 14.5 },
    { x: -2.0, z: 22 },
    { x: 2.0, z: 36 },
  ];

  const baseGeo = new THREE.CylinderGeometry(0.16, 0.24, 0.65, 10);
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.12, 3.6, 10);
  const capGeo = new THREE.ConeGeometry(0.34, 0.28, 6);
  const bulbGeo = new THREE.CylinderGeometry(0.17, 0.13, 0.34, 6);
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x1b222c,
    roughness: 0.38,
    metalness: 0.85,
  });
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xffedd5,
    emissive: 0xffb347,
    emissiveIntensity: 0.2,
    roughness: 0.2,
  });
  disposables.push(baseGeo, poleGeo, capGeo, bulbGeo, poleMat, bulbMat);

  const streetLights: THREE.PointLight[] = [];
  lampPositions.forEach((lp, idx) => {
    const ly = groundHeightAt(lp.x, lp.z);
    const lGroup = new THREE.Group();
    lGroup.position.set(lp.x, ly, lp.z);

    const plinth = new THREE.Mesh(baseGeo, poleMat);
    plinth.position.y = 0.32;
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 2.05;
    pole.castShadow = !isSoftwareGl;
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.y = 3.95;
    const cap = new THREE.Mesh(capGeo, poleMat);
    cap.position.y = 4.24;
    lGroup.add(plinth, pole, bulb, cap);

    if (idx < 3) {
      const pLight = new THREE.PointLight(0xffb85c, 0, 18, 1.7);
      pLight.position.y = 3.9;
      lGroup.add(pLight);
      streetLights.push(pLight);
    }
    group.add(lGroup);
  });

  // =========================================================================
  // 6. MOORED BOBBING SAILBOATS IN SAPPHIRE BAY (Sculpted Hull + Rigging)
  // =========================================================================
  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, 2.75);
  hullShape.quadraticCurveTo(0.98, 1.15, 0.85, -1.95);
  hullShape.lineTo(0.65, -2.35);
  hullShape.lineTo(-0.65, -2.35);
  hullShape.lineTo(-0.85, -1.95);
  hullShape.quadraticCurveTo(-0.98, 1.15, 0, 2.75);

  const boatHullGeo = new THREE.ExtrudeGeometry(hullShape, {
    depth: 0.72,
    bevelEnabled: true,
    bevelThickness: 0.14,
    bevelSize: 0.08,
    bevelSegments: 2,
  });
  boatHullGeo.rotateX(Math.PI * 0.5);
  boatHullGeo.translate(0, 0.38, 0);

  const cabinDeckGeo = new THREE.BoxGeometry(0.95, 0.34, 1.65);
  const mastGeo = new THREE.CylinderGeometry(0.055, 0.08, 4.9, 8);
  const boomGeo = new THREE.CylinderGeometry(0.035, 0.04, 2.2, 6);
  boomGeo.rotateX(Math.PI * 0.5);

  const sailShape = new THREE.Shape();
  sailShape.moveTo(0, 0);
  sailShape.lineTo(2.05, 0.15);
  sailShape.lineTo(0.08, 4.1);
  sailShape.closePath();
  const sailGeo = new THREE.ExtrudeGeometry(sailShape, { depth: 0.03, bevelEnabled: false });

  const jibShape = new THREE.Shape();
  jibShape.moveTo(0, 0);
  jibShape.lineTo(-1.35, 0.1);
  jibShape.lineTo(-0.05, 3.6);
  jibShape.closePath();
  const jibGeo = new THREE.ExtrudeGeometry(jibShape, { depth: 0.03, bevelEnabled: false });

  const hullMat = new THREE.MeshPhysicalMaterial({
    color: 0xf4f4f0,
    roughness: 0.24,
    metalness: 0.08,
    clearcoat: 0.85,
  });
  const trimStripeMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a5f,
    roughness: 0.35,
  });
  const sailMat = new THREE.MeshStandardMaterial({
    color: 0xfffbeb,
    roughness: 0.82,
    side: THREE.DoubleSide,
  });
  disposables.push(
    boatHullGeo,
    cabinDeckGeo,
    mastGeo,
    boomGeo,
    sailGeo,
    jibGeo,
    hullMat,
    trimStripeMat,
    sailMat,
  );

  const boats: Array<{ group: THREE.Group; baseX: number; baseZ: number; phase: number }> = [];
  const boatCoords = [
    { x: -7.5, z: 39, rot: 0.4 },
    { x: 8.5, z: 44, rot: -0.5 },
    { x: 18, z: 54, rot: 0.85 },
  ];
  boatCoords.forEach((bc, i) => {
    const bg = new THREE.Group();
    bg.position.set(bc.x, WATER_LEVEL + 0.05, bc.z);
    bg.rotation.y = bc.rot;

    const hull = new THREE.Mesh(boatHullGeo, hullMat);
    const cabin = new THREE.Mesh(cabinDeckGeo, barkMat);
    cabin.position.set(0, 0.54, 0.15);
    const mast = new THREE.Mesh(mastGeo, trimStripeMat);
    mast.position.set(0, 2.75, 0.25);
    const boom = new THREE.Mesh(boomGeo, trimStripeMat);
    boom.position.set(0, 1.05, -0.8);
    const sail = new THREE.Mesh(sailGeo, sailMat);
    sail.position.set(0, 1.1, 0.2);
    sail.rotation.y = Math.PI * 0.5;
    const jib = new THREE.Mesh(jibGeo, sailMat);
    jib.position.set(0, 1.15, 0.35);
    jib.rotation.y = Math.PI * 0.5;
    bg.add(hull, cabin, mast, boom, sail, jib);
    group.add(bg);
    boats.push({ group: bg, baseX: bc.x, baseZ: bc.z, phase: i * 1.7 });
  });

  // =========================================================================
  // 7. HARBOR PLAZA BENCHES (Slatted Wood + Cast Iron Backrest) & BEACH UMBRELLAS
  // =========================================================================
  const benchSeatGeo = new THREE.BoxGeometry(2.1, 0.1, 0.55);
  const benchBackGeo = new THREE.BoxGeometry(2.1, 0.45, 0.08);
  const benchLegGeo = new THREE.BoxGeometry(0.12, 0.45, 0.52);
  const benchWoodMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.woodMap,
    bumpMap: textures.woodBump,
    bumpScale: 0.05,
    roughness: 0.72,
  });
  disposables.push(benchSeatGeo, benchBackGeo, benchLegGeo, benchWoodMat);

  const benchSpots = [
    { x: -4.2, z: -6.5, rot: Math.PI * 0.5 },
    { x: 4.2, z: -6.5, rot: -Math.PI * 0.5 },
    { x: -1.8, z: 42.5, rot: 0 },
  ];
  for (const bs of benchSpots) {
    const by = groundHeightAt(bs.x, bs.z);
    const bg = new THREE.Group();
    bg.position.set(bs.x, by, bs.z);
    bg.rotation.y = bs.rot;
    const seat = new THREE.Mesh(benchSeatGeo, benchWoodMat);
    seat.position.y = 0.45;
    seat.castShadow = !isSoftwareGl;
    const back = new THREE.Mesh(benchBackGeo, benchWoodMat);
    back.position.set(0, 0.75, -0.24);
    back.rotation.x = -0.15;
    const legL = new THREE.Mesh(benchLegGeo, poleMat);
    legL.position.set(-0.88, 0.22, 0);
    const legR = new THREE.Mesh(benchLegGeo, poleMat);
    legR.position.set(0.88, 0.22, 0);
    bg.add(seat, back, legL, legR);
    group.add(bg);
  }

  const umbPoleGeo = new THREE.CylinderGeometry(0.045, 0.045, 2.5, 8);
  const umbTopGeo = new THREE.ConeGeometry(1.65, 0.65, 12);
  const umbColors = [0xb9382c, 0x1d5f82, 0xc78926];
  disposables.push(umbPoleGeo, umbTopGeo);
  [
    { x: 14, z: 24 },
    { x: 22, z: 26 },
    { x: 60, z: 24 },
  ].forEach((us, i) => {
    const uy = groundHeightAt(us.x, us.z);
    const ug = new THREE.Group();
    ug.position.set(us.x, uy, us.z);
    const up = new THREE.Mesh(umbPoleGeo, benchWoodMat);
    up.position.y = 1.25;
    const uMat = new THREE.MeshStandardMaterial({
      color: umbColors[i % umbColors.length],
      roughness: 0.78,
      side: THREE.DoubleSide,
    });
    disposables.push(uMat);
    const ut = new THREE.Mesh(umbTopGeo, uMat);
    ut.position.y = 2.55;
    ut.rotation.z = 0.08;
    ut.castShadow = !isSoftwareGl;
    ug.add(up, ut);
    group.add(ug);
  });

  const update = (
    elapsed: number,
    isNight: boolean,
    windStrength: number,
    snowAccum: number,
  ) => {
    windUniforms.uTime.value = elapsed;
    windUniforms.uWind.value = windStrength;
    windUniforms.uSnowAccum.value = snowAccum;

    bulbMat.emissiveIntensity = isNight ? 2.8 : 0.15;
    for (const l of streetLights) {
      l.intensity = isNight ? 4.4 : 0;
    }

    for (const b of boats) {
      b.group.position.y = WATER_LEVEL + 0.12 + Math.sin(elapsed * 1.4 + b.phase) * 0.14;
      b.group.rotation.z = Math.sin(elapsed * 1.1 + b.phase) * 0.045;
      b.group.rotation.x = Math.cos(elapsed * 0.9 + b.phase) * 0.03;
    }
  };

  return {
    group,
    colliders,
    update,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
