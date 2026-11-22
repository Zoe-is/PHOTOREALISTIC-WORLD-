import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { computeAtmosphereProfile, createRng } from './math';
import type { WeatherType } from './types';

const _sunVec = new THREE.Vector3();
const _moonVec = new THREE.Vector3();
const _leafDummy = new THREE.Object3D();

export interface AtmosphereRig {
  sky: Sky;
  sunLight: THREE.DirectionalLight;
  moonLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  fog: THREE.FogExp2;
  starPoints: THREE.Points;
  moonDisc: THREE.Mesh;
  cloudGroup: THREE.Group;
  update: (
    dt: number,
    elapsed: number,
    timeOfDay: number,
    weather: WeatherType,
    focusX: number,
    focusZ: number,
    isIndoors: boolean,
    onThunder?: () => void,
  ) => { isNight: boolean; lightningFlash: number; targetExposure: number; targetEnvIntensity: number };
  dispose: () => void;
}

function createSoftParticleTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(240,248,255,0.75)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export function createAtmosphereRig(
  scene: THREE.Scene,
  isSoftwareGl: boolean,
): AtmosphereRig {
  // Atmospheric scattering Sky
  const sky = new Sky();
  sky.scale.setScalar(900);
  scene.add(sky);

  const skyUniforms = sky.material.uniforms;
  skyUniforms['turbidity'].value = 3.2;
  skyUniforms['rayleigh'].value = 1.35;
  skyUniforms['mieCoefficient'].value = 0.003;
  skyUniforms['mieDirectionalG'].value = 0.84;

  // Horizon-matched FogExp2
  const fog = new THREE.FogExp2(0x9ec5e2, 0.0022);
  scene.fog = fog;
  scene.background = new THREE.Color(0x4c8ec9);

  // Warm key directional sun light (the single shadow caster)
  const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.8);
  sunLight.castShadow = !isSoftwareGl;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 2;
  sunLight.shadow.camera.far = 195;
  const d = 56;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.bias = -0.00045;
  sunLight.shadow.normalBias = 0.022;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // Cool moonlight fill (no shadow caster to keep shadow caster count = 1)
  const moonLight = new THREE.DirectionalLight(0x8baeff, 0.25);
  moonLight.castShadow = false;
  scene.add(moonLight);

  // Sky / Ground hemisphere fill (calibrated so shadowed faces retain depth)
  const hemiLight = new THREE.HemisphereLight(0x8bc3ee, 0x35422e, 0.52);
  scene.add(hemiLight);

  // Starfield dome for night sky
  const starCount = 520;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  const rng = createRng(991);
  for (let i = 0; i < starCount; i++) {
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(0.14 + rng() * 0.86);
    const r = 385;
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi);
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xf8fafc,
    size: 1.7,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const starPoints = new THREE.Points(starGeo, starMat);
  scene.add(starPoints);

  // Moon disc
  const moonGeo = new THREE.SphereGeometry(8.5, 16, 16);
  const moonMat = new THREE.MeshBasicMaterial({
    color: 0xe6eeff,
    fog: false,
    transparent: true,
    opacity: 0,
  });
  const moonDisc = new THREE.Mesh(moonGeo, moonMat);
  scene.add(moonDisc);

  // Multi-layered soft cloud banks
  const cloudGroup = new THREE.Group();
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.96,
    metalness: 0,
    transparent: true,
    opacity: 0.84,
    depthWrite: false,
  });
  const puffGeo = new THREE.SphereGeometry(1, 12, 9);
  for (let i = 0; i < 22; i++) {
    const cluster = new THREE.Group();
    const angle = (i / 22) * Math.PI * 2 + rng() * 0.25;
    const dist = 55 + rng() * 145;
    cluster.position.set(
      Math.cos(angle) * dist,
      86 + rng() * 26,
      Math.sin(angle) * dist,
    );
    const puffs = 4 + Math.floor(rng() * 4);
    for (let p = 0; p < puffs; p++) {
      const puff = new THREE.Mesh(puffGeo, cloudMat);
      puff.position.set((p - 2.0) * 6.8, (rng() - 0.5) * 2.2, (rng() - 0.5) * 5.2);
      puff.scale.set(8.5 + rng() * 7.5, 2.4 + rng() * 2.0, 6.2 + rng() * 4.2);
      cluster.add(puff);
    }
    cluster.userData.speed = 0.55 + rng() * 0.85;
    cloudGroup.add(cluster);
  }
  scene.add(cloudGroup);

  // 1. Real Streaking Raindrops (LineSegments, never square dots!)
  const rainCount = 950;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(rainCount * 6); // 2 vertices per streak
  const rainSeeds = new Float32Array(rainCount);
  const rainOrigin = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i++) {
    const rx = (rng() - 0.5) * 64;
    const ry = rng() * 28;
    const rz = (rng() - 0.5) * 64;
    rainOrigin[i * 3] = rx;
    rainOrigin[i * 3 + 1] = ry;
    rainOrigin[i * 3 + 2] = rz;
    rainSeeds[i] = rng();
    rainPos[i * 6] = rx;
    rainPos[i * 6 + 1] = ry;
    rainPos[i * 6 + 2] = rz;
    rainPos[i * 6 + 3] = rx - 0.12;
    rainPos[i * 6 + 4] = ry + 0.72;
    rainPos[i * 6 + 5] = rz;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.LineBasicMaterial({
    color: 0xdbeafe,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const rainLines = new THREE.LineSegments(rainGeo, rainMat);
  rainLines.frustumCulled = false;
  rainLines.visible = false;
  scene.add(rainLines);

  // 2. Soft Circular Snowflakes (Points with radial alpha texture)
  const snowTex = createSoftParticleTexture();
  const snowCount = 800;
  const snowGeo = new THREE.BufferGeometry();
  const snowPos = new Float32Array(snowCount * 3);
  const snowSeeds = new Float32Array(snowCount);
  for (let i = 0; i < snowCount; i++) {
    snowPos[i * 3] = (rng() - 0.5) * 66;
    snowPos[i * 3 + 1] = rng() * 28;
    snowPos[i * 3 + 2] = (rng() - 0.5) * 66;
    snowSeeds[i] = rng();
  }
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snowMat = new THREE.PointsMaterial({
    color: 0xf8fafc,
    map: snowTex,
    size: 0.34,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    alphaTest: 0.05,
  });
  const snowPoints = new THREE.Points(snowGeo, snowMat);
  snowPoints.frustumCulled = false;
  snowPoints.visible = false;
  scene.add(snowPoints);

  // 3. Wind-blown Swirling Leaves across streets & parks
  const leafCount = 64;
  const leafGeo = new THREE.PlaneGeometry(0.16, 0.09);
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.75,
    side: THREE.DoubleSide,
  });
  const windLeaves = new THREE.InstancedMesh(leafGeo, leafMat, leafCount);
  windLeaves.frustumCulled = false;
  const leafData: Array<{ x: number; y: number; z: number; phase: number; speed: number }> = [];
  const leafPalette = [new THREE.Color(0x6c8a3c), new THREE.Color(0xb8893a), new THREE.Color(0x9e532b)];
  for (let i = 0; i < leafCount; i++) {
    leafData.push({
      x: (rng() - 0.5) * 44,
      y: 0.4 + rng() * 5.5,
      z: (rng() - 0.5) * 44,
      phase: rng() * Math.PI * 2,
      speed: 2.2 + rng() * 2.5,
    });
    windLeaves.setColorAt(i, leafPalette[i % leafPalette.length]);
  }
  if (windLeaves.instanceColor) windLeaves.instanceColor.needsUpdate = true;
  scene.add(windLeaves);

  let lightningFlash = 0;
  let nextLightningTimer = 4.5;

  const update = (
    dt: number,
    elapsed: number,
    timeOfDay: number,
    weather: WeatherType,
    focusX: number,
    focusZ: number,
    isIndoors: boolean,
    onThunder?: () => void,
  ) => {
    const profile = computeAtmosphereProfile(timeOfDay, weather);

    const phi = THREE.MathUtils.degToRad(90 - profile.elevationDeg);
    const theta = THREE.MathUtils.degToRad(profile.azimuthDeg);
    _sunVec.setFromSphericalCoords(1, phi, theta);
    skyUniforms['sunPosition'].value.copy(_sunVec);

    skyUniforms['turbidity'].value =
      weather === 'thunderstorm' || weather === 'rain'
        ? 12
        : weather === 'foggy' || weather === 'cloudy'
          ? 8
          : 2.6;
    skyUniforms['rayleigh'].value = profile.isNight ? 0.35 : 1.25;
    skyUniforms['mieCoefficient'].value = weather === 'clear' ? 0.0025 : 0.007;

    sunLight.position.set(
      focusX + _sunVec.x * 88,
      Math.max(8, _sunVec.y * 88),
      focusZ + _sunVec.z * 88,
    );
    sunLight.target.position.set(focusX, 3, focusZ);
    sunLight.target.updateMatrixWorld();

    if (weather === 'thunderstorm') {
      nextLightningTimer -= dt;
      if (nextLightningTimer <= 0) {
        lightningFlash = 1.0;
        nextLightningTimer = 4.5 + Math.random() * 7.5;
        onThunder?.();
      }
    }
    lightningFlash = Math.max(0, lightningFlash - dt * 4.8);

    sunLight.color.setHex(profile.sunColorHex);
    sunLight.intensity = profile.sunIntensity + lightningFlash * 4.5;

    _moonVec.set(-_sunVec.x, Math.max(0.25, -_sunVec.y), -_sunVec.z).normalize();
    moonLight.position.copy(_moonVec).multiplyScalar(80);
    moonLight.intensity = profile.moonIntensity;

    moonDisc.position.copy(_moonVec).multiplyScalar(335);
    moonMat.opacity = profile.isNight && weather === 'clear' ? 0.92 : profile.isNight ? 0.3 : 0;
    starMat.opacity = profile.isNight && weather === 'clear' ? 0.85 : 0;

    hemiLight.color.setHex(profile.skyColorHex);
    hemiLight.groundColor.setHex(profile.groundColorHex);
    hemiLight.intensity = profile.ambientIntensity + lightningFlash * 1.2;

    fog.color.setHex(profile.fogColorHex);
    fog.density = profile.fogDensity;
    if (scene.background instanceof THREE.Color) {
      scene.background.setHex(profile.skyColorHex);
    }

    sky.visible = !profile.isNight || profile.elevationDeg > -10;

    const cloudDarkness =
      weather === 'thunderstorm'
        ? 0.52
        : weather === 'rain'
          ? 0.72
          : weather === 'cloudy'
            ? 0.94
            : 1.0;
    const nightDim = profile.isNight ? 0.25 : 1.0;
    cloudMat.color.setRGB(
      cloudDarkness * nightDim,
      cloudDarkness * nightDim,
      cloudDarkness * nightDim * 1.02,
    );
    cloudMat.opacity =
      weather === 'clear' ? 0.42 : weather === 'foggy' ? 0.3 : 0.74;

    for (const child of cloudGroup.children) {
      child.position.x += (child.userData.speed as number) * dt;
      if (child.position.x > 210) child.position.x = -210;
    }

    // Update streaking rain lines (outside only; indoors hides immediate nearby streaks)
    const isRain = weather === 'rain' || weather === 'thunderstorm';
    const isSnow = weather === 'snow';
    if (isRain) {
      rainLines.visible = true;
      rainMat.opacity = weather === 'thunderstorm' ? 0.48 : 0.36;
      const rArr = (rainGeo.attributes.position as THREE.BufferAttribute).array as Float32Array;
      const fallSpeed = weather === 'thunderstorm' ? 28 : 22;
      const windSlant = weather === 'thunderstorm' ? -5.8 : -3.2;
      const streakLen = weather === 'thunderstorm' ? 0.95 : 0.72;

      for (let i = 0; i < rainCount; i++) {
        let rx = rainOrigin[i * 3] + windSlant * dt;
        let ry = rainOrigin[i * 3 + 1] - fallSpeed * (0.85 + rainSeeds[i] * 0.3) * dt;
        let rz = rainOrigin[i * 3 + 2];

        if (ry < 0.2) {
          ry = 24 + rainSeeds[i] * 6;
          rx = focusX + (rainSeeds[i] - 0.5) * 64;
          rz = focusZ + (((i * 73) % 100) / 100 - 0.5) * 64;
        }
        if (rx < focusX - 32) rx += 64;
        if (rx > focusX + 32) rx -= 64;
        if (rz < focusZ - 32) rz += 64;
        if (rz > focusZ + 32) rz -= 64;

        rainOrigin[i * 3] = rx;
        rainOrigin[i * 3 + 1] = ry;
        rainOrigin[i * 3 + 2] = rz;

        const base = i * 6;
        rArr[base] = rx;
        rArr[base + 1] = ry;
        rArr[base + 2] = rz;
        rArr[base + 3] = rx - windSlant * 0.032;
        rArr[base + 4] = ry + streakLen;
        rArr[base + 5] = rz;
      }
      rainGeo.attributes.position.needsUpdate = true;
    } else {
      rainLines.visible = false;
    }

    if (isSnow) {
      snowPoints.visible = true;
      const sArr = (snowGeo.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < snowCount; i++) {
        const ix = i * 3;
        sArr[ix] += Math.sin(elapsed * 0.9 + i) * 1.1 * dt;
        sArr[ix + 1] -= (2.4 + snowSeeds[i] * 1.4) * dt;
        sArr[ix + 2] += Math.cos(elapsed * 1.1 + i) * 0.8 * dt;
        if (sArr[ix + 1] < 0.2) {
          sArr[ix + 1] = 25 + snowSeeds[i] * 5;
          sArr[ix] = focusX + (snowSeeds[i] - 0.5) * 64;
          sArr[ix + 2] = focusZ + (((i * 61) % 100) / 100 - 0.5) * 64;
        }
        if (sArr[ix] < focusX - 32) sArr[ix] += 64;
        if (sArr[ix] > focusX + 32) sArr[ix] -= 64;
        if (sArr[ix + 2] < focusZ - 32) sArr[ix + 2] += 64;
        if (sArr[ix + 2] > focusZ + 32) sArr[ix + 2] -= 64;
      }
      snowGeo.attributes.position.needsUpdate = true;
    } else {
      snowPoints.visible = false;
    }

    // Wind-blown leaves (active visibly in breezy/rainy/stormy weather)
    const windSpeedMult =
      weather === 'thunderstorm' ? 2.8 : weather === 'rain' ? 1.8 : weather === 'cloudy' ? 1.1 : 0.65;
    for (let i = 0; i < leafCount; i++) {
      const ld = leafData[i];
      ld.x += ld.speed * windSpeedMult * dt;
      ld.z += Math.sin(elapsed * 1.8 + ld.phase) * 1.2 * dt;
      if (ld.x > focusX + 24) ld.x -= 48;
      if (ld.x < focusX - 24) ld.x += 48;
      if (ld.z > focusZ + 24) ld.z -= 48;
      if (ld.z < focusZ - 24) ld.z += 48;

      const py = 4.2 + Math.abs(Math.sin(elapsed * 1.4 + ld.phase)) * 2.4;
      _leafDummy.position.set(ld.x, py, ld.z);
      _leafDummy.rotation.set(
        elapsed * 3.1 + ld.phase,
        elapsed * 2.2 + ld.phase,
        Math.sin(elapsed * 4 + ld.phase),
      );
      _leafDummy.updateMatrix();
      windLeaves.setMatrixAt(i, _leafDummy.matrix);
    }
    windLeaves.instanceMatrix.needsUpdate = true;

    // Natural eye exposure adaptation & IBL environment calibration
    const targetExposure = isIndoors
      ? 1.18
      : profile.isNight
        ? 1.05
        : weather === 'thunderstorm' || weather === 'rain'
          ? 0.94
          : 0.96;
    const targetEnvIntensity = profile.isNight
      ? 0.22
      : weather === 'thunderstorm'
        ? 0.34
        : weather === 'rain' || weather === 'snow' || weather === 'foggy'
          ? 0.38
          : 0.48;

    return {
      isNight: profile.isNight,
      lightningFlash,
      targetExposure,
      targetEnvIntensity,
    };
  };

  return {
    sky,
    sunLight,
    moonLight,
    hemiLight,
    fog,
    starPoints,
    moonDisc,
    cloudGroup,
    update,
    dispose: () => {
      starGeo.dispose();
      starMat.dispose();
      moonGeo.dispose();
      moonMat.dispose();
      puffGeo.dispose();
      cloudMat.dispose();
      rainGeo.dispose();
      rainMat.dispose();
      snowTex.dispose();
      snowGeo.dispose();
      snowMat.dispose();
      leafGeo.dispose();
      leafMat.dispose();
    },
  };
}
