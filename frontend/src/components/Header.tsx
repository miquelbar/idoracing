import React from 'react';
import {
  Cpu,
  Gauge,
  Layers,
  MessageSquare,
  Settings,
  Wrench,
} from 'lucide-react';
import type { SystemStatus } from '../types/telemetry';
import { useLanguage } from '../i18n';

export type NavTab = 'sessions' | 'telemetry' | 'setup' | 'engineer' | 'settings';

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
  const { lang, setLanguage, t } = useLanguage();

  const tabs = [
    { id: 'sessions', label: t('sessions_tab'), icon: Layers },
    { id: 'telemetry', label: t('telemetry_tab'), icon: Gauge },
    { id: 'setup', label: t('setup_tab'), icon: Wrench },
    { id: 'engineer', label: t('engineer_tab'), icon: MessageSquare },
    { id: 'settings', label: t('settings_tab'), icon: Settings },
  ] as const;

  return (
    <header className="border-b border-[#1E2638] bg-[#0A0C12]/95 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 py-2.5">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[#E10600] via-[#C00000] to-[#121824] text-white font-bold shadow-md border border-[#E10600]/40">
            <span className="font-brand text-sm italic tracking-tighter">IR</span>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-brand text-lg tracking-wider text-white font-black italic">
                IDORACING
              </span>
              <span className="text-xs font-bold text-[#00D2BE] font-telemetry tracking-widest uppercase">
                ANALYTICS
              </span>
            </div>
            <span className="text-[9px] text-gray-400 font-telemetry -mt-0.5 hidden sm:inline">
              {t('app_slogan')}
            </span>
          </div>
        </div>

        {/* Section Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-[#121622] p-1 rounded-xl border border-white/5 overflow-x-auto max-w-full">
          {tabs.map((tItem) => {
            const Icon = tItem.icon;
            const isActive = currentTab === tItem.id;
            return (
              <button
                key={tItem.id}
                onClick={() => onSelectTab(tItem.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[#1E2738] text-white shadow-sm border border-white/10'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.03]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#00D2BE]' : 'text-gray-400'}`} />
                <span>{tItem.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Status Pill & Language Selector */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Model Status Badge */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#121622] border border-[#232B3E] text-xs">
            <Cpu className="w-3.5 h-3.5 text-[#00D2BE]" />
            <span className="text-gray-400 text-[11px]">{t('model')}:</span>
            {status?.ai_available ? (
              <span className="font-telemetry font-bold text-[#00D2BE] text-xs">
                {status.active_model}
              </span>
            ) : (
              <span className="font-telemetry text-[#FFD700] text-xs">
                {t('rules_engine')}
              </span>
            )}
          </div>

          {/* Language Switcher Selector */}
          <div className="flex items-center rounded-lg bg-[#121622] border border-[#232B3E] p-0.5 text-xs font-telemetry">
            <button
              onClick={() => setLanguage('es')}
              className={`px-2 py-0.5 rounded font-bold transition cursor-pointer text-[11px] ${
                lang === 'es'
                  ? 'bg-[#00D2BE] text-black shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Español"
            >
              ES
            </button>
            <button
              onClick={() => setLanguage('en')}
              className={`px-2 py-0.5 rounded font-bold transition cursor-pointer text-[11px] ${
                lang === 'en'
                  ? 'bg-[#00D2BE] text-black shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="English"
            >
              EN
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
