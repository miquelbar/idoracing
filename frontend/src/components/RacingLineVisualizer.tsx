import React from 'react';
import type { CornerDTO } from '../types/telemetry';
import { AlertTriangle, CheckCircle2, CornerDownRight, Zap } from 'lucide-react';

interface RacingLineVisualizerProps {
  corner: CornerDTO;
}

export const RacingLineVisualizer: React.FC<RacingLineVisualizerProps> = ({ corner }) => {
  const svgData = corner.racing_line_svg;

  if (!svgData) {
    return (
      <div className="flex items-center justify-center p-6 text-xs text-gray-500 bg-[#07090E] rounded-lg border border-white/5">
        Geometría de trazada no disponible para esta curva
      </div>
    );
  }

  const isLeft = svgData.turn_dir === 'left';
  const hasSubviraje = svgData.has_subviraje;
  const isEarlyApex = (corner.racing_line_eval || '').includes('Prematuro');
  const isOptimal = (corner.racing_line_eval || '').includes('Óptima');

  return (
    <div className="bg-[#07090E]/80 rounded-xl p-2.5 border border-white/5 flex flex-col space-y-1.5 shrink-0">
      {/* Header with Badges */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CornerDownRight className={`w-3.5 h-3.5 ${isLeft ? '-scale-x-100 text-[#00D2BE]' : 'text-[#00D2BE]'}`} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-white">
            Trazada {isLeft ? 'Viraje a Izquierdas' : 'Viraje a Derechas'}
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2.5 text-[9px] font-telemetry">
          <div className="flex items-center gap-1">
            <span className="w-2 h-0.5 bg-[#00FF7F] border-b border-dashed border-[#00FF7F]" />
            <span className="text-gray-300">Trazada Óptima</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-0.5 bg-[#B138FE]" />
            <span className="text-gray-300">Tu Trazada</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full h-[125px] sm:h-[135px] bg-[#05070B] rounded-lg border border-white/5 overflow-hidden flex items-center justify-center">
        <svg viewBox="0 0 440 230" className="w-full h-full select-none">
          <defs>
            {/* Kerb Pattern Red/White */}
            <pattern id="kerb-pattern" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="8" height="16" fill="#E10600" />
              <rect x="8" width="8" height="16" fill="#F0F0F0" />
            </pattern>
            <filter id="glow-optimal" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#00FF7F" floodOpacity="0.8" />
            </filter>
            <filter id="glow-actual" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#B138FE" floodOpacity="0.9" />
            </filter>
            <filter id="glow-understeer" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#FF4D4D" floodOpacity="0.8" />
            </filter>
          </defs>

          {/* Road Asphalt Base */}
          <path d={svgData.asphalt_fill} fill="#141822" stroke="none" />

          {/* Outer Track Kerb Band */}
          <path
            d={svgData.outer_curb}
            fill="none"
            stroke="url(#kerb-pattern)"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d={svgData.outer_curb}
            fill="none"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="1"
          />

          {/* Inner Track Kerb Band (Apex) */}
          <path
            d={svgData.inner_curb}
            fill="none"
            stroke="url(#kerb-pattern)"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path
            d={svgData.inner_curb}
            fill="none"
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="1"
          />

          {/* Reference / Optimal Racing Line (Green Dashed) */}
          <path
            d={svgData.optimal_line}
            fill="none"
            stroke="#00FF7F"
            strokeWidth="3"
            strokeDasharray="6 4"
            strokeLinecap="round"
            filter="url(#glow-optimal)"
            opacity="0.95"
          />

          {/* Driver's Actual Racing Line (Solid Purple or Red Glow if understeering) */}
          <path
            d={svgData.actual_line}
            fill="none"
            stroke={hasSubviraje ? '#FF385C' : '#B138FE'}
            strokeWidth="3.5"
            strokeLinecap="round"
            filter={hasSubviraje ? 'url(#glow-understeer)' : 'url(#glow-actual)'}
          />

          {/* Annotated Points: Turn-In */}
          <g transform={`translate(${svgData.turn_in.x}, ${svgData.turn_in.y})`}>
            <circle r="4" fill="#00D2BE" />
            <circle r="7" fill="none" stroke="#00D2BE" strokeWidth="1" opacity="0.6" />
            <text
              y={isLeft ? 14 : 14}
              x={isLeft ? 8 : -8}
              textAnchor={isLeft ? 'start' : 'end'}
              fill="#94A3B8"
              fontSize="9px"
              fontFamily="monospace"
              fontWeight="bold"
            >
              Giro
            </text>
          </g>

          {/* Annotated Points: Optimal Apex */}
          <g transform={`translate(${svgData.apex_ref.x}, ${svgData.apex_ref.y})`}>
            <circle r="4.5" fill="#00FF7F" />
            <circle r="8" fill="none" stroke="#00FF7F" strokeWidth="1" opacity="0.5" />
            <text
              y="-8"
              textAnchor="middle"
              fill="#00FF7F"
              fontSize="9px"
              fontFamily="monospace"
              fontWeight="bold"
            >
              Ápice {corner.v_min_ref.toFixed(0)} km/h
            </text>
          </g>

          {/* Annotated Points: Actual Apex Point */}
          <g transform={`translate(${svgData.apex_comp.x}, ${svgData.apex_comp.y})`}>
            <circle r="5" fill={hasSubviraje ? '#FF1801' : '#B138FE'} />
            <circle
              r="9"
              fill="none"
              stroke={hasSubviraje ? '#FF1801' : '#B138FE'}
              strokeWidth="1.5"
              strokeDasharray="2 2"
            />
            <text
              y="18"
              textAnchor="middle"
              fill={hasSubviraje ? '#FF7B72' : '#E9D5FF'}
              fontSize="9px"
              fontFamily="monospace"
              fontWeight="bold"
            >
              {corner.v_min_comp.toFixed(0)} km/h
            </text>
          </g>

          {/* Annotated Points: Track-out Exit */}
          <g transform={`translate(${svgData.exit_pt.x}, ${svgData.exit_pt.y})`}>
            <circle r="4" fill="#FFD700" />
            <text
              y={isLeft ? -7 : -7}
              x={isLeft ? 0 : 0}
              textAnchor="middle"
              fill="#FFD700"
              fontSize="9px"
              fontFamily="monospace"
              fontWeight="bold"
            >
              Salida
            </text>
          </g>
        </svg>

        {/* Floating Mini Dynamic Badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/80 backdrop-blur-md border border-white/10 text-[10px] font-telemetry">
          {hasSubviraje ? (
            <>
              <AlertTriangle className="w-3 h-3 text-[#FF1801]" />
              <span className="text-[#FF7B72] font-bold">Subviraje en Vértice (+1.8m)</span>
            </>
          ) : isEarlyApex ? (
            <>
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span className="text-amber-300 font-bold">Vértice Anticipado</span>
            </>
          ) : isOptimal ? (
            <>
              <CheckCircle2 className="w-3 h-3 text-[#00FF7F]" />
              <span className="text-[#00FF7F] font-bold">Trazada Óptima</span>
            </>
          ) : (
            <>
              <Zap className="w-3 h-3 text-[#00D2BE]" />
              <span className="text-[#00D2BE] font-bold">Vértice Neutro</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
