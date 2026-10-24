import React, { useState } from 'react';
import { CheckCircle2, Headphones, Radio, Volume2 } from 'lucide-react';
import { useLanguage } from '../i18n';

export const SpotterInfoCard: React.FC = () => {
  const { lang, t } = useLanguage();
  const [isPlaying, setIsPlaying] = useState(false);

  const handleTestVoice = () => {
    try {
      setIsPlaying(true);
      const audio = new Audio(`/api/spotter/audio/radio_on?lang=${lang}`);
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => setIsPlaying(false);
      audio.play().catch(() => setIsPlaying(false));
    } catch {
      setIsPlaying(false);
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-br from-[#121824] via-[#0E131E] to-[#0A0D14] border border-[#232D42] shadow-lg space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-brand/10 border border-brand/30 text-brand shadow-sm">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
              <span>📻</span>
              <span>{t('spotter_card_title')}</span>
            </h4>
            <p className="text-[11px] text-gray-400 font-telemetry">
              Live Spotter · GT3 Pit-Wall Radio
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full bg-best/15 border border-best/40 text-[10px] font-bold text-best font-telemetry tracking-wide uppercase">
            {t('spotter_card_badge')}
          </span>
          <button
            onClick={handleTestVoice}
            disabled={isPlaying}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#1E2738] hover:bg-[#28344B] border border-white/10 text-xs text-gray-200 transition cursor-pointer disabled:opacity-50"
            title="Escuchar audio de prueba"
          >
            <Volume2 className={`w-3.5 h-3.5 ${isPlaying ? 'text-brand animate-bounce' : 'text-gray-400'}`} />
            <span className="text-[11px] font-semibold">{t('spotter_test_voice_btn')}</span>
          </button>
        </div>
      </div>

      {/* 3 Step Workflow */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Step 1 */}
        <div className="p-3.5 rounded-lg bg-black/40 border border-white/5 space-y-1.5 hover:border-brand/30 transition">
          <div className="flex items-center gap-2 text-xs font-bold text-brand">
            <CheckCircle2 className="w-3.5 h-3.5 text-brand shrink-0" />
            <span>{t('spotter_step1_title')}</span>
          </div>
          <p className="text-[11px] text-gray-300 leading-relaxed font-sans">
            {t('spotter_step1_body')}
          </p>
        </div>

        {/* Step 2 */}
        <div className="p-3.5 rounded-lg bg-black/40 border border-white/5 space-y-1.5 hover:border-comp/30 transition">
          <div className="flex items-center gap-2 text-xs font-bold text-comp">
            <CheckCircle2 className="w-3.5 h-3.5 text-comp shrink-0" />
            <span>{t('spotter_step2_title')}</span>
          </div>
          <p className="text-[11px] text-gray-300 leading-relaxed font-sans">
            {t('spotter_step2_body')}
          </p>
        </div>

        {/* Step 3 */}
        <div className="p-3.5 rounded-lg bg-black/40 border border-white/5 space-y-1.5 hover:border-best/30 transition">
          <div className="flex items-center gap-2 text-xs font-bold text-best">
            <Headphones className="w-3.5 h-3.5 text-best shrink-0" />
            <span>{t('spotter_step3_title')}</span>
          </div>
          <p className="text-[11px] text-gray-300 leading-relaxed font-sans">
            {t('spotter_step3_body')}
          </p>
        </div>
      </div>
    </div>
  );
};
