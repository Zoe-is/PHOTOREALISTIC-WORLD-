import React from 'react';
import {
  Maximize2,
  Minimize2,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { GraphicsQuality, WeatherType, WorldSettings } from '../world/types';

interface PauseSettingsModalProps {
  fromTitle: boolean;
  settings: WorldSettings;
  isFullscreen: boolean;
  onUpdateSettings: (next: WorldSettings) => void;
  onToggleFullscreen: () => void;
  onResume: () => void;
  onReturnToTitle: () => void;
}

const WEATHER_OPTIONS: Array<{ id: WeatherType; label: string }> = [
  { id: 'clear', label: 'Sunny' },
  { id: 'cloudy', label: 'Cloudy' },
  { id: 'foggy', label: 'Foggy' },
  { id: 'rain', label: 'Rain' },
  { id: 'thunderstorm', label: 'Storm' },
  { id: 'snow', label: 'Snow' },
];

const TIME_PRESETS: Array<{ label: string; hour: number }> = [
  { label: 'Dawn', hour: 6.4 },
  { label: 'Noon', hour: 12.5 },
  { label: 'Sunset', hour: 18.2 },
  { label: 'Night', hour: 23.0 },
];

function formatHour(hour: number): string {
  const h = Math.floor(((hour % 24) + 24) % 24);
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const PauseSettingsModal: React.FC<PauseSettingsModalProps> = ({
  fromTitle,
  settings,
  isFullscreen,
  onUpdateSettings,
  onToggleFullscreen,
  onResume,
  onReturnToTitle,
}) => {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(10, 12, 16, 0.72)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={fromTitle ? 'World Settings' : 'Game Menu'}
        className="w-full max-w-lg rounded-xl border border-stone-600/70 p-6 md:p-7 text-stone-100 shadow-2xl space-y-5"
        style={{ backgroundColor: 'rgba(22, 24, 28, 0.96)' }}
      >
        <div className="flex items-center justify-between border-b border-stone-700/80 pb-3">
          <div>
            <h2 className="font-display text-3xl font-bold text-amber-300 leading-none">
              {fromTitle ? 'World Settings' : 'Paused'}
            </h2>
            <p className="text-xs text-stone-400 mt-1">
              Atmosphere, Graphics & Audio Preferences
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="px-3 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-600/60 text-xs font-semibold flex items-center gap-2 cursor-pointer"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
                Exit Fullscreen
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
                Fullscreen
              </>
            )}
          </button>
        </div>

        {/* Time of Day Controls */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="time-slider"
              className="text-xs uppercase tracking-wider font-semibold text-stone-300"
            >
              Time of Day
            </label>
            <span className="text-xs font-bold tabular-nums text-amber-300">
              {formatHour(settings.timeOfDay)}
            </span>
          </div>
          <input
            id="time-slider"
            type="range"
            min={0}
            max={23.95}
            step={0.05}
            value={settings.timeOfDay}
            onChange={(e) =>
              onUpdateSettings({
                ...settings,
                timeOfDay: parseFloat(e.target.value),
              })
            }
            className="w-full world-slider"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5">
              {TIME_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() =>
                    onUpdateSettings({ ...settings, timeOfDay: p.hour })
                  }
                  className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-xs font-medium text-stone-200 cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoTime}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, autoTime: e.target.checked })
                }
                className="accent-amber-500"
              />
              Auto-Cycle Time
            </label>
          </div>
        </div>

        {/* Weather Controls */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-stone-300">
              Weather Condition
            </span>
            <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoWeather}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    autoWeather: e.target.checked,
                  })
                }
                className="accent-amber-500"
              />
              Dynamic Weather
            </label>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            {WEATHER_OPTIONS.map((opt) => {
              const active = settings.weather === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    onUpdateSettings({ ...settings, weather: opt.id })
                  }
                  className={`py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    active
                      ? 'bg-amber-500 text-stone-950 border-amber-400'
                      : 'bg-stone-800/90 text-stone-200 border-stone-700 hover:bg-stone-700'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Graphics Quality */}
        <div className="space-y-2">
          <span className="text-xs uppercase tracking-wider font-semibold text-stone-300 block">
            Graphics Quality
          </span>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
            {(['low', 'medium', 'high', 'ultra', 'cinematic'] as GraphicsQuality[]).map((q) => {
              const active = settings.quality === q;
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, quality: q })}
                  className={`py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider border transition-colors cursor-pointer ${
                    active
                      ? 'bg-amber-500 text-stone-950 border-amber-400'
                      : 'bg-stone-800/90 text-stone-200 border-stone-700 hover:bg-stone-700'
                  }`}
                >
                  {q}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sound Volume */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="volume-slider"
              className="text-xs uppercase tracking-wider font-semibold text-stone-300"
            >
              Master Volume
            </label>
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({ ...settings, muted: !settings.muted })
              }
              className="flex items-center gap-1.5 text-xs font-semibold text-stone-200 hover:text-amber-300 cursor-pointer"
            >
              {settings.muted ? (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                  Muted
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                  <span className="tabular-nums">
                    {Math.round(settings.volume * 100)}%
                  </span>
                </>
              )}
            </button>
          </div>
          <input
            id="volume-slider"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.muted ? 0 : settings.volume}
            onChange={(e) =>
              onUpdateSettings({
                ...settings,
                volume: parseFloat(e.target.value),
                muted: parseFloat(e.target.value) === 0,
              })
            }
            className="w-full world-slider"
          />
        </div>

        {/* Primary Modal Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-stone-700/80">
          {!fromTitle && (
            <button
              type="button"
              onClick={onReturnToTitle}
              className="px-4 py-2.5 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-600/60 text-xs font-semibold text-stone-200 flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Title Screen
            </button>
          )}
          <button
            type="button"
            onClick={onResume}
            className="px-6 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {fromTitle ? 'Done' : 'Resume World'}
          </button>
        </div>
      </div>
    </div>
  );
};
