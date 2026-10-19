import React from 'react';
import { AlertTriangle, CheckCircle2, CornerDownRight, Zap } from 'lucide-react';
import type { CornerDTO } from '../../types/telemetry';
import { useLanguage } from '../../i18n';
import type { TrackGeometry } from './trackGeometry';
import { COLORS } from '../../theme';

interface CornerDiagramProps {
  selectedCorner: CornerDTO;
  staticTrack: TrackGeometry | null;
  onSelectCorner: (corner: CornerDTO | null) => void;
}

/** Schematic of the reference and driven lines through the corner (an illustration, not the measured line). */
export const CornerDiagram: React.FC<CornerDiagramProps> = ({ selectedCorner, staticTrack, onSelectCorner }) => {
  const { t } = useLanguage();
  const cornerSvgData = selectedCorner.racing_line_svg!;
  const isLeft = cornerSvgData.turn_dir === 'left';
  const hasUndersteer = cornerSvgData.has_understeer;
  const isEarlyApex = selectedCorner.racing_line_code === 'early_apex';
  const isOptimal = selectedCorner.racing_line_code === 'optimal';

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Badges Flotantes Superior Izquierda */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 select-none">
        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-black/80 backdrop-blur-md border border-white/10 text-[10px] font-telemetry text-white font-bold shadow-md">
          <CornerDownRight
            className={`w-3.5 h-3.5 ${isLeft ? '-scale-x-100 text-brand' : 'text-brand'}`}
          />
          <span>{isLeft ? t('turn_left') : t('turn_right')}</span>
        </div>

        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-black/80 backdrop-blur-md border border-white/10 text-[10px] font-telemetry shadow-md">
          {hasUndersteer ? (
            <>
              <AlertTriangle className="w-3 h-3 text-loss" />
              <span className="text-loss-soft font-bold">{t('understeer')}</span>
            </>
          ) : isEarlyApex ? (
            <>
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span className="text-amber-300 font-bold">{t('early_apex')}</span>
            </>
          ) : isOptimal ? (
            <>
              <CheckCircle2 className="w-3 h-3 text-gain" />
              <span className="text-gain font-bold">{t('optimal_line')}</span>
            </>
          ) : (
            <>
              <Zap className="w-3 h-3 text-brand" />
              <span className="text-brand font-bold">{t('neutral_apex')}</span>
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-2 px-2.5 py-1 rounded bg-black/80 backdrop-blur-md border border-white/10 text-[9px] font-telemetry shadow-md select-none">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 bg-gain border-b border-dashed border-gain" />
          <span className="text-gray-300 font-medium">{t('optimal_badge')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 bg-comp" />
          <span className="text-gray-300 font-medium">{t('your_line')}</span>
        </div>
      </div>

      {/* SVG Curva Detallada con Pianos */}
      <svg viewBox="0 0 440 230" preserveAspectRatio="xMidYMid meet" className="w-full h-full select-none">
        <defs>
          <pattern
            id="unified-kerb-pattern"
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="8" height="16" fill={COLORS.accent} />
            <rect x="8" width="8" height="16" fill="#F0F0F0" />
          </pattern>
          <filter id="glow-opt" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={COLORS.gain} floodOpacity="0.8" />
          </filter>
          <filter id="glow-act" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={COLORS.comp} floodOpacity="0.9" />
          </filter>
          <filter id="glow-under" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={COLORS.lossLight} floodOpacity="0.8" />
          </filter>
        </defs>

        {/* Road Asphalt Base */}
        <path d={cornerSvgData.asphalt_fill} fill="#141822" stroke="none" />

        {/* Outer Track Kerb Band */}
        <path
          d={cornerSvgData.outer_curb}
          fill="none"
          stroke="url(#unified-kerb-pattern)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d={cornerSvgData.outer_curb}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1"
        />

        {/* Inner Track Kerb Band (Apex) */}
        <path
          d={cornerSvgData.inner_curb}
          fill="none"
          stroke="url(#unified-kerb-pattern)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d={cornerSvgData.inner_curb}
          fill="none"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="1"
        />

        {/* Reference / Optimal Line */}
        <path
          d={cornerSvgData.optimal_line}
          fill="none"
          stroke={COLORS.gain}
          strokeWidth="3"
          strokeDasharray="6 4"
          strokeLinecap="round"
          filter="url(#glow-opt)"
          opacity="0.95"
        />

        {/* Driver's Actual Line */}
        <path
          d={cornerSvgData.actual_line}
          fill="none"
          stroke={hasUndersteer ? '#FF385C' : COLORS.comp}
          strokeWidth="3.5"
          strokeLinecap="round"
          filter={hasUndersteer ? 'url(#glow-under)' : 'url(#glow-act)'}
        />

        {/* Turn-In Marker */}
        <g transform={`translate(${cornerSvgData.turn_in.x}, ${cornerSvgData.turn_in.y})`}>
          <circle r="4" fill={COLORS.brand} />
          <circle r="7" fill="none" stroke={COLORS.brand} strokeWidth="1" opacity="0.6" />
          <text
            y={14}
            x={isLeft ? 8 : -8}
            textAnchor={isLeft ? 'start' : 'end'}
            fill="#94A3B8"
            fontSize="9px"
            fontFamily="monospace"
            fontWeight="bold"
            paintOrder="stroke"
            stroke={COLORS.night1}
            strokeWidth="3px"
            strokeLinejoin="round"
          >
            {t('turn_in')}
          </text>
        </g>

        {/* Optimal Apex Marker (Desplazamiento hacia el interior/arriba con halo oscuro protector) */}
        <g transform={`translate(${cornerSvgData.apex_ref.x}, ${cornerSvgData.apex_ref.y})`}>
          <circle r="4.5" fill={COLORS.gain} />
          <circle r="8" fill="none" stroke={COLORS.gain} strokeWidth="1" opacity="0.5" />
          <text
            y="-14"
            x={isLeft ? 8 : -8}
            textAnchor={isLeft ? 'start' : 'end'}
            fill={COLORS.gain}
            fontSize="9px"
            fontFamily="monospace"
            fontWeight="bold"
            paintOrder="stroke"
            stroke={COLORS.night1}
            strokeWidth="3px"
            strokeLinejoin="round"
          >
            {t('apex')} {selectedCorner.v_min_ref.toFixed(0)} km/h
          </text>
        </g>

        {/* Actual Apex Marker (Desplazamiento hacia el exterior/abajo para evitar colisión de texto) */}
        <g transform={`translate(${cornerSvgData.apex_comp.x}, ${cornerSvgData.apex_comp.y})`}>
          <circle r="5" fill={hasUndersteer ? COLORS.loss : COLORS.comp} />
          <circle
            r="9"
            fill="none"
            stroke={hasUndersteer ? COLORS.loss : COLORS.comp}
            strokeWidth="1.5"
            strokeDasharray="2 2"
          />
          <text
            y="20"
            x={isLeft ? -8 : 8}
            textAnchor={isLeft ? 'end' : 'start'}
            fill={hasUndersteer ? COLORS.lossSoft : '#E9D5FF'}
            fontSize="9px"
            fontFamily="monospace"
            fontWeight="bold"
            paintOrder="stroke"
            stroke={COLORS.night1}
            strokeWidth="3px"
            strokeLinejoin="round"
          >
            {selectedCorner.v_min_comp.toFixed(0)} km/h
          </text>
        </g>

        {/* Track-out Exit Marker */}
        <g transform={`translate(${cornerSvgData.exit_pt.x}, ${cornerSvgData.exit_pt.y})`}>
          <circle r="4" fill={COLORS.best} />
          <text
            y={-7}
            textAnchor="middle"
            fill={COLORS.best}
            fontSize="9px"
            fontFamily="monospace"
            fontWeight="bold"
            paintOrder="stroke"
            stroke={COLORS.night1}
            strokeWidth="3px"
            strokeLinejoin="round"
          >
            {t('exit')}
          </text>
        </g>
      </svg>

      {/* Minimapa Flotante en Inferior Derecha */}
      {staticTrack && (
        <button
          onClick={() => onSelectCorner(null)}
          className="absolute bottom-2 right-2 z-10 w-28 h-20 bg-night-4/90 hover:bg-[#0E131F] border border-white/15 hover:border-brand/60 rounded-lg p-1.5 cursor-pointer transition shadow-xl group backdrop-blur-md flex flex-col justify-between"
          title={t('return_to_circuit')}
        >
          <div className="flex items-center justify-between w-full text-[8px] font-telemetry text-gray-400 group-hover:text-brand px-0.5">
            <span className="font-bold">{t('circuit_label')}</span>
            <span className="text-[7px] text-brand opacity-0 group-hover:opacity-100 transition-opacity">
              {t('view_all')}
            </span>
          </div>
          <div className="w-full h-12 flex items-center justify-center">
            <svg viewBox={staticTrack.viewBox} className="w-full h-full select-none" preserveAspectRatio="xMidYMid meet">
              <path
                d={staticTrack.fullOutline}
                fill="none"
                stroke="#4A5568"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {(() => {
                const activePt = staticTrack.cornerPoints.find(
                  (cp) => cp.corner_number === selectedCorner.corner_number
                );
                if (!activePt) return null;
                return (
                  <g transform={`translate(${activePt.svgX}, ${activePt.svgY})`}>
                    <circle r="9" fill={COLORS.comp} opacity="0.4" className="animate-ping" />
                    <circle r="5" fill={COLORS.comp} stroke="#FFFFFF" strokeWidth="1.5" />
                  </g>
                );
              })()}
            </svg>
          </div>
        </button>
      )}
    </div>
  );
};
