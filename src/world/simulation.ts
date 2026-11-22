import {
  clamp,
  groundHeightAt,
  SECRET_LOCATIONS,
  WATER_LEVEL,
  WORLD_PLAYABLE_RADIUS,
} from './math';
import type { ColliderBox, ColliderCylinder } from './types';

export interface PlayerSimState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  heading: number;
  grounded: boolean;
  coyoteTimer: number;
  jumpBufferTimer: number;
  walkDistance: number;
  isMoving: boolean;
  isSprinting: boolean;
  landingSquash: number;
}

export interface VehicleSimState {
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  steerAngle: number;
  wheelSpin: number;
}

export interface InputIntent {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  jumpHeld: boolean;
  jumpJustPressed: boolean;
  cameraYaw: number;
}

export const PLAYER_RADIUS = 0.42;
export const PLAYER_HEIGHT = 1.75;
export const WALK_SPEED = 6.2;
export const SPRINT_SPEED = 10.8;
export const JUMP_VELOCITY = 7.8;
export const GRAVITY = -21.0;

export function createInitialPlayerState(): PlayerSimState {
  const startX = 0;
  const startZ = 0;
  return {
    x: startX,
    y: groundHeightAt(startX, startZ),
    z: startZ,
    vx: 0,
    vy: 0,
    vz: 0,
    // Face toward Harbor Pier / Lighthouse Bay vista (+Z, slight -X)
    heading: -0.32,
    grounded: true,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    walkDistance: 0,
    isMoving: false,
    isSprinting: false,
    landingSquash: 0,
  };
}

export function createInitialVehicleState(): VehicleSimState {
  const vx = 5.5;
  const vz = 11.5;
  return {
    x: vx,
    y: groundHeightAt(vx, vz),
    z: vz,
    heading: Math.PI * 0.5, // Parked facing east along the harbor promenade road
    speed: 0,
    steerAngle: 0,
    wheelSpin: 0,
  };
}

/** Resolves horizontal circle vs AABB / cylinder collisions cleanly with wall sliding */
export function resolveHorizontalCollisions(
  x: number,
  z: number,
  y: number,
  radius: number,
  entityHeight: number,
  boxes: ReadonlyArray<ColliderBox>,
  cylinders: ReadonlyArray<ColliderCylinder>,
): { x: number; z: number } {
  let px = x;
  let pz = z;

  // Iterative resolution (2 passes prevents corner snagging)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.isDoor && b.doorOpen) continue;
      if (y + entityHeight <= b.minY + 0.05 || y >= b.maxY - 0.05) continue;

      const closestX = clamp(px, b.minX, b.maxX);
      const closestZ = clamp(pz, b.minZ, b.maxZ);
      const dx = px - closestX;
      const dz = pz - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const push = radius - dist;
          px += (dx / dist) * push;
          pz += (dz / dist) * push;
        } else {
          // Center inside AABB: push out along nearest face
          const leftPen = px - b.minX;
          const rightPen = b.maxX - px;
          const frontPen = pz - b.minZ;
          const backPen = b.maxZ - pz;
          const minPen = Math.min(leftPen, rightPen, frontPen, backPen);
          if (minPen === leftPen) px = b.minX - radius;
          else if (minPen === rightPen) px = b.maxX + radius;
          else if (minPen === frontPen) pz = b.minZ - radius;
          else pz = b.maxZ + radius;
        }
      }
    }

    for (let i = 0; i < cylinders.length; i++) {
      const c = cylinders[i];
      if (y + entityHeight <= c.minY + 0.05 || y >= c.maxY - 0.05) continue;
      const dx = px - c.x;
      const dz = pz - c.z;
      const minDist = radius + c.radius;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist * minDist && distSq > 1e-8) {
        const dist = Math.sqrt(distSq);
        const push = minDist - dist;
        px += (dx / dist) * push;
        pz += (dz / dist) * push;
      }
    }
  }

  // Natural valley perimeter clamp
  const radial = Math.hypot(px, pz);
  if (radial > WORLD_PLAYABLE_RADIUS) {
    const scale = WORLD_PLAYABLE_RADIUS / radial;
    px *= scale;
    pz *= scale;
  }

  return { x: px, z: pz };
}

/** Computes shortest signed angle difference in [-PI, PI] */
export function angleDiff(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Advances third-person player simulation by dt (clamped <= 0.05s).
 * Movement is instant on keypress: zero startup delay.
 */
export function stepPlayerSimulation(
  state: PlayerSimState,
  input: InputIntent,
  rawDt: number,
  boxes: ReadonlyArray<ColliderBox>,
  cylinders: ReadonlyArray<ColliderCylinder>,
): { jumped: boolean; landed: boolean } {
  const dt = Math.min(rawDt, 0.05);
  let jumped = false;
  let landed = false;

  // Input direction in camera-relative XZ plane
  // cameraYaw = 0 means camera looks along -Z (forward = -Z, right = +X)
  const moveForward = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
  const moveRight = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  const sinY = Math.sin(input.cameraYaw);
  const cosY = Math.cos(input.cameraYaw);
  // Forward vector from yaw: (-sinY, -cosY), Right vector: (cosY, -sinY)
  let wishX = -sinY * moveForward + cosY * moveRight;
  let wishZ = -cosY * moveForward - sinY * moveRight;
  const wishLen = Math.hypot(wishX, wishZ);

  const isMoving = wishLen > 0.01;
  const isSprinting = isMoving && input.sprint;
  const targetSpeed = isSprinting ? SPRINT_SPEED : WALK_SPEED;

  if (isMoving) {
    wishX /= wishLen;
    wishZ /= wishLen;
    // Instant velocity response: immediately move at target speed
    state.vx = wishX * targetSpeed;
    state.vz = wishZ * targetSpeed;

    const targetHeading = Math.atan2(wishX, wishZ);
    const turnRate = 1 - Math.exp(-16 * dt);
    state.heading += angleDiff(state.heading, targetHeading) * turnRate;
  } else {
    state.vx = 0;
    state.vz = 0;
  }

  state.isMoving = isMoving;
  state.isSprinting = isSprinting;

  // Coyote time & jump buffer
  if (state.grounded) {
    state.coyoteTimer = 0.1;
  } else {
    state.coyoteTimer = Math.max(0, state.coyoteTimer - dt);
  }

  if (input.jumpJustPressed) {
    state.jumpBufferTimer = 0.12;
  } else {
    state.jumpBufferTimer = Math.max(0, state.jumpBufferTimer - dt);
  }

  if (state.jumpBufferTimer > 0 && state.coyoteTimer > 0) {
    state.vy = JUMP_VELOCITY;
    state.grounded = false;
    state.coyoteTimer = 0;
    state.jumpBufferTimer = 0;
    jumped = true;
  }

  // Variable jump height cut when releasing Space early
  if (!input.jumpHeld && state.vy > 2.2) {
    state.vy *= 0.85;
  }

  // Gravity
  state.vy += GRAVITY * dt;

  // Proposed position
  const nextX = state.x + state.vx * dt;
  const nextZ = state.z + state.vz * dt;
  const resolved = resolveHorizontalCollisions(
    nextX,
    nextZ,
    state.y,
    PLAYER_RADIUS,
    PLAYER_HEIGHT,
    boxes,
    cylinders,
  );

  // Prevent walking into deep ocean beyond shallow wading depth
  const targetGroundY = groundHeightAt(resolved.x, resolved.z);
  if (targetGroundY < WATER_LEVEL - 0.55) {
    // Keep at shoreline if trying to walk deeper
    const curGround = groundHeightAt(state.x, state.z);
    if (curGround >= WATER_LEVEL - 0.55) {
      resolved.x = state.x;
      resolved.z = state.z;
    }
  }

  const movedDist = Math.hypot(resolved.x - state.x, resolved.z - state.z);
  state.walkDistance += state.grounded ? movedDist : 0;
  state.x = resolved.x;
  state.z = resolved.z;

  // Vertical integration & floor clamping (also check interior floor boxes)
  let floorY = groundHeightAt(state.x, state.z);
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.isDoor) continue;
    if (
      state.x >= b.minX - 0.1 &&
      state.x <= b.maxX + 0.1 &&
      state.z >= b.minZ - 0.1 &&
      state.z <= b.maxZ + 0.1 &&
      state.y >= b.maxY - 0.45 &&
      b.maxY <= state.y + 0.65
    ) {
      if (b.maxY > floorY) floorY = b.maxY;
    }
  }

  const nextY = state.y + state.vy * dt;
  if (nextY <= floorY) {
    if (!state.grounded && state.vy < -3.5) {
      landed = true;
      state.landingSquash = Math.min(1, Math.abs(state.vy) / 12);
    }
    state.y = floorY;
    state.vy = 0;
    state.grounded = true;
  } else {
    state.y = nextY;
    state.grounded = false;
  }

  state.landingSquash = Math.max(0, state.landingSquash - dt * 5.0);

  return { jumped, landed };
}

/** Advances drivable coastal convertible kinematics */
export function stepVehicleSimulation(
  car: VehicleSimState,
  input: InputIntent,
  rawDt: number,
  boxes: ReadonlyArray<ColliderBox>,
  cylinders: ReadonlyArray<ColliderCylinder>,
): void {
  const dt = Math.min(rawDt, 0.05);

  const throttle = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
  const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);

  const accel = throttle > 0 ? 15.0 : throttle < 0 ? 12.0 : 0;
  if (throttle !== 0) {
    car.speed += throttle * accel * dt;
  } else {
    // Natural rolling resistance
    car.speed *= Math.exp(-2.8 * dt);
    if (Math.abs(car.speed) < 0.05) car.speed = 0;
  }

  if (input.jumpHeld) {
    // Handbrake
    car.speed *= Math.exp(-7.5 * dt);
  }

  car.speed = clamp(car.speed, -9.0, 23.0);

  // Smooth front wheel steering
  const targetSteer = steerInput * 0.55;
  car.steerAngle += (targetSteer - car.steerAngle) * (1 - Math.exp(-10 * dt));

  if (Math.abs(car.speed) > 0.2) {
    const turnSign = car.speed >= 0 ? 1 : -1;
    const speedFactor = clamp(Math.abs(car.speed) / 6.0, 0.25, 1.0);
    car.heading += car.steerAngle * 2.4 * speedFactor * turnSign * dt;
  }

  const vx = Math.sin(car.heading) * car.speed;
  const vz = Math.cos(car.heading) * car.speed;

  const nextX = car.x + vx * dt;
  const nextZ = car.z + vz * dt;
  const resolved = resolveHorizontalCollisions(
    nextX,
    nextZ,
    car.y,
    1.35,
    1.6,
    boxes,
    cylinders,
  );

  // Stop gently if blocked by water or collision
  const targetGround = groundHeightAt(resolved.x, resolved.z);
  if (targetGround < WATER_LEVEL - 0.1) {
    car.speed *= -0.25;
  } else {
    const actualMove = Math.hypot(resolved.x - car.x, resolved.z - car.z);
    const expectedMove = Math.hypot(vx * dt, vz * dt);
    if (expectedMove > 0.02 && actualMove < expectedMove * 0.45) {
      car.speed *= 0.35;
    }
    car.x = resolved.x;
    car.z = resolved.z;
    car.y = targetGround;
  }

  car.wheelSpin += (car.speed * dt) / 0.36;
}

/** Checks if player entered any secret/notable discovery zones */
export function checkDiscoveries(
  x: number,
  z: number,
  discovered: Set<string>,
): string | null {
  for (const loc of SECRET_LOCATIONS) {
    if (!discovered.has(loc.id)) {
      if (Math.hypot(x - loc.x, z - loc.z) <= loc.radius) {
        discovered.add(loc.id);
        return loc.name;
      }
    }
  }
  return null;
}
