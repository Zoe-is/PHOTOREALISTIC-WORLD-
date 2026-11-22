export type GamePhase = 'loading' | 'title' | 'playing' | 'paused';

export type WeatherType =
  | 'clear'
  | 'foggy'
  | 'cloudy'
  | 'rain'
  | 'thunderstorm'
  | 'snow';

export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra' | 'cinematic';

export type CameraMode = 'third' | 'first';

export interface WorldSettings {
  quality: GraphicsQuality;
  volume: number;
  muted: boolean;
  timeOfDay: number; // 0..24 hours (e.g. 9.5 = 9:30 AM)
  autoTime: boolean;
  timeSpeed: number; // game minutes per real second
  weather: WeatherType;
  autoWeather: boolean;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: 'provision' | 'gear' | 'souvenir';
}

export interface NpcDialogue {
  npcId: string;
  name: string;
  role: string;
  greeting: string;
  options: {
    label: string;
    reply: string;
    rewardCoins?: number;
    openShop?: boolean;
  }[];
  shopItems?: ShopItem[];
}

export interface InteractableTarget {
  id: string;
  kind: 'door' | 'npc' | 'vehicle' | 'shrine' | 'shop' | 'lantern';
  label: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  data?: Record<string, unknown>;
}

export interface ColliderBox {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
  isDoor?: boolean;
  doorOpen?: boolean;
}

export interface ColliderCylinder {
  id: string;
  x: number;
  z: number;
  radius: number;
  minY: number;
  maxY: number;
}

export interface HudSnapshot {
  locationName: string;
  timeOfDay: number;
  weather: WeatherType;
  cameraMode: CameraMode;
  isIndoors: boolean;
  isDriving: boolean;
  speedKmh: number;
  isSprinting: boolean;
  coins: number;
  discoveredIds: string[];
  totalDiscoveries: number;
  nearbyPrompt: string | null;
  nearbyKind: InteractableTarget['kind'] | null;
  activeDialogue: NpcDialogue | null;
  inventory: string[];
  playerPos: { x: number; y: number; z: number };
  playerHeading: number;
}
