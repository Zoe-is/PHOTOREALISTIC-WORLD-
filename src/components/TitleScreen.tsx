import React from 'react';
import { SlidersHorizontal } from 'lucide-react';

interface TitleScreenProps {
  onStart: () => void;
  onOpenSettings: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onStart,
  onOpenSettings,
}) => {
  return (
    <div
      className="fixed inset-0 z-20 flex flex-col justify-between p-8 md:p-12 pointer-events-none"
      style={{
        background:
          'linear-gradient(180deg, rgba(12,16,22,0.52) 0%, rgba(12,16,22,0.12) 45%, rgba(12,16,22,0.62) 100%)',
      }}
    >
      {/* Top-Left Bespoke Inline SVG Title Lockup */}
      <div className="max-w-lg pt-2 pointer-events-auto">
        <svg
          viewBox="0 0 460 118"
          className="w-full max-w-[440px] h-auto drop-shadow-[0_4px_18px_rgba(0,0,0,0.65)]"
          role="img"
          aria-label="Solstice Valley"
        >
          {/* Horizon Compass Crest */}
          <g transform="translate(26, 36)" fill="none" stroke="#f59e0b" strokeWidth="1.75">
            <circle cx="0" cy="0" r="19" strokeOpacity="0.85" />
            <circle cx="0" cy="0" r="13" strokeOpacity="0.4" />
            <path d="M 0 -24 L 0 24 M -24 0 L 24 0" strokeOpacity="0.55" />
            <polygon
              points="0,-16 4,0 0,16 -4,0"
              fill="#f59e0b"
              fillOpacity="0.9"
              stroke="none"
            />
            <polygon
              points="-16,0 0,-3.5 16,0 0,3.5"
              fill="#fef3c7"
              fillOpacity="0.85"
              stroke="none"
            />
          </g>

          <text
            x="64"
            y="46"
            fill="#fffbeb"
            fontSize="44"
            fontWeight="700"
            letterSpacing="3.5"
            style={{ fontFamily: '"Cormorant Garamond", Georgia, serif' }}
          >
            SOLSTICE
          </text>
          <text
            x="66"
            y="84"
            fill="#fbbf24"
            fontSize="32"
            fontWeight="600"
            letterSpacing="9"
            style={{ fontFamily: '"Cormorant Garamond", Georgia, serif' }}
          >
            VALLEY
          </text>
          <line
            x1="66"
            y1="96"
            x2="310"
            y2="96"
            stroke="#f59e0b"
            strokeOpacity="0.45"
            strokeWidth="1"
          />
          <text
            x="66"
            y="112"
            fill="#e7e5e4"
            fontSize="11"
            fontWeight="600"
            letterSpacing="3.2"
          >
            COASTAL OPEN WORLD EXPLORATION
          </text>
        </svg>

        {/* Primary CTA + Settings (max 2 actions) */}
        <div className="mt-7 flex items-center gap-3">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart();
            }}
            className="px-7 py-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-stone-950 font-bold text-sm tracking-wider uppercase transition-colors cursor-pointer shadow-[0_6px_24px_rgba(0,0,0,0.45)]"
          >
            Enter World
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenSettings();
            }}
            className="px-5 py-3.5 rounded-lg bg-stone-900/85 hover:bg-stone-800 border border-stone-600/60 text-stone-100 font-semibold text-sm tracking-wide flex items-center gap-2 transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4 text-amber-400" />
            Settings
          </button>
        </div>
      </div>

      {/* Single flat borderless control hint line in bottom safe margin */}
      <div className="w-full text-center text-xs md:text-sm tracking-wide text-stone-200/90 font-medium drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]">
        WASD Move · Shift Sprint · Space Jump · Mouse Look · F Interact · V Camera · Esc Menu
      </div>
    </div>
  );
};
