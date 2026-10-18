import React from 'react';
import { Flag, RefreshCw, Trophy } from 'lucide-react';

interface ActiveSessionBannerProps {
  trackName: string;
  carName: string;
  gameName?: string;
  lapCount?: number;
  bestLapTime?: number;
  refLapNumber?: number;
  compLapNumber?: number;
  onOpenSwitcher: () => void;
}

function formatLapTime(seconds?: number): string {
  if (!seconds || seconds <= 0 || isNaN(seconds)) return '--:--.---';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(3).padStart(6, '0')}`;
}

export const ActiveSessionBanner: React.FC<ActiveSessionBannerProps> = ({
  trackName,
  carName,
  gameName = 'Assetto Corsa Competizione',
  lapCount,
  bestLapTime,
  refLapNumber,
  compLapNumber,
  onOpenSwitcher,
}) => {
  const isLMU = gameName.toLowerCase().includes('le mans');
  const isiRacing = gameName.toLowerCase().includes('iracing');

  return (
    <div className="bg-[#0C0F17] border-b border-[#1E2638] px-6 py-3.5 shadow-sm">
      <div className="max-w-[1720px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Sim Badge, Big Track Name & Car */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          {/* Game Pill */}
          <div
            className={`self-start sm:self-auto px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wider uppercase font-telemetry flex items-center gap-1.5 border shadow-sm ${
              isLMU
                ? 'bg-blue-950/70 border-blue-500/40 text-blue-300'
                : isiRacing
                ? 'bg-red-950/70 border-red-500/40 text-red-300'
                : 'bg-red-950/60 border-[#E10600]/40 text-[#FF4D4D]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
            <span>{gameName}</span>
          </div>

          <div className="border-l-0 sm:border-l border-white/10 sm:pl-4">
            <div className="flex items-baseline gap-3">
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-wide font-f1-brand uppercase drop-shadow-sm">
                {trackName}
              </h1>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs sm:text-sm font-bold text-[#00D2BE] font-telemetry">
                {carName}
              </span>
              <span className="text-gray-600 text-xs">•</span>
              <span className="text-xs text-gray-400 font-telemetry">
                Sesión Activa en Workspace
              </span>
            </div>
          </div>
        </div>

        {/* Right: Quick Stats & Global Switcher Action */}
        <div className="flex items-center gap-4 self-end sm:self-auto">
          {bestLapTime && bestLapTime > 0 && (
            <div className="hidden lg:flex flex-col items-end text-right pr-4 border-r border-white/10 font-telemetry">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <Trophy className="w-3 h-3 text-[#FFD700]" />
                Mejor Vuelta
              </span>
              <span className="text-xs font-bold text-white">
                {formatLapTime(bestLapTime)}
              </span>
            </div>
          )}

          {lapCount !== undefined && lapCount > 0 && (
            <div className="hidden md:flex flex-col items-end text-right pr-4 border-r border-white/10 font-telemetry">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <Flag className="w-3 h-3 text-[#00D2BE]" />
                Vueltas
              </span>
              <span className="text-xs font-bold text-white">{lapCount} registradas</span>
            </div>
          )}

          {refLapNumber && compLapNumber && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#141A26] border border-white/5 font-telemetry text-xs">
              <span className="text-[#00D2BE] font-bold">P1: V{refLapNumber}</span>
              <span className="text-gray-500">vs</span>
              <span className="text-[#B138FE] font-bold">P2: V{compLapNumber}</span>
            </div>
          )}

          {/* Global Switcher Button */}
          <button
            onClick={onOpenSwitcher}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#171E2D] hover:bg-[#202B3F] text-white border border-[#2D3A52] hover:border-[#00D2BE]/60 text-xs font-bold tracking-wide transition cursor-pointer shadow-md group"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#00D2BE] group-hover:rotate-180 transition-transform duration-300" />
            <span>Cambiar Pista / Juego</span>
          </button>
        </div>
      </div>
    </div>
  );
};
