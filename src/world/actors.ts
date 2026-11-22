import * as THREE from 'three';
import { computeTrafficLightCycle, groundHeightAt, ROAD_LOOP_POINTS } from './math';
import type { MaterialTextureSet } from './textures';
import type { InteractableTarget, NpcDialogue } from './types';

export interface CharacterRig {
  group: THREE.Group;
  bodyPivot: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftForearm: THREE.Group;
  rightForearm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftKnee: THREE.Group;
  rightKnee: THREE.Group;
  head: THREE.Group;
  shadowDisc: THREE.Mesh;
}

export interface VehicleVisualRig {
  group: THREE.Group;
  bodyGroup: THREE.Group;
  wheels: THREE.Group[];
  frontSteerPivots: THREE.Group[];
  headlightBeam: THREE.SpotLight;
  headlightMat: THREE.MeshStandardMaterial;
  taillightMat: THREE.MeshStandardMaterial;
}

export interface ActorsRig {
  group: THREE.Group;
  playerRig: CharacterRig;
  carRig: VehicleVisualRig;
  interactables: InteractableTarget[];
  dialogues: Record<string, NpcDialogue>;
  updatePlayerVisual: (
    x: number,
    y: number,
    z: number,
    heading: number,
    walkDistance: number,
    isMoving: boolean,
    isSprinting: boolean,
    grounded: boolean,
    landingSquash: number,
    elapsed: number,
    visible: boolean,
  ) => void;
  updateVehicleVisual: (
    x: number,
    y: number,
    z: number,
    heading: number,
    steerAngle: number,
    wheelSpin: number,
    isDriving: boolean,
    isNight: boolean,
    speed: number,
  ) => void;
  updateLivingWorld: (dt: number, elapsed: number, isNight: boolean) => void;
  dispose: () => void;
}

function buildHumanCharacter(
  jacketColor: number,
  pantsColor: number,
  hairColor: number,
  skinColor: number,
  hasPack: boolean,
  shadowMap: THREE.Texture,
  disposables: Array<{ dispose: () => void }>,
): CharacterRig {
  const group = new THREE.Group();
  const bodyPivot = new THREE.Group();
  group.add(bodyPivot);

  const jacketMat = new THREE.MeshStandardMaterial({ color: jacketColor, roughness: 0.78 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0xe5e0d8, roughness: 0.85 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.86 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.58 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.82 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x291f17, roughness: 0.52, metalness: 0.12 });
  const packMat = new THREE.MeshStandardMaterial({ color: 0x704928, roughness: 0.8 });
  disposables.push(jacketMat, shirtMat, pantsMat, skinMat, hairMat, eyeMat, bootMat, packMat);

  // Sculpted Anatomical Torso via LatheGeometry (broad shoulders -> tapered waist -> hips)
  const torsoPts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.16, 0.02),
    new THREE.Vector2(0.155, 0.16), // hips
    new THREE.Vector2(0.135, 0.30), // waist
    new THREE.Vector2(0.185, 0.48), // chest
    new THREE.Vector2(0.165, 0.57), // shoulders
    new THREE.Vector2(0.06, 0.60),
    new THREE.Vector2(0.0, 0.60),
  ];
  const torsoGeo = new THREE.LatheGeometry(torsoPts, 14);
  torsoGeo.scale(1.22, 1.0, 0.76);
  const torso = new THREE.Mesh(torsoGeo, jacketMat);
  torso.position.y = 0.83;
  torso.castShadow = true;
  bodyPivot.add(torso);

  // Jacket lapel / collar + neck
  const collarGeo = new THREE.CylinderGeometry(0.09, 0.14, 0.11, 12);
  const collar = new THREE.Mesh(collarGeo, shirtMat);
  collar.position.y = 1.43;
  const neckGeo = new THREE.CylinderGeometry(0.055, 0.068, 0.12, 10);
  const neck = new THREE.Mesh(neckGeo, skinMat);
  neck.position.y = 1.48;
  bodyPivot.add(collar, neck);

  if (hasPack) {
    const packGeo = new THREE.CapsuleGeometry(0.13, 0.24, 6, 10);
    packGeo.scale(1.1, 1.0, 0.58);
    const pack = new THREE.Mesh(packGeo, packMat);
    pack.position.set(0, 1.15, -0.17);
    pack.castShadow = true;
    bodyPivot.add(pack);
    disposables.push(packGeo);
  }

  // Sculpted Oval Head + Facial Features + Layered Hair
  const head = new THREE.Group();
  head.position.y = 1.61;
  const headGeo = new THREE.SphereGeometry(0.155, 16, 14);
  headGeo.scale(0.88, 1.06, 0.95);
  const headMesh = new THREE.Mesh(headGeo, skinMat);
  headMesh.castShadow = true;

  const noseGeo = new THREE.ConeGeometry(0.024, 0.06, 6);
  noseGeo.rotateX(Math.PI * 0.5);
  const nose = new THREE.Mesh(noseGeo, skinMat);
  nose.position.set(0, -0.01, 0.15);

  const eyeGeo = new THREE.SphereGeometry(0.016, 8, 8);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.048, 0.025, 0.128);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.048, 0.025, 0.128);

  const hairGeo = new THREE.SphereGeometry(0.165, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.58);
  hairGeo.scale(0.9, 1.05, 0.98);
  const hairMesh = new THREE.Mesh(hairGeo, hairMat);
  hairMesh.position.set(0, 0.02, -0.015);
  hairMesh.rotation.x = -0.22;
  head.add(headMesh, nose, eyeL, eyeR, hairMesh);
  bodyPivot.add(head);

  // Articulated 2-Segment Arms (Upper Arm + Elbow Forearm + Hand)
  const upperArmGeo = new THREE.CapsuleGeometry(0.056, 0.22, 5, 10);
  const forearmGeo = new THREE.CapsuleGeometry(0.048, 0.2, 5, 10);
  const handGeo = new THREE.SphereGeometry(0.05, 8, 8);
  const makeArm = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.24, 1.38, 0);
    pivot.rotation.z = side * 0.08;
    const upper = new THREE.Mesh(upperArmGeo, jacketMat);
    upper.position.y = -0.14;
    upper.castShadow = true;

    const forearmPivot = new THREE.Group();
    forearmPivot.position.y = -0.24;
    const fore = new THREE.Mesh(forearmGeo, jacketMat);
    fore.position.y = -0.11;
    fore.castShadow = true;
    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.position.y = -0.23;
    forearmPivot.add(fore, hand);
    pivot.add(upper, forearmPivot);
    bodyPivot.add(pivot);
    return { pivot, forearmPivot };
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  // Articulated 2-Segment Legs (Thigh + Knee Shin + Sculpted Boot)
  const thighGeo = new THREE.CapsuleGeometry(0.08, 0.28, 5, 10);
  const shinGeo = new THREE.CapsuleGeometry(0.065, 0.28, 5, 10);
  const bootGeo = new THREE.CapsuleGeometry(0.064, 0.12, 5, 8);
  bootGeo.rotateX(Math.PI * 0.5);
  const makeLeg = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.105, 0.84, 0);
    const thigh = new THREE.Mesh(thighGeo, pantsMat);
    thigh.position.y = -0.19;
    thigh.castShadow = true;

    const kneePivot = new THREE.Group();
    kneePivot.position.y = -0.37;
    const shin = new THREE.Mesh(shinGeo, pantsMat);
    shin.position.y = -0.19;
    shin.castShadow = true;
    const boot = new THREE.Mesh(bootGeo, bootMat);
    boot.position.set(0, -0.39, 0.045);
    boot.castShadow = true;
    kneePivot.add(shin, boot);

    pivot.add(thigh, kneePivot);
    bodyPivot.add(pivot);
    return { pivot, kneePivot };
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  const shadowGeo = new THREE.CircleGeometry(0.45, 16);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowMap,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.position.y = 0.025;
  group.add(shadowDisc);

  disposables.push(
    torsoGeo,
    collarGeo,
    neckGeo,
    headGeo,
    noseGeo,
    eyeGeo,
    hairGeo,
    upperArmGeo,
    forearmGeo,
    handGeo,
    thighGeo,
    shinGeo,
    bootGeo,
    shadowGeo,
    shadowMat,
  );

  return {
    group,
    bodyPivot,
    leftArm: armL.pivot,
    rightArm: armR.pivot,
    leftForearm: armL.forearmPivot,
    rightForearm: armR.forearmPivot,
    leftLeg: legL.pivot,
    rightLeg: legR.pivot,
    leftKnee: legL.kneePivot,
    rightKnee: legR.kneePivot,
    head,
    shadowDisc,
  };
}

function buildConvertibleCar(
  paintColor: number,
  withHeadlightSpot: boolean,
  shadowMap: THREE.Texture,
  disposables: Array<{ dispose: () => void }>,
): VehicleVisualRig {
  const group = new THREE.Group();
  const bodyGroup = new THREE.Group();
  group.add(bodyGroup);

  const paintMat = new THREE.MeshPhysicalMaterial({
    color: paintColor,
    roughness: 0.16,
    metalness: 0.72,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.16,
    metalness: 0.94,
  });
  const leatherMat = new THREE.MeshStandardMaterial({ color: 0x704126, roughness: 0.68 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x161618, roughness: 0.88 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xcbe5ff,
    roughness: 0.05,
    clearcoat: 1.0,
    transparent: true,
    opacity: 0.48,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfffbeb,
    emissive: 0xffe49e,
    emissiveIntensity: 0.25,
  });
  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    emissive: 0xef4444,
    emissiveIntensity: 0.3,
  });
  disposables.push(
    paintMat,
    chromeMat,
    leatherMat,
    tireMat,
    glassMat,
    headlightMat,
    taillightMat,
  );

  // Sculpted Side-Profile Chassis Extrusion with curved hood, fenders & trunk
  const profile = new THREE.Shape();
  profile.moveTo(-2.08, 0.36);
  profile.lineTo(-2.08, 0.82); // rear trunk
  profile.quadraticCurveTo(-1.85, 0.94, -1.1, 0.94);
  profile.lineTo(-0.92, 0.78); // cabin dip
  profile.lineTo(0.68, 0.78);
  profile.lineTo(0.86, 0.96); // cowl
  profile.quadraticCurveTo(1.55, 0.92, 2.08, 0.76); // sloped hood
  profile.lineTo(2.12, 0.38);
  profile.lineTo(1.75, 0.34);
  // Front wheel arch cutout
  profile.absarc(1.28, 0.36, 0.42, 0, Math.PI, false);
  profile.lineTo(0.82, 0.34);
  profile.lineTo(-0.82, 0.34);
  // Rear wheel arch cutout
  profile.absarc(-1.28, 0.36, 0.42, 0, Math.PI, false);
  profile.lineTo(-1.75, 0.34);
  profile.closePath();

  const hullGeo = new THREE.ExtrudeGeometry(profile, {
    depth: 1.76,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 3,
  });
  hullGeo.rotateY(Math.PI * 0.5);
  hullGeo.translate(-0.88, 0, 0);
  const hull = new THREE.Mesh(hullGeo, paintMat);
  hull.castShadow = true;
  hull.receiveShadow = true;
  bodyGroup.add(hull);

  // Cabin interior tub, dashboard, bucket seats & steering wheel
  const cabinGeo = new THREE.BoxGeometry(1.54, 0.24, 1.55);
  const cabin = new THREE.Mesh(cabinGeo, leatherMat);
  cabin.position.set(0, 0.72, -0.16);
  const seatBackGeo = new THREE.BoxGeometry(0.55, 0.48, 0.16);
  const seatL = new THREE.Mesh(seatBackGeo, leatherMat);
  seatL.position.set(-0.4, 1.05, -0.58);
  seatL.rotation.x = -0.18;
  const seatR = new THREE.Mesh(seatBackGeo, leatherMat);
  seatR.position.set(0.4, 1.05, -0.58);
  seatR.rotation.x = -0.18;
  const steerGeo = new THREE.TorusGeometry(0.16, 0.025, 8, 16);
  const steerWheel = new THREE.Mesh(steerGeo, tireMat);
  steerWheel.position.set(-0.4, 1.08, 0.38);
  steerWheel.rotation.x = -0.5;
  bodyGroup.add(cabin, seatL, seatR, steerWheel);

  // Windshield glass + chrome frame + side mirrors
  const wsGeo = new THREE.BoxGeometry(1.62, 0.52, 0.06);
  const ws = new THREE.Mesh(wsGeo, glassMat);
  ws.position.set(0, 1.15, 0.74);
  ws.rotation.x = -0.48;
  const wsTopGeo = new THREE.BoxGeometry(1.7, 0.07, 0.08);
  const wsTop = new THREE.Mesh(wsTopGeo, chromeMat);
  wsTop.position.set(0, 1.38, 0.62);
  const mirrorGeo = new THREE.BoxGeometry(0.18, 0.1, 0.12);
  const mirL = new THREE.Mesh(mirrorGeo, chromeMat);
  mirL.position.set(-0.98, 0.98, 0.7);
  const mirR = new THREE.Mesh(mirrorGeo, chromeMat);
  mirR.position.set(0.98, 0.98, 0.7);
  bodyGroup.add(ws, wsTop, mirL, mirR);

  // Chrome bumpers + recessed grille + license plate
  const bumperGeo = new THREE.BoxGeometry(1.94, 0.15, 0.16);
  const fBump = new THREE.Mesh(bumperGeo, chromeMat);
  fBump.position.set(0, 0.42, 2.15);
  const rBump = new THREE.Mesh(bumperGeo, chromeMat);
  rBump.position.set(0, 0.42, -2.12);
  const grilleGeo = new THREE.BoxGeometry(0.94, 0.2, 0.08);
  const grille = new THREE.Mesh(grilleGeo, chromeMat);
  grille.position.set(0, 0.62, 2.13);
  bodyGroup.add(fBump, rBump, grille);
  disposables.push(seatBackGeo, steerGeo, wsTopGeo, mirrorGeo, grilleGeo);

  // Headlights & Taillights
  const lampGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.08, 12);
  lampGeo.rotateX(Math.PI * 0.5);
  for (const sx of [-0.66, 0.66]) {
    const hl = new THREE.Mesh(lampGeo, headlightMat);
    hl.position.set(sx, 0.66, 2.13);
    const tl = new THREE.Mesh(lampGeo, taillightMat);
    tl.position.set(sx, 0.68, -2.11);
    bodyGroup.add(hl, tl);
  }

  // Wheels + multi-spoke alloy rims + brake discs
  const tireGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 20);
  tireGeo.rotateZ(Math.PI * 0.5);
  const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.28, 14);
  rimGeo.rotateZ(Math.PI * 0.5);
  const hubGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.3, 10);
  hubGeo.rotateZ(Math.PI * 0.5);
  const wheels: THREE.Group[] = [];
  const frontSteerPivots: THREE.Group[] = [];

  const wheelPos = [
    { x: -0.94, z: 1.28, front: true },
    { x: 0.94, z: 1.28, front: true },
    { x: -0.94, z: -1.28, front: false },
    { x: 0.94, z: -1.28, front: false },
  ];
  for (const wp of wheelPos) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(wp.x, 0.36, wp.z);
    const spinPivot = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, chromeMat);
    const hub = new THREE.Mesh(hubGeo, paintMat);
    spinPivot.add(tire, rim, hub);
    steerPivot.add(spinPivot);
    group.add(steerPivot);
    wheels.push(spinPivot);
    if (wp.front) frontSteerPivots.push(steerPivot);
  }

  const cShadGeo = new THREE.PlaneGeometry(2.5, 4.7);
  cShadGeo.rotateX(-Math.PI / 2);
  const cShadMat = new THREE.MeshBasicMaterial({
    map: shadowMap,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
  });
  const cShad = new THREE.Mesh(cShadGeo, cShadMat);
  cShad.position.y = 0.03;
  group.add(cShad);

  const headlightBeam = new THREE.SpotLight(0xfff4d2, 0, 34, Math.PI / 5, 0.55, 1.4);
  if (withHeadlightSpot) {
    headlightBeam.position.set(0, 0.95, 2.05);
    headlightBeam.target.position.set(0, 0.25, 16);
    group.add(headlightBeam, headlightBeam.target);
  }

  disposables.push(
    hullGeo,
    cabinGeo,
    wsGeo,
    bumperGeo,
    lampGeo,
    tireGeo,
    rimGeo,
    hubGeo,
    cShadGeo,
    cShadMat,
  );

  return {
    group,
    bodyGroup,
    wheels,
    frontSteerPivots,
    headlightBeam,
    headlightMat,
    taillightMat,
  };
}

export function createActors(
  textures: MaterialTextureSet,
  isSoftwareGl: boolean,
): ActorsRig {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const interactables: InteractableTarget[] = [];

  const playerRig = buildHumanCharacter(
    0x27516b,
    0x383430,
    0x3b281c,
    0xe6be9e,
    true,
    textures.contactShadowMap,
    disposables,
  );
  group.add(playerRig.group);

  const carRig = buildConvertibleCar(
    0x1a5f7a,
    !isSoftwareGl,
    textures.contactShadowMap,
    disposables,
  );
  group.add(carRig.group);

  const dialogues: Record<string, NpcDialogue> = {
    npc_elena: {
      npcId: 'npc_elena',
      name: 'Elena Vance',
      role: 'Harbor Café Barista',
      greeting:
        'Welcome to Solstice Valley! Fresh espresso is brewing inside, and the morning breeze off Sapphire Bay could not be clearer.',
      options: [
        {
          label: 'Ask about hidden places to explore',
          reply:
            'Follow the coastal trail past the Lighthouse headland to find the Ancient Cliff Shrine—and check the eastern cliffs above Emerald Mountain Lake!',
          rewardCoins: 25,
        },
        {
          label: 'Ask about the coastal roadster',
          reply:
            'That teal convertible parked on the south plaza road is yours to take for a spin anytime. Drive across the Stone Arch Bridge to reach the meadows!',
        },
      ],
    },
    npc_marcus: {
      npcId: 'npc_marcus',
      name: 'Marcus Reed',
      role: 'General Storekeeper',
      greeting:
        'Good day, traveler! Step inside the store or browse provisions right here. Everything you need for the alpine ridge is stocked.',
      options: [
        {
          label: 'Browse Store Provisions & Gear',
          reply: 'Take a look at today’s coastal goods.',
          openShop: true,
        },
        {
          label: 'Ask about weather in the valley',
          reply:
            'Mountain weather shifts fast—sunny mornings can turn into dramatic thunderstorms or crisp snowfall up north. You can also adjust weather in the pause menu.',
        },
      ],
      shopItems: [
        {
          id: 'espresso',
          name: 'Harbor Roast Espresso',
          description: 'Warm coastal blend roasted in Solstice Harbor.',
          price: 10,
          category: 'provision',
        },
        {
          id: 'compass',
          name: 'Brass Horizon Compass',
          description: 'Engraved mariner compass from Lighthouse Point.',
          price: 25,
          category: 'gear',
        },
        {
          id: 'lantern',
          name: 'Stormproof Brass Lantern',
          description: 'Keeps trails bright during foggy nights.',
          price: 35,
          category: 'gear',
        },
        {
          id: 'postcard',
          name: 'Solstice Valley Postcard',
          description: 'Hand-tinted view of Sapphire Bay and the peaks.',
          price: 15,
          category: 'souvenir',
        },
      ],
    },
    npc_thorne: {
      npcId: 'npc_thorne',
      name: 'Captain Thorne',
      role: 'Harbor Master',
      greeting:
        'Steady tides today! You can walk all the way out to the end of the Timber Pier or head west up to my old Lighthouse.',
      options: [
        {
          label: 'Ask about Driftwood Cove',
          reply:
            'If you follow the sandy beach east past the river mouth, you will stumble onto Driftwood Cove—quietest spot in the whole valley.',
          rewardCoins: 20,
        },
      ],
    },
  };

  const npcDefs = [
    {
      id: 'npc_elena',
      label: 'Talk to Elena (Barista)',
      x: -9.5,
      z: -9.5,
      rotY: Math.PI * 0.5,
      jacket: 0xb04e34,
      pants: 0x292524,
      hair: 0x271911,
      skin: 0xe3b596,
    },
    {
      id: 'npc_marcus',
      label: 'Talk to Marcus (General Store)',
      x: 10.2,
      z: -11.5,
      rotY: -Math.PI * 0.5,
      jacket: 0x42543d,
      pants: 0x3b2f26,
      hair: 0x5c4738,
      skin: 0xd9a888,
    },
    {
      id: 'npc_thorne',
      label: 'Talk to Captain Thorne (Pier)',
      x: -1.4,
      z: 20.5,
      rotY: -0.35,
      jacket: 0x1e3a5f,
      pants: 0x1e293b,
      hair: 0xcbd5e1,
      skin: 0xdfb292,
    },
  ];

  const staticNpcRigs: CharacterRig[] = [];
  for (const nd of npcDefs) {
    const ny = groundHeightAt(nd.x, nd.z);
    const rig = buildHumanCharacter(
      nd.jacket,
      nd.pants,
      nd.hair,
      nd.skin,
      false,
      textures.contactShadowMap,
      disposables,
    );
    rig.group.position.set(nd.x, ny, nd.z);
    rig.group.rotation.y = nd.rotY;
    group.add(rig.group);
    staticNpcRigs.push(rig);

    interactables.push({
      id: nd.id,
      kind: 'npc',
      label: nd.label,
      x: nd.x,
      y: ny + 1.1,
      z: nd.z,
      radius: 2.8,
    });
  }

  // Strolling Townsfolk Walkers with varied gait & idle pauses
  const walkers: Array<{
    rig: CharacterRig;
    cx: number;
    cz: number;
    rx: number;
    rz: number;
    speed: number;
    phase: number;
  }> = [
    {
      rig: buildHumanCharacter(0xb8661c, 0x334155, 0x1c1917, 0xeac09e, false, textures.contactShadowMap, disposables),
      cx: 0,
      cz: -2,
      rx: 7.4,
      rz: 5.8,
      speed: 0.32,
      phase: 0,
    },
    {
      rig: buildHumanCharacter(0x52396e, 0x27272a, 0x713f12, 0xf1ccb0, false, textures.contactShadowMap, disposables),
      cx: 2,
      cz: 1.5,
      rx: 9.6,
      rz: 6.4,
      speed: -0.26,
      phase: 2.2,
    },
  ];
  for (const w of walkers) group.add(w.rig.group);

  // Autonomous Road Traffic Cars obeying Traffic Lights
  const roadCurve = new THREE.CatmullRomCurve3(
    ROAD_LOOP_POINTS.map((p) => new THREE.Vector3(p.x, groundHeightAt(p.x, p.z), p.z)),
    true,
    'catmullrom',
    0.45,
  );
  const trafficCars = [
    {
      rig: buildConvertibleCar(0x9e2323, false, textures.contactShadowMap, disposables),
      t: 0.18,
      baseSpeed: 0.022,
      curSpeed: 0.022,
    },
    {
      rig: buildConvertibleCar(0xb86b1a, false, textures.contactShadowMap, disposables),
      t: 0.64,
      baseSpeed: 0.02,
      curSpeed: 0.02,
    },
  ];
  for (const tc of trafficCars) group.add(tc.rig.group);

  // Soaring Seagulls & Hawks
  const birdBodyGeo = new THREE.ConeGeometry(0.09, 0.58, 6);
  birdBodyGeo.rotateX(Math.PI * 0.5);
  const birdWingGeo = new THREE.BoxGeometry(0.68, 0.028, 0.22);
  birdWingGeo.translate(0.34, 0, 0);
  const birdMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.72 });
  disposables.push(birdBodyGeo, birdWingGeo, birdMat);

  const birds: Array<{
    group: THREE.Group;
    leftW: THREE.Mesh;
    rightW: THREE.Mesh;
    cx: number;
    cz: number;
    radius: number;
    alt: number;
    speed: number;
    phase: number;
  }> = [];
  for (let i = 0; i < 8; i++) {
    const bg = new THREE.Group();
    const bBody = new THREE.Mesh(birdBodyGeo, birdMat);
    const lw = new THREE.Mesh(birdWingGeo, birdMat);
    const rw = new THREE.Mesh(birdWingGeo, birdMat);
    rw.scale.x = -1;
    bg.add(bBody, lw, rw);
    group.add(bg);
    birds.push({
      group: bg,
      leftW: lw,
      rightW: rw,
      cx: i % 2 === 0 ? -15 : 18,
      cz: (i % 3) * 18 - 10,
      radius: 18 + (i % 4) * 9,
      alt: 20 + (i % 3) * 6,
      speed: 0.26 + (i % 3) * 0.06,
      phase: i * 1.1,
    });
  }

  // Grazing Meadow & Forest Deer
  const deerBodyGeo = new THREE.CapsuleGeometry(0.24, 0.78, 6, 10);
  deerBodyGeo.rotateX(Math.PI * 0.5);
  const deerNeckGeo = new THREE.CylinderGeometry(0.09, 0.14, 0.55, 8);
  const deerHeadGeo = new THREE.CapsuleGeometry(0.11, 0.18, 5, 8);
  deerHeadGeo.rotateX(Math.PI * 0.5);
  const deerLegGeo = new THREE.CylinderGeometry(0.045, 0.032, 0.68, 8);
  const deerMat = new THREE.MeshStandardMaterial({ color: 0x8f623d, roughness: 0.86 });
  disposables.push(deerBodyGeo, deerNeckGeo, deerHeadGeo, deerLegGeo, deerMat);

  const deerList: Array<{
    group: THREE.Group;
    neckPivot: THREE.Group;
    cx: number;
    cz: number;
    phase: number;
  }> = [];
  const deerZones = [
    { x: -34, z: -8 },
    { x: -29, z: -20 },
    { x: 46, z: -18 },
    { x: 52, z: -10 },
  ];
  deerZones.forEach((dz, i) => {
    const dg = new THREE.Group();
    const dBody = new THREE.Mesh(deerBodyGeo, deerMat);
    dBody.position.y = 0.82;
    dBody.castShadow = !isSoftwareGl;
    const neckPivot = new THREE.Group();
    neckPivot.position.set(0, 0.94, 0.4);
    const dNeck = new THREE.Mesh(deerNeckGeo, deerMat);
    dNeck.position.set(0, 0.22, 0.1);
    dNeck.rotation.x = 0.42;
    const dHead = new THREE.Mesh(deerHeadGeo, deerMat);
    dHead.position.set(0, 0.45, 0.26);
    neckPivot.add(dNeck, dHead);
    dg.add(dBody, neckPivot);
    for (const lx of [-0.16, 0.16]) {
      for (const lz of [-0.38, 0.38]) {
        const leg = new THREE.Mesh(deerLegGeo, deerMat);
        leg.position.set(lx, 0.34, lz);
        dg.add(leg);
      }
    }
    group.add(dg);
    deerList.push({ group: dg, neckPivot, cx: dz.x, cz: dz.z, phase: i * 1.6 });
  });

  const _pt = new THREE.Vector3();
  const _tan = new THREE.Vector3();

  const updatePlayerVisual = (
    x: number,
    y: number,
    z: number,
    heading: number,
    walkDistance: number,
    isMoving: boolean,
    isSprinting: boolean,
    grounded: boolean,
    landingSquash: number,
    elapsed: number,
    visible: boolean,
  ) => {
    playerRig.group.visible = visible;
    if (!visible) return;

    playerRig.group.position.set(x, y, z);
    playerRig.group.rotation.y = heading;

    const strideFreq = 2.6;
    const swingAmp = isMoving ? (isSprinting ? 0.85 : 0.58) : 0;
    const phase = walkDistance * strideFreq;

    if (!grounded) {
      playerRig.leftLeg.rotation.x = 0.35;
      playerRig.rightLeg.rotation.x = -0.25;
      playerRig.leftKnee.rotation.x = 0.45;
      playerRig.rightKnee.rotation.x = 0.25;
      playerRig.leftArm.rotation.x = -0.65;
      playerRig.rightArm.rotation.x = -0.65;
      playerRig.leftForearm.rotation.x = -0.4;
      playerRig.rightForearm.rotation.x = -0.4;
      playerRig.bodyPivot.position.y = 0;
    } else if (isMoving) {
      const s = Math.sin(phase);
      playerRig.leftLeg.rotation.x = s * swingAmp;
      playerRig.rightLeg.rotation.x = -s * swingAmp;
      playerRig.leftKnee.rotation.x = Math.max(0, -s) * (isSprinting ? 0.85 : 0.48);
      playerRig.rightKnee.rotation.x = Math.max(0, s) * (isSprinting ? 0.85 : 0.48);
      playerRig.leftArm.rotation.x = -s * swingAmp * 0.82;
      playerRig.rightArm.rotation.x = s * swingAmp * 0.82;
      playerRig.leftForearm.rotation.x = -0.22 - Math.max(0, -s) * 0.35;
      playerRig.rightForearm.rotation.x = -0.22 - Math.max(0, s) * 0.35;
      playerRig.bodyPivot.position.y = Math.abs(Math.cos(phase)) * (isSprinting ? 0.08 : 0.045);
    } else {
      playerRig.leftLeg.rotation.x *= 0.85;
      playerRig.rightLeg.rotation.x *= 0.85;
      playerRig.leftKnee.rotation.x *= 0.85;
      playerRig.rightKnee.rotation.x *= 0.85;
      playerRig.leftArm.rotation.x = Math.sin(elapsed * 1.6) * 0.03;
      playerRig.rightArm.rotation.x = -Math.sin(elapsed * 1.6) * 0.03;
      playerRig.leftForearm.rotation.x = -0.14;
      playerRig.rightForearm.rotation.x = -0.14;
      playerRig.bodyPivot.position.y = Math.sin(elapsed * 2.1) * 0.015;
    }

    const sy = 1 - landingSquash * 0.16;
    const sxz = 1 + landingSquash * 0.1;
    playerRig.bodyPivot.scale.set(sxz, sy, sxz);

    const gY = groundHeightAt(x, z);
    const airHeight = Math.max(0, y - gY);
    playerRig.shadowDisc.position.y = -airHeight + 0.025;
    const shadScale = Math.max(0.4, 1 - airHeight * 0.22);
    playerRig.shadowDisc.scale.setScalar(shadScale);
  };

  const updateVehicleVisual = (
    x: number,
    y: number,
    z: number,
    heading: number,
    steerAngle: number,
    wheelSpin: number,
    isDriving: boolean,
    isNight: boolean,
    speed: number,
  ) => {
    carRig.group.position.set(x, y, z);
    carRig.group.rotation.y = heading;

    // Subtle body suspension pitch/roll on speed & steering
    carRig.bodyGroup.rotation.z = -steerAngle * Math.min(1, Math.abs(speed) / 14) * 0.08;
    carRig.bodyGroup.rotation.x = Math.sin(wheelSpin * 0.5) * (Math.abs(speed) > 1 ? 0.008 : 0);

    for (const fp of carRig.frontSteerPivots) {
      fp.rotation.y = steerAngle;
    }
    for (const w of carRig.wheels) {
      w.rotation.x = wheelSpin;
    }

    const lightsOn = isNight || isDriving;
    carRig.headlightMat.emissiveIntensity = lightsOn ? 2.4 : 0.2;
    carRig.taillightMat.emissiveIntensity = isDriving ? 2.0 : 0.35;
    carRig.headlightBeam.intensity = isNight && isDriving ? 4.8 : 0;
  };

  const updateLivingWorld = (dt: number, elapsed: number, isNight: boolean) => {
    staticNpcRigs.forEach((rig, idx) => {
      rig.head.rotation.y = Math.sin(elapsed * 0.9 + idx) * 0.24;
      rig.bodyPivot.position.y = Math.sin(elapsed * 2.0 + idx) * 0.012;
    });

    for (const w of walkers) {
      const a = elapsed * w.speed + w.phase;
      const nx = w.cx + Math.cos(a) * w.rx;
      const nz = w.cz + Math.sin(a) * w.rz;
      const ny = groundHeightAt(nx, nz);
      const dx = -Math.sin(a) * w.rx * w.speed;
      const dz = Math.cos(a) * w.rz * w.speed;
      w.rig.group.position.set(nx, ny, nz);
      w.rig.group.rotation.y = Math.atan2(dx, dz);
      const walkP = elapsed * 5.2 + w.phase;
      const s = Math.sin(walkP);
      w.rig.leftLeg.rotation.x = s * 0.52;
      w.rig.rightLeg.rotation.x = -s * 0.52;
      w.rig.leftKnee.rotation.x = Math.max(0, -s) * 0.42;
      w.rig.rightKnee.rotation.x = Math.max(0, s) * 0.42;
      w.rig.leftArm.rotation.x = -s * 0.42;
      w.rig.rightArm.rotation.x = s * 0.42;
    }

    // Autonomous road traffic obeys traffic lights at East Plaza Intersection (t ~ 0.08..0.11)
    const signal = computeTrafficLightCycle(elapsed);
    for (const tc of trafficCars) {
      const approachingEastStop = tc.t > 0.06 && tc.t < 0.095;
      const approachingWestStop = tc.t > 0.87 && tc.t < 0.905;
      const mustStop =
        (approachingEastStop || approachingWestStop) && signal.ewAspect !== 'green';
      const targetSpd = mustStop ? 0 : tc.baseSpeed;
      tc.curSpeed += (targetSpd - tc.curSpeed) * (1 - Math.exp(-5.0 * dt));

      tc.t = (tc.t + tc.curSpeed * dt) % 1;
      roadCurve.getPointAt(tc.t, _pt);
      roadCurve.getTangentAt(tc.t, _tan);
      const y = groundHeightAt(_pt.x, _pt.z);
      tc.rig.group.position.set(_pt.x, y, _pt.z);
      tc.rig.group.rotation.y = Math.atan2(_tan.x, _tan.z);
      const spinStep = dt * (tc.curSpeed / tc.baseSpeed) * 10;
      for (const w of tc.rig.wheels) w.rotation.x += spinStep;
      tc.rig.headlightMat.emissiveIntensity = isNight ? 2.6 : 0.4;
      tc.rig.taillightMat.emissiveIntensity = mustStop ? 2.6 : 1.2;
    }

    for (const b of birds) {
      const a = elapsed * b.speed + b.phase;
      const bx = b.cx + Math.cos(a) * b.radius;
      const bz = b.cz + Math.sin(a) * b.radius;
      const by = b.alt + Math.sin(elapsed * 0.8 + b.phase) * 1.8;
      b.group.position.set(bx, by, bz);
      b.group.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a));
      // Alternate flapping and gliding phases naturally
      const glideGate = Math.sin(elapsed * 0.45 + b.phase) > -0.25 ? 1 : 0.12;
      const flap = Math.sin(elapsed * 7.5 + b.phase) * 0.52 * glideGate;
      b.leftW.rotation.z = flap;
      b.rightW.rotation.z = -flap;
    }

    for (const d of deerList) {
      const a = elapsed * 0.16 + d.phase;
      const dx = d.cx + Math.cos(a) * 3.8;
      const dz = d.cz + Math.sin(a * 0.8) * 3.2;
      d.group.position.set(dx, groundHeightAt(dx, dz), dz);
      d.group.rotation.y = Math.atan2(-Math.sin(a) * 3.8, Math.cos(a * 0.8) * 3.2);
      // Natural grazing head dip
      d.neckPivot.rotation.x = Math.max(0, Math.sin(elapsed * 0.7 + d.phase)) * 0.75;
    }
  };

  return {
    group,
    playerRig,
    carRig,
    interactables,
    dialogues,
    updatePlayerVisual,
    updateVehicleVisual,
    updateLivingWorld,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
