import * as THREE from 'three';
import { computeTrafficLightCycle, groundHeightAt } from './math';
import type { MaterialTextureSet } from './textures';
import type { ColliderBox, InteractableTarget } from './types';

export interface DoorController {
  id: string;
  pivot: THREE.Group;
  collider: ColliderBox;
  isOpen: boolean;
  angle: number;
  targetAngle: number;
}

interface SignalHead {
  redMat: THREE.MeshStandardMaterial;
  amberMat: THREE.MeshStandardMaterial;
  greenMat: THREE.MeshStandardMaterial;
  axis: 'ns' | 'ew';
}

export interface ArchitectureRig {
  group: THREE.Group;
  colliders: ColliderBox[];
  interactables: InteractableTarget[];
  doors: DoorController[];
  interiorLights: THREE.PointLight[];
  lighthouseBeam: THREE.Group;
  shrineGlow: THREE.PointLight;
  toggleDoor: (doorId: string) => boolean;
  update: (dt: number, elapsed: number, isNight: boolean, snowAccum: number) => void;
  dispose: () => void;
}

interface BuildingSpec {
  id: string;
  name: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  wallHeight: number;
  rotY: number;
  wallStyle: 'stucco' | 'brick' | 'timber';
  wallColor: number;
  trimColor: number;
  roofColor: number;
  enterable: boolean;
  furnishKind?: 'cafe' | 'shop' | 'lodge';
}

function localToWorldXZ(
  bx: number,
  bz: number,
  rotY: number,
  lx: number,
  lz: number,
): { x: number; z: number } {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  return {
    x: bx + lx * c + lz * s,
    z: bz - lx * s + lz * c,
  };
}

function worldColliderBox(
  id: string,
  bx: number,
  bz: number,
  baseY: number,
  rotY: number,
  cx: number,
  cz: number,
  w: number,
  d: number,
  minH: number,
  maxH: number,
  isDoor = false,
): ColliderBox {
  const hw = w * 0.5;
  const hd = d * 0.5;
  const corners = [
    localToWorldXZ(bx, bz, rotY, cx - hw, cz - hd),
    localToWorldXZ(bx, bz, rotY, cx + hw, cz - hd),
    localToWorldXZ(bx, bz, rotY, cx - hw, cz + hd),
    localToWorldXZ(bx, bz, rotY, cx + hw, cz + hd),
  ];
  return {
    id,
    minX: Math.min(...corners.map((p) => p.x)),
    maxX: Math.max(...corners.map((p) => p.x)),
    minZ: Math.min(...corners.map((p) => p.z)),
    maxZ: Math.max(...corners.map((p) => p.z)),
    minY: baseY + minH,
    maxY: baseY + maxH,
    isDoor,
    doorOpen: false,
  };
}

export function createArchitecture(
  textures: MaterialTextureSet,
): ArchitectureRig {
  const group = new THREE.Group();
  const colliders: ColliderBox[] = [];
  const interactables: InteractableTarget[] = [];
  const doors: DoorController[] = [];
  const interiorLights: THREE.PointLight[] = [];
  const signalHeads: SignalHead[] = [];
  const disposables: Array<{ dispose: () => void }> = [];

  const roofUniforms = {
    uSnowAccum: { value: 0 },
  };

  const injectRoofSnow = (mat: THREE.MeshStandardMaterial) => {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSnowAccum = roofUniforms.uSnowAccum;
      shader.vertexShader =
        `varying vec3 vRoofNormal;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vRoofNormal = normalize(mat3(modelMatrix) * objectNormal);`,
        );
      shader.fragmentShader =
        `uniform float uSnowAccum;\nvarying vec3 vRoofNormal;\n` +
        shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float roofSnow = smoothstep(0.32, 0.72, vRoofNormal.y) * uSnowAccum;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.90, 0.93, 0.97), roofSnow * 0.88);`,
        );
    };
  };

  const roofMatBase = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.roofTileMap,
    bumpMap: textures.roofTileBump,
    bumpScale: 0.12,
    roughness: 0.74,
    metalness: 0.05,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.woodMap,
    bumpMap: textures.woodBump,
    bumpScale: 0.08,
    roughness: 0.72,
    metalness: 0.04,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xcbe3f7,
    roughness: 0.06,
    metalness: 0.12,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: 0.55,
  });
  const warmInteriorGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x3b4d5e,
    emissive: 0xffc670,
    emissiveIntensity: 0.12,
    roughness: 0.06,
    metalness: 0.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd9a441,
    roughness: 0.24,
    metalness: 0.9,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.36,
    metalness: 0.84,
  });
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.stoneMap,
    bumpMap: textures.stoneBump,
    bumpScale: 0.12,
    roughness: 0.84,
    metalness: 0.04,
  });
  disposables.push(
    roofMatBase,
    woodMat,
    glassMat,
    warmInteriorGlassMat,
    brassMat,
    steelMat,
    stoneMat,
  );

  const buildings: BuildingSpec[] = [
    {
      id: 'harbor_cafe',
      name: 'Harbor Café & Bakery',
      x: -14.5,
      z: -9.5,
      width: 8.6,
      depth: 7.4,
      wallHeight: 3.8,
      rotY: Math.PI * 0.5,
      wallStyle: 'stucco',
      wallColor: 0xe8d9c0,
      trimColor: 0x2c4759,
      roofColor: 0xb04e34,
      enterable: true,
      furnishKind: 'cafe',
    },
    {
      id: 'general_store',
      name: 'Coastal General Store',
      x: 15.5,
      z: -11.5,
      width: 9.2,
      depth: 7.8,
      wallHeight: 4.0,
      rotY: -Math.PI * 0.5,
      wallStyle: 'brick',
      wallColor: 0xffffff,
      trimColor: 0x374734,
      roofColor: 0x8f412e,
      enterable: true,
      furnishKind: 'shop',
    },
    {
      id: 'lakeside_lodge',
      name: 'Emerald Lake Lodge',
      x: 56,
      z: -24,
      width: 9.4,
      depth: 7.6,
      wallHeight: 3.9,
      rotY: -Math.PI * 0.25,
      wallStyle: 'timber',
      wallColor: 0xdccbb5,
      trimColor: 0x4b3329,
      roofColor: 0x523b30,
      enterable: true,
      furnishKind: 'lodge',
    },
    {
      id: 'villa_west',
      name: 'Harbor Residence',
      x: -17,
      z: 10.5,
      width: 7.4,
      depth: 6.4,
      wallHeight: 3.8,
      rotY: Math.PI * 0.72,
      wallStyle: 'brick',
      wallColor: 0xf4ebe2,
      trimColor: 0x54382d,
      roofColor: 0x9c4632,
      enterable: false,
    },
    {
      id: 'villa_north',
      name: 'Artisan Studio',
      x: 1.5,
      z: -19.5,
      width: 8.4,
      depth: 6.8,
      wallHeight: 4.1,
      rotY: 0,
      wallStyle: 'stucco',
      wallColor: 0xe0d8c8,
      trimColor: 0x334e5e,
      roofColor: 0x8a3d2b,
      enterable: false,
    },
    {
      id: 'forest_cabin',
      name: 'Ranger Timber Cabin',
      x: -36,
      z: -22,
      width: 7.0,
      depth: 6.0,
      wallHeight: 3.5,
      rotY: Math.PI * 0.35,
      wallStyle: 'timber',
      wallColor: 0xc29b75,
      trimColor: 0x38281c,
      roofColor: 0x453b35,
      enterable: false,
    },
  ];

  // Shared detailed window / interior geometries
  const winPaneGeo = new THREE.BoxGeometry(1.12, 1.32, 0.08);
  const frameOuterGeo = new THREE.BoxGeometry(1.36, 1.54, 0.16);
  const mullionVGeo = new THREE.BoxGeometry(0.06, 1.34, 0.14);
  const mullionHGeo = new THREE.BoxGeometry(1.16, 0.06, 0.14);
  const shutterGeo = new THREE.BoxGeometry(0.38, 1.4, 0.09);
  const sillGeo = new THREE.BoxGeometry(1.5, 0.14, 0.28);
  const flowerBoxGeo = new THREE.BoxGeometry(1.18, 0.22, 0.28);
  const flowerBloomGeo = new THREE.DodecahedronGeometry(0.11, 0);
  const pipeGeo = new THREE.CylinderGeometry(0.055, 0.055, 3.8, 8);
  disposables.push(
    winPaneGeo,
    frameOuterGeo,
    mullionVGeo,
    mullionHGeo,
    shutterGeo,
    sillGeo,
    flowerBoxGeo,
    flowerBloomGeo,
    pipeGeo,
  );

  for (const b of buildings) {
    const baseY = groundHeightAt(b.x, b.z);
    const bGroup = new THREE.Group();
    bGroup.position.set(b.x, baseY, b.z);
    bGroup.rotation.y = b.rotY;

    const wallMap =
      b.wallStyle === 'brick'
        ? textures.brickMap
        : b.wallStyle === 'timber'
          ? textures.woodMap
          : textures.stuccoMap;
    const wallBump =
      b.wallStyle === 'brick'
        ? textures.brickBump
        : b.wallStyle === 'timber'
          ? textures.woodBump
          : textures.stuccoBump;

    const wallMat = new THREE.MeshStandardMaterial({
      color: b.wallColor,
      map: wallMap,
      bumpMap: wallBump,
      bumpScale: b.wallStyle === 'brick' ? 0.1 : 0.06,
      roughness: 0.86,
      metalness: 0.02,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: b.trimColor,
      roughness: 0.52,
      metalness: 0.08,
    });
    const roofMat = roofMatBase.clone();
    roofMat.color.setHex(b.roofColor);
    injectRoofSnow(roofMat);
    disposables.push(wallMat, trimMat, roofMat);

    const w = b.width;
    const d = b.depth;
    const h = b.wallHeight;
    const wallT = 0.34;

    // Stone masonry foundation plinth + stone step at doorway
    const plinthGeo = new THREE.BoxGeometry(w + 0.48, 0.52, d + 0.48);
    const plinth = new THREE.Mesh(plinthGeo, stoneMat);
    plinth.position.y = 0.04;
    plinth.receiveShadow = true;
    plinth.castShadow = true;
    bGroup.add(plinth);
    disposables.push(plinthGeo);

    // Corner stone quoins & rain downspout pipe
    const pilasterGeo = new THREE.BoxGeometry(0.42, h, 0.42);
    disposables.push(pilasterGeo);
    for (const cx of [-w * 0.5 + 0.14, w * 0.5 - 0.14]) {
      for (const cz of [-d * 0.5 + 0.14, d * 0.5 - 0.14]) {
        const pil = new THREE.Mesh(pilasterGeo, stoneMat);
        pil.position.set(cx, h * 0.5 + 0.2, cz);
        pil.castShadow = true;
        pil.receiveShadow = true;
        bGroup.add(pil);
      }
    }
    const pipe = new THREE.Mesh(pipeGeo, steelMat);
    pipe.position.set(w * 0.5 + 0.06, h * 0.5 + 0.1, d * 0.5 - 0.3);
    bGroup.add(pipe);

    if (b.enterable) {
      // Interior timber floor + woven area rug
      const floorGeo = new THREE.BoxGeometry(w - 0.2, 0.14, d - 0.2);
      const floorMesh = new THREE.Mesh(floorGeo, woodMat);
      floorMesh.position.y = 0.26;
      floorMesh.receiveShadow = true;
      bGroup.add(floorMesh);

      const rugGeo = new THREE.BoxGeometry(w * 0.46, 0.02, d * 0.44);
      const rugMat = new THREE.MeshStandardMaterial({
        color: b.furnishKind === 'cafe' ? 0x7c2d23 : b.furnishKind === 'shop' ? 0x2c4b4e : 0x5c3a28,
        roughness: 0.95,
      });
      const rug = new THREE.Mesh(rugGeo, rugMat);
      rug.position.set(0.4, 0.34, 0.3);
      rug.receiveShadow = true;
      bGroup.add(rug);
      disposables.push(floorGeo, rugGeo, rugMat);

      const sideGeo = new THREE.BoxGeometry(wallT, h, d);
      const backGeo = new THREE.BoxGeometry(w, h, wallT);
      disposables.push(sideGeo, backGeo);

      const leftW = new THREE.Mesh(sideGeo, wallMat);
      leftW.position.set(-w * 0.5 + wallT * 0.5, h * 0.5 + 0.2, 0);
      leftW.castShadow = true;
      leftW.receiveShadow = true;

      const rightW = new THREE.Mesh(sideGeo, wallMat);
      rightW.position.set(w * 0.5 - wallT * 0.5, h * 0.5 + 0.2, 0);
      rightW.castShadow = true;
      rightW.receiveShadow = true;

      const backW = new THREE.Mesh(backGeo, wallMat);
      backW.position.set(0, h * 0.5 + 0.2, -d * 0.5 + wallT * 0.5);
      backW.castShadow = true;
      backW.receiveShadow = true;
      bGroup.add(leftW, rightW, backW);

      // Front wall split around wide 1.85m doorway
      const doorW = 1.85;
      const doorH = 2.68;
      const sideSegW = (w - doorW) * 0.5;
      const fSideGeo = new THREE.BoxGeometry(sideSegW, h, wallT);
      const lintelGeo = new THREE.BoxGeometry(doorW, h - doorH, wallT);
      disposables.push(fSideGeo, lintelGeo);

      const frontL = new THREE.Mesh(fSideGeo, wallMat);
      frontL.position.set(-w * 0.5 + sideSegW * 0.5, h * 0.5 + 0.2, d * 0.5 - wallT * 0.5);
      frontL.castShadow = true;
      frontL.receiveShadow = true;

      const frontR = new THREE.Mesh(fSideGeo, wallMat);
      frontR.position.set(w * 0.5 - sideSegW * 0.5, h * 0.5 + 0.2, d * 0.5 - wallT * 0.5);
      frontR.castShadow = true;
      frontR.receiveShadow = true;

      const lintel = new THREE.Mesh(lintelGeo, wallMat);
      lintel.position.set(0, doorH + (h - doorH) * 0.5 + 0.2, d * 0.5 - wallT * 0.5);
      lintel.castShadow = true;
      bGroup.add(frontL, frontR, lintel);

      // Stone threshold step + solid door jambs + hinged glazed door
      const stepGeo = new THREE.BoxGeometry(doorW + 0.4, 0.22, 0.8);
      const step = new THREE.Mesh(stepGeo, stoneMat);
      step.position.set(0, 0.14, d * 0.5 + 0.35);
      step.receiveShadow = true;
      bGroup.add(step);

      const jambGeo = new THREE.BoxGeometry(0.16, doorH, wallT + 0.14);
      const jambL = new THREE.Mesh(jambGeo, trimMat);
      jambL.position.set(-doorW * 0.5, doorH * 0.5 + 0.2, d * 0.5 - wallT * 0.5);
      const jambR = new THREE.Mesh(jambGeo, trimMat);
      jambR.position.set(doorW * 0.5, doorH * 0.5 + 0.2, d * 0.5 - wallT * 0.5);
      bGroup.add(jambL, jambR);
      disposables.push(stepGeo, jambGeo);

      const doorPivot = new THREE.Group();
      doorPivot.position.set(-doorW * 0.5 + 0.08, 0.26, d * 0.5 - wallT * 0.5);
      const doorPanelGeo = new THREE.BoxGeometry(doorW - 0.16, doorH - 0.08, 0.1);
      const doorPanel = new THREE.Mesh(doorPanelGeo, trimMat);
      doorPanel.position.set((doorW - 0.16) * 0.5, (doorH - 0.08) * 0.5, 0);
      doorPanel.castShadow = true;
      doorPivot.add(doorPanel);

      const doorGlassGeo = new THREE.BoxGeometry(0.96, 1.1, 0.12);
      const doorGlass = new THREE.Mesh(doorGlassGeo, glassMat);
      doorGlass.position.set((doorW - 0.16) * 0.5, 1.65, 0);
      doorPivot.add(doorGlass);

      const handleGeo = new THREE.SphereGeometry(0.055, 8, 8);
      const handle = new THREE.Mesh(handleGeo, brassMat);
      handle.position.set(doorW - 0.3, 1.08, 0.09);
      doorPivot.add(handle);
      bGroup.add(doorPivot);
      disposables.push(doorPanelGeo, doorGlassGeo, handleGeo);

      const doorCollider = worldColliderBox(
        `${b.id}_door`,
        b.x,
        b.z,
        baseY,
        b.rotY,
        0,
        d * 0.5 - wallT * 0.5,
        doorW,
        wallT + 0.2,
        0,
        doorH,
        true,
      );
      colliders.push(
        worldColliderBox(`${b.id}_wl`, b.x, b.z, baseY, b.rotY, -w * 0.5 + wallT * 0.5, 0, wallT, d, 0, h),
        worldColliderBox(`${b.id}_wr`, b.x, b.z, baseY, b.rotY, w * 0.5 - wallT * 0.5, 0, wallT, d, 0, h),
        worldColliderBox(`${b.id}_wb`, b.x, b.z, baseY, b.rotY, 0, -d * 0.5 + wallT * 0.5, w, wallT, 0, h),
        worldColliderBox(`${b.id}_wfl`, b.x, b.z, baseY, b.rotY, -w * 0.5 + sideSegW * 0.5, d * 0.5 - wallT * 0.5, sideSegW, wallT, 0, h),
        worldColliderBox(`${b.id}_wfr`, b.x, b.z, baseY, b.rotY, w * 0.5 - sideSegW * 0.5, d * 0.5 - wallT * 0.5, sideSegW, wallT, 0, h),
        doorCollider,
      );

      const doorWorldPos = localToWorldXZ(b.x, b.z, b.rotY, 0, d * 0.5 + 0.45);
      const doorId = `${b.id}_door`;
      doors.push({
        id: doorId,
        pivot: doorPivot,
        collider: doorCollider,
        isOpen: false,
        angle: 0,
        targetAngle: 0,
      });
      interactables.push({
        id: doorId,
        kind: 'door',
        label: `Open ${b.name} Door`,
        x: doorWorldPos.x,
        y: baseY + 1.2,
        z: doorWorldPos.z,
        radius: 2.8,
        data: { buildingName: b.name },
      });

      // Warm interior lighting + pendant lamp fixture
      const intLight = new THREE.PointLight(0xffcb85, 2.4, 14, 1.5);
      intLight.position.set(0, h - 0.55, 0);
      bGroup.add(intLight);
      interiorLights.push(intLight);

      const lampShadeGeo = new THREE.ConeGeometry(0.38, 0.25, 12, 1, true);
      const lampShade = new THREE.Mesh(lampShadeGeo, brassMat);
      lampShade.position.set(0, h - 0.5, 0);
      bGroup.add(lampShade);

      // Counter desk & stocked back shelving
      const counterGeo = new THREE.BoxGeometry(w * 0.56, 1.02, 0.85);
      const counter = new THREE.Mesh(counterGeo, woodMat);
      counter.position.set(-0.6, 0.8, -d * 0.24);
      counter.castShadow = true;
      counter.receiveShadow = true;
      bGroup.add(counter);
      disposables.push(lampShadeGeo, counterGeo);

      colliders.push(
        worldColliderBox(
          `${b.id}_counter`,
          b.x,
          b.z,
          baseY,
          b.rotY,
          -0.6,
          -d * 0.24,
          w * 0.56,
          0.85,
          0,
          1.4,
        ),
      );

      const shelfGeo = new THREE.BoxGeometry(w * 0.65, 2.1, 0.45);
      const shelf = new THREE.Mesh(shelfGeo, woodMat);
      shelf.position.set(0, 1.35, -d * 0.5 + 0.65);
      bGroup.add(shelf);

      // Framed wall painting inside every enterable location
      const frameArtGeo = new THREE.BoxGeometry(1.1, 0.78, 0.06);
      const artMat = new THREE.MeshStandardMaterial({ color: 0x3b6e8c, roughness: 0.55 });
      const art = new THREE.Mesh(frameArtGeo, artMat);
      art.position.set(w * 0.5 - 0.22, 2.1, 0);
      art.rotation.y = Math.PI * 0.5;
      bGroup.add(art);
      disposables.push(shelfGeo, frameArtGeo, artMat);

      if (b.furnishKind === 'cafe') {
        const machineGeo = new THREE.BoxGeometry(0.7, 0.55, 0.45);
        const machine = new THREE.Mesh(machineGeo, brassMat);
        machine.position.set(-1.3, 1.58, -d * 0.24);
        bGroup.add(machine);

        const pastryCaseGeo = new THREE.BoxGeometry(0.9, 0.45, 0.5);
        const pastryCase = new THREE.Mesh(pastryCaseGeo, glassMat);
        pastryCase.position.set(-0.2, 1.54, -d * 0.24);
        bGroup.add(pastryCase);

        const tableTopGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.08, 16);
        const tableLegGeo = new THREE.CylinderGeometry(0.08, 0.24, 0.78, 10);
        const chairSeatGeo = new THREE.BoxGeometry(0.42, 0.06, 0.42);
        const chairBackGeo = new THREE.BoxGeometry(0.42, 0.45, 0.06);
        const mugGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.1, 8);
        const mugMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25 });

        for (const tPos of [
          { tx: 2.1, tz: 1.0 },
          { tx: 2.1, tz: -1.3 },
        ]) {
          const tableTop = new THREE.Mesh(tableTopGeo, woodMat);
          tableTop.position.set(tPos.tx, 1.05, tPos.tz);
          const tableLeg = new THREE.Mesh(tableLegGeo, trimMat);
          tableLeg.position.set(tPos.tx, 0.64, tPos.tz);
          const mug = new THREE.Mesh(mugGeo, mugMat);
          mug.position.set(tPos.tx - 0.18, 1.14, tPos.tz + 0.12);
          bGroup.add(tableTop, tableLeg, mug);

          for (const side of [-0.75, 0.75]) {
            const cSeat = new THREE.Mesh(chairSeatGeo, trimMat);
            cSeat.position.set(tPos.tx + side, 0.75, tPos.tz);
            const cBack = new THREE.Mesh(chairBackGeo, trimMat);
            cBack.position.set(tPos.tx + side + Math.sign(side) * 0.18, 0.98, tPos.tz);
            cBack.rotation.y = Math.PI * 0.5;
            bGroup.add(cSeat, cBack);
          }
        }

        // Exterior cafe canvas awning
        const awningGeo = new THREE.BoxGeometry(w * 0.84, 0.14, 1.85);
        const awningMat = new THREE.MeshStandardMaterial({
          color: 0xb04833,
          roughness: 0.82,
        });
        const awning = new THREE.Mesh(awningGeo, awningMat);
        awning.position.set(0, 2.95, d * 0.5 + 0.84);
        awning.rotation.x = 0.26;
        awning.castShadow = true;
        bGroup.add(awning);
        disposables.push(
          machineGeo,
          pastryCaseGeo,
          tableTopGeo,
          tableLegGeo,
          chairSeatGeo,
          chairBackGeo,
          mugGeo,
          mugMat,
          awningGeo,
          awningMat,
        );
      } else if (b.furnishKind === 'shop') {
        const crateGeo = new THREE.BoxGeometry(0.72, 0.62, 0.72);
        const jarGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.28, 10);
        const jarMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.35 });
        for (const cz of [0.9, 1.75]) {
          const crate = new THREE.Mesh(crateGeo, woodMat);
          crate.position.set(2.4, 0.62, cz);
          bGroup.add(crate);
        }
        for (let j = -2; j <= 2; j++) {
          const jar = new THREE.Mesh(jarGeo, jarMat);
          jar.position.set(j * 0.75, 1.9, -d * 0.5 + 0.65);
          bGroup.add(jar);
        }
        disposables.push(crateGeo, jarGeo, jarMat);
      } else if (b.furnishKind === 'lodge') {
        // Stone hearth & glowing fireplace
        const hearthGeo = new THREE.BoxGeometry(1.8, 2.2, 0.9);
        const hearth = new THREE.Mesh(hearthGeo, stoneMat);
        hearth.position.set(2.5, 1.35, -d * 0.5 + 0.65);
        const emberGeo = new THREE.BoxGeometry(0.95, 0.45, 0.35);
        const emberMat = new THREE.MeshStandardMaterial({
          color: 0xff6b2b,
          emissive: 0xff4500,
          emissiveIntensity: 2.2,
        });
        const ember = new THREE.Mesh(emberGeo, emberMat);
        ember.position.set(2.5, 0.65, -d * 0.5 + 0.98);
        bGroup.add(hearth, ember);
        disposables.push(hearthGeo, emberGeo, emberMat);
      }
    } else {
      const bodyGeo = new THREE.BoxGeometry(w, h, d);
      const body = new THREE.Mesh(bodyGeo, wallMat);
      body.position.y = h * 0.5 + 0.2;
      body.castShadow = true;
      body.receiveShadow = true;
      bGroup.add(body);
      disposables.push(bodyGeo);

      colliders.push(
        worldColliderBox(`${b.id}_body`, b.x, b.z, baseY, b.rotY, 0, 0, w, d, 0, h + 1),
      );

      // Detailed paneled front door with brass knob & portico hood
      const dFrameGeo = new THREE.BoxGeometry(1.48, 2.48, 0.16);
      const dPanelGeo = new THREE.BoxGeometry(1.24, 2.3, 0.12);
      const dKnobGeo = new THREE.SphereGeometry(0.055, 8, 8);
      const dHoodGeo = new THREE.BoxGeometry(1.8, 0.16, 0.75);
      const dFrame = new THREE.Mesh(dFrameGeo, trimMat);
      dFrame.position.set(0, 1.44, d * 0.5 + 0.03);
      const dPanel = new THREE.Mesh(dPanelGeo, woodMat);
      dPanel.position.set(0, 1.38, d * 0.5 + 0.06);
      const dKnob = new THREE.Mesh(dKnobGeo, brassMat);
      dKnob.position.set(0.45, 1.25, d * 0.5 + 0.15);
      const dHood = new THREE.Mesh(dHoodGeo, trimMat);
      dHood.position.set(0, 2.78, d * 0.5 + 0.35);
      bGroup.add(dFrame, dPanel, dKnob, dHood);
      disposables.push(dFrameGeo, dPanelGeo, dKnobGeo, dHoodGeo);
    }

    // Detailed Multi-Pane Recessed Windows with Mullions, Shutters, Sills & Flower Boxes
    for (const wx of [-w * 0.3, w * 0.3]) {
      const fFrame = new THREE.Mesh(frameOuterGeo, trimMat);
      fFrame.position.set(wx, 2.05, d * 0.5 + 0.01);
      const fWin = new THREE.Mesh(
        winPaneGeo,
        b.enterable ? glassMat : warmInteriorGlassMat,
      );
      fWin.position.set(wx, 2.05, d * 0.5 + 0.05);
      const mulV = new THREE.Mesh(mullionVGeo, trimMat);
      mulV.position.set(wx, 2.05, d * 0.5 + 0.06);
      const mulH = new THREE.Mesh(mullionHGeo, trimMat);
      mulH.position.set(wx, 2.05, d * 0.5 + 0.06);
      const sill = new THREE.Mesh(sillGeo, stoneMat);
      sill.position.set(wx, 1.25, d * 0.5 + 0.09);
      const shutL = new THREE.Mesh(shutterGeo, trimMat);
      shutL.position.set(wx - 0.88, 2.05, d * 0.5 + 0.04);
      const shutR = new THREE.Mesh(shutterGeo, trimMat);
      shutR.position.set(wx + 0.88, 2.05, d * 0.5 + 0.04);

      // Planter box under front window
      const fBox = new THREE.Mesh(flowerBoxGeo, woodMat);
      fBox.position.set(wx, 1.12, d * 0.5 + 0.14);
      bGroup.add(fFrame, fWin, mulV, mulH, sill, shutL, shutR, fBox);

      const bloomMat = new THREE.MeshStandardMaterial({
        color: wx < 0 ? 0xe11d48 : 0xf59e0b,
        roughness: 0.65,
      });
      disposables.push(bloomMat);
      for (const bx of [-0.36, 0, 0.36]) {
        const bloom = new THREE.Mesh(flowerBloomGeo, bloomMat);
        bloom.position.set(wx + bx, 1.28, d * 0.5 + 0.16);
        bGroup.add(bloom);
      }
    }

    for (const sx of [-w * 0.5, w * 0.5]) {
      const sFrame = new THREE.Mesh(frameOuterGeo, trimMat);
      sFrame.rotation.y = Math.PI * 0.5;
      sFrame.position.set(sx, 2.05, 0);
      const sWin = new THREE.Mesh(
        winPaneGeo,
        b.enterable ? glassMat : warmInteriorGlassMat,
      );
      sWin.rotation.y = Math.PI * 0.5;
      sWin.position.set(sx + Math.sign(sx) * 0.04, 2.05, 0);
      const sMulV = new THREE.Mesh(mullionVGeo, trimMat);
      sMulV.rotation.y = Math.PI * 0.5;
      sMulV.position.set(sx + Math.sign(sx) * 0.05, 2.05, 0);
      bGroup.add(sFrame, sWin, sMulV);
    }

    // Pitched Gabled Roof + Timber Fascia + Ridge Cap + Stone Chimney
    const roofShape = new THREE.Shape();
    const rw = w * 0.5 + 0.62;
    const rh = 2.25;
    roofShape.moveTo(-rw, 0);
    roofShape.lineTo(rw, 0);
    roofShape.lineTo(0, rh);
    roofShape.closePath();

    const roofGeo = new THREE.ExtrudeGeometry(roofShape, {
      depth: d + 1.05,
      bevelEnabled: false,
    });
    roofGeo.translate(0, 0, -(d + 1.05) * 0.5);
    const roofMesh = new THREE.Mesh(roofGeo, roofMat);
    roofMesh.position.y = h + 0.2;
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    bGroup.add(roofMesh);

    const ridgeGeo = new THREE.BoxGeometry(0.24, 0.22, d + 1.12);
    const ridge = new THREE.Mesh(ridgeGeo, stoneMat);
    ridge.position.set(0, h + 0.2 + rh, 0);
    bGroup.add(ridge);

    const chimGeo = new THREE.BoxGeometry(0.92, 2.35, 0.92);
    const chimCapGeo = new THREE.BoxGeometry(1.08, 0.16, 1.08);
    const chim = new THREE.Mesh(chimGeo, stoneMat);
    chim.position.set(-w * 0.25, h + 1.55, -d * 0.2);
    chim.castShadow = true;
    const chimCap = new THREE.Mesh(chimCapGeo, stoneMat);
    chimCap.position.set(-w * 0.25, h + 2.75, -d * 0.2);
    bGroup.add(chim, chimCap);
    disposables.push(roofGeo, ridgeGeo, chimGeo, chimCapGeo);

    group.add(bGroup);
  }

  // =========================================================================
  // WORKING TRAFFIC LIGHTS AT HARBOR INTERSECTIONS
  // =========================================================================
  const poleMastGeo = new THREE.CylinderGeometry(0.11, 0.15, 5.2, 10);
  const armGeo = new THREE.CylinderGeometry(0.07, 0.09, 3.8, 8);
  armGeo.rotateZ(Math.PI * 0.5);
  const housingGeo = new THREE.BoxGeometry(0.36, 1.05, 0.34);
  const lensGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.1, 12);
  lensGeo.rotateX(Math.PI * 0.5);
  disposables.push(poleMastGeo, armGeo, housingGeo, lensGeo);

  const trafficLocations: Array<{ x: number; z: number; rotY: number; axis: 'ns' | 'ew' }> = [
    { x: 17.5, z: 6.2, rotY: Math.PI * 0.5, axis: 'ew' },
    { x: 11.2, z: -0.4, rotY: -Math.PI * 0.5, axis: 'ns' },
    { x: -16.8, z: 7.4, rotY: 0, axis: 'ew' },
  ];

  for (const tl of trafficLocations) {
    const ty = groundHeightAt(tl.x, tl.z);
    const tlGroup = new THREE.Group();
    tlGroup.position.set(tl.x, ty, tl.z);
    tlGroup.rotation.y = tl.rotY;

    const mast = new THREE.Mesh(poleMastGeo, steelMat);
    mast.position.y = 2.6;
    mast.castShadow = true;

    const arm = new THREE.Mesh(armGeo, steelMat);
    arm.position.set(1.8, 4.9, 0);
    arm.castShadow = true;

    const housing = new THREE.Mesh(housingGeo, steelMat);
    housing.position.set(3.2, 4.45, 0);

    const redMat = new THREE.MeshStandardMaterial({
      color: 0x450a0a,
      emissive: 0xef4444,
      emissiveIntensity: 0.1,
    });
    const amberMat = new THREE.MeshStandardMaterial({
      color: 0x451a03,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.1,
    });
    const greenMat = new THREE.MeshStandardMaterial({
      color: 0x052e16,
      emissive: 0x22c55e,
      emissiveIntensity: 0.1,
    });
    disposables.push(redMat, amberMat, greenMat);

    const redL = new THREE.Mesh(lensGeo, redMat);
    redL.position.set(3.2, 4.78, 0.16);
    const ambL = new THREE.Mesh(lensGeo, amberMat);
    ambL.position.set(3.2, 4.45, 0.16);
    const grnL = new THREE.Mesh(lensGeo, greenMat);
    grnL.position.set(3.2, 4.12, 0.16);

    tlGroup.add(mast, arm, housing, redL, ambL, grnL);
    group.add(tlGroup);
    signalHeads.push({ redMat, amberMat, greenMat, axis: tl.axis });
  }

  // =========================================================================
  // CLIFFSIDE LIGHTHOUSE at (-44, 34) - Iconic vertical landmark + beacon
  // =========================================================================
  const lhX = -44;
  const lhZ = 34;
  const lhBaseY = groundHeightAt(lhX, lhZ);
  const lhGroup = new THREE.Group();
  lhGroup.position.set(lhX, lhBaseY, lhZ);

  const lhWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xf0ece2,
    map: textures.stuccoMap,
    bumpMap: textures.stuccoBump,
    bumpScale: 0.09,
    roughness: 0.74,
  });
  const lhRedMat = new THREE.MeshStandardMaterial({
    color: 0xa83426,
    map: textures.stuccoMap,
    roughness: 0.7,
  });
  const lhIronMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.32,
    metalness: 0.85,
  });
  disposables.push(lhWhiteMat, lhRedMat, lhIronMat);

  const lhPlinthGeo = new THREE.CylinderGeometry(3.5, 4.1, 2.4, 20);
  const lhPlinth = new THREE.Mesh(lhPlinthGeo, stoneMat);
  lhPlinth.position.y = 1.0;
  lhPlinth.castShadow = true;
  lhPlinth.receiveShadow = true;
  lhGroup.add(lhPlinth);

  for (let s = 0; s < 5; s++) {
    const rBot = 3.1 - s * 0.26;
    const rTop = 3.1 - (s + 1) * 0.26;
    const ringGeo = new THREE.CylinderGeometry(rTop, rBot, 3.2, 24);
    const ring = new THREE.Mesh(ringGeo, s % 2 === 0 ? lhWhiteMat : lhRedMat);
    ring.position.y = 3.6 + s * 3.2;
    ring.castShadow = true;
    ring.receiveShadow = true;
    lhGroup.add(ring);
    disposables.push(ringGeo);
  }

  const galleryGeo = new THREE.CylinderGeometry(2.55, 2.1, 0.55, 20);
  const gallery = new THREE.Mesh(galleryGeo, lhIronMat);
  gallery.position.y = 18.2;
  lhGroup.add(gallery);

  const lanternGeo = new THREE.CylinderGeometry(1.5, 1.5, 2.5, 16);
  const lantern = new THREE.Mesh(lanternGeo, glassMat);
  lantern.position.y = 19.6;
  lhGroup.add(lantern);

  const coreGeo = new THREE.SphereGeometry(0.7, 12, 12);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff0b3 });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  coreMesh.position.y = 19.6;
  lhGroup.add(coreMesh);

  const capGeo = new THREE.ConeGeometry(1.85, 2.0, 16);
  const cap = new THREE.Mesh(capGeo, lhRedMat);
  cap.position.y = 21.8;
  lhGroup.add(cap);

  const lighthouseBeam = new THREE.Group();
  lighthouseBeam.position.y = 19.6;
  const beamGeo = new THREE.ConeGeometry(4.5, 28, 16, 1, true);
  beamGeo.translate(0, -14, 0);
  beamGeo.rotateX(Math.PI * 0.5);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff3c4,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const beam1 = new THREE.Mesh(beamGeo, beamMat);
  const beam2 = new THREE.Mesh(beamGeo, beamMat);
  beam2.rotation.y = Math.PI;
  lighthouseBeam.add(beam1, beam2);
  lhGroup.add(lighthouseBeam);
  group.add(lhGroup);

  disposables.push(
    lhPlinthGeo,
    galleryGeo,
    lanternGeo,
    coreGeo,
    coreMat,
    capGeo,
    beamGeo,
    beamMat,
  );

  colliders.push({
    id: 'lighthouse_tower',
    minX: lhX - 3.6,
    maxX: lhX + 3.6,
    minZ: lhZ - 3.6,
    maxZ: lhZ + 3.6,
    minY: lhBaseY,
    maxY: lhBaseY + 22,
  });

  // =========================================================================
  // ANCIENT CLIFF SHRINE at (-56, 48) - Secret Discovery Landmark
  // =========================================================================
  const shX = -56;
  const shZ = 48;
  const shY = groundHeightAt(shX, shZ);
  const shrineGroup = new THREE.Group();
  shrineGroup.position.set(shX, shY, shZ);
  shrineGroup.rotation.y = 0.65;

  const daisGeo = new THREE.CylinderGeometry(3.8, 4.3, 0.55, 8);
  const dais = new THREE.Mesh(daisGeo, stoneMat);
  dais.position.y = 0.2;
  dais.receiveShadow = true;
  shrineGroup.add(dais);

  const pillarGeo = new THREE.BoxGeometry(0.75, 3.8, 0.75);
  const lintelTopGeo = new THREE.BoxGeometry(4.2, 0.65, 1.0);
  const pLeft = new THREE.Mesh(pillarGeo, stoneMat);
  pLeft.position.set(-1.5, 2.2, 0);
  pLeft.castShadow = true;
  const pRight = new THREE.Mesh(pillarGeo, stoneMat);
  pRight.position.set(1.5, 2.2, 0);
  pRight.castShadow = true;
  const pTop = new THREE.Mesh(lintelTopGeo, stoneMat);
  pTop.position.set(0, 4.35, 0);
  pTop.castShadow = true;

  const orbGeo = new THREE.OctahedronGeometry(0.55, 0);
  const orbMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 1.4,
    roughness: 0.2,
    metalness: 0.4,
  });
  const orb = new THREE.Mesh(orbGeo, orbMat);
  orb.position.set(0, 1.75, 0);
  shrineGroup.add(pLeft, pRight, pTop, orb);

  const shrineGlow = new THREE.PointLight(0x38bdf8, 1.6, 14);
  shrineGlow.position.set(0, 1.8, 0);
  shrineGroup.add(shrineGlow);
  group.add(shrineGroup);

  disposables.push(daisGeo, pillarGeo, lintelTopGeo, orbGeo, orbMat);
  interactables.push({
    id: 'ancient_shrine',
    kind: 'shrine',
    label: 'Inspect Ancient Cliff Shrine',
    x: shX,
    y: shY + 1.5,
    z: shZ,
    radius: 4.0,
  });

  // =========================================================================
  // HARBOR STONE FOUNTAIN CENTERPIECE at (0, -6.5)
  // =========================================================================
  const fX = 0;
  const fZ = -6.5;
  const fY = groundHeightAt(fX, fZ);
  const fountainGroup = new THREE.Group();
  fountainGroup.position.set(fX, fY, fZ);
  const basinGeo = new THREE.CylinderGeometry(2.6, 2.9, 0.75, 20);
  const basinWaterGeo = new THREE.CircleGeometry(2.25, 20);
  basinWaterGeo.rotateX(-Math.PI / 2);
  const basinWaterMat = new THREE.MeshPhysicalMaterial({
    color: 0x167894,
    roughness: 0.08,
    metalness: 0.15,
    clearcoat: 1.0,
  });
  const spoutGeo = new THREE.CylinderGeometry(0.32, 0.52, 2.2, 14);
  const basin = new THREE.Mesh(basinGeo, stoneMat);
  basin.position.y = 0.35;
  basin.castShadow = true;
  basin.receiveShadow = true;
  const bWater = new THREE.Mesh(basinWaterGeo, basinWaterMat);
  bWater.position.y = 0.73;
  const spout = new THREE.Mesh(spoutGeo, stoneMat);
  spout.position.y = 1.25;
  spout.castShadow = true;
  fountainGroup.add(basin, bWater, spout);
  group.add(fountainGroup);
  disposables.push(basinGeo, basinWaterGeo, basinWaterMat, spoutGeo);

  colliders.push({
    id: 'plaza_fountain',
    minX: fX - 2.6,
    maxX: fX + 2.6,
    minZ: fZ - 2.6,
    maxZ: fZ + 2.6,
    minY: fY,
    maxY: fY + 2.5,
  });

  const toggleDoor = (doorId: string): boolean => {
    const door = doors.find((d) => d.id === doorId);
    if (!door) return false;
    door.isOpen = !door.isOpen;
    door.targetAngle = door.isOpen ? -Math.PI * 0.52 : 0;
    door.collider.doorOpen = door.isOpen;
    const inter = interactables.find((i) => i.id === doorId);
    if (inter) {
      const bName = (inter.data?.buildingName as string) ?? 'Door';
      inter.label = door.isOpen ? `Close ${bName} Door` : `Open ${bName} Door`;
    }
    return door.isOpen;
  };

  const update = (dt: number, elapsed: number, isNight: boolean, snowAccum: number) => {
    roofUniforms.uSnowAccum.value = snowAccum;

    for (const door of doors) {
      door.angle += (door.targetAngle - door.angle) * (1 - Math.exp(-10 * dt));
      door.pivot.rotation.y = door.angle;
    }

    // Update working traffic lights
    const signalState = computeTrafficLightCycle(elapsed);
    for (const sh of signalHeads) {
      const aspect = sh.axis === 'ns' ? signalState.nsAspect : signalState.ewAspect;
      sh.redMat.emissiveIntensity = aspect === 'red' ? 3.2 : 0.08;
      sh.amberMat.emissiveIntensity = aspect === 'amber' ? 3.2 : 0.08;
      sh.greenMat.emissiveIntensity = aspect === 'green' ? 3.2 : 0.08;
    }

    lighthouseBeam.visible = isNight;
    lighthouseBeam.rotation.y = elapsed * 0.65;
    beamMat.opacity = isNight ? 0.24 : 0.0;

    orb.rotation.y = elapsed * 1.1;
    orb.position.y = 1.75 + Math.sin(elapsed * 2.2) * 0.14;
    shrineGlow.intensity = isNight ? 2.8 : 1.2;

    warmInteriorGlassMat.emissiveIntensity = isNight ? 1.15 : 0.1;

    for (const l of interiorLights) {
      l.intensity = isNight ? 3.4 : 1.8;
    }
  };

  return {
    group,
    colliders,
    interactables,
    doors,
    interiorLights,
    lighthouseBeam,
    shrineGlow,
    toggleDoor,
    update,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
