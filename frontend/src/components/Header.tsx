import React from 'react';
import {
  Cpu,
  FolderOpen,
  Gauge,
  Layers,
  MessageSquare,
  Settings,
} from 'lucide-react';
import type { SystemStatus } from '../types/telemetry';

export type NavTab = 'sessions' | 'telemetry' | 'engineer' | 'files' | 'settings';

interface HeaderProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  status: SystemStatus | null;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  status,
}) => {
  const tabs = [
    { id: 'sessions', label: 'Sesiones & Garaje', icon: Layers },
    { id: 'telemetry', label: 'Telemetría & Trazada', icon: Gauge },
    { id: 'engineer', label: 'Ingeniero de Pista (IA)', icon: MessageSquare },
    { id: 'files', label: 'Archivos & Simuladores', icon: FolderOpen },
    { id: 'settings', label: 'Ajustes IA', icon: Settings },
  ] as const;

  return (
    <header className="border-b border-[#1E2638] bg-[#0A0C12]/95 backdrop-blur-md sticky top-0 z-40 px-6 py-2.5">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[#E10600] to-[#800300] text-white font-bold shadow-sm">
            <span className="font-f1-brand text-lg italic">S</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-f1-brand text-xl tracking-wider text-white font-black italic">
              SIM<span className="text-[#00D2BE]">COACH</span>
            </span>
            <span className="text-[10px] text-gray-500 font-telemetry tracking-widest uppercase hidden lg:inline">
              PRO
            </span>
          </div>
        </div>

        {/* Section Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-[#121622] p-1 rounded-xl border border-white/5">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = currentTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onSelectTab(t.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  isActive
                    ? 'bg-[#1E2738] text-white shadow-sm border border-white/10'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.03]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#00D2BE]' : 'text-gray-400'}`} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Status Pill */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#121622] border border-[#232B3E] text-xs">
            <Cpu className="w-3.5 h-3.5 text-[#00D2BE]" />
            <span className="text-gray-400 text-[11px]">Modelo:</span>
            {status?.ai_available ? (
              <span className="font-telemetry font-bold text-[#00D2BE] text-xs">
                {status.active_model}
              </span>
            ) : (
              <span className="font-telemetry text-[#FFD700] text-xs">
                Reglas Numéricas
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
