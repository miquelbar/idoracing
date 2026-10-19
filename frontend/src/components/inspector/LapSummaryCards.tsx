import React from 'react';
import { AlertTriangle, Compass } from 'lucide-react';
import type { CornerDTO } from '../../types/telemetry';
import { useLanguage } from '../../i18n';

interface LapSummaryCardsProps {
  worstCorner: CornerDTO | null;
  totalGap: number;
  onSelectCorner: (corner: CornerDTO | null) => void;
}

/** Lap-level cards shown under the track map: overall gap and the corner that cost the most. */
export const LapSummaryCards: React.FC<LapSummaryCardsProps> = ({ worstCorner, totalGap, onSelectCorner }) => {
  const { t } = useLanguage();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 shrink-0 select-text">
      {/* Tarjeta 1: Consistencia & Sectores */}
      <div className="p-2.5 rounded-lg bg-[#07090E] border border-white/5 space-y-1 select-text">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1 select-text">
            <Compass className="w-3 h-3 text-[#00D2BE]" />
            {t('overall_balance')}
          </span>
          <span className="text-[10px] font-telemetry font-bold px-1.5 py-0.5 rounded bg-white/5 text-[#00D2BE] select-text">
            {totalGap < 0.2 ? t('competitive_pace') : t('progressive_improvement')}
          </span>
        </div>
        <p className="text-[11px] text-gray-300 leading-snug select-text">
          {t('balance_card_desc')}
        </p>
      </div>

      {/* Tarjeta 2: Mayor Pérdida de Tiempo */}
      {worstCorner ? (
        <div className="p-2.5 rounded-lg bg-[#07090E] border border-white/5 space-y-1 select-text">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1 select-text">
              <AlertTriangle className="w-3 h-3 text-[#FF1801]" />
              {t('critical_point')}
            </span>
            <button
              onClick={() => onSelectCorner(worstCorner)}
              className="text-[10px] font-telemetry font-bold px-1.5 py-0.5 rounded bg-[#FF1801]/15 text-[#FF7B72] hover:bg-[#FF1801]/25 transition cursor-pointer select-text"
            >
              T{worstCorner.corner_number}: +{worstCorner.delta_time.toFixed(3)}s ↗
            </button>
          </div>
          <p className="text-[11px] text-gray-300 leading-snug select-text">
            {worstCorner.name}: {t('worst_corner_desc')}
          </p>
        </div>
      ) : (
        <div className="p-2.5 rounded-lg bg-[#07090E] border border-white/5 space-y-1 select-text">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider select-text">
            {t('sync_telemetry')}
          </span>
          <p className="text-[11px] text-gray-300 leading-snug select-text">
            {t('sync_telemetry_desc')}
          </p>
        </div>
      )}
    </div>
  );
};
