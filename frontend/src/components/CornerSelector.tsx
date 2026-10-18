import { Zap } from 'lucide-react';
import type { CornerDTO } from '../types/telemetry';

interface CornerSelectorProps {
  corners: CornerDTO[];
  selectedCorner: CornerDTO | null;
  onSelectCorner: (corner: CornerDTO | null) => void;
}

export const CornerSelector: React.FC<CornerSelectorProps> = ({
  corners,
  selectedCorner,
  onSelectCorner,
}) => {
  return (
    <div className="glass-panel rounded-xl p-4 mt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-[#00D2BE]" />
          <h3 className="font-bold text-sm text-white tracking-wide uppercase">
            Análisis Telemétrico por Segmento (Curvas T1 — T{corners.length})
          </h3>
        </div>
        <span className="text-xs text-gray-400 font-telemetry">
          Haz clic en cualquier curva para auto-zoom y análisis de ápice
        </span>
      </div>

      {/* Grid of Corners */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
        {corners.map((c) => {
          const isSelected = selectedCorner?.corner_number === c.corner_number;
          const isLostTime = c.delta_time > 0.08;
          const isGainedTime = c.delta_time < -0.05;

          return (
            <div
              key={`corner-card-${c.corner_number}`}
              onClick={() => onSelectCorner(isSelected ? null : c)}
              className={`p-3 rounded-lg border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'bg-[#1C162E] border-[#B138FE] shadow-[0_0_15px_rgba(177,56,254,0.3)] ring-1 ring-[#B138FE]'
                  : 'bg-[#0E121B] hover:bg-[#151B27] border-white/5 hover:border-white/15'
              }`}
            >
              {/* Top row: Badge & Delta */}
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={`w-6 h-6 rounded flex items-center justify-center font-telemetry font-bold text-xs ${
                    isSelected
                      ? 'bg-[#B138FE] text-white shadow-md'
                      : 'bg-[#18202E] text-gray-200 border border-white/10'
                  }`}
                >
                  T{c.corner_number}
                </span>

                <span
                  className={`font-telemetry text-xs font-bold ${
                    isLostTime
                      ? 'text-[#FF453A]'
                      : isGainedTime
                      ? 'text-[#00FF7F]'
                      : 'text-gray-400'
                  }`}
                >
                  {c.delta_time > 0 ? '+' : ''}
                  {c.delta_time.toFixed(3)}s
                </span>
              </div>

              {/* Corner Name */}
              <span className="text-[11px] font-semibold text-gray-200 truncate mb-2" title={c.name}>
                {c.name}
              </span>

              {/* Metrics */}
              <div className="space-y-1 font-telemetry text-[10px] text-gray-400 border-t border-white/5 pt-1.5">
                <div className="flex justify-between">
                  <span>ΔV min:</span>
                  <span
                    className={
                      c.delta_v_min >= 0 ? 'text-[#00FF7F] font-bold' : 'text-[#FF453A] font-bold'
                    }
                  >
                    {c.delta_v_min > 0 ? '+' : ''}
                    {c.delta_v_min.toFixed(1)} km/h
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>Frenada:</span>
                  <span className="text-gray-300">
                    {c.braking_point_delta > 0
                      ? `+${Math.round(c.braking_point_delta)}m tarde`
                      : c.braking_point_delta < 0
                      ? `${Math.round(c.braking_point_delta)}m pronto`
                      : 'Exacta'}
                  </span>
                </div>
              </div>

              {/* Diagnosis Pill */}
              <div className="mt-2 pt-1 border-t border-white/5">
                <span
                  className={`text-[9px] font-bold tracking-wider uppercase block truncate ${
                    c.severity === 'critical'
                      ? 'text-[#FF453A]'
                      : c.severity === 'warning'
                      ? 'text-[#FFD700]'
                      : c.severity === 'success'
                      ? 'text-[#00D2BE]'
                      : 'text-gray-400'
                  }`}
                  title={c.diagnosis}
                >
                  {c.diagnosis.split('.')[0]}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
