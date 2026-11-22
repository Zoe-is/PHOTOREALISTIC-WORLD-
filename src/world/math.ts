import type { WeatherType } from './types';

export const WATER_LEVEL = 0.0;
export const WORLD_PLAYABLE_RADIUS = 135;
export const TERRAIN_EXTENT = 320;
export const BRIDGE_CENTER_X = 36;
export const BRIDGE_CENTER_Z = 2;
export const BRIDGE_HALF_LENGTH = 9.5;
export const BRIDGE_HALF_WIDTH = 4.2;
export const BRIDGE_DECK_Y = 4.05;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Deterministic PRNG (Mulberry32) */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 2D hash in [0, 1) */
function hash2(ix: number, iz: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 2D value noise in [-1, 1] */
export function noise2D(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);

  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);

  return (lerp(lerp(a, b, ux), lerp(c, d, ux), uz) - 0.5) * 2;
}

/** Multi-octave fBM in roughly [-1, 1] */
export function fbm2D(x: number, z: number, octaves = 4): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    value += amp * noise2D(x * freq, z * freq);
    norm += amp;
    freq *= 2.03;
    amp *= 0.5;
  }
  return value / norm;
}

/** Closed road loop waypoints in (x, z) */
export const ROAD_LOOP_POINTS: ReadonlyArray<{ x: number; z: number }> = [
  { x: 0, z: 4 }, // Harbor plaza south edge
  { x: 18, z: 3 }, // East plaza exit
  { x: 36, z: 2 }, // Stone river bridge
  { x: 56, z: -4 }, // Eastern meadow bend
  { x: 60, z: -26 }, // Lakeside lodge road
  { x: 34, z: -44 }, // Foothill overlook
  { x: 2, z: -42 }, // Northern mountain pass
  { x: -26, z: -34 }, // Whispering pines turn
  { x: -30, z: -10 }, // West town gate
  { x: -16, z: 4 }, // West plaza entry
];

/** Spur road from West Town Gate (-30, -10) to Lighthouse Point (-42, 30) */
export const LIGHTHOUSE_ROAD_POINTS: ReadonlyArray<{ x: number; z: number }> = [
  { x: -16, z: 4 },
  { x: -28, z: 14 },
  { x: -38, z: 26 },
];

export interface RoadDistanceResult {
  distance: number;
  segmentIndex: number;
  isBridge: boolean;
}

function distToSegmentSq(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const c1 = vx * wx + vz * wz;
  if (c1 <= 0) return wx * wx + wz * wz;
  const c2 = vx * vx + vz * vz;
  if (c2 <= c1) {
    const dx = px - bx;
    const dz = pz - bz;
    return dx * dx + dz * dz;
  }
  const b = c1 / c2;
  const projX = ax + b * vx;
  const projZ = az + b * vz;
  const dx = px - projX;
  const dz = pz - projZ;
  return dx * dx + dz * dz;
}

/** Shortest distance from (x, z) to any paved road centerline */
export function distanceToRoad(x: number, z: number): RoadDistanceResult {
  let minSq = Infinity;
  let bestIdx = 0;

  for (let i = 0; i < ROAD_LOOP_POINTS.length; i++) {
    const a = ROAD_LOOP_POINTS[i];
    const b = ROAD_LOOP_POINTS[(i + 1) % ROAD_LOOP_POINTS.length];
    const dSq = distToSegmentSq(x, z, a.x, a.z, b.x, b.z);
    if (dSq < minSq) {
      minSq = dSq;
      bestIdx = i;
    }
  }

  for (let i = 0; i < LIGHTHOUSE_ROAD_POINTS.length - 1; i++) {
    const a = LIGHTHOUSE_ROAD_POINTS[i];
    const b = LIGHTHOUSE_ROAD_POINTS[i + 1];
    const dSq = distToSegmentSq(x, z, a.x, a.z, b.x, b.z);
    if (dSq < minSq) {
      minSq = dSq;
      bestIdx = 100 + i;
    }
  }

  const isBridge =
    Math.abs(x - BRIDGE_CENTER_X) <= BRIDGE_HALF_LENGTH &&
    Math.abs(z - BRIDGE_CENTER_Z) <= BRIDGE_HALF_WIDTH;

  return {
    distance: Math.sqrt(minSq),
    segmentIndex: bestIdx,
    isBridge,
  };
}

/** Winding river centerline X as a function of Z for z in [-65, 50] */
export function riverCenterX(z: number): number {
  return 36 + Math.sin(z * 0.065) * 4.5 + Math.cos(z * 0.03) * 2.0;
}

/** Distance from (x, z) to the freshwater river channel */
export function distanceToRiver(x: number, z: number): number {
  if (z < -62) {
    const dx = x - riverCenterX(-62);
    const dz = z + 62;
    return Math.sqrt(dx * dx + dz * dz);
  }
  return Math.abs(x - riverCenterX(z));
}

/** Natural ground terrain elevation (without bridge deck) */
export function rawTerrainHeightAt(x: number, z: number): number {
  // Base gentle coastal valley rising northward (-Z)
  const baseRoll = fbm2D(x * 0.014 + 3.1, z * 0.014 - 1.7, 4) * 5.2;
  const fineDetail = fbm2D(x * 0.055 - 4.2, z * 0.055 + 2.8, 3) * 0.75;

  // North alpine mountain range (z < -48)
  const northRise = smoothstep(-42, -135, z);
  const ridgeNoise = Math.abs(fbm2D(x * 0.018 + 11.4, z * 0.018 - 7.3, 4));
  const alpinePeak =
    northRise * (24 + ridgeNoise * 32) +
    smoothstep(-85, -165, z) * 18;

  // Outer perimeter natural mountain amphitheater (east/west distant ridges)
  const radialDist = Math.sqrt(x * x + z * z);
  const rimFactor = smoothstep(105, 195, radialDist) * smoothstep(35, -30, z);
  const rimMountain = rimFactor * (18 + Math.abs(fbm2D(x * 0.022, z * 0.022, 3)) * 22);

  // Lighthouse headland rocky bluff around (-44, 34)
  const lhDist = Math.hypot(x + 44, z - 34);
  const lighthouseBluff = (1 - smoothstep(10, 28, lhDist)) * 7.8;

  // Southern bay & ocean shoreline (z > 16 slopes into sea)
  const coastSlope = smoothstep(16, 46, z);
  const bayCarve = coastSlope * (7.5 + (1 - smoothstep(0, 26, lhDist)) * -4.5);

  let h = 4.2 + baseRoll * 0.45 + fineDetail + alpinePeak + rimMountain + lighthouseBluff - bayCarve;

  // Flatten Harbor Town Plaza around (0, -2) for buildings & crisp grounding
  const plazaDist = Math.hypot(x * 0.85, (z + 2) * 0.95);
  const plazaBlend = 1 - smoothstep(18, 32, plazaDist);
  h = lerp(h, 4.0, plazaBlend);

  // Smoothly grade road bed along the road loop (except bridge span)
  const road = distanceToRoad(x, z);
  if (road.distance < 8.0 && !road.isBridge) {
    const roadFlat = 1 - smoothstep(2.6, 8.0, road.distance);
    // Target road height: smoothly rises in north hills, ~4.0 in town
    const northRoadLift = smoothstep(-10, -48, z) * 5.2;
    const westHeadlandLift = smoothstep(-14, -40, x) * smoothstep(6, 28, z) * 4.5;
    const targetRoadH = 4.0 + northRoadLift + westHeadlandLift;
    h = lerp(h, targetRoadH, roadFlat * 0.82);
  }

  // Carve Emerald Mountain Lake basin around (48, -42)
  const lakeDist = Math.hypot((x - 48) * 0.85, (z + 42) * 1.05);
  if (lakeDist < 20) {
    const lakeCarve = (1 - smoothstep(8, 20, lakeDist)) * 5.8;
    h -= lakeCarve;
  }

  // Carve freshwater river channel flowing from (44, -36) through (36, 2) to sea (36, 36)
  if (z > -44 && z < 44) {
    const rDist = distanceToRiver(x, z);
    if (rDist < 9.5) {
      const riverCarve = (1 - smoothstep(3.2, 9.5, rDist)) * 6.2;
      h -= riverCarve;
    }
  }

  // Clamp deep ocean floor
  if (z > 55) {
    h = Math.min(h, -1.8 - smoothstep(55, 130, z) * 3.5);
  }

  return h;
}

/**
 * Walkable ground height at (x, z), accounting for the stone river bridge deck
 * and harbor wooden pier.
 */
export function groundHeightAt(x: number, z: number): number {
  // Stone arched bridge deck over the river at (36, 2)
  if (
    Math.abs(x - BRIDGE_CENTER_X) <= BRIDGE_HALF_LENGTH &&
    Math.abs(z - BRIDGE_CENTER_Z) <= BRIDGE_HALF_WIDTH
  ) {
    const archT = (x - BRIDGE_CENTER_X) / BRIDGE_HALF_LENGTH; // -1..1
    const archRise = (1 - archT * archT) * 0.65;
    return BRIDGE_DECK_Y + archRise;
  }

  // Harbor wooden pier extending south into the bay at x in [-2.6, 2.6], z in [19, 44]
  if (Math.abs(x) <= 2.6 && z >= 19 && z <= 44) {
    return 1.35;
  }

  return rawTerrainHeightAt(x, z);
}

export type BiomeKind =
  | 'plaza'
  | 'beach'
  | 'water'
  | 'meadow'
  | 'forest'
  | 'alpine'
  | 'snow'
  | 'road';

export function classifyBiomeAt(x: number, z: number): BiomeKind {
  const h = rawTerrainHeightAt(x, z);
  if (h < WATER_LEVEL + 0.15) return 'water';
  const road = distanceToRoad(x, z);
  if (road.distance < 2.6) return 'road';
  if (Math.hypot(x * 0.85, (z + 2) * 0.95) < 20) return 'plaza';
  if (h < 2.0 && z > 12) return 'beach';
  if (h > 25) return 'snow';
  if (h > 15) return 'alpine';
  if (x < -16 && z < 20) return 'forest';
  return 'meadow';
}

export function getLocationAt(x: number, z: number): string {
  if (
    Math.abs(x - BRIDGE_CENTER_X) <= BRIDGE_HALF_LENGTH + 2 &&
    Math.abs(z - BRIDGE_CENTER_Z) <= BRIDGE_HALF_WIDTH + 2
  ) {
    return 'Stone Arch Bridge';
  }
  if (Math.abs(x) <= 4 && z >= 19 && z <= 46) {
    return 'Harbor Timber Pier';
  }
  if (Math.hypot(x + 56, z - 48) < 12) {
    return 'Ancient Cliff Shrine';
  }
  if (Math.hypot(x - 54, z + 52) < 13) {
    return 'Emerald Falls Overlook';
  }
  if (Math.hypot(x - 62, z - 26) < 13) {
    return 'Driftwood Cove';
  }
  if (Math.hypot(x + 44, z - 34) < 18) {
    return 'Lighthouse Headland';
  }
  if (Math.hypot(x - 48, z + 42) < 22) {
    return 'Emerald Mountain Lake';
  }
  if (Math.hypot(x, z + 2) < 24) {
    return 'Solstice Harbor Town';
  }
  if (z < -48) {
    return 'Alpine Frost Peaks';
  }
  if (x < -18 && z < 16) {
    return 'Whispering Pines Forest';
  }
  if (z > 24 && rawTerrainHeightAt(x, z) < 1.2) {
    return 'Sapphire Bay';
  }
  if (z > 15 && rawTerrainHeightAt(x, z) < 3.0) {
    return 'Golden Cove Beach';
  }
  return 'Solstice Valley Meadows';
}

export interface SunLightProfile {
  elevationDeg: number;
  azimuthDeg: number;
  sunIntensity: number;
  moonIntensity: number;
  ambientIntensity: number;
  sunColorHex: number;
  skyColorHex: number;
  groundColorHex: number;
  fogColorHex: number;
  fogDensity: number;
  isNight: boolean;
}

/** Computes realistic physically-inspired sun/sky/fog profile for any time (0..24) & weather */
export function computeAtmosphereProfile(
  timeOfDay: number,
  weather: WeatherType,
): SunLightProfile {
  const hour = ((timeOfDay % 24) + 24) % 24;
  // Sun peaks at 12:30, rises ~6:00, sets ~19:00
  const sunAngle = ((hour - 6.0) / 13.0) * Math.PI;
  const elevationDeg = Math.sin(sunAngle) * 62;
  const azimuthDeg = 135 + ((hour - 6) / 24) * 180;

  const dayFactor = smoothstep(-6, 12, elevationDeg); // 0 at night, 1 in full day
  const goldenFactor =
    smoothstep(-4, 4, elevationDeg) * (1 - smoothstep(8, 24, elevationDeg));

  // Weather attenuation
  let weatherSunMult = 1.0;
  let weatherFogMult = 1.0;
  let overcastTint = 0.0;
  if (weather === 'cloudy') {
    weatherSunMult = 0.55;
    weatherFogMult = 1.35;
    overcastTint = 0.35;
  } else if (weather === 'foggy') {
    weatherSunMult = 0.48;
    weatherFogMult = 3.2;
    overcastTint = 0.45;
  } else if (weather === 'rain') {
    weatherSunMult = 0.32;
    weatherFogMult = 2.4;
    overcastTint = 0.65;
  } else if (weather === 'thunderstorm') {
    weatherSunMult = 0.18;
    weatherFogMult = 3.0;
    overcastTint = 0.8;
  } else if (weather === 'snow') {
    weatherSunMult = 0.45;
    weatherFogMult = 2.5;
    overcastTint = 0.55;
  }

  const sunIntensity =
    Math.max(0, dayFactor) * 3.4 * weatherSunMult;
  const moonIntensity = (1 - dayFactor) * 0.45 * (1 - overcastTint * 0.5);
  const ambientIntensity = lerp(0.16, 0.42, dayFactor) * (1 - overcastTint * 0.25);

  // Interpolate palette colors smoothly
  const lerpColor = (c1: number, c2: number, t: number): number => {
    const r1 = (c1 >> 16) & 255;
    const g1 = (c1 >> 8) & 255;
    const b1 = c1 & 255;
    const r2 = (c2 >> 16) & 255;
    const g2 = (c2 >> 8) & 255;
    const b2 = c2 & 255;
    const r = Math.round(lerp(r1, r2, t));
    const g = Math.round(lerp(g1, g2, t));
    const b = Math.round(lerp(b1, b2, t));
    return (r << 16) | (g << 8) | b;
  };

  let sunColorHex = lerpColor(0xff944d, 0xfff3dc, smoothstep(5, 28, elevationDeg));
  if (goldenFactor > 0.1) {
    sunColorHex = lerpColor(sunColorHex, 0xff7b30, goldenFactor * 0.78);
  }

  let skyColorHex = lerpColor(0x09101f, 0x4c8ec9, dayFactor);
  skyColorHex = lerpColor(skyColorHex, 0xd47e52, goldenFactor * 0.62);
  const stormSky = weather === 'snow' ? 0xb4c2d0 : 0x3f4c59;
  skyColorHex = lerpColor(skyColorHex, stormSky, overcastTint);

  let fogColorHex = lerpColor(0x0d1626, 0x9ec5e2, dayFactor);
  fogColorHex = lerpColor(fogColorHex, 0xe0966a, goldenFactor * 0.65);
  const weatherFogColor =
    weather === 'snow'
      ? 0xc8d4e0
      : weather === 'foggy'
        ? 0xb8c5d1
        : 0x52606e;
  fogColorHex = lerpColor(fogColorHex, weatherFogColor, overcastTint);

  const groundColorHex = lerpColor(0x141b26, 0x34422e, dayFactor);
  const baseFogDensity = lerp(0.0028, 0.0014, dayFactor);

  return {
    elevationDeg,
    azimuthDeg,
    sunIntensity,
    moonIntensity,
    ambientIntensity,
    sunColorHex,
    skyColorHex,
    groundColorHex,
    fogColorHex,
    fogDensity: baseFogDensity * weatherFogMult,
    isNight: dayFactor < 0.25,
  };
}

export type SignalAspect = 'green' | 'amber' | 'red';

export interface TrafficLightCycleState {
  nsAspect: SignalAspect;
  ewAspect: SignalAspect;
}

/** Deterministic 14-second working traffic light cycle */
export function computeTrafficLightCycle(elapsedSec: number): TrafficLightCycleState {
  const t = ((elapsedSec % 14) + 14) % 14;
  if (t < 5.5) return { nsAspect: 'green', ewAspect: 'red' };
  if (t < 7.0) return { nsAspect: 'amber', ewAspect: 'red' };
  if (t < 12.5) return { nsAspect: 'red', ewAspect: 'green' };
  return { nsAspect: 'red', ewAspect: 'amber' };
}

export interface EnterableBuildingBounds {
  id: string;
  name: string;
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  rotY: number;
  maxH: number;
}

export const ENTERABLE_BUILDINGS: ReadonlyArray<EnterableBuildingBounds> = [
  { id: 'harbor_cafe', name: 'Harbor Café & Bakery', x: -14.5, z: -9.5, halfW: 4.1, halfD: 3.5, rotY: Math.PI * 0.5, maxH: 4.2 },
  { id: 'general_store', name: 'Coastal General Store', x: 15.5, z: -11.5, halfW: 4.4, halfD: 3.7, rotY: -Math.PI * 0.5, maxH: 4.4 },
  { id: 'lakeside_lodge', name: 'Emerald Lake Lodge', x: 56, z: -24, halfW: 4.5, halfD: 3.6, rotY: -Math.PI * 0.25, maxH: 4.3 },
];

/** Checks whether a world coordinate is inside one of the furnished enterable buildings */
export function isPointIndoors(
  x: number,
  y: number,
  z: number,
): { indoors: boolean; buildingName: string | null } {
  for (const b of ENTERABLE_BUILDINGS) {
    const dx = x - b.x;
    const dz = z - b.z;
    const c = Math.cos(-b.rotY);
    const s = Math.sin(-b.rotY);
    const lx = dx * c + dz * s;
    const lz = -dx * s + dz * c;
    if (Math.abs(lx) <= b.halfW && Math.abs(lz) <= b.halfD) {
      const floorY = groundHeightAt(b.x, b.z);
      if (y >= floorY - 0.3 && y <= floorY + b.maxH) {
        return { indoors: true, buildingName: b.name };
      }
    }
  }
  return { indoors: false, buildingName: null };
}

export const SECRET_LOCATIONS: ReadonlyArray<{
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
}> = [
  { id: 'lighthouse_summit', name: 'Lighthouse Headland', x: -44, z: 34, radius: 11 },
  { id: 'cliff_shrine', name: 'Ancient Cliff Shrine', x: -56, z: 48, radius: 9 },
  { id: 'emerald_lake', name: 'Emerald Falls Overlook', x: 54, z: -52, radius: 11 },
  { id: 'driftwood_cove', name: 'Driftwood Cove', x: 62, z: 26, radius: 11 },
  { id: 'alpine_ridge', name: 'Alpine Frost Peaks', x: 0, z: -72, radius: 14 },
];
