import React from 'react';
import {
  Compass,
  Eye,
  Maximize2,
  Minimize2,
  Pause,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  CloudRain,
  CloudLightning,
  CloudSnow,
  CloudFog,
  Cloud,
} from 'lucide-react';
import type { HudSnapshot, WeatherType } from '../world/types';

interface GameHUDProps {
  hud: HudSnapshot;
  muted: boolean;
  isFullscreen: boolean;
  discoveryBanner: string | null;
  dialogueReply: string | null;
  showShop: boolean;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onToggleCameraMode: () => void;
  onOpenPause: () => void;
  onTriggerInteract: () => void;
  onCloseDialogue: () => void;
  onSelectDialogueOption: (opt: {
    reply: string;
    rewardCoins?: number;
    openShop?: boolean;
  }) => void;
  onBuyItem: (id: string, name: string, price: number) => void;
}

function formatClock(hours: number): string {
  const h24 = Math.floor(((hours % 24) + 24) % 24);
  const mins = Math.floor((hours - Math.floor(hours)) * 60);
  return `${String(h24).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function WeatherGlyph({ weather, time }: { weather: WeatherType; time: number }) {
  const isNight = time < 6 || time >= 19.5;
  if (weather === 'thunderstorm') return <CloudLightning className="w-4 h-4 text-amber-300" />;
  if (weather === 'rain') return <CloudRain className="w-4 h-4 text-sky-300" />;
  if (weather === 'snow') return <CloudSnow className="w-4 h-4 text-slate-100" />;
  if (weather === 'foggy') return <CloudFog className="w-4 h-4 text-stone-300" />;
  if (weather === 'cloudy') return <Cloud className="w-4 h-4 text-stone-200" />;
  return isNight ? (
    <Moon className="w-4 h-4 text-indigo-200" />
  ) : (
    <Sun className="w-4 h-4 text-amber-300" />
  );
}

export const GameHUD: React.FC<GameHUDProps> = ({
  hud,
  muted,
  isFullscreen,
  discoveryBanner,
  dialogueReply,
  showShop,
  onToggleMute,
  onToggleFullscreen,
  onToggleCameraMode,
  onOpenPause,
  onTriggerInteract,
  onCloseDialogue,
  onSelectDialogueOption,
  onBuyItem,
}) => {
  return (
    <div
      data-camera-mode={hud.cameraMode}
      className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 md:p-6"
    >
      {/* Top Bar: Location Indicator (Left) & Compact Utility Controls (Right) */}
      <div className="flex items-start justify-between gap-4">
        {/* Location, Clock & Discovery Counter */}
        <div
          className="px-4 py-2.5 rounded-lg border border-stone-600/50 text-stone-100 shadow-lg flex items-center gap-4"
          style={{ backgroundColor: 'rgba(20, 22, 26, 0.84)' }}
        >
          <div className="flex items-center gap-2.5">
            <Compass className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold leading-none">
                {hud.isIndoors ? 'Indoors' : 'Location'}
              </div>
              <div
                data-testid="location-indicator"
                className="text-sm font-semibold text-stone-50 mt-0.5 leading-tight"
              >
                {hud.locationName}
              </div>
            </div>
          </div>

          <div className="h-7 w-px bg-stone-700/80" />

          <div className="flex items-center gap-2">
            <WeatherGlyph weather={hud.weather} time={hud.timeOfDay} />
            <span className="text-sm font-semibold tabular-nums text-stone-100">
              {formatClock(hud.timeOfDay)}
            </span>
          </div>

          <div className="h-7 w-px bg-stone-700/80 hidden sm:block" />

          <div className="hidden sm:flex items-center gap-3 text-xs font-semibold tabular-nums">
            <span className="text-amber-300">{hud.coins} Coins</span>
            <span className="text-stone-400">
              {hud.discoveredIds.length}/{hud.totalDiscoveries} Landmarks
            </span>
          </div>
        </div>

        {/* Top-Right Compact Utility Buttons */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            tabIndex={-1}
            data-testid="camera-toggle"
            aria-label="Switch camera view (V)"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleCameraMode();
            }}
            className="h-10 px-3 rounded-lg border border-stone-600/50 text-stone-100 hover:bg-stone-800 flex items-center gap-1.5 text-xs font-semibold tracking-wide transition-colors cursor-pointer"
            style={{ backgroundColor: 'rgba(20, 22, 26, 0.84)' }}
          >
            <Eye className="w-3.5 h-3.5 text-amber-400" />
            <span>{hud.cameraMode === 'first' ? '1st Person' : '3rd Person'}</span>
            <span className="text-[10px] text-stone-400">[V]</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="w-10 h-10 rounded-lg border border-stone-600/50 text-stone-100 hover:bg-stone-800 flex items-center justify-center transition-colors cursor-pointer"
            style={{ backgroundColor: 'rgba(20, 22, 26, 0.84)' }}
          >
            {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleFullscreen();
            }}
            className="w-10 h-10 rounded-lg border border-stone-600/50 text-stone-100 hover:bg-stone-800 flex items-center justify-center transition-colors cursor-pointer"
            style={{ backgroundColor: 'rgba(20, 22, 26, 0.84)' }}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Open pause menu"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenPause();
            }}
            className="h-10 px-3.5 rounded-lg border border-stone-600/50 text-stone-100 hover:bg-stone-800 flex items-center gap-2 text-xs font-semibold tracking-wider uppercase transition-colors cursor-pointer"
            style={{ backgroundColor: 'rgba(20, 22, 26, 0.84)' }}
          >
            <Pause className="w-3.5 h-3.5 text-amber-400" />
            <span>Menu</span>
          </button>
        </div>
      </div>

      {/* Discovery Toast */}
      {discoveryBanner && (
        <div className="self-center pointer-events-none">
          <div
            className="px-5 py-2.5 rounded-lg border border-amber-400/60 text-amber-100 text-sm font-semibold tracking-wide shadow-xl"
            style={{ backgroundColor: 'rgba(24, 22, 18, 0.9)' }}
          >
            {discoveryBanner}
          </div>
        </div>
      )}

      {/* Active NPC Dialogue / Shop Overlay */}
      {hud.activeDialogue && (
        <div className="self-center w-full max-w-lg pointer-events-auto my-auto">
          <div
            className="rounded-xl border border-stone-600/70 p-6 text-stone-100 shadow-2xl"
            style={{ backgroundColor: 'rgba(18, 20, 24, 0.94)' }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-stone-700/80 pb-3">
              <div>
                <h2 className="font-display text-2xl font-bold text-amber-300 leading-tight">
                  {hud.activeDialogue.name}
                </h2>
                <p className="text-xs uppercase tracking-wider text-stone-400 font-semibold">
                  {hud.activeDialogue.role}
                </p>
              </div>
              <button
                type="button"
                onClick={onCloseDialogue}
                className="px-3 py-1 rounded bg-stone-800 hover:bg-stone-700 text-xs font-semibold text-stone-200 cursor-pointer"
              >
                Close [Esc]
              </button>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-stone-200">
              {dialogueReply ?? hud.activeDialogue.greeting}
            </p>

            {showShop && hud.activeDialogue.shopItems ? (
              <div className="mt-4 space-y-2 max-h-60 overflow-y-auto pr-1">
                {hud.activeDialogue.shopItems.map((item) => {
                  const owned = hud.inventory.includes(item.name);
                  const canAfford = hud.coins >= item.price;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg bg-stone-800/85 border border-stone-700/70"
                    >
                      <div>
                        <div className="text-sm font-semibold text-stone-100">
                          {item.name}
                        </div>
                        <div className="text-xs text-stone-400">
                          {item.description}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={owned || !canAfford}
                        onClick={() => onBuyItem(item.id, item.name, item.price)}
                        className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 disabled:bg-stone-700 disabled:text-stone-400 text-stone-950 font-bold text-xs tabular-nums shrink-0 cursor-pointer"
                      >
                        {owned ? 'Owned' : `${item.price} Coins`}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-5 flex flex-col gap-2">
                {hud.activeDialogue.options.map((opt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSelectDialogueOption(opt)}
                    className="w-full text-left px-4 py-2.5 rounded-lg bg-stone-800/90 hover:bg-stone-700 border border-stone-600/50 text-sm font-medium text-stone-100 transition-colors cursor-pointer"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Perimeter: Interaction Prompt & Vehicle Speedometer */}
      <div className="flex items-end justify-between gap-4">
        {/* Bottom-left subtle controls hint */}
        <div
          className="px-3 py-1.5 rounded-md border border-stone-600/40 text-xs text-stone-200 font-medium tabular-nums"
          style={{ backgroundColor: 'rgba(18, 20, 24, 0.78)' }}
        >
          {hud.isDriving
            ? 'WASD Drive · Space Brake · V Camera · F Exit Car'
            : 'WASD Move · Shift Sprint · Space Jump · V Camera · F Interact'}
        </div>

        {/* Bottom-center Interaction Prompt */}
        {hud.nearbyPrompt && !hud.activeDialogue && (
          <div className="pointer-events-auto">
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onTriggerInteract();
              }}
              className="px-4 py-2 rounded-lg border border-amber-400/60 text-stone-100 text-sm font-semibold flex items-center gap-2.5 shadow-lg hover:bg-stone-800 transition-colors cursor-pointer"
              style={{ backgroundColor: 'rgba(20, 22, 26, 0.9)' }}
            >
              <span className="w-6 h-6 rounded bg-amber-500 text-stone-950 font-bold text-xs flex items-center justify-center">
                F
              </span>
              <span>{hud.nearbyPrompt}</span>
            </button>
          </div>
        )}

        {/* Bottom-right Vehicle Speedometer when driving */}
        {hud.isDriving ? (
          <div
            className="px-4 py-2 rounded-lg border border-stone-600/60 text-right tabular-nums"
            style={{ backgroundColor: 'rgba(20, 22, 26, 0.86)' }}
          >
            <div className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold">
              Speed
            </div>
            <div className="text-2xl font-bold text-amber-400 leading-none mt-0.5">
              {hud.speedKmh}{' '}
              <span className="text-xs font-medium text-stone-300">km/h</span>
            </div>
          </div>
        ) : (
          <div className="w-16" />
        )}
      </div>
    </div>
  );
};
