import React from 'react';
import { Sparkles } from 'lucide-react';
import type { ComparisonResponse, CornerDTO } from '../../types/telemetry';
import { useLanguage } from '../../i18n';
import type { CornerViewMode } from './trackGeometry';

interface CornerHeaderProps {
  comparison: ComparisonResponse;
  corners: CornerDTO[];
  selectedCorner: CornerDTO | null;
  cornerViewMode: CornerViewMode;
  setCornerViewMode: (mode: CornerViewMode) => void;
  totalGap: number;
  onAskEngineerAboutCorner?: (corner: CornerDTO) => void;
}

/** Selected corner name, time-loss badge and view toggle; the lap summary line when no corner is open. */
export const CornerHeader: React.FC<CornerHeaderProps> = ({
  comparison,
  corners,
  selectedCorner,
  cornerViewMode,
  setCornerViewMode,
  totalGap,
  onAskEngineerAboutCorner,
}) => {
  const { t } = useLanguage();
  return (
    selectedCorner ? (
      <div className="px-2.5 py-1 rounded-lg bg-night-4 border border-white/5 flex items-center justify-between text-xs font-telemetry shrink-0 select-text gap-2">
        {/* Corner name and time-loss badge */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="px-1.5 py-0.5 rounded bg-comp text-white font-black text-[10px] shadow-sm shrink-0">
            T{selectedCorner.corner_number}
          </span>
          <span className="font-bold text-white tracking-wide truncate max-w-[130px] sm:max-w-[200px]">
            {selectedCorner.name}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded font-black font-telemetry text-[10px] shrink-0 border ${
              selectedCorner.delta_time > 0.05
                ? 'bg-loss/15 text-loss-soft border-loss/30'
                : selectedCorner.delta_time < -0.05
                ? 'bg-gain/15 text-gain border-gain/30'
                : 'bg-white/5 text-gray-300 border-white/10'
            }`}
          >
            {selectedCorner.delta_time > 0.05
              ? `${t('corner_loss_badge')} +${selectedCorner.delta_time.toFixed(3)} s`
              : selectedCorner.delta_time < -0.05
              ? `${t('corner_gain_badge')} ${selectedCorner.delta_time.toFixed(3)} s`
              : `${t('corner_delta_badge')} ${selectedCorner.delta_time > 0 ? '+' : ''}${selectedCorner.delta_time.toFixed(3)} s`}
          </span>
        </div>

        {/* Derecha: Segmented Toggle [ Trazada Óptima ] | [ Diagnóstico y Fases ] + Sparkle */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="inline-flex p-0.5 rounded-lg bg-night-1 border border-white/10 shadow-inner">
            <button
              type="button"
              onClick={() => setCornerViewMode('track2d')}
              className={`px-2 py-0.5 rounded text-[10px] font-telemetry font-bold transition cursor-pointer ${
                cornerViewMode === 'track2d'
                  ? 'bg-comp text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t('track_optimal_tab')}
            </button>
            <button
              type="button"
              onClick={() => setCornerViewMode('phase')}
              className={`px-2 py-0.5 rounded text-[10px] font-telemetry font-bold transition cursor-pointer ${
                cornerViewMode === 'phase'
                  ? 'bg-comp text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t('phase_diagnostics_tab')}
            </button>
          </div>

          {onAskEngineerAboutCorner && (
            <button
              onClick={() => onAskEngineerAboutCorner(selectedCorner)}
              className="p-1 rounded-md bg-brand/10 hover:bg-brand/20 text-brand border border-brand/30 transition cursor-pointer"
              title={t('consult_engineer_hint')}
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    ) : (
      <div className="px-3 py-1.5 rounded-lg bg-night-4 border border-white/5 flex items-center justify-between text-xs font-telemetry shrink-0 select-text">
        <div className="flex items-center gap-2.5">
          <span className="px-1.5 py-0.5 rounded bg-brand/20 text-brand font-bold text-[10px] tracking-wider uppercase">
            {comparison.game_name || t('circuit_label')}
          </span>
          <strong className="text-white">{comparison.track_name || t('circuit_label')}</strong>
          <span className="text-gray-500">•</span>
          <span className="text-gray-400">
            {((comparison.distance?.[comparison.distance.length - 1] || 4000) / 1000).toFixed(3)} km
          </span>
          <span className="text-gray-500">•</span>
          <span className="text-gray-400">{corners.length} {t('corners_identified')}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400 uppercase">{t('total_delta')}:</span>
          <span
            className={`font-black font-telemetry px-2 py-0.5 rounded text-xs ${
              totalGap < 0 ? 'bg-gain/15 text-gain' : 'bg-loss/15 text-loss-soft'
            }`}
          >
            {totalGap >= 0 ? '+' : ''}
            {totalGap.toFixed(3)}s
          </span>
        </div>
      </div>
    )
  );
};
