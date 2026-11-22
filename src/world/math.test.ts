import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRIDGE_CENTER_X,
  BRIDGE_CENTER_Z,
  BRIDGE_DECK_Y,
  classifyBiomeAt,
  computeAtmosphereProfile,
  computeTrafficLightCycle,
  distanceToRoad,
  getLocationAt,
  groundHeightAt,
  isPointIndoors,
  rawTerrainHeightAt,
  WATER_LEVEL,
} from './math';

test('spawn plaza is flat, dry, and classified as Harbor Town', () => {
  const h0 = groundHeightAt(0, 0);
  const h1 = groundHeightAt(4, -3);
  assert.ok(h0 > WATER_LEVEL + 2.5, `Expected spawn height > 2.5, got ${h0}`);
  assert.ok(Math.abs(h0 - h1) < 0.25, 'Plaza should be smoothly leveled');
  assert.equal(getLocationAt(0, 0), 'Solstice Harbor Town');
  assert.equal(classifyBiomeAt(0, 0), 'plaza');
});

test('stone bridge spans above the carved river channel', () => {
  const riverBed = rawTerrainHeightAt(BRIDGE_CENTER_X, BRIDGE_CENTER_Z);
  const bridgeDeck = groundHeightAt(BRIDGE_CENTER_X, BRIDGE_CENTER_Z);
  assert.ok(riverBed < WATER_LEVEL, `Riverbed should be below water level, got ${riverBed}`);
  assert.ok(bridgeDeck >= BRIDGE_DECK_Y, `Bridge deck should sit above ${BRIDGE_DECK_Y}, got ${bridgeDeck}`);
  assert.equal(getLocationAt(BRIDGE_CENTER_X, BRIDGE_CENTER_Z), 'Stone Arch Bridge');
});

test('road distance detects points on the loop and spur', () => {
  const onPlazaRoad = distanceToRoad(0, 4);
  assert.ok(onPlazaRoad.distance < 0.1);
  const onBridge = distanceToRoad(BRIDGE_CENTER_X, BRIDGE_CENTER_Z);
  assert.equal(onBridge.isBridge, true);
});

test('alpine north rises into snow biome and south descends into sapphire bay', () => {
  const northH = groundHeightAt(0, -110);
  const southBayH = rawTerrainHeightAt(0, 58);
  assert.ok(northH > 24, `North mountain should rise > 24m, got ${northH}`);
  assert.ok(southBayH < WATER_LEVEL, `Southern bay should be submerged, got ${southBayH}`);
  assert.equal(classifyBiomeAt(0, 58), 'water');
});

test('atmosphere profile transitions smoothly from day to night and storm', () => {
  const noon = computeAtmosphereProfile(12.5, 'clear');
  const midnight = computeAtmosphereProfile(0.5, 'clear');
  const storm = computeAtmosphereProfile(12.5, 'thunderstorm');

  assert.equal(noon.isNight, false);
  assert.equal(midnight.isNight, true);
  assert.ok(noon.sunIntensity > midnight.sunIntensity);
  assert.ok(storm.fogDensity > noon.fogDensity * 2);
  assert.ok(storm.sunIntensity < noon.sunIntensity * 0.4);
});

test('traffic light cycle switches cleanly without conflicting greens', () => {
  for (let t = 0; t < 28; t += 0.5) {
    const sig = computeTrafficLightCycle(t);
    assert.ok(
      !(sig.nsAspect === 'green' && sig.ewAspect === 'green'),
      `Both axes green at t=${t}`,
    );
  }
  assert.deepEqual(computeTrafficLightCycle(2), { nsAspect: 'green', ewAspect: 'red' });
  assert.deepEqual(computeTrafficLightCycle(6.2), { nsAspect: 'amber', ewAspect: 'red' });
  assert.deepEqual(computeTrafficLightCycle(9), { nsAspect: 'red', ewAspect: 'green' });
  assert.deepEqual(computeTrafficLightCycle(13.2), { nsAspect: 'red', ewAspect: 'amber' });
});

test('isPointIndoors detects interior of Harbor Cafe vs outdoor plaza', () => {
  const cafeFloor = groundHeightAt(-14.5, -9.5);
  const insideCafe = isPointIndoors(-14.5, cafeFloor + 0.5, -9.5);
  assert.equal(insideCafe.indoors, true);
  assert.equal(insideCafe.buildingName, 'Harbor Café & Bakery');

  const outsidePlaza = isPointIndoors(0, groundHeightAt(0, 0), 0);
  assert.equal(outsidePlaza.indoors, false);
  assert.equal(outsidePlaza.buildingName, null);
});
