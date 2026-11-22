import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createActors } from './actors';
import { createArchitecture } from './architecture';
import { createAtmosphereRig } from './atmosphere';
import { WorldAudioEngine } from './audio';
import {
  clamp,
  classifyBiomeAt,
  distanceToRoad,
  getLocationAt,
  groundHeightAt,
  isPointIndoors,
  SECRET_LOCATIONS,
} from './math';
import { createPropsAndFoliage } from './propsAndFoliage';
import {
  checkDiscoveries,
  createInitialPlayerState,
  createInitialVehicleState,
  stepPlayerSimulation,
  stepVehicleSimulation,
} from './simulation';
import { createTerrainAndWater } from './terrain';
import { createProceduralTextures } from './textures';
import type {
  CameraMode,
  GamePhase,
  HudSnapshot,
  InteractableTarget,
  NpcDialogue,
  WeatherType,
  WorldSettings,
} from './types';

export interface WorldCallbacks {
  onReady: () => void;
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onPhaseChange: (phase: GamePhase) => void;
  onDiscovery: (locationName: string) => void;
  onOpenDialogue: (dialogue: NpcDialogue) => void;
}

const WEATHER_CYCLE: WeatherType[] = [
  'clear',
  'cloudy',
  'foggy',
  'rain',
  'thunderstorm',
  'snow',
];

const _camTarget = new THREE.Vector3();
const _camDesired = new THREE.Vector3();
const _camLook = new THREE.Vector3();
const _rayDir = new THREE.Vector3();

export class WorldEngine {
  private container: HTMLElement;
  private callbacks: WorldCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private isSoftwareGl: boolean;

  private audio = new WorldAudioEngine();
  private textures: ReturnType<typeof createProceduralTextures>;
  private atmosphere: ReturnType<typeof createAtmosphereRig>;
  private terrain: ReturnType<typeof createTerrainAndWater>;
  private architecture: ReturnType<typeof createArchitecture>;
  private props: ReturnType<typeof createPropsAndFoliage>;
  private actors: ReturnType<typeof createActors>;

  private allBoxes: ReturnType<typeof createArchitecture>['colliders'];
  private allCylinders: ReturnType<typeof createPropsAndFoliage>['colliders'];
  private allInteractables: InteractableTarget[];
  private cameraRaycaster = new THREE.Raycaster();
  private occluderMeshes: THREE.Object3D[] = [];

  private player = createInitialPlayerState();
  private vehicle = createInitialVehicleState();
  private isDriving = false;
  private cameraMode: CameraMode = 'third';
  private isIndoors = false;
  private wetness = 0;
  private snowAccum = 0;
  private lastWeather: WeatherType;

  private discovered = new Set<string>();
  private coins = 50;
  private inventory: string[] = [];
  private activeDialogue: NpcDialogue | null = null;

  private phase: GamePhase = 'title';
  private settings: WorldSettings;
  private weatherAutoTimer = 55;

  private cameraYaw = Math.PI - 0.32; // Facing south-east toward bay & lighthouse
  private cameraPitch = 0.28;
  private cameraDistance = 6.2;
  private camPosCurrent = new THREE.Vector3(0, 12, -10);
  private camLookCurrent = new THREE.Vector3(0, 5, 10);

  private keysHeld = new Set<string>();
  private jumpJustPressed = false;
  private isDraggingMouse = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  private frameId = 0;
  private disposed = false;
  private lastTimeMs = performance.now();
  private elapsedSec = 0;
  private lastHudPushSec = 0;
  private stepDistAccum = 0;

  constructor(
    container: HTMLElement,
    initialSettings: WorldSettings,
    initialPhase: GamePhase,
    callbacks: WorldCallbacks,
  ) {
    this.container = container;
    this.settings = { ...initialSettings };
    this.lastWeather = initialSettings.weather;
    this.phase = initialPhase;
    this.callbacks = callbacks;

    this.isSoftwareGl = (() => {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.environmentIntensity = 0.52;
    this.camera = new THREE.PerspectiveCamera(62, w / h, 0.12, 480);

    // Natural Outdoor Sky-Dome IBL Environment (avoids studio softbox white rectangles on wet roads)
    const envScene = new THREE.Scene();
    const envGeo = new THREE.SphereGeometry(40, 24, 16);
    const envMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {},
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vDir;
        void main() {
          float y = vDir.y;
          vec3 zenith = vec3(0.32, 0.56, 0.85);
          vec3 horizon = vec3(0.76, 0.84, 0.92);
          vec3 ground = vec3(0.18, 0.22, 0.16);
          vec3 col = y >= 0.0
            ? mix(horizon, zenith, pow(clamp(y, 0.0, 1.0), 0.6))
            : mix(horizon * 0.65, ground, clamp(-y * 3.0, 0.0, 1.0));
          // Subtle soft solar warmth without harsh rectangular studio glare
          vec3 sunDir = normalize(vec3(0.45, 0.52, -0.72));
          float sunDot = max(0.0, dot(normalize(vDir), sunDir));
          col += vec3(0.95, 0.86, 0.72) * pow(sunDot, 24.0) * 0.65;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const envDome = new THREE.Mesh(envGeo, envMat);
    envScene.add(envDome);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(envScene, 0.035).texture;
    pmrem.dispose();
    envGeo.dispose();
    envMat.dispose();

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);
    this.atmosphere = createAtmosphereRig(this.scene, this.isSoftwareGl);
    this.terrain = createTerrainAndWater(this.textures);
    this.architecture = createArchitecture(this.textures);
    this.props = createPropsAndFoliage(this.textures, this.isSoftwareGl);
    this.actors = createActors(this.textures, this.isSoftwareGl);

    this.scene.add(
      this.terrain.group,
      this.architecture.group,
      this.props.group,
      this.actors.group,
    );

    this.applyQualityToRenderer();

    this.allBoxes = [...this.terrain.colliders, ...this.architecture.colliders];
    this.allCylinders = [...this.props.colliders];
    this.allInteractables = [
      ...this.architecture.interactables,
      ...this.actors.interactables,
      {
        id: 'coastal_convertible',
        kind: 'vehicle',
        label: 'Drive Coastal Convertible',
        x: this.vehicle.x,
        y: this.vehicle.y + 0.8,
        z: this.vehicle.z,
        radius: 3.2,
      },
    ];

    // Collect architectural meshes for camera occlusion pull-in
    this.architecture.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        this.occluderMeshes.push(obj);
      }
    });

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.snapCameraToPlayer();
    this.lastTimeMs = performance.now();
    // Run initial update + draw synchronously before reporting ready so frame 0 is never black
    this.atmosphere.update(
      0.016,
      0,
      this.settings.timeOfDay,
      this.settings.weather,
      0,
      12,
      false,
    );
    this.terrain.updateWater(0, false, this.atmosphere.fog.color.getHex(), 0, 0);
    if (this.phase === 'title') {
      this.camera.position.set(0, 23, 74);
      this.camera.lookAt(-8, 6, -4);
    }
    this.renderer.render(this.scene, this.camera);
    this.callbacks.onReady();
    this.pushHudSnapshot(true);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private applyQualityToRenderer(): void {
    const q = this.settings.quality;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;

    if (this.isSoftwareGl) {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.disposeComposer();
      return;
    }

    const maxDpr =
      q === 'cinematic'
        ? 2.25
        : q === 'ultra'
          ? 2
          : q === 'high'
            ? 1.5
            : q === 'medium'
              ? 1.25
              : 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    this.renderer.shadowMap.enabled = q !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const shadowRes =
      q === 'cinematic'
        ? 4096
        : q === 'ultra' || q === 'high'
          ? 2048
          : 1024;
    if (this.atmosphere.sunLight.shadow.mapSize.x !== shadowRes) {
      this.atmosphere.sunLight.shadow.mapSize.set(shadowRes, shadowRes);
      if (this.atmosphere.sunLight.shadow.map) {
        this.atmosphere.sunLight.shadow.map.dispose();
        this.atmosphere.sunLight.shadow.map = null;
      }
    }

    if (q === 'ultra' || q === 'cinematic') {
      if (!this.composer) {
        const composer = new EffectComposer(this.renderer);
        const renderPass = new RenderPass(this.scene, this.camera);
        const bloomPass = new UnrealBloomPass(
          new THREE.Vector2(w, h),
          q === 'cinematic' ? 0.18 : 0.12,
          0.35,
          0.93,
        );
        const outputPass = new OutputPass();
        composer.addPass(renderPass);
        composer.addPass(bloomPass);
        composer.addPass(outputPass);
        this.composer = composer;
        this.bloomPass = bloomPass;
      } else if (this.bloomPass) {
        this.bloomPass.strength = q === 'cinematic' ? 0.18 : 0.12;
      }
      this.composer.setSize(w, h);
    } else {
      this.disposeComposer();
    }
  }

  private disposeComposer(): void {
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
      this.bloomPass = null;
    }
  }

  public updateSettings(next: WorldSettings): void {
    const qualityChanged = next.quality !== this.settings.quality;
    const weatherChanged = next.weather !== this.settings.weather;
    this.settings = { ...next };
    this.audio.setVolume(next.volume, next.muted);

    if (weatherChanged) {
      // Immediate noticeable surface response when weather is changed explicitly
      if (next.weather === 'rain' || next.weather === 'thunderstorm') {
        this.wetness = Math.max(this.wetness, 0.72);
        this.snowAccum = 0;
      } else if (next.weather === 'snow') {
        this.snowAccum = Math.max(this.snowAccum, 0.68);
        this.wetness = 0;
      } else {
        this.wetness = 0;
        this.snowAccum = 0;
      }
      this.lastWeather = next.weather;
    }

    if (qualityChanged) {
      this.applyQualityToRenderer();
    }
    this.pushHudSnapshot(true);
  }

  public toggleCameraMode(): void {
    this.cameraMode = this.cameraMode === 'third' ? 'first' : 'third';
    if (this.cameraMode === 'first') {
      if (this.cameraPitch > 0.22) this.cameraPitch = 0.04;
      this.camera.fov = 68;
    } else {
      this.cameraPitch = Math.max(0.22, this.cameraPitch);
      this.camera.fov = 62;
    }
    this.camera.updateProjectionMatrix();
    this.snapCameraToPlayer();
    this.pushHudSnapshot(true);
  }

  public setPhase(nextPhase: GamePhase): void {
    this.phase = nextPhase;
    if (nextPhase === 'playing') {
      this.audio.unlock();
      this.keysHeld.clear();
      this.snapCameraToPlayer();
    } else {
      this.keysHeld.clear();
      this.isDraggingMouse = false;
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock?.();
      }
    }
    this.pushHudSnapshot(true);
  }

  public closeDialogue(): void {
    this.activeDialogue = null;
    this.pushHudSnapshot(true);
  }

  public grantCoins(amount: number): void {
    this.coins += amount;
    this.audio.playInteract('chime');
    this.pushHudSnapshot(true);
  }

  public buyShopItem(_itemId: string, name: string, price: number): boolean {
    if (this.coins < price) return false;
    this.coins -= price;
    this.inventory = [...this.inventory, name];
    this.audio.playInteract('chime');
    this.pushHudSnapshot(true);
    return true;
  }

  public triggerInteract(): void {
    if (this.phase !== 'playing') return;
    this.audio.unlock();

    if (this.activeDialogue) {
      this.closeDialogue();
      return;
    }

    if (this.isDriving) {
      this.exitVehicle();
      return;
    }

    const nearest = this.findNearestInteractable();
    if (!nearest) return;

    if (nearest.kind === 'door') {
      this.architecture.toggleDoor(nearest.id);
      this.audio.playInteract('door');
    } else if (nearest.kind === 'vehicle') {
      this.enterVehicle();
    } else if (nearest.kind === 'npc') {
      const dlg = this.actors.dialogues[nearest.id];
      if (dlg) {
        this.activeDialogue = dlg;
        this.audio.playInteract('ui');
        this.callbacks.onOpenDialogue(dlg);
      }
    } else if (nearest.kind === 'shrine') {
      this.audio.playInteract('chime');
      if (!this.discovered.has('cliff_shrine')) {
        this.discovered.add('cliff_shrine');
        this.coins += 40;
        this.callbacks.onDiscovery('Ancient Cliff Shrine (+40 Coins)');
      } else {
        this.callbacks.onDiscovery('The Ancient Shrine hums with coastal light.');
      }
    }
    this.pushHudSnapshot(true);
  }

  private enterVehicle(): void {
    this.isDriving = true;
    this.audio.playInteract('door');
    this.pushHudSnapshot(true);
  }

  private exitVehicle(): void {
    this.isDriving = false;
    // Place player safely to the left side of the car
    const sideX = this.vehicle.x - Math.cos(this.vehicle.heading) * 2.1;
    const sideZ = this.vehicle.z + Math.sin(this.vehicle.heading) * 2.1;
    this.player.x = sideX;
    this.player.z = sideZ;
    this.player.y = groundHeightAt(sideX, sideZ);
    this.player.vx = 0;
    this.player.vz = 0;
    this.player.vy = 0;
    this.audio.playInteract('door');
    this.pushHudSnapshot(true);
  }

  private snapCameraToPlayer(): void {
    const sinY = Math.sin(this.cameraYaw);
    const cosY = Math.cos(this.cameraYaw);
    const cosP = Math.cos(this.cameraPitch);
    const sinP = Math.sin(this.cameraPitch);

    if (this.cameraMode === 'first') {
      if (this.isDriving) {
        const ey = this.vehicle.y + 1.24;
        const ex =
          this.vehicle.x -
          Math.cos(this.vehicle.heading) * 0.38 -
          Math.sin(this.vehicle.heading) * 0.15;
        const ez =
          this.vehicle.z +
          Math.sin(this.vehicle.heading) * 0.38 -
          Math.cos(this.vehicle.heading) * 0.15;
        this.camPosCurrent.set(ex, ey, ez);
        this.camLookCurrent.set(
          ex - sinY * cosP * 10,
          ey - sinP * 10,
          ez - cosY * cosP * 10,
        );
      } else {
        const ey = this.player.y + 1.62;
        this.camPosCurrent.set(this.player.x, ey, this.player.z);
        this.camLookCurrent.set(
          this.player.x - sinY * cosP * 10,
          ey - sinP * 10,
          this.player.z - cosY * cosP * 10,
        );
      }
      this.camera.position.copy(this.camPosCurrent);
      this.camera.lookAt(this.camLookCurrent);
      return;
    }

    const focusX = this.isDriving ? this.vehicle.x : this.player.x;
    const focusY = (this.isDriving ? this.vehicle.y : this.player.y) + 1.5;
    const focusZ = this.isDriving ? this.vehicle.z : this.player.z;
    const dist = this.isDriving ? 7.8 : this.cameraDistance;

    this.camLookCurrent.set(focusX, focusY, focusZ);
    this.camPosCurrent.set(
      focusX + sinY * cosP * dist,
      focusY + sinP * dist,
      focusZ + cosY * cosP * dist,
    );
    this.camera.position.copy(this.camPosCurrent);
    this.camera.lookAt(this.camLookCurrent);
  }

  private findNearestInteractable(): InteractableTarget | null {
    if (this.isDriving) return null;
    const carInter = this.allInteractables.find((i) => i.id === 'coastal_convertible');
    if (carInter) {
      carInter.x = this.vehicle.x;
      carInter.y = this.vehicle.y + 0.8;
      carInter.z = this.vehicle.z;
    }

    let best: InteractableTarget | null = null;
    let bestDist = Infinity;
    for (const item of this.allInteractables) {
      const d = Math.hypot(
        this.player.x - item.x,
        this.player.z - item.z,
      );
      if (d <= item.radius && d < bestDist) {
        bestDist = d;
        best = item;
      }
    }
    return best;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (
      e.repeat &&
      (e.code === 'Space' ||
        e.code === 'KeyE' ||
        e.code === 'KeyF' ||
        e.code === 'KeyV' ||
        e.code === 'Escape')
    ) {
      return;
    }

    if (e.code === 'Escape') {
      if (this.activeDialogue) {
        this.closeDialogue();
        return;
      }
      if (this.phase === 'playing') {
        this.setPhase('paused');
        this.callbacks.onPhaseChange('paused');
      } else if (this.phase === 'paused') {
        this.setPhase('playing');
        this.callbacks.onPhaseChange('playing');
      }
      return;
    }

    if (this.phase !== 'playing') return;

    this.audio.unlock();
    this.keysHeld.add(e.code);

    if (e.code === 'Space') {
      this.jumpJustPressed = true;
    } else if (e.code === 'KeyF' || e.code === 'KeyE') {
      this.triggerInteract();
    } else if (e.code === 'KeyV') {
      this.toggleCameraMode();
    } else if (e.code === 'KeyM') {
      this.updateSettings({ ...this.settings, muted: !this.settings.muted });
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keysHeld.delete(e.code);
  };

  private onBlur = () => {
    this.keysHeld.clear();
    this.isDraggingMouse = false;
  };

  private onVisibilityChange = () => {
    if (document.hidden) {
      this.keysHeld.clear();
      this.isDraggingMouse = false;
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.phase !== 'playing' || this.activeDialogue) return;
    if (e.target !== this.renderer.domElement) return;
    this.audio.unlock();
    this.isDraggingMouse = true;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    if (document.pointerLockElement !== this.renderer.domElement && e.button === 0) {
      try {
        this.renderer.domElement.requestPointerLock?.();
      } catch {
        // Fallback to drag look
      }
    }
  };

  private onPointerUp = () => {
    this.isDraggingMouse = false;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.phase !== 'playing' || this.activeDialogue) return;
    const locked = document.pointerLockElement === this.renderer.domElement;
    if (!locked && !this.isDraggingMouse) return;

    const dx = locked ? e.movementX : e.clientX - this.lastMouseX;
    const dy = locked ? e.movementY : e.clientY - this.lastMouseY;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;

    this.cameraYaw -= dx * 0.0042;
    const minPitch = this.cameraMode === 'first' ? -1.1 : -0.18;
    const maxPitch = this.cameraMode === 'first' ? 1.1 : 1.05;
    this.cameraPitch = clamp(this.cameraPitch + dy * 0.0032, minPitch, maxPitch);
  };

  private onWheel = (e: WheelEvent) => {
    if (this.phase !== 'playing') return;
    if (this.cameraMode === 'third') {
      this.cameraDistance = clamp(this.cameraDistance + e.deltaY * 0.005, 3.4, 13.0);
    }
  };

  private onResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    if (!this.disposed) {
      if (this.composer) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    }
  };

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('resize', this.onResize);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: true });
  }

  private unbindEvents(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('resize', this.onResize);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('wheel', this.onWheel);
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = () => {
    if (this.disposed) return;

    const nowMs = performance.now();
    const rawDt = (nowMs - this.lastTimeMs) / 1000;
    this.lastTimeMs = nowMs;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    if (this.phase !== 'paused') {
      this.elapsedSec += dt;

      // Advance dynamic time-of-day
      if (this.settings.autoTime && this.phase === 'playing') {
        this.settings.timeOfDay =
          (this.settings.timeOfDay + (dt * this.settings.timeSpeed) / 60) % 24;
      }

      // Dynamic weather cycle when enabled
      if (this.settings.autoWeather && this.phase === 'playing') {
        this.weatherAutoTimer -= dt;
        if (this.weatherAutoTimer <= 0) {
          this.weatherAutoTimer = 50;
          const idx = WEATHER_CYCLE.indexOf(this.settings.weather);
          this.settings.weather = WEATHER_CYCLE[(idx + 1) % WEATHER_CYCLE.length];
        }
      }

      // Step simulation when playing
      if (this.phase === 'playing' && !this.activeDialogue) {
        const intent = {
          forward: this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp'),
          backward: this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown'),
          left: this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft'),
          right: this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight'),
          sprint:
            this.keysHeld.has('ShiftLeft') || this.keysHeld.has('ShiftRight'),
          jumpHeld: this.keysHeld.has('Space'),
          jumpJustPressed: this.jumpJustPressed,
          cameraYaw: this.cameraYaw,
        };
        this.jumpJustPressed = false;

        if (this.isDriving) {
          stepVehicleSimulation(
            this.vehicle,
            intent,
            dt,
            this.allBoxes,
            this.allCylinders,
          );
          this.player.x = this.vehicle.x;
          this.player.y = this.vehicle.y + 0.5;
          this.player.z = this.vehicle.z;
          this.player.heading = this.vehicle.heading;
          if (!this.isDraggingMouse && Math.abs(this.vehicle.speed) > 2.5) {
            const behindYaw = this.vehicle.heading + Math.PI;
            let diff = (behindYaw - this.cameraYaw) % (Math.PI * 2);
            if (diff > Math.PI) diff -= Math.PI * 2;
            if (diff < -Math.PI) diff += Math.PI * 2;
            this.cameraYaw += diff * (1 - Math.exp(-2.2 * dt));
          }
        } else {
          const prevWalk = this.player.walkDistance;
          const { jumped, landed } = stepPlayerSimulation(
            this.player,
            intent,
            dt,
            this.allBoxes,
            this.allCylinders,
          );
          if (jumped) this.audio.playJump();
          if (landed) this.audio.playLand();

          this.stepDistAccum += this.player.walkDistance - prevWalk;
          if (this.stepDistAccum > 1.75) {
            this.stepDistAccum = 0;
            const biome = classifyBiomeAt(this.player.x, this.player.z);
            const isWetGround =
              this.wetness > 0.35 &&
              !this.isIndoors &&
              (biome === 'plaza' || biome === 'road');
            const surf = isWetGround
              ? 'wet'
              : this.isIndoors
                ? 'wood'
                : biome === 'plaza' || biome === 'road'
                  ? 'stone'
                  : biome === 'beach'
                    ? 'sand'
                    : 'grass';
            this.audio.playFootstep(surf, this.isIndoors);
          }
        }

        const newlyFound = checkDiscoveries(
          this.player.x,
          this.player.z,
          this.discovered,
        );
        if (newlyFound) {
          this.coins += 30;
          this.audio.playInteract('chime');
          this.callbacks.onDiscovery(`Discovered ${newlyFound} (+30 Coins)`);
          this.pushHudSnapshot(true);
        }
      } else {
        this.jumpJustPressed = false;
      }

      const indoorsCheck = isPointIndoors(this.player.x, this.player.y, this.player.z);
      this.isIndoors = !this.isDriving && this.phase === 'playing' && indoorsCheck.indoors;

      // Dynamic weather adjustment: high altitude alpine peaks get snow aura in rain
      const effectiveWeather: WeatherType =
        this.player.y > 24 && this.settings.weather === 'rain'
          ? 'snow'
          : this.settings.weather;

      if (effectiveWeather !== this.lastWeather) {
        if (effectiveWeather === 'rain' || effectiveWeather === 'thunderstorm') {
          this.wetness = Math.max(this.wetness, 0.65);
        } else if (effectiveWeather === 'snow') {
          this.snowAccum = Math.max(this.snowAccum, 0.55);
        }
        this.lastWeather = effectiveWeather;
      }

      // Smoothly update wet puddle & snow accumulation state
      const targetWet =
        effectiveWeather === 'thunderstorm'
          ? 1.0
          : effectiveWeather === 'rain'
            ? 0.9
            : 0.0;
      const wetRate = targetWet > this.wetness ? 0.55 : 0.14;
      this.wetness += (targetWet - this.wetness) * (1 - Math.exp(-wetRate * dt));

      const targetSnow = effectiveWeather === 'snow' ? 1.0 : 0.0;
      const snowRate = targetSnow > this.snowAccum ? 0.45 : 0.18;
      this.snowAccum += (targetSnow - this.snowAccum) * (1 - Math.exp(-snowRate * dt));

      const focusX =
        this.phase === 'title' ? 0 : this.isDriving ? this.vehicle.x : this.player.x;
      const focusZ =
        this.phase === 'title' ? 12 : this.isDriving ? this.vehicle.z : this.player.z;

      const { isNight, targetExposure, targetEnvIntensity } = this.atmosphere.update(
        dt,
        this.elapsedSec,
        this.settings.timeOfDay,
        effectiveWeather,
        focusX,
        focusZ,
        this.isIndoors,
        () => this.audio.playInteract('thunder'),
      );

      // Smooth eye exposure adaptation & IBL calibration
      const expAlpha = 1 - Math.exp(-2.6 * dt);
      this.renderer.toneMappingExposure +=
        (targetExposure - this.renderer.toneMappingExposure) * expAlpha;
      this.scene.environmentIntensity +=
        (targetEnvIntensity - this.scene.environmentIntensity) * expAlpha;

      this.terrain.updateWater(
        this.elapsedSec,
        isNight,
        this.atmosphere.fog.color.getHex(),
        this.wetness,
        this.snowAccum,
      );
      this.architecture.update(dt, this.elapsedSec, isNight, this.snowAccum);

      const windStrength =
        effectiveWeather === 'thunderstorm'
          ? 2.2
          : effectiveWeather === 'rain'
            ? 1.5
            : effectiveWeather === 'cloudy'
              ? 1.15
              : 0.9;
      this.props.update(this.elapsedSec, isNight, windStrength, this.snowAccum);

      this.actors.updatePlayerVisual(
        this.player.x,
        this.player.y,
        this.player.z,
        this.player.heading,
        this.player.walkDistance,
        this.player.isMoving,
        this.player.isSprinting,
        this.player.grounded,
        this.player.landingSquash,
        this.elapsedSec,
        !this.isDriving && this.cameraMode === 'third',
      );

      this.actors.updateVehicleVisual(
        this.vehicle.x,
        this.vehicle.y,
        this.vehicle.z,
        this.vehicle.heading,
        this.vehicle.steerAngle,
        this.vehicle.wheelSpin,
        this.isDriving,
        isNight,
        this.vehicle.speed,
      );

      this.actors.updateLivingWorld(dt, this.elapsedSec, isNight);

      // Update procedural ambience audio
      const distToShore = Math.max(0, 30 - this.player.z);
      const distToRoad = distanceToRoad(this.player.x, this.player.z).distance;
      this.audio.updateAmbience(
        this.elapsedSec,
        distToShore,
        effectiveWeather,
        isNight,
        this.isDriving,
        this.vehicle.speed,
        false,
        windStrength,
        this.isIndoors,
        distToRoad,
      );

      // Camera positioning (Title Flyover / First-Person / Third-Person)
      if (this.phase === 'title') {
        const t = this.elapsedSec * 0.11;
        const camX = Math.sin(t) * 56;
        const camZ = 48 + Math.cos(t * 0.8) * 26;
        const camY = 23 + Math.sin(t * 1.4) * 5;
        this.camera.position.set(camX, camY, camZ);
        this.camera.lookAt(-8, 6, -4);
      } else if (this.cameraMode === 'first') {
        const sinY = Math.sin(this.cameraYaw);
        const cosY = Math.cos(this.cameraYaw);
        const cosP = Math.cos(this.cameraPitch);
        const sinP = Math.sin(this.cameraPitch);

        if (this.isDriving) {
          const ey = this.vehicle.y + 1.24;
          const ex =
            this.vehicle.x -
            Math.cos(this.vehicle.heading) * 0.38 -
            Math.sin(this.vehicle.heading) * 0.15;
          const ez =
            this.vehicle.z +
            Math.sin(this.vehicle.heading) * 0.38 -
            Math.cos(this.vehicle.heading) * 0.15;
          this.camPosCurrent.set(ex, ey, ez);
          _camLook.set(
            ex - sinY * cosP * 12,
            ey - sinP * 12,
            ez - cosY * cosP * 12,
          );
        } else {
          const headBob =
            this.player.isMoving && this.player.grounded
              ? Math.sin(this.player.walkDistance * 2.6) *
                (this.player.isSprinting ? 0.045 : 0.025)
              : Math.sin(this.elapsedSec * 2.0) * 0.008;
          const ey = this.player.y + 1.62 + headBob;
          this.camPosCurrent.set(this.player.x, ey, this.player.z);
          _camLook.set(
            this.player.x - sinY * cosP * 12,
            ey - sinP * 12,
            this.player.z - cosY * cosP * 12,
          );
        }
        this.camera.position.copy(this.camPosCurrent);
        this.camera.lookAt(_camLook);
      } else {
        const fx = this.isDriving ? this.vehicle.x : this.player.x;
        const fy =
          (this.isDriving ? this.vehicle.y : this.player.y) +
          (this.isDriving ? 1.55 : 1.48);
        const fz = this.isDriving ? this.vehicle.z : this.player.z;

        const dist = this.isDriving ? 8.2 : this.cameraDistance;
        const sinY = Math.sin(this.cameraYaw);
        const cosY = Math.cos(this.cameraYaw);
        const cosP = Math.cos(this.cameraPitch);
        const sinP = Math.sin(this.cameraPitch);

        _camTarget.set(fx, fy, fz);
        _camDesired.set(
          fx + sinY * cosP * dist,
          fy + sinP * dist,
          fz + cosY * cosP * dist,
        );

        // Clamp above terrain height so camera never goes underground
        const camGround = groundHeightAt(_camDesired.x, _camDesired.z) + 0.65;
        if (_camDesired.y < camGround) _camDesired.y = camGround;

        // Raycast against architecture walls for smooth wall pull-in
        _rayDir.subVectors(_camDesired, _camTarget);
        const maxDist = _rayDir.length();
        if (maxDist > 0.2) {
          _rayDir.divideScalar(maxDist);
          this.cameraRaycaster.set(_camTarget, _rayDir);
          this.cameraRaycaster.far = maxDist;
          const hits = this.cameraRaycaster.intersectObjects(this.occluderMeshes, false);
          if (hits.length > 0 && hits[0].distance < maxDist) {
            const safeDist = Math.max(1.1, hits[0].distance - 0.35);
            _camDesired.copy(_camTarget).addScaledVector(_rayDir, safeDist);
          }
        }

        const dampAlpha = 1 - Math.exp(-14 * dt);
        this.camPosCurrent.lerp(_camDesired, dampAlpha);
        this.camLookCurrent.lerp(_camTarget, 1 - Math.exp(-18 * dt));
        _camLook.copy(this.camLookCurrent);

        this.camera.position.copy(this.camPosCurrent);
        this.camera.lookAt(_camLook);
      }

      if (this.elapsedSec - this.lastHudPushSec >= 0.12) {
        this.pushHudSnapshot(false);
      }
    } else {
      this.audio.updateAmbience(
        this.elapsedSec,
        20,
        this.settings.weather,
        false,
        false,
        0,
        true,
        1.0,
        false,
        20,
      );
    }

    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private pushHudSnapshot(force: boolean): void {
    if (!force && this.elapsedSec - this.lastHudPushSec < 0.12) return;
    this.lastHudPushSec = this.elapsedSec;

    const nearest = this.phase === 'playing' ? this.findNearestInteractable() : null;
    const nearbyPrompt = this.isDriving
      ? 'Exit Coastal Convertible'
      : nearest
        ? nearest.label
        : null;

    const indoorsInfo = isPointIndoors(this.player.x, this.player.y, this.player.z);
    const locationName =
      !this.isDriving && indoorsInfo.indoors && indoorsInfo.buildingName
        ? indoorsInfo.buildingName
        : getLocationAt(this.player.x, this.player.z);

    this.callbacks.onHudUpdate({
      locationName,
      timeOfDay: this.settings.timeOfDay,
      weather: this.settings.weather,
      cameraMode: this.cameraMode,
      isIndoors: this.isIndoors,
      isDriving: this.isDriving,
      speedKmh: Math.round(Math.abs(this.vehicle.speed) * 3.6),
      isSprinting: this.player.isSprinting,
      coins: this.coins,
      discoveredIds: Array.from(this.discovered),
      totalDiscoveries: SECRET_LOCATIONS.length,
      nearbyPrompt,
      nearbyKind: this.isDriving ? 'vehicle' : nearest?.kind ?? null,
      activeDialogue: this.activeDialogue,
      inventory: this.inventory,
      playerPos: {
        x: Math.round(this.player.x),
        y: Math.round(this.player.y),
        z: Math.round(this.player.z),
      },
      playerHeading: this.player.heading,
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.unbindEvents();
    this.disposeComposer();
    this.audio.dispose();
    this.atmosphere.dispose();
    this.terrain.dispose();
    this.architecture.dispose();
    this.props.dispose();
    this.actors.dispose();
    this.textures.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
