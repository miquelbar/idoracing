import React from 'react';
import { Bot, ChevronRight, SlidersHorizontal, TrendingDown } from 'lucide-react';
import type { ComparisonResponse } from '../types/telemetry';
import { formatLapTime, simBadge } from '../utils/formatters';
import { useLanguage } from '../i18n';

interface TelemetryHeaderBarProps {
  comparison?: ComparisonResponse | null;
  gameName: string | null;
  trackName: string;
  carName: string;
  lapCount?: number;
  bestLapTime?: number;
  refLapNumber?: number;
  compLapNumber?: number;
  onNavigateToSessions: () => void;
  onOpenDebrief?: () => void;
  reportAvailable?: boolean;
  onOpenCarSetup?: () => void;
  onOpenStint?: () => void;
  showIdealGhost?: boolean;
  onToggleIdealGhost?: () => void;
}

function formatDelta(seconds: number): string {
  if (isNaN(seconds)) return '+0.000s';
  const sign = seconds > 0 ? '+' : '';
  return `${sign}${seconds.toFixed(3)}s`;
}

export const TelemetryHeaderBar: React.FC<TelemetryHeaderBarProps> = ({
  comparison,
  gameName,
  trackName,
  carName,
  lapCount,
  bestLapTime,
  refLapNumber = 1,
  compLapNumber = 2,
  onNavigateToSessions,
  onOpenDebrief,
  reportAvailable = false,
  onOpenCarSetup,
  onOpenStint,
}) => {
  const { lang, t } = useLanguage();
  const isEn = lang === 'en';
  const badge = simBadge(gameName);

  const refS1 = comparison?.ref_sectors?.['S1'] ?? 0;
  const refS2 = comparison?.ref_sectors?.['S2'] ?? 0;
  const refS3 = comparison?.ref_sectors?.['S3'] ?? 0;

  const compS1 = comparison?.comp_sectors?.['S1'] ?? 0;
  const compS2 = comparison?.comp_sectors?.['S2'] ?? 0;
  const compS3 = comparison?.comp_sectors?.['S3'] ?? 0;

  const deltaS1 = compS1 && refS1 ? compS1 - refS1 : 0;
  const deltaS2 = compS2 && refS2 ? compS2 - refS2 : 0;
  const deltaS3 = compS3 && refS3 ? compS3 - refS3 : 0;
  const hasRealSectors =
    Math.abs(deltaS1) >= 0.001 || Math.abs(deltaS2) >= 0.001 || Math.abs(deltaS3) >= 0.001;

  return (
    <div className="w-full bg-[#0B0E17]/95 border-b border-[#1E2638] px-3 sm:px-4 py-2 flex items-center justify-between gap-3 text-xs font-telemetry shrink-0 shadow-sm z-30 flex-wrap">
      {/* Fila 1 (Izquierda — Identidad): Badge Sim + Circuito + Badge Coche + Meta-info */}
      <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap shrink-0">
        {/* Game Pill */}
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase shrink-0 border ${badge.className}`}
          title={gameName || undefined}
        >
          {badge.label}
        </span>

        {/* Track & Clickable Car Button (never truncated!) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-brand font-bold text-white text-xs sm:text-sm tracking-wide whitespace-nowrap shrink-0">
            {trackName}
          </span>
          <span className="text-gray-500">·</span>
          {onOpenCarSetup ? (
            <button
              onClick={onOpenCarSetup}
              title={t('open_setup_modal')}
              className="car-badge flex items-center gap-1.5 px-2 py-0.5 rounded bg-brand/10 hover:bg-brand/20 border border-brand/30 text-brand font-bold text-xs whitespace-nowrap shrink-0 transition cursor-pointer"
            >
              <SlidersHorizontal className="w-3 h-3 text-brand shrink-0" />
              <span>{carName}</span>
            </button>
          ) : (
            <span className="car-badge text-brand font-bold text-xs whitespace-nowrap shrink-0">
              {carName}
            </span>
          )}
        </div>

        {/* Lap Count Pill */}
        {lapCount !== undefined && lapCount > 0 && (
          <span className="text-gray-400 text-[11px] whitespace-nowrap pl-2 border-l border-white/10 shrink-0 hidden sm:inline">
            {lapCount} {t('laps_label')}
          </span>
        )}

        {/* Switch Track Button */}
        <button
          onClick={onNavigateToSessions}
          className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/15 border border-white/10 text-gray-300 hover:text-white text-[11px] font-semibold transition cursor-pointer shrink-0 flex items-center gap-1"
          title={t('change_track_hint')}
        >
          <span>{t('sessions_btn')}</span>
          <ChevronRight className="w-3 h-3 opacity-60" />
        </button>

        {/* Stint Degradation Modal Button */}
        {onOpenStint && (
          <button
            onClick={onOpenStint}
            className="px-2 py-0.5 rounded bg-brand/10 hover:bg-brand/20 border border-brand/30 text-brand text-[11px] font-semibold transition cursor-pointer shrink-0 flex items-center gap-1"
            title="Evolución de stint y degradación de neumáticos"
          >
            <TrendingDown className="w-3 h-3 text-brand shrink-0" />
            <span>Stint</span>
          </button>
        )}
      </div>

      {/* Fila 2 (o Derecha — Comparador y Métricas con separación real de 16px) */}
      <div className="flex items-center gap-3 sm:gap-4 flex-wrap shrink-0">
        {/* Lap Times */}
        {comparison ? (
          <>
            <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
              <div className="flex items-center gap-1">
                <span className="lap-p1-badge px-1.5 py-0.5 rounded bg-brand/20 text-brand font-bold text-[10px] border border-brand/30">
                  P1 {isEn ? 'L' : 'V'}{refLapNumber}
                </span>
                <span className="text-white font-bold tracking-tight">
                  {formatLapTime(comparison.ref_lap_time)}
                </span>
              </div>

              <span className="text-gray-600 text-[10px]">vs</span>

              <div className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 rounded bg-comp/20 text-[#D8B4FE] font-bold text-[10px] border border-comp/30">
                  P2 {isEn ? 'L' : 'V'}{compLapNumber}
                </span>
                <span className="text-white font-bold tracking-tight">
                  {formatLapTime(comparison.comp_lap_time)}
                </span>
              </div>

              {/* GAP Pill */}
              <span
                className={`px-1.5 py-0.5 rounded font-extrabold text-[11px] shadow-sm ${
                  comparison.delta_time_total > 0
                    ? 'bg-accent/20 text-[#FF453A] border border-accent/40'
                    : 'bg-brand/20 text-brand border border-brand/40'
                }`}
              >
                {t('gap')} {formatDelta(comparison.delta_time_total)}
              </span>
            </div>

            {/* Separador vertical (|) */}
            <div className="h-4 w-px bg-white/10 hidden sm:block shrink-0" />

            {/* Badges de potencial: Óptima y Potencial Bubota */}
            {comparison.has_telemetry !== false && (
              <div className="flex items-center gap-1.5 shrink-0">
                {comparison.optimal_lap_time && (
                  <span
                    className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold text-[10px] whitespace-nowrap"
                    title={isEn ? 'Combined Rolling Best across corners' : 'Vuelta Óptima Combinada (Rolling Best)'}
                  >
                    {isEn ? 'Optimal:' : 'Óptima:'} {formatLapTime(comparison.optimal_lap_time)}
                  </span>
                )}
                {comparison.ideal_potential_gain && comparison.ideal_potential_gain > 0 && (
                  <span
                    className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-400/35 text-amber-300 font-bold text-[10px] whitespace-nowrap"
                    title={
                      isEn
                        ? 'Physical potential gain vs 👻 Bubota'
                        : 'Potencial físico total frente a 👻 Bubota'
                    }
                  >
                    {t('bubota_badge')} -{comparison.ideal_potential_gain.toFixed(2)}s
                  </span>
                )}
              </div>
            )}

            {/* Micro-Sectors (only shown when non-zero) */}
            {hasRealSectors && (
              <div className="hidden 2xl:flex items-center gap-1.5 text-[10.5px] border-l border-white/10 pl-2">
                <span className="text-gray-400">
                  S1:{' '}
                  <strong className={deltaS1 <= 0 ? 'text-brand' : 'text-amber-400'}>
                    {formatDelta(deltaS1)}
                  </strong>
                </span>
                <span className="text-gray-600">•</span>
                <span className="text-gray-400">
                  S2:{' '}
                  <strong className={deltaS2 <= 0 ? 'text-brand' : 'text-amber-400'}>
                    {formatDelta(deltaS2)}
                  </strong>
                </span>
                <span className="text-gray-600">•</span>
                <span className="text-gray-400">
                  S3:{' '}
                  <strong className={deltaS3 <= 0 ? 'text-brand' : 'text-amber-400'}>
                    {formatDelta(deltaS3)}
                  </strong>
                </span>
              </div>
            )}
          </>
        ) : bestLapTime && bestLapTime > 0 ? (
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded bg-brand/20 text-brand font-bold text-[10px] border border-brand/30">
                {t('best_lap')}
              </span>
              <span className="text-white font-bold tracking-tight">
                {formatLapTime(bestLapTime)}
              </span>
            </div>
            {refLapNumber && compLapNumber && (
              <span className="text-gray-400 text-[11px] pl-2 border-l border-white/10 hidden sm:inline">
                P1: V{refLapNumber} vs P2: V{compLapNumber}
              </span>
            )}
          </div>
        ) : null}

        {/* Debrief & Radio Trigger Button */}
        {onOpenDebrief && (
          <button
            onClick={onOpenDebrief}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-brand/20 hover:bg-brand text-brand hover:text-black border border-brand/40 hover:border-brand text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-sm shrink-0 whitespace-nowrap"
            title={t('open_debrief_hint')}
          >
            <Bot className="w-3.5 h-3.5" />
            <span className="inline">{t('debrief_radio')}</span>
            {reportAvailable && <span className="w-1.5 h-1.5 rounded-full bg-brand animate-ping" />}
          </button>
        )}
      </div>
    </div>
  );
};
