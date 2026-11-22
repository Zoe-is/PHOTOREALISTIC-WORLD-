import * as THREE from 'three';
import {
  BRIDGE_CENTER_X,
  BRIDGE_CENTER_Z,
  BRIDGE_DECK_Y,
  BRIDGE_HALF_LENGTH,
  BRIDGE_HALF_WIDTH,
  clamp,
  distanceToRoad,
  fbm2D,
  groundHeightAt,
  lerp,
  LIGHTHOUSE_ROAD_POINTS,
  rawTerrainHeightAt,
  riverCenterX,
  ROAD_LOOP_POINTS,
  smoothstep,
  TERRAIN_EXTENT,
  WATER_LEVEL,
} from './math';
import type { MaterialTextureSet } from './textures';
import type { ColliderBox } from './types';

export interface TerrainRig {
  group: THREE.Group;
  colliders: ColliderBox[];
  updateWater: (
    elapsed: number,
    isNight: boolean,
    skyColorHex: number,
    wetness: number,
    snowAccum: number,
  ) => void;
  dispose: () => void;
}

function injectWetAndSnowSurfaceShader(
  mat: THREE.MeshPhysicalMaterial,
  puddleTex: THREE.Texture,
  uniforms: {
    uTime: { value: number };
    uWetness: { value: number };
    uSnowAccum: { value: number };
  },
  puddleScale: number,
): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWetness = uniforms.uWetness;
    shader.uniforms.uSnowAccum = uniforms.uSnowAccum;
    shader.uniforms.uPuddleMap = { value: puddleTex };

    shader.vertexShader =
      `varying vec3 vSurfaceWorldPos;\nvarying vec3 vSurfaceWorldNormal;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vSurfaceWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vSurfaceWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );

    shader.fragmentShader =
      `uniform float uTime;
      uniform float uWetness;
      uniform float uSnowAccum;
      uniform sampler2D uPuddleMap;
      varying vec3 vSurfaceWorldPos;
      varying vec3 vSurfaceWorldNormal;\n` +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float pudSample = texture2D(uPuddleMap, vSurfaceWorldPos.xz * ${puddleScale.toFixed(4)}).r;
          float puddleMask = smoothstep(0.38, 0.78, pudSample) * uWetness;
          // Wet stone/asphalt darkens realistically due to internal light trapping
          diffuseColor.rgb *= mix(1.0, 0.48, uWetness * 0.65 + puddleMask * 0.35);
          // Snow accumulation on upward-facing surfaces with subtle drift texture
          float upFace = smoothstep(0.55, 0.9, vSurfaceWorldNormal.y);
          float snowPatch = smoothstep(0.18, 0.72, 1.0 - pudSample * 0.42) * upFace * uSnowAccum;
          vec3 snowShade = vec3(0.82, 0.86, 0.91) + (pudSample - 0.5) * 0.06;
          diffuseColor.rgb = mix(diffuseColor.rgb, snowShade, snowPatch * 0.88);`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          float pudSampleR = texture2D(uPuddleMap, vSurfaceWorldPos.xz * ${puddleScale.toFixed(4)}).r;
          float puddleMaskR = smoothstep(0.38, 0.78, pudSampleR) * uWetness;
          roughnessFactor = mix(roughnessFactor, 0.38, uWetness * 0.75);
          roughnessFactor = mix(roughnessFactor, 0.14, puddleMaskR);
          float snowPatchR = smoothstep(0.55, 0.9, vSurfaceWorldNormal.y) * uSnowAccum;
          roughnessFactor = mix(roughnessFactor, 0.88, snowPatchR * 0.85);`,
        );
  };
}

function buildRoadRibbon(
  points: ReadonlyArray<{ x: number; z: number }>,
  closed: boolean,
  width: number,
  skipBridge: boolean,
  textures: MaterialTextureSet,
  weatherUniforms: {
    uTime: { value: number };
    uWetness: { value: number };
    uSnowAccum: { value: number };
  },
): THREE.Mesh {
  const curvePts = points.map(
    (p) => new THREE.Vector3(p.x, groundHeightAt(p.x, p.z) + 0.04, p.z),
  );
  const curve = new THREE.CatmullRomCurve3(curvePts, closed, 'catmullrom', 0.45);
  const samples = closed ? 240 : 80;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const halfW = width * 0.5;
  let accumDist = 0;
  let prevPt = curve.getPointAt(0);

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const pt = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    if (i > 0) accumDist += pt.distanceTo(prevPt);
    prevPt = pt;

    const nx = -tan.z;
    const nz = tan.x;
    const len = Math.hypot(nx, nz) || 1;
    const px = nx / len;
    const pz = nz / len;

    const lx = pt.x - px * halfW;
    const lz = pt.z - pz * halfW;
    const rx = pt.x + px * halfW;
    const rz = pt.z + pz * halfW;

    const inBridge =
      skipBridge &&
      Math.abs(pt.x - BRIDGE_CENTER_X) < BRIDGE_HALF_LENGTH - 0.5 &&
      Math.abs(pt.z - BRIDGE_CENTER_Z) < BRIDGE_HALF_WIDTH + 1.5;

    const ly = inBridge ? BRIDGE_DECK_Y - 0.2 : groundHeightAt(lx, lz) + 0.048;
    const ry = inBridge ? BRIDGE_DECK_Y - 0.2 : groundHeightAt(rx, rz) + 0.048;

    positions.push(lx, ly, lz, rx, ry, rz);
    const vCoord = accumDist / 8.0;
    uvs.push(0, vCoord, 1, vCoord);

    if (i < samples) {
      const base = i * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: textures.asphaltMap,
    bumpMap: textures.asphaltBump,
    bumpScale: 0.045,
    roughness: 0.84,
    metalness: 0.05,
    clearcoat: 0.0,
    clearcoatRoughness: 0.1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  injectWetAndSnowSurfaceShader(mat, textures.puddleNoiseMap, weatherUniforms, 0.065);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.userData.wetMaterial = mat;
  return mesh;
}

export function createTerrainAndWater(
  textures: MaterialTextureSet,
): TerrainRig {
  const group = new THREE.Group();
  const colliders: ColliderBox[] = [];
  const disposables: Array<{ dispose: () => void }> = [];

  const weatherUniforms = {
    uTime: { value: 0 },
    uWetness: { value: 0 },
    uSnowAccum: { value: 0 },
  };
  const wetMaterials: THREE.MeshPhysicalMaterial[] = [];

  // 1. High-resolution Multi-Biome Terrain with World-Space PBR Texture Splatting
  const segs = 200;
  const size = TERRAIN_EXTENT * 2;
  const terrainGeo = new THREE.PlaneGeometry(size, size, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);

  const pos = terrainGeo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  // x: grass/forest weight, y: sand weight, z: rock weight, w: permanent alpine snow weight
  const biomeWeights = new Float32Array(pos.count * 4);

  const cGrass = new THREE.Color(0x4f7537);
  const cLush = new THREE.Color(0x3b5d2b);
  const cForest = new THREE.Color(0x2c4723);
  const cSand = new THREE.Color(0xd5be94);
  const cRock = new THREE.Color(0x736f68);
  const cSnow = new THREE.Color(0xf1f5f9);
  const cPlaza = new THREE.Color(0x8a7d6a);
  const cTmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = rawTerrainHeightAt(x, z);
    pos.setY(i, h);

    const hx = rawTerrainHeightAt(x + 1.5, z);
    const hz = rawTerrainHeightAt(x, z + 1.5);
    const slope = Math.hypot(hx - h, hz - h) / 1.5;

    const n = fbm2D(x * 0.04, z * 0.04, 2) * 0.5 + 0.5;
    cTmp.copy(cGrass).lerp(cLush, n);

    const forestMask = smoothstep(-10, -32, x) * (1 - smoothstep(10, 32, z));
    cTmp.lerp(cForest, forestMask * 0.65);

    const sandMask = clamp(
      (1 - smoothstep(1.3, 3.2, h)) * smoothstep(8, 22, z) +
        (1 - smoothstep(0.2, 1.4, h)),
      0,
      1,
    );
    cTmp.lerp(cSand, sandMask);

    const plazaMask = 1 - smoothstep(17, 25, Math.hypot(x * 0.85, (z + 2) * 0.95));
    cTmp.lerp(cPlaza, plazaMask * 0.72);

    const rockMask = clamp(
      smoothstep(0.36, 0.82, slope) + smoothstep(15, 25, h) * 0.78,
      0,
      1,
    );
    cTmp.lerp(cRock, rockMask);

    const snowMask = clamp(
      smoothstep(23.5, 31, h + n * 2.5) * (1 - smoothstep(0.65, 1.15, slope)),
      0,
      1,
    );
    cTmp.lerp(cSnow, snowMask);

    const roadDist = distanceToRoad(x, z).distance;
    if (roadDist < 4.5) {
      cTmp.lerp(cRock, (1 - smoothstep(2.4, 4.5, roadDist)) * 0.35);
    }

    colors[i * 3] = cTmp.r;
    colors[i * 3 + 1] = cTmp.g;
    colors[i * 3 + 2] = cTmp.b;

    const wTotal = Math.max(0.001, (1 - sandMask) * (1 - rockMask) + sandMask + rockMask);
    biomeWeights[i * 4] = ((1 - sandMask) * (1 - rockMask)) / wTotal;
    biomeWeights[i * 4 + 1] = sandMask / wTotal;
    biomeWeights[i * 4 + 2] = rockMask / wTotal;
    biomeWeights[i * 4 + 3] = snowMask;
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.setAttribute('aBiome', new THREE.BufferAttribute(biomeWeights, 4));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    bumpMap: textures.terrainDetailBump,
    bumpScale: 0.16,
    roughness: 0.92,
    metalness: 0.02,
  });

  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrassMap = { value: textures.grassGroundMap };
    shader.uniforms.uRockMap = { value: textures.rockCliffMap };
    shader.uniforms.uSandMap = { value: textures.sandMap };
    shader.uniforms.uWetness = weatherUniforms.uWetness;
    shader.uniforms.uSnowAccum = weatherUniforms.uSnowAccum;

    shader.vertexShader =
      `attribute vec4 aBiome;
      varying vec4 vBiome;
      varying vec3 vTerrainWorldPos;
      varying vec3 vTerrainWorldNormal;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vBiome = aBiome;
        vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTerrainWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );

    shader.fragmentShader =
      `uniform sampler2D uGrassMap;
      uniform sampler2D uRockMap;
      uniform sampler2D uSandMap;
      uniform float uWetness;
      uniform float uSnowAccum;
      varying vec4 vBiome;
      varying vec3 vTerrainWorldPos;
      varying vec3 vTerrainWorldNormal;\n` +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec2 uvGrass = vTerrainWorldPos.xz * 0.16;
          vec2 uvSand = vTerrainWorldPos.xz * 0.18;
          // Triplanar-style rock sampling so steep cliff faces stay crisp without vertical stretching
          vec2 uvRockX = vTerrainWorldPos.zy * 0.11;
          vec2 uvRockZ = vTerrainWorldPos.xy * 0.11;
          vec2 uvRockY = vTerrainWorldPos.xz * 0.11;
          vec3 blendW = abs(vTerrainWorldNormal);
          blendW = pow(blendW, vec3(3.0));
          blendW /= max(0.001, blendW.x + blendW.y + blendW.z);

          vec3 grassTex = texture2D(uGrassMap, uvGrass).rgb;
          vec3 sandTex = texture2D(uSandMap, uvSand).rgb;
          vec3 rockTex = texture2D(uRockMap, uvRockX).rgb * blendW.x
                       + texture2D(uRockMap, uvRockY).rgb * blendW.y
                       + texture2D(uRockMap, uvRockZ).rgb * blendW.z;

          vec3 splatColor = grassTex * vBiome.x + sandTex * vBiome.y + rockTex * vBiome.z;
          // Modulate rich procedural detail against macro biome tint
          diffuseColor.rgb = mix(diffuseColor.rgb, splatColor * (0.62 + diffuseColor.rgb * 0.68), 0.78);

          // Alpine snow & dynamic snowfall accumulation
          float slopeMask = smoothstep(0.45, 0.85, vTerrainWorldNormal.y);
          float totalSnow = clamp(vBiome.w + uSnowAccum * slopeMask * 0.92, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.90, 0.93, 0.97), totalSnow);

          // Rain dampens soil & sand darker
          diffuseColor.rgb *= mix(1.0, 0.68, uWetness * (1.0 - totalSnow));`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.42, uWetness * 0.65);`,
        );
  };

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);
  disposables.push(terrainGeo, terrainMat);

  // 2. Harbor Town Cobblestone Plaza with carved stone curb ring & wet puddle shader
  const plazaGeo = new THREE.CircleGeometry(15.5, 64);
  plazaGeo.rotateX(-Math.PI / 2);
  const plazaMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: textures.cobbleMap,
    bumpMap: textures.cobbleBump,
    bumpScale: 0.1,
    roughness: 0.78,
    metalness: 0.04,
    clearcoat: 0.0,
    clearcoatRoughness: 0.12,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  injectWetAndSnowSurfaceShader(plazaMat, textures.puddleNoiseMap, weatherUniforms, 0.08);
  wetMaterials.push(plazaMat);

  const plazaMesh = new THREE.Mesh(plazaGeo, plazaMat);
  plazaMesh.position.set(0, 4.025, -4);
  plazaMesh.receiveShadow = true;
  group.add(plazaMesh);

  const curbGeo = new THREE.TorusGeometry(15.5, 0.24, 8, 64);
  curbGeo.rotateX(Math.PI / 2);
  const curbMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.stoneMap,
    bumpMap: textures.stoneBump,
    bumpScale: 0.08,
    roughness: 0.85,
  });
  const curbMesh = new THREE.Mesh(curbGeo, curbMat);
  curbMesh.position.set(0, 4.04, -4);
  curbMesh.receiveShadow = true;
  group.add(curbMesh);
  disposables.push(plazaGeo, plazaMat, curbGeo, curbMat);

  // 3. Paved Road Ribbons (with wet puddles & snow accumulation)
  const mainRoad = buildRoadRibbon(
    ROAD_LOOP_POINTS,
    true,
    5.4,
    true,
    textures,
    weatherUniforms,
  );
  const lhRoad = buildRoadRibbon(
    LIGHTHOUSE_ROAD_POINTS,
    false,
    4.2,
    false,
    textures,
    weatherUniforms,
  );
  group.add(mainRoad, lhRoad);
  wetMaterials.push(
    mainRoad.userData.wetMaterial as THREE.MeshPhysicalMaterial,
    lhRoad.userData.wetMaterial as THREE.MeshPhysicalMaterial,
  );
  disposables.push(
    mainRoad.geometry,
    mainRoad.material as THREE.Material,
    lhRoad.geometry,
    lhRoad.material as THREE.Material,
  );

  // Pedestrian Crosswalk Stripes near East Plaza Intersection (x=15, z=3)
  const stripeGeo = new THREE.PlaneGeometry(0.45, 2.6);
  stripeGeo.rotateX(-Math.PI / 2);
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xe5e2d8,
    roughness: 0.72,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  for (let i = -2; i <= 2; i++) {
    const sx = 14.5;
    const sz = 3.1 + i * 0.9;
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.set(sx, groundHeightAt(sx, sz) + 0.055, sz);
    stripe.rotation.y = Math.PI * 0.5;
    stripe.receiveShadow = true;
    group.add(stripe);
  }
  disposables.push(stripeGeo, stripeMat);

  // 4. Stone Arched River Bridge at (36, 2)
  const bridgeGroup = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.stoneMap,
    bumpMap: textures.stoneBump,
    bumpScale: 0.14,
    roughness: 0.85,
    metalness: 0.04,
  });
  const deckMat = new THREE.MeshPhysicalMaterial({
    color: 0xd8d0c4,
    map: textures.cobbleMap,
    bumpMap: textures.cobbleBump,
    bumpScale: 0.07,
    roughness: 0.8,
    clearcoat: 0,
    clearcoatRoughness: 0.12,
  });
  injectWetAndSnowSurfaceShader(deckMat, textures.puddleNoiseMap, weatherUniforms, 0.09);
  wetMaterials.push(deckMat);
  disposables.push(stoneMat, deckMat);

  const archSegs = 12;
  const segLen = (BRIDGE_HALF_LENGTH * 2) / archSegs;
  const segGeo = new THREE.BoxGeometry(segLen + 0.12, 0.55, BRIDGE_HALF_WIDTH * 2);
  const parapetGeo = new THREE.BoxGeometry(segLen + 0.1, 0.85, 0.45);
  const copingGeo = new THREE.BoxGeometry(segLen + 0.12, 0.14, 0.58);
  disposables.push(segGeo, parapetGeo, copingGeo);

  for (let i = 0; i < archSegs; i++) {
    const t = ((i + 0.5) / archSegs) * 2 - 1;
    const wx = BRIDGE_CENTER_X + t * BRIDGE_HALF_LENGTH;
    const archRise = (1 - t * t) * 0.65;
    const y = BRIDGE_DECK_Y + archRise;
    const slopeAngle = Math.atan((-2 * t * 0.65) / BRIDGE_HALF_LENGTH);

    const deckSeg = new THREE.Mesh(segGeo, deckMat);
    deckSeg.position.set(wx, y - 0.25, BRIDGE_CENTER_Z);
    deckSeg.rotation.z = slopeAngle;
    deckSeg.castShadow = true;
    deckSeg.receiveShadow = true;
    bridgeGroup.add(deckSeg);

    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(parapetGeo, stoneMat);
      wall.position.set(
        wx,
        y + 0.42,
        BRIDGE_CENTER_Z + side * (BRIDGE_HALF_WIDTH - 0.22),
      );
      wall.rotation.z = slopeAngle;
      wall.castShadow = true;
      wall.receiveShadow = true;

      const coping = new THREE.Mesh(copingGeo, stoneMat);
      coping.position.set(
        wx,
        y + 0.88,
        BRIDGE_CENTER_Z + side * (BRIDGE_HALF_WIDTH - 0.22),
      );
      coping.rotation.z = slopeAngle;
      coping.castShadow = true;
      bridgeGroup.add(wall, coping);
    }
  }

  const pierGeo = new THREE.BoxGeometry(2.6, 7.5, BRIDGE_HALF_WIDTH * 2 + 0.8);
  disposables.push(pierGeo);
  for (const px of [
    BRIDGE_CENTER_X - BRIDGE_HALF_LENGTH + 0.8,
    BRIDGE_CENTER_X + BRIDGE_HALF_LENGTH - 0.8,
  ]) {
    const pier = new THREE.Mesh(pierGeo, stoneMat);
    pier.position.set(px, 0.8, BRIDGE_CENTER_Z);
    pier.castShadow = true;
    pier.receiveShadow = true;
    bridgeGroup.add(pier);
  }
  group.add(bridgeGroup);

  colliders.push(
    {
      id: 'bridge_parapet_n',
      minX: BRIDGE_CENTER_X - BRIDGE_HALF_LENGTH,
      maxX: BRIDGE_CENTER_X + BRIDGE_HALF_LENGTH,
      minZ: BRIDGE_CENTER_Z - BRIDGE_HALF_WIDTH,
      maxZ: BRIDGE_CENTER_Z - BRIDGE_HALF_WIDTH + 0.55,
      minY: 2.5,
      maxY: 6.5,
    },
    {
      id: 'bridge_parapet_s',
      minX: BRIDGE_CENTER_X - BRIDGE_HALF_LENGTH,
      maxX: BRIDGE_CENTER_X + BRIDGE_HALF_LENGTH,
      minZ: BRIDGE_CENTER_Z + BRIDGE_HALF_WIDTH - 0.55,
      maxZ: BRIDGE_CENTER_Z + BRIDGE_HALF_WIDTH,
      minY: 2.5,
      maxY: 6.5,
    },
  );

  // 5. Harbor Timber Pier extending into Sapphire Bay (x: [-2.6, 2.6], z: [19, 44])
  const pierGroup = new THREE.Group();
  const woodMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: textures.woodMap,
    bumpMap: textures.woodBump,
    bumpScale: 0.09,
    roughness: 0.78,
    metalness: 0.04,
    clearcoat: 0,
    clearcoatRoughness: 0.15,
  });
  injectWetAndSnowSurfaceShader(woodMat, textures.puddleNoiseMap, weatherUniforms, 0.12);
  wetMaterials.push(woodMat);

  const pierDeckGeo = new THREE.BoxGeometry(5.2, 0.3, 25.5);
  const pierDeck = new THREE.Mesh(pierDeckGeo, woodMat);
  pierDeck.position.set(0, 1.2, 31.5);
  pierDeck.castShadow = true;
  pierDeck.receiveShadow = true;
  pierGroup.add(pierDeck);

  const postGeo = new THREE.CylinderGeometry(0.18, 0.22, 4.8, 10);
  const bollardGeo = new THREE.CylinderGeometry(0.16, 0.19, 0.65, 10);
  const bollardMat = new THREE.MeshStandardMaterial({
    color: 0x3b2f26,
    roughness: 0.72,
    metalness: 0.25,
  });
  disposables.push(woodMat, pierDeckGeo, postGeo, bollardGeo, bollardMat);

  for (let pz = 20; pz <= 43; pz += 4.5) {
    for (const px of [-2.2, 2.2]) {
      const piling = new THREE.Mesh(postGeo, woodMat);
      piling.position.set(px, -0.6, pz);
      piling.castShadow = true;
      pierGroup.add(piling);

      const bollard = new THREE.Mesh(bollardGeo, bollardMat);
      bollard.position.set(px, 1.65, pz);
      bollard.castShadow = true;
      pierGroup.add(bollard);
    }
  }
  group.add(pierGroup);

  // 6. Photorealistic Animated Water (Multi-wave Gerstner ripples + Fresnel + Shoreline Foam)
  const waterUniforms = {
    uTime: { value: 0 },
    uSkyColor: { value: new THREE.Color(0x8bc3ee) },
  };

  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f536e,
    roughness: 0.07,
    metalness: 0.18,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    transparent: true,
    opacity: 0.88,
  });

  waterMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterUniforms.uTime;
    shader.uniforms.uSkyColor = waterUniforms.uSkyColor;
    shader.vertexShader =
      `uniform float uTime;
      varying vec3 vWaterWorldPos;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 wPos0 = modelMatrix * vec4(transformed, 1.0);
        float w1 = sin(wPos0.x * 0.18 + uTime * 1.45) * 0.13;
        float w2 = cos(wPos0.z * 0.23 - uTime * 1.18) * 0.10;
        float w3 = sin((wPos0.x * 0.5 - wPos0.z * 0.4) + uTime * 2.1) * 0.04;
        transformed.y += w1 + w2 + w3;
        vWaterWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader =
      `uniform float uTime;
      uniform vec3 uSkyColor;
      varying vec3 vWaterWorldPos;\n` +
      shader.fragmentShader
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          // Analytic micro-ripple normal perturbation for crisp sunlight water glints
          float nx = cos(vWaterWorldPos.x * 1.35 + uTime * 2.4) * 0.06
                   + cos((vWaterWorldPos.x + vWaterWorldPos.z) * 2.6 - uTime * 3.1) * 0.035;
          float nz = sin(vWaterWorldPos.z * 1.45 - uTime * 2.1) * 0.06
                   + sin((vWaterWorldPos.z - vWaterWorldPos.x) * 2.4 + uTime * 2.8) * 0.035;
          normal = normalize(normal + vec3(nx, 0.0, nz));`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          // World-space micro-ripple normal for Fresnel grazing sky reflection + shallow coastal turquoise
          vec3 waterNormalW = normalize(vec3(
            cos(vWaterWorldPos.x * 1.35 + uTime * 2.4) * 0.065 + cos((vWaterWorldPos.x + vWaterWorldPos.z) * 2.6 - uTime * 3.1) * 0.035,
            1.0,
            sin(vWaterWorldPos.z * 1.45 - uTime * 2.1) * 0.065 + sin((vWaterWorldPos.z - vWaterWorldPos.x) * 2.4 + uTime * 2.8) * 0.035
          ));
          vec3 viewDirW = normalize(cameraPosition - vWaterWorldPos);
          float fresnel = pow(1.0 - clamp(dot(waterNormalW, viewDirW), 0.0, 1.0), 3.2);
          float shoreDist = clamp((36.0 - vWaterWorldPos.z) * 0.055, 0.0, 1.0);
          vec3 deepCol = diffuseColor.rgb;
          vec3 shallowCol = vec3(0.08, 0.44, 0.48);
          diffuseColor.rgb = mix(deepCol, shallowCol, shoreDist * 0.72);
          diffuseColor.rgb = mix(diffuseColor.rgb, uSkyColor * 0.88, fresnel * 0.62);
          // Subtle animated shoreline foam band
          float foamWave = sin(vWaterWorldPos.z * 0.9 - uTime * 2.2 + sin(vWaterWorldPos.x * 0.25) * 1.6);
          float foamMask = smoothstep(0.55, 0.92, shoreDist) * smoothstep(0.35, 0.95, foamWave);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.94, 0.97), foamMask * 0.45);`,
        );
  };

  const oceanGeo = new THREE.PlaneGeometry(660, 320, 110, 72);
  oceanGeo.rotateX(-Math.PI / 2);
  const oceanMesh = new THREE.Mesh(oceanGeo, waterMat);
  oceanMesh.position.set(0, WATER_LEVEL, 178);
  oceanMesh.receiveShadow = true;
  group.add(oceanMesh);

  const lakeGeo = new THREE.CircleGeometry(17.5, 48);
  lakeGeo.rotateX(-Math.PI / 2);
  const lakeMesh = new THREE.Mesh(lakeGeo, waterMat);
  lakeMesh.position.set(48, WATER_LEVEL + 0.1, -42);
  lakeMesh.receiveShadow = true;
  group.add(lakeMesh);

  const riverPts: THREE.Vector3[] = [];
  for (let rz = -36; rz <= 34; rz += 4) {
    riverPts.push(new THREE.Vector3(riverCenterX(rz), WATER_LEVEL + 0.05, rz));
  }
  const riverCurve = new THREE.CatmullRomCurve3(riverPts);
  const riverSamples = 72;
  const rPos: number[] = [];
  const rIdx: number[] = [];
  for (let i = 0; i <= riverSamples; i++) {
    const t = i / riverSamples;
    const p = riverCurve.getPointAt(t);
    const tan = riverCurve.getTangentAt(t);
    const nx = -tan.z;
    const nz = tan.x;
    const l = Math.hypot(nx, nz) || 1;
    const hw = lerp(3.4, 5.2, t);
    rPos.push(p.x - (nx / l) * hw, p.y, p.z - (nz / l) * hw);
    rPos.push(p.x + (nx / l) * hw, p.y, p.z + (nz / l) * hw);
    if (i < riverSamples) {
      const b = i * 2;
      rIdx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  const riverGeo = new THREE.BufferGeometry();
  riverGeo.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3));
  riverGeo.setIndex(rIdx);
  riverGeo.computeVertexNormals();
  const riverMesh = new THREE.Mesh(riverGeo, waterMat);
  riverMesh.receiveShadow = true;
  group.add(riverMesh);

  disposables.push(waterMat, oceanGeo, lakeGeo, riverGeo);

  const dayWaterColor = new THREE.Color(0x0f536e);
  const nightWaterColor = new THREE.Color(0x081a2b);
  const tmpWaterColor = new THREE.Color();

  const updateWater = (
    elapsed: number,
    isNight: boolean,
    skyColorHex: number,
    wetness: number,
    snowAccum: number,
  ) => {
    waterUniforms.uTime.value = elapsed;
    waterUniforms.uSkyColor.value.setHex(skyColorHex);

    weatherUniforms.uTime.value = elapsed;
    weatherUniforms.uWetness.value = wetness;
    weatherUniforms.uSnowAccum.value = snowAccum;

    for (const m of wetMaterials) {
      m.clearcoat = wetness * 0.36 * (1 - snowAccum);
      m.clearcoatRoughness = lerp(0.36, 0.16, wetness);
    }

    tmpWaterColor.copy(isNight ? nightWaterColor : dayWaterColor);
    tmpWaterColor.lerp(waterUniforms.uSkyColor.value, 0.16);
    waterMat.color.copy(tmpWaterColor);
  };

  return {
    group,
    colliders,
    updateWater,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
