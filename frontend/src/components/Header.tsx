import React from 'react';
import {
  Gauge,
  Headphones,
  Layers,
  MessageSquare,
  Settings,
  Wrench,
} from 'lucide-react';
import type { SpotterConfigDTO, SystemStatus } from '../types/telemetry';
import { fetchSpotterConfig, updateSpotterConfig } from '../services/api';
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
  const [spotterConfig, setSpotterConfig] = React.useState<SpotterConfigDTO>({
    enabled: true,
    language: 'es',
    volume: 85,
  });

  React.useEffect(() => {
    fetchSpotterConfig()
      .then((cfg) => {
        setSpotterConfig(cfg);
      })
      .catch(() => {});
  }, []);

  const handleToggleSpotter = () => {
    const nextEnabled = !spotterConfig.enabled;
    setSpotterConfig((prev) => ({ ...prev, enabled: nextEnabled }));
    updateSpotterConfig({ enabled: nextEnabled }).catch(() => {});

    // Immediate audio feedback on toggle
    const clip = nextEnabled ? 'radio_on' : 'radio_off';
    try {
      const audio = new Audio(`/api/spotter/audio/${clip}?lang=${lang}`);
      audio.volume = Math.max(0.1, Math.min(1.0, (spotterConfig.volume || 85) / 100));
      audio.play().catch(() => {});
    } catch {
      // Handled silently if autoplay restricted
    }
  };

  const handleLanguageChange = (newLang: 'es' | 'en') => {
    setLanguage(newLang);
    setSpotterConfig((prev) => ({ ...prev, language: newLang }));
    updateSpotterConfig({ language: newLang }).catch(() => {});
  };

  const tabs = [
    { id: 'sessions', label: t('sessions_tab'), icon: Layers },
    { id: 'telemetry', label: t('telemetry_tab'), icon: Gauge },
    { id: 'setup', label: t('setup_tab'), icon: Wrench },
    { id: 'engineer', label: t('engineer_tab'), icon: MessageSquare },
    { id: 'settings', label: t('settings_tab'), icon: Settings },
  ] as const;

  return (
    <header className="border-b border-[#1E2638] bg-[#0A0C12]/95 backdrop-blur-md sticky top-0 z-40 px-3 sm:px-4 py-2">
      <div className="flex items-center justify-between gap-2.5 flex-wrap xl:flex-nowrap">
        {/* Brand */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-accent via-[#C00000] to-[#121824] text-white font-bold shadow-md border border-accent/40">
            <span className="font-brand text-sm italic tracking-tighter">IR</span>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-brand text-lg tracking-wider text-white font-black italic">
                IDORACING
              </span>
              <span className="text-xs font-bold text-brand font-telemetry tracking-widest uppercase">
                ANALYTICS
              </span>
            </div>
            <span className="text-[9px] text-gray-400 font-telemetry -mt-0.5 hidden xl:inline">
              {t('app_slogan')}
            </span>
          </div>
        </div>

        {/* Section Navigation Tabs */}
        <nav
          className="nav-tabs flex items-center gap-1 bg-night-8 p-1 rounded-xl border border-white/5 whitespace-nowrap shrink-0 overflow-visible"
          style={{ scrollbarWidth: 'none' }}
        >
          {tabs.map((tItem) => {
            const Icon = tItem.icon;
            const isActive = currentTab === tItem.id;
            return (
              <button
                key={tItem.id}
                onClick={() => onSelectTab(tItem.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-[#1E2738] text-white shadow-sm border border-white/10'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.03]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-brand' : 'text-gray-400'}`} />
                <span>{tItem.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Status Pill & Language Selector */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Model Status Badge */}
          <div
            className="model-badge flex items-center gap-1.5 px-2.5 h-[32px] rounded-full text-xs font-telemetry font-bold whitespace-nowrap shrink-0"
            style={{
              background: 'rgba(20, 184, 166, 0.08)',
              border: '1px solid rgba(20, 184, 166, 0.25)',
              color: '#2dd4bf',
            }}
            title={status?.ai_available ? `AI Model: ${status.active_model}` : t('rules_engine')}
          >
            <span>
              ⚙️ {status?.ai_available ? status.active_model : t('rules_engine')}
            </span>
          </div>

          {/* Live Spotter Radio Toggle: [ 🎧 Radio: ON / OFF ] */}
          <button
            onClick={handleToggleSpotter}
            className={`radio-toggle flex items-center gap-1.5 px-2.5 h-[32px] rounded-lg text-[0.8rem] font-telemetry font-bold transition cursor-pointer border whitespace-nowrap shrink-0 ${
              spotterConfig.enabled
                ? 'bg-brand/15 border-brand/60 text-brand shadow-[0_0_12px_rgba(230,57,70,0.2)] hover:bg-brand/25'
                : 'bg-night-8 border-[#232B3E] text-gray-400 hover:text-gray-300 hover:border-gray-600'
            }`}
            title={t('spotter_radio_hint')}
          >
            <Headphones className={`w-3.5 h-3.5 ${spotterConfig.enabled ? 'text-brand animate-pulse' : 'text-gray-500'}`} />
            <span>
              🎧 Radio: {spotterConfig.enabled ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* Language Switcher Selector */}
          <div className="lang-switcher flex items-center rounded-lg bg-night-8 border border-[#232B3E] p-0.5 text-xs font-telemetry h-[32px] shrink-0">
            <button
              onClick={() => handleLanguageChange('es')}
              className={`px-2 h-full rounded font-bold transition cursor-pointer text-[11px] flex items-center justify-center ${
                lang === 'es'
                  ? 'bg-brand text-black shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Español"
            >
              ES
            </button>
            <button
              onClick={() => handleLanguageChange('en')}
              className={`px-2 h-full rounded font-bold transition cursor-pointer text-[11px] flex items-center justify-center ${
                lang === 'en'
                  ? 'bg-brand text-black shadow-sm'
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
