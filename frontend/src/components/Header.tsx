import React from 'react';
import { Activity, Cpu, DownloadCloud, Flame, Sparkles } from 'lucide-react';
import type { SystemStatus } from '../types/telemetry';

interface HeaderProps {
  status: SystemStatus | null;
  onOpenImport: () => void;
  onLoadDemo: () => void;
  onOpenCoach: () => void;
  loadingDemo: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  onOpenImport,
  onLoadDemo,
  onOpenCoach,
  loadingDemo,
}) => {
  return (
    <header className="border-b border-[#1E2638] bg-[#0A0C12]/95 backdrop-blur-md sticky top-0 z-40 px-6 py-3">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand & Subtitle */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-[#E10600] to-[#800300] shadow-[0_0_15px_rgba(225,6,0,0.5)] border border-[#ff3b35]/40 text-white font-bold">
            <Flame className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-f1-brand text-2xl tracking-wider text-white font-black italic">
                SIM<span className="text-[#00D2BE]">COACH</span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-[#E10600]/20 text-[#FF453A] border border-[#E10600]/30 font-telemetry">
                2026 F1 GRADE
              </span>
            </div>
            <p className="text-xs text-gray-400 font-medium">
              Universal High-Performance Motorsport Telemetry • <span className="text-gray-300">ACC • LMU • iRacing</span>
            </p>
          </div>
        </div>

        {/* Center Indicators */}
        <div className="flex items-center gap-3">
          {/* AI Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121620] border border-[#232B3E] text-xs">
            <Cpu className="w-3.5 h-3.5 text-[#00D2BE]" />
            <span className="text-gray-400">Ingeniero IA:</span>
            {status?.ollama_available ? (
              <span className="flex items-center gap-1.5 font-telemetry font-bold text-[#00D2BE]">
                <span className="w-2 h-2 rounded-full bg-[#00D2BE] animate-ping" />
                {status.ollama_model}
              </span>
            ) : (
              <span className="flex items-center gap-1 font-telemetry text-[#FFD700]">
                <span className="w-2 h-2 rounded-full bg-[#FFD700]" />
                Reglas Numéricas (Offline)
              </span>
            )}
          </div>

          {/* Engine Status */}
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#121620] border border-[#232B3E] text-xs text-gray-300">
            <Activity className="w-3.5 h-3.5 text-[#B138FE]" />
            <span className="font-telemetry text-gray-400">Sesiones:</span>
            <span className="font-telemetry font-bold text-white">{status?.session_count ?? 0}</span>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onLoadDemo}
            disabled={loadingDemo}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#18202F] hover:bg-[#202B3F] border border-[#2C384E] text-gray-200 text-xs font-semibold transition cursor-pointer shadow-sm disabled:opacity-50"
            title="Carga una sesión demo de competición en Valencia con el Porsche 992 GT3 R"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#00D2BE]" />
            {loadingDemo ? 'Cargando Demo...' : 'Demo Valencia 992'}
          </button>

          <button
            onClick={onOpenCoach}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-[#B138FE]/20 to-[#6E00F8]/20 hover:from-[#B138FE]/30 hover:to-[#6E00F8]/30 border border-[#B138FE]/40 text-[#D8B4FE] text-xs font-semibold transition cursor-pointer shadow-[0_0_15px_rgba(177,56,254,0.15)]"
          >
            <Cpu className="w-3.5 h-3.5 text-[#B138FE]" />
            Debrief IA F1
          </button>

          <button
            onClick={onOpenImport}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#E10600] hover:bg-[#FF1801] text-white text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-[0_0_20px_rgba(225,6,0,0.4)]"
          >
            <DownloadCloud className="w-3.5 h-3.5" />
            Importar
          </button>
        </div>
      </div>
    </header>
  );
};
