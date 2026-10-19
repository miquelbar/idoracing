import React from 'react';
import { Sliders, Zap } from 'lucide-react';
import type { CornerDTO, RacingLineCode } from '../../types/telemetry';
import { useLanguage, type TranslationKey } from '../../i18n';
import { formatGear, LINE_OFFSET_NOTE_M, type PhaseMetrics } from '../../utils/cornerPhases';
import type { CornerViewMode } from './trackGeometry';

const RACING_LINE_LABEL: Record<RacingLineCode, TranslationKey> = {
  optimal: 'line_optimal',
  early_apex: 'line_early_apex',
  late_apex: 'line_late_apex',
  missed_apex: 'line_missed_apex',
  pinched_exit: 'line_pinched_exit',
  suboptimal: 'line_suboptimal',
};

interface CornerPhasePanelProps {
  selectedCorner: CornerDTO;
  phaseMetrics: PhaseMetrics | null;
  actionPlan: { entry: string; apex: string; exit: string } | null;
  setCornerViewMode: (mode: CornerViewMode) => void;
  onAskEngineerAboutCorner?: (corner: CornerDTO) => void;
}

/** Six-row phase table comparing both laps through the corner, and the three-step improvement plan. */
export const CornerPhasePanel: React.FC<CornerPhasePanelProps> = ({
  selectedCorner,
  phaseMetrics,
  actionPlan,
  setCornerViewMode,
  onAskEngineerAboutCorner,
}) => {
  const { lang, t } = useLanguage();
  const formatPostApex = (metres: number | null) => (metres === null ? '—' : `+${metres}m ${t('post_apex_meters')}`);
  const formatOffset = (metres: number) =>
    Math.abs(metres) < 0.05
      ? '0.0 m'
      : `${Math.abs(metres).toFixed(1)} m ${metres > 0 ? t('offset_outside') : t('offset_inside')}`;

  return (
    <div className="w-full h-full flex flex-col justify-between p-3 select-text overflow-hidden gap-1.5">
      {/* Bloque Superior: Subtítulo */}
      <div className="flex items-center justify-between pb-1.5 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5 text-brand" />
          <span className="text-xs text-gray-300 font-medium tracking-wide">
            {t('corner_performance_sub')}
          </span>
        </div>
        <div className="text-[11px] font-telemetry text-gray-400">
          Apex: <strong className="text-white">{selectedCorner.apex_distance.toFixed(0)}m</strong>
        </div>
      </div>

      {/* Bloque Central: Tabla de 6 Filas de Causas y Telemetría Real */}
      {phaseMetrics && (
        <div className="flex-1 min-h-0 flex flex-col justify-center py-1">
          <table className="w-full text-xs font-telemetry border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-[10px] text-gray-400 uppercase tracking-wider">
                <th className="text-left py-1 pr-2 font-bold">{t('corner_phase_col')}</th>
                <th className="text-right py-1 px-2 font-bold">{t('reference_col')}</th>
                <th className="text-right py-1 px-2 font-bold">{t('your_lap_col')}</th>
                <th className="text-right py-1 pl-2 font-bold">{t('delta_col')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-[11px]">
              {/* 1. Punto de frenada (Braking point) */}
              <tr className="hover:bg-white/[0.02] transition">
                <td className="py-1 pr-2 text-left font-medium text-gray-300">{t('braking_point_row')}</td>
                <td className="py-1 px-2 text-right text-gray-400 whitespace-nowrap">
                  {phaseMetrics.braking.isFlatOut ? t('flat_out_braking') : `${phaseMetrics.braking.refDist} m`}
                </td>
                <td className="py-1 px-2 text-right text-white font-bold whitespace-nowrap">
                  {phaseMetrics.braking.isFlatOut ? t('flat_out_braking') : `${phaseMetrics.braking.compDist} m`}
                </td>
                <td className="py-1 pl-2 text-right font-black whitespace-nowrap">
                  {phaseMetrics.braking.isFlatOut ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gain/15 text-gain font-bold text-[10px]">
                      ✓ {t('optimal_gear')}
                    </span>
                  ) : Math.abs(phaseMetrics.braking.delta) < 3 ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gain/15 text-gain font-bold text-[10px]">
                      ✓ {t('synchronized_label')}
                    </span>
                  ) : phaseMetrics.braking.delta < -3 ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 font-bold text-[10px]">
                      {phaseMetrics.braking.delta.toFixed(0)}m ({t('early_braking')})
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-loss/15 text-loss-soft font-bold text-[10px]">
                      +{phaseMetrics.braking.delta.toFixed(0)}m ({t('late_braking')})
                    </span>
                  )}
                </td>
              </tr>

              {/* 2. Suelta de freno / Trail braking */}
              <tr className="hover:bg-white/[0.02] transition">
                <td className="py-1 pr-2 text-left font-medium text-gray-300">{t('trail_braking_row')}</td>
                <td className="py-1 px-2 text-right text-gray-400 whitespace-nowrap">
                  {phaseMetrics.braking.isFlatOut ? '--' : `${t('progressive_trail')} (${phaseMetrics.trail.refPct}%)`}
                </td>
                <td className="py-1 px-2 text-right text-white font-bold whitespace-nowrap">
                  {phaseMetrics.braking.isFlatOut
                    ? '--'
                    : `${phaseMetrics.trail.code === 'early_release' ? t('abrupt_trail') : t('progressive_trail')} (${phaseMetrics.trail.compPct}%)`}
                </td>
                <td className="py-1 pl-2 text-right font-black whitespace-nowrap">
                  {phaseMetrics.trail.code === 'early_release' ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 font-bold text-[10px]">
                      {t('lack_rotation')}
                    </span>
                  ) : phaseMetrics.trail.code === 'over_braking' ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-loss/15 text-loss-soft font-bold text-[10px]">
                      {t('front_overload')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gain/15 text-gain font-bold text-[10px]">
                      ✓ {t('efficient_trail')}
                    </span>
                  )}
                </td>
              </tr>

              {/* 3. Línea y Ápice (Track position) */}
              <tr className="hover:bg-white/[0.02] transition">
                <td className="py-1 pr-2 text-left font-medium text-gray-300">{t('track_position_row')}</td>
                <td className="py-1 px-2 text-right text-gray-400 whitespace-nowrap">
                  {phaseMetrics.position.offsets ? t('reference_line') : t('outside_to_kerb')}
                </td>
                <td
                  className="py-1 px-2 text-right text-white font-bold whitespace-nowrap"
                  title={phaseMetrics.position.offsets ? undefined : t('no_position_data')}
                >
                  {phaseMetrics.position.offsets ? (
                    <>
                      {t('offset_apex_short')} {formatOffset(phaseMetrics.position.offsets.apex)}
                      <span className="block text-[10px] font-normal text-gray-400">
                        {t('offset_entry_short')} {formatOffset(phaseMetrics.position.offsets.entry)} ·{' '}
                        {t('offset_exit_short')} {formatOffset(phaseMetrics.position.offsets.exit)}
                      </span>
                    </>
                  ) : phaseMetrics.position.isUndersteer ? (
                    t('wide_of_apex')
                  ) : phaseMetrics.position.isEarly ? (
                    t('early_turn_in')
                  ) : (
                    t('outside_to_kerb')
                  )}
                </td>
                <td className="py-1 pl-2 text-right font-black whitespace-nowrap">
                  {phaseMetrics.position.offsets ? (
                    Math.abs(phaseMetrics.position.offsets.apex) < LINE_OFFSET_NOTE_M ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gain/15 text-gain font-bold text-[10px]">
                        ✓ {t('on_reference_line')}
                      </span>
                    ) : phaseMetrics.position.offsets.apex > 0 ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-loss/15 text-loss-soft font-bold text-[10px]">
                        {t('wider_by')} {Math.abs(phaseMetrics.position.offsets.apex).toFixed(1)} m
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 font-bold text-[10px]">
                        {t('tighter_by')} {Math.abs(phaseMetrics.position.offsets.apex).toFixed(1)} m
                      </span>
                    )
                  ) : phaseMetrics.position.isUndersteer ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-loss/15 text-loss-soft font-bold text-[10px]">
                      {t('understeer_offset')}
                    </span>
                  ) : phaseMetrics.position.isEarly ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 font-bold text-[10px]">
                      {t('early_apex_offset')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gain/15 text-gain font-bold text-[10px]">
                      ✓ {t('optimal_line_badge')}
                    </span>
                  )}
                </td>
              </tr>

              {/* 4. Velocidad mínima (Apex Vmin) con Marcha fusionada */}
              <tr className="hover:bg-white/[0.02] transition">
                <td className="py-1 pr-2 text-left font-medium text-gray-300">{t('min_speed_row')}</td>
                <td className="py-1 px-2 text-right text-gray-400 whitespace-nowrap">
                  {phaseMetrics.min.ref} km/h{' '}
                  <span className="text-gray-500 font-normal">({formatGear(phaseMetrics.min.refGear, lang)})</span>
                </td>
                <td className="py-1 px-2 text-right text-white font-bold whitespace-nowrap">
                  {phaseMetrics.min.comp} km/h{' '}
                  <span className="text-brand font-bold">({formatGear(phaseMetrics.min.compGear, lang)})</span>
                </td>
                <td className="py-1 pl-2 text-right font-black whitespace-nowrap">
                  <span
                    className={
                      phaseMetrics.min.delta > 0.5
                        ? 'text-gain'
                        : phaseMetrics.min.delta < -0.5
                        ? 'text-loss'
                        : 'text-gray-400'
                    }
                  >
                    {phaseMetrics.min.delta > 0 ? '+' : ''}
                    {phaseMetrics.min.delta.toFixed(1)} km/h
                  </span>
                  {phaseMetrics.min.gearDiff !== 0 && (
                    <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-amber-400/15 text-amber-300 font-bold">
                      {phaseMetrics.min.gearDiff > 0
                        ? `+${phaseMetrics.min.gearDiff} (${t('too_high_gear')})`
                        : `${phaseMetrics.min.gearDiff} (${t('too_low_gear')})`}
                    </span>
                  )}
                </td>
              </tr>

              {/* 5. Aplicación de gas (Throttle onset) */}
              <tr className="hover:bg-white/[0.02] transition">
                <td className="py-1 pr-2 text-left font-medium text-gray-300">{t('throttle_onset_row')}</td>
                <td className="py-1 px-2 text-right text-gray-400 whitespace-nowrap">{formatPostApex(phaseMetrics.throttle.refDist)}</td>
                <td className="py-1 px-2 text-right text-white font-bold whitespace-nowrap">{formatPostApex(phaseMetrics.throttle.compDist)}</td>
                <td className="py-1 pl-2 text-right font-black whitespace-nowrap">
                  {phaseMetrics.throttle.delta === null ? (
                    <span className="text-gray-500">—</span>
                  ) : Math.abs(phaseMetrics.throttle.delta) < 2 ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gain/15 text-gain font-bold text-[10px]">
                      ✓ {t('synchronized_label')}
                    </span>
                  ) : phaseMetrics.throttle.delta > 0 ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-loss/15 text-loss-soft font-bold text-[10px]">
                      +{phaseMetrics.throttle.delta.toFixed(0)}m ({t('delayed_label')})
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-brand/15 text-brand font-bold text-[10px]">
                      {phaseMetrics.throttle.delta.toFixed(0)}m ({t('early_label')})
                    </span>
                  )}
                </td>
              </tr>

              {/* 6. Velocidad de salida (Exit speed) */}
              <tr className="hover:bg-white/[0.02] transition">
                <td className="py-1 pr-2 text-left font-medium text-gray-300">{t('exit_speed_row')}</td>
                <td className="py-1 px-2 text-right text-gray-400 whitespace-nowrap">{phaseMetrics.exit.ref} km/h</td>
                <td className="py-1 px-2 text-right text-white font-bold whitespace-nowrap">{phaseMetrics.exit.comp} km/h</td>
                <td className="py-1 pl-2 text-right font-black whitespace-nowrap">
                  <span
                    className={
                      phaseMetrics.exit.delta > 0.5
                        ? 'text-gain'
                        : phaseMetrics.exit.delta < -0.5
                        ? 'text-loss'
                        : 'text-gray-400'
                    }
                  >
                    {phaseMetrics.exit.delta > 0 ? '+' : ''}
                    {phaseMetrics.exit.delta.toFixed(1)} km/h
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Three-step improvement plan */}
      {actionPlan && (
        <div className="pt-2 border-t border-white/10 shrink-0 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-brand uppercase tracking-wider flex items-center gap-1">
              <Zap className="w-3 h-3 text-brand" />
              {t('primary_rec_label')}
            </span>
            <span className="text-[9px] font-telemetry font-bold px-1.5 py-0.5 rounded bg-white/5 text-brand">
              {t(RACING_LINE_LABEL[selectedCorner.racing_line_code])}
            </span>
          </div>

          {/* 3 Viñetas Directas Causa -> Acción */}
          <div className="space-y-1 text-[11px] leading-snug select-text">
            <div className="text-gray-300">
              <strong className="text-white font-semibold">{t('phase_entry_title')} </strong>
              <span>{actionPlan.entry}</span>
            </div>
            <div className="text-gray-300">
              <strong className="text-white font-semibold">{t('phase_apex_title')} </strong>
              <span>{actionPlan.apex}</span>
            </div>
            <div className="text-gray-300">
              <strong className="text-white font-semibold">{t('phase_exit_title')} </strong>
              <span>{actionPlan.exit}</span>
            </div>
          </div>

          {/* Botones de Acción Contextuales */}
          <div className="pt-1 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setCornerViewMode('track2d')}
              className="inline-flex items-center gap-1.5 text-[11px] font-telemetry font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-md border border-white/10 transition cursor-pointer"
            >
              <span>📐</span>
              <span>{t('view_optimal_line_action')}</span>
            </button>

            {onAskEngineerAboutCorner && (
              <button
                type="button"
                onClick={() => onAskEngineerAboutCorner(selectedCorner)}
                className="inline-flex items-center gap-1.5 text-[11px] font-telemetry font-bold text-brand hover:text-white bg-brand/10 hover:bg-brand/25 px-2.5 py-1.5 rounded-md border border-brand/30 transition cursor-pointer shadow-sm"
              >
                <span>🎧</span>
                <span>
                  {t('ask_engineer_corner_action')} T{selectedCorner.corner_number} →
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
