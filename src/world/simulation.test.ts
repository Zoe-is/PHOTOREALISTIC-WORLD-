import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkDiscoveries,
  createInitialPlayerState,
  createInitialVehicleState,
  SPRINT_SPEED,
  stepPlayerSimulation,
  stepVehicleSimulation,
  WALK_SPEED,
} from './simulation';
import type { ColliderBox } from './types';

test('WASD input produces immediate movement on first frame without artificial delay', () => {
  const player = createInitialPlayerState();
  const startZ = player.z;
  stepPlayerSimulation(
    player,
    {
      forward: true,
      backward: false,
      left: false,
      right: false,
      sprint: false,
      jumpHeld: false,
      jumpJustPressed: false,
      cameraYaw: 0,
    },
    0.016,
    [],
    [],
  );
  assert.ok(player.isMoving);
  assert.ok(player.z < startZ, 'Pressing W at yaw=0 moves immediately along -Z');
  assert.ok(Math.abs(Math.hypot(player.vx, player.vz) - WALK_SPEED) < 0.01);
});

test('Shift sprint immediately boosts speed to SPRINT_SPEED', () => {
  const player = createInitialPlayerState();
  stepPlayerSimulation(
    player,
    {
      forward: true,
      backward: false,
      left: false,
      right: false,
      sprint: true,
      jumpHeld: false,
      jumpJustPressed: false,
      cameraYaw: 0,
    },
    0.016,
    [],
    [],
  );
  assert.equal(player.isSprinting, true);
  assert.ok(Math.abs(Math.hypot(player.vx, player.vz) - SPRINT_SPEED) < 0.01);
});

test('Jump launches player upward and gravity returns them to ground', () => {
  const player = createInitialPlayerState();
  const groundY = player.y;
  const res = stepPlayerSimulation(
    player,
    {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
      jumpHeld: true,
      jumpJustPressed: true,
      cameraYaw: 0,
    },
    0.016,
    [],
    [],
  );
  assert.equal(res.jumped, true);
  assert.equal(player.grounded, false);
  assert.ok(player.y > groundY);

  // Simulate 1.2s of falling
  for (let i = 0; i < 60; i++) {
    stepPlayerSimulation(
      player,
      {
        forward: false,
        backward: false,
        left: false,
        right: false,
        sprint: false,
        jumpHeld: false,
        jumpJustPressed: false,
        cameraYaw: 0,
      },
      0.02,
      [],
      [],
    );
  }
  assert.equal(player.grounded, true);
  assert.ok(Math.abs(player.y - groundY) < 0.01);
});

test('Solid building walls block player while open doors allow entry', () => {
  const player = createInitialPlayerState();
  player.z = 0;
  const wallBox: ColliderBox = {
    id: 'wall',
    minX: -2,
    maxX: 2,
    minZ: -2,
    maxZ: -1,
    minY: 0,
    maxY: 10,
  };
  const doorBox: ColliderBox = {
    id: 'door',
    minX: -2,
    maxX: 2,
    minZ: -2,
    maxZ: -1,
    minY: 0,
    maxY: 10,
    isDoor: true,
    doorOpen: false,
  };

  // Closed wall blocks at z >= -1 + radius (-0.58)
  for (let i = 0; i < 20; i++) {
    stepPlayerSimulation(
      player,
      {
        forward: true,
        backward: false,
        left: false,
        right: false,
        sprint: false,
        jumpHeld: false,
        jumpJustPressed: false,
        cameraYaw: 0,
      },
      0.02,
      [wallBox],
      [],
    );
  }
  assert.ok(player.z >= -0.6, `Player should be blocked before wall at z=-1, got z=${player.z}`);

  // Open door lets player pass through
  doorBox.doorOpen = true;
  player.z = 0;
  for (let i = 0; i < 30; i++) {
    stepPlayerSimulation(
      player,
      {
        forward: true,
        backward: false,
        left: false,
        right: false,
        sprint: false,
        jumpHeld: false,
        jumpJustPressed: false,
        cameraYaw: 0,
      },
      0.02,
      [doorBox],
      [],
    );
  }
  assert.ok(player.z < -2.0, `Player should pass through open door, got z=${player.z}`);
});

test('Vehicle accelerates, steers, and discovery tracks secret locations', () => {
  const car = createInitialVehicleState();
  const startX = car.x;
  for (let i = 0; i < 30; i++) {
    stepVehicleSimulation(
      car,
      {
        forward: true,
        backward: false,
        left: false,
        right: false,
        sprint: false,
        jumpHeld: false,
        jumpJustPressed: false,
        cameraYaw: 0,
      },
      0.03,
      [],
      [],
    );
  }
  assert.ok(car.speed > 5, 'Vehicle should accelerate');
  assert.ok(car.x > startX, 'Vehicle facing east should move +X');

  const discovered = new Set<string>();
  const found = checkDiscoveries(-56, 48, discovered);
  assert.equal(found, 'Ancient Cliff Shrine');
  assert.equal(discovered.size, 1);
});
