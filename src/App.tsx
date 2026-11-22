import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHUD } from './components/GameHUD';
import { PauseSettingsModal } from './components/PauseSettingsModal';
import { TitleScreen } from './components/TitleScreen';
import { SECRET_LOCATIONS } from './world/math';
import type { GamePhase, HudSnapshot, WorldSettings } from './world/types';
import { WorldEngine } from './world/WorldEngine';

const INITIAL_SETTINGS: WorldSettings = {
  quality: 'high',
  volume: 0.65,
  muted: false,
  timeOfDay: 9.25, // Crisp golden-morning coastal light
  autoTime: true,
  timeSpeed: 12, // 12 game-minutes per real second
  weather: 'clear',
  autoWeather: false,
};

const INITIAL_HUD: HudSnapshot = {
  locationName: 'Solstice Harbor Town',
  timeOfDay: INITIAL_SETTINGS.timeOfDay,
  weather: INITIAL_SETTINGS.weather,
  cameraMode: 'third',
  isIndoors: false,
  isDriving: false,
  speedKmh: 0,
  isSprinting: false,
  coins: 50,
  discoveredIds: [],
  totalDiscoveries: SECRET_LOCATIONS.length,
  nearbyPrompt: null,
  nearbyKind: null,
  activeDialogue: null,
  inventory: [],
  playerPos: { x: 0, y: 4, z: 0 },
  playerHeading: -0.32,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<WorldEngine | null>(null);
  const discoveryTimerRef = useRef<number>(0);

  const autostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<GamePhase>(autostart ? 'playing' : 'title');
  const [titleSettingsOpen, setTitleSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<WorldSettings>(INITIAL_SETTINGS);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [discoveryBanner, setDiscoveryBanner] = useState<string | null>(null);
  const [dialogueReply, setDialogueReply] = useState<string | null>(null);
  const [showShop, setShowShop] = useState(false);

  // Sync game state machine to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = !ready ? 'loading' : phase;
  }, [ready, phase]);

  // Mount Three.js WorldEngine once in isolated container
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const initialPhase: GamePhase = autostart ? 'playing' : 'title';
    const engine = new WorldEngine(container, INITIAL_SETTINGS, initialPhase, {
      onReady: () => setReady(true),
      onHudUpdate: (snap) => setHud(snap),
      onPhaseChange: (nextPhase) => setPhase(nextPhase),
      onDiscovery: (label) => {
        setDiscoveryBanner(label);
        window.clearTimeout(discoveryTimerRef.current);
        discoveryTimerRef.current = window.setTimeout(() => {
          setDiscoveryBanner(null);
        }, 4200);
      },
      onOpenDialogue: () => {
        setDialogueReply(null);
        setShowShop(false);
      },
    });
    engineRef.current = engine;

    return () => {
      window.clearTimeout(discoveryTimerRef.current);
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = useCallback(() => {
    setTitleSettingsOpen(false);
    setPhase('playing');
    document.body.dataset.state = 'playing';
    engineRef.current?.setPhase('playing');
  }, []);

  // Enter / Space starts from Title Screen
  useEffect(() => {
    if (phase !== 'title' || titleSettingsOpen || !ready) return;
    const onTitleKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        handleStart();
      }
    };
    window.addEventListener('keydown', onTitleKey);
    return () => window.removeEventListener('keydown', onTitleKey);
  }, [phase, titleSettingsOpen, ready, handleStart]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleUpdateSettings = useCallback((next: WorldSettings) => {
    setSettings(next);
    engineRef.current?.updateSettings(next);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      void document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  const handleOpenPause = useCallback(() => {
    setPhase('paused');
    engineRef.current?.setPhase('paused');
  }, []);

  const handleResume = useCallback(() => {
    setPhase('playing');
    engineRef.current?.setPhase('playing');
  }, []);

  const handleReturnToTitle = useCallback(() => {
    setPhase('title');
    engineRef.current?.setPhase('title');
  }, []);

  const handleToggleMute = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, muted: !prev.muted };
      engineRef.current?.updateSettings(next);
      return next;
    });
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-stone-950">
      {/* Isolated WebGL Canvas Container */}
      <div
        ref={mountRef}
        data-testid="world-canvas"
        className="absolute inset-0 w-full h-full"
      />

      {/* Brief Initialization Overlay until WorldEngine reports ready */}
      {!ready && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-stone-950 text-stone-100">
          <div className="font-display text-3xl font-bold tracking-widest text-amber-300">
            SOLSTICE VALLEY
          </div>
          <div className="mt-2 text-xs uppercase tracking-[0.25em] text-stone-400">
            Sculpting Coastline & Atmosphere
          </div>
        </div>
      )}

      {/* Title Screen */}
      {ready && phase === 'title' && !titleSettingsOpen && (
        <TitleScreen
          onStart={handleStart}
          onOpenSettings={() => setTitleSettingsOpen(true)}
        />
      )}

      {/* Title Settings Modal */}
      {ready && phase === 'title' && titleSettingsOpen && (
        <PauseSettingsModal
          fromTitle={true}
          settings={settings}
          isFullscreen={isFullscreen}
          onUpdateSettings={handleUpdateSettings}
          onToggleFullscreen={handleToggleFullscreen}
          onResume={() => setTitleSettingsOpen(false)}
          onReturnToTitle={() => setTitleSettingsOpen(false)}
        />
      )}

      {/* Active Gameplay HUD */}
      {ready && phase === 'playing' && (
        <GameHUD
          hud={hud}
          muted={settings.muted}
          isFullscreen={isFullscreen}
          discoveryBanner={discoveryBanner}
          dialogueReply={dialogueReply}
          showShop={showShop}
          onToggleMute={handleToggleMute}
          onToggleFullscreen={handleToggleFullscreen}
          onToggleCameraMode={() => engineRef.current?.toggleCameraMode()}
          onOpenPause={handleOpenPause}
          onTriggerInteract={() => engineRef.current?.triggerInteract()}
          onCloseDialogue={() => {
            setDialogueReply(null);
            setShowShop(false);
            engineRef.current?.closeDialogue();
          }}
          onSelectDialogueOption={(opt) => {
            setDialogueReply(opt.reply);
            if (opt.openShop) setShowShop(true);
            if (opt.rewardCoins) {
              engineRef.current?.grantCoins(opt.rewardCoins);
            }
          }}
          onBuyItem={(id, name, price) => {
            engineRef.current?.buyShopItem(id, name, price);
          }}
        />
      )}

      {/* Pause & Settings Modal */}
      {ready && phase === 'paused' && (
        <PauseSettingsModal
          fromTitle={false}
          settings={settings}
          isFullscreen={isFullscreen}
          onUpdateSettings={handleUpdateSettings}
          onToggleFullscreen={handleToggleFullscreen}
          onResume={handleResume}
          onReturnToTitle={handleReturnToTitle}
        />
      )}
    </main>
  );
}
