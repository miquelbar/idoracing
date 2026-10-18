import { Bot, Gauge } from 'lucide-react';
import type { ComparisonResponse } from '../types/telemetry';

interface TimingTowerProps {
  comparison: ComparisonResponse;
  compact?: boolean;
  onOpenDebrief?: () => void;
  reportAvailable?: boolean;
}

function formatLapTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '--:--.---';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(3).padStart(6, '0')}`;
}

function formatDelta(seconds: number): string {
  if (isNaN(seconds)) return '+0.000s';
  const sign = seconds > 0 ? '+' : '';
  return `${sign}${seconds.toFixed(3)}s`;
}

export const TimingTower: React.FC<TimingTowerProps> = ({
  comparison,
  compact = false,
  onOpenDebrief,
  reportAvailable = false,
}) => {
  const refS1 = comparison.ref_sectors?.['S1'] ?? 0;
  const refS2 = comparison.ref_sectors?.['S2'] ?? 0;
  const refS3 = comparison.ref_sectors?.['S3'] ?? 0;

  const compS1 = comparison.comp_sectors?.['S1'] ?? 0;
  const compS2 = comparison.comp_sectors?.['S2'] ?? 0;
  const compS3 = comparison.comp_sectors?.['S3'] ?? 0;

  const deltaS1 = compS1 && refS1 ? compS1 - refS1 : 0;
  const deltaS2 = compS2 && refS2 ? compS2 - refS2 : 0;
  const deltaS3 = compS3 && refS3 ? compS3 - refS3 : 0;

  const maxSpeedRef = Math.max(...(comparison.ref_speed || [0]));
  const maxSpeedComp = Math.max(...(comparison.comp_speed || [0]));

  const minSpeedRef = Math.min(...(comparison.ref_speed || [999]));
  const minSpeedComp = Math.min(...(comparison.comp_speed || [999]));

  // Compact Single-Row Ribbon Mode (Laptop-first, 42-46px)
  if (compact) {
    return (
      <div className="w-full glass-panel rounded-xl px-4 py-2 border border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs font-telemetry shrink-0 shadow-sm">
        {/* Laps & Times */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-[#00D2BE]/20 text-[#00D2BE] font-bold text-[10px] tracking-wide border border-[#00D2BE]/30">
              P1 REF
            </span>
            <span className="text-white font-bold tracking-tight">
              {formatLapTime(comparison.ref_lap_time)}
            </span>
          </div>

          <span className="text-gray-600">vs</span>

          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-[#B138FE]/20 text-[#D8B4FE] font-bold text-[10px] tracking-wide border border-[#B138FE]/30">
              P2 COMP
            </span>
            <span className="text-white font-bold tracking-tight">
              {formatLapTime(comparison.comp_lap_time)}
            </span>
          </div>

          {/* GAP Pill */}
          <span
            className={`px-2.5 py-0.5 rounded font-extrabold text-[11px] shadow-sm ml-1 ${
              comparison.delta_time_total > 0
                ? 'bg-[#E10600]/20 text-[#FF453A] border border-[#E10600]/40'
                : 'bg-[#00D2BE]/20 text-[#00D2BE] border border-[#00D2BE]/40'
            }`}
          >
            GAP {formatDelta(comparison.delta_time_total)}
          </span>
        </div>

        {/* Micro-Sectors */}
        <div className="flex items-center gap-2 sm:gap-3 text-[11px] border-l border-r border-white/10 px-3">
          <span className="text-gray-400">
            S1:{' '}
            <strong className={deltaS1 <= 0 ? 'text-[#00D2BE]' : 'text-amber-400'}>
              {formatDelta(deltaS1)}
            </strong>
          </span>
          <span className="text-gray-600">•</span>
          <span className="text-gray-400">
            S2:{' '}
            <strong className={deltaS2 <= 0 ? 'text-[#00D2BE]' : 'text-amber-400'}>
              {formatDelta(deltaS2)}
            </strong>
          </span>
          <span className="text-gray-600">•</span>
          <span className="text-gray-400">
            S3:{' '}
            <strong className={deltaS3 <= 0 ? 'text-[#00D2BE]' : 'text-amber-400'}>
              {formatDelta(deltaS3)}
            </strong>
          </span>
        </div>

        {/* Speed Stats & AI Button */}
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-3 text-[11px] text-gray-400">
            <span>
              Vmax: <strong className="text-white">{Math.round(maxSpeedComp)}</strong>{' '}
              <span className="text-gray-500 text-[10px]">km/h</span>{' '}
              <span className="text-gray-600">({Math.round(maxSpeedRef)})</span>
            </span>
            <span>•</span>
            <span>
              Vmin: <strong className="text-white">{Math.round(minSpeedComp)}</strong>{' '}
              <span className="text-gray-500 text-[10px]">km/h</span>{' '}
              <span className="text-gray-600">({Math.round(minSpeedRef)})</span>
            </span>
          </div>

          {onOpenDebrief && (
            <button
              onClick={onOpenDebrief}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gradient-to-r from-[#00D2BE]/20 to-[#B138FE]/20 hover:from-[#00D2BE]/30 hover:to-[#B138FE]/30 border border-[#00D2BE]/40 hover:border-[#00D2BE] text-white font-sans text-xs font-bold transition shadow-sm cursor-pointer"
            >
              <Bot className="w-3.5 h-3.5 text-[#00D2BE]" />
              <span>Debrief & Radio IA</span>
              {reportAvailable && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#00D2BE] animate-ping" />
              )}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-3 mb-4">
      {/* P1: Reference Lap Card */}
      <div className="lg:col-span-5 glass-panel rounded-xl p-4 border-l-4 border-l-[#00D2BE] flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded bg-[#00D2BE]/20 border border-[#00D2BE]/40 flex items-center justify-center font-telemetry font-extrabold text-xs text-[#00D2BE]">
              P1
            </div>
            <div>
              <h3 className="font-bold text-xs text-white truncate max-w-[220px]">
                {comparison.car_name}
              </h3>
              <span className="text-[10px] text-gray-400 font-telemetry">{comparison.ref_lap_id} • {comparison.track_name}</span>
            </div>
          </div>
          <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-[#00D2BE]/15 text-[#00D2BE] border border-[#00D2BE]/30 font-telemetry">
            REFERENCIA
          </span>
        </div>

        <div className="flex items-baseline justify-between mt-3">
          <div>
            <span className="text-xs text-gray-400 font-semibold block uppercase tracking-wider">
              Tiempo de Vuelta
            </span>
            <span className="font-telemetry text-3xl font-extrabold text-white tracking-tight drop-shadow-[0_0_10px_rgba(0,210,190,0.3)]">
              {formatLapTime(comparison.ref_lap_time)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded bg-[#B138FE] text-white font-telemetry font-bold text-xs uppercase shadow-[0_0_12px_rgba(177,56,254,0.4)]">
              PURPLE
            </span>
          </div>
        </div>

        {/* Micro Sectors */}
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/5 font-telemetry text-xs">
          <div className="bg-[#0D1017] p-2 rounded border border-white/5">
            <span className="text-[10px] text-gray-400 block">SECTOR 1</span>
            <span className="text-white font-bold">{refS1 ? `${refS1.toFixed(3)}s` : '--.---'}</span>
          </div>
          <div className="bg-[#0D1017] p-2 rounded border border-white/5">
            <span className="text-[10px] text-gray-400 block">SECTOR 2</span>
            <span className="text-white font-bold">{refS2 ? `${refS2.toFixed(3)}s` : '--.---'}</span>
          </div>
          <div className="bg-[#0D1017] p-2 rounded border border-white/5">
            <span className="text-[10px] text-gray-400 block">SECTOR 3</span>
            <span className="text-white font-bold">{refS3 ? `${refS3.toFixed(3)}s` : '--.---'}</span>
          </div>
        </div>
      </div>

      {/* P2: Comparison Lap Card */}
      <div className="lg:col-span-5 glass-panel rounded-xl p-4 border-l-4 border-l-[#B138FE] flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded bg-[#B138FE]/20 border border-[#B138FE]/40 flex items-center justify-center font-telemetry font-extrabold text-xs text-[#B138FE]">
              P2
            </div>
            <div>
              <h3 className="font-bold text-xs text-white truncate max-w-[220px]">
                {comparison.comp_lap_id}
              </h3>
              <span className="text-[10px] text-gray-400 font-telemetry">Vuelta de Análisis</span>
            </div>
          </div>
          <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-[#B138FE]/15 text-[#B138FE] border border-[#B138FE]/30 font-telemetry">
            COMPARADA
          </span>
        </div>

        <div className="flex items-baseline justify-between mt-3">
          <div>
            <span className="text-xs text-gray-400 font-semibold block uppercase tracking-wider">
              Tiempo de Vuelta
            </span>
            <span className="font-telemetry text-3xl font-extrabold text-white tracking-tight">
              {formatLapTime(comparison.comp_lap_time)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded font-telemetry font-extrabold text-sm shadow-md ${
                comparison.delta_time_total > 0
                  ? 'bg-[#E10600]/20 text-[#FF453A] border border-[#E10600]/40 shadow-[0_0_12px_rgba(225,6,0,0.3)]'
                  : 'bg-[#00D2BE]/20 text-[#00D2BE] border border-[#00D2BE]/40'
              }`}
            >
              GAP {formatDelta(comparison.delta_time_total)}
            </span>
          </div>
        </div>

        {/* Micro Sectors Comparison */}
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/5 font-telemetry text-xs">
          <div className="bg-[#0D1017] p-2 rounded border border-white/5 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-gray-400 block">S1</span>
              <span className="text-white font-bold">{compS1 ? `${compS1.toFixed(3)}s` : '--.---'}</span>
            </div>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                deltaS1 <= 0 ? 'bg-[#00D2BE]/20 text-[#00D2BE]' : 'bg-[#FFD700]/20 text-[#FFD700]'
              }`}
            >
              {formatDelta(deltaS1)}
            </span>
          </div>

          <div className="bg-[#0D1017] p-2 rounded border border-white/5 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-gray-400 block">S2</span>
              <span className="text-white font-bold">{compS2 ? `${compS2.toFixed(3)}s` : '--.---'}</span>
            </div>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                deltaS2 <= 0 ? 'bg-[#00D2BE]/20 text-[#00D2BE]' : 'bg-[#FFD700]/20 text-[#FFD700]'
              }`}
            >
              {formatDelta(deltaS2)}
            </span>
          </div>

          <div className="bg-[#0D1017] p-2 rounded border border-white/5 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-gray-400 block">S3</span>
              <span className="text-white font-bold">{compS3 ? `${compS3.toFixed(3)}s` : '--.---'}</span>
            </div>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                deltaS3 <= 0 ? 'bg-[#00D2BE]/20 text-[#00D2BE]' : 'bg-[#FFD700]/20 text-[#FFD700]'
              }`}
            >
              {formatDelta(deltaS3)}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Metrics Widget */}
      <div className="lg:col-span-2 glass-panel rounded-xl p-4 flex flex-col justify-between">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 uppercase font-bold tracking-wider mb-2">
          <Gauge className="w-4 h-4 text-[#00D2BE]" />
          <span>V-Trap & Apex</span>
        </div>

        <div className="space-y-3 font-telemetry">
          <div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>Vel. Máxima</span>
              <span className="text-gray-300">
                {Math.round(maxSpeedComp)} <span className="text-[10px]">km/h</span>
              </span>
            </div>
            <div className="flex justify-between text-[11px] text-gray-500">
              <span>Ref</span>
              <span>{Math.round(maxSpeedRef)} km/h</span>
            </div>
          </div>

          <div className="pt-2 border-t border-white/5">
            <div className="flex justify-between text-xs text-gray-400">
              <span>V-Mínima</span>
              <span className="text-gray-300">
                {Math.round(minSpeedComp)} <span className="text-[10px]">km/h</span>
              </span>
            </div>
            <div className="flex justify-between text-[11px] text-gray-500">
              <span>Ref</span>
              <span>{Math.round(minSpeedRef)} km/h</span>
            </div>
          </div>
        </div>

        <div className="mt-2 pt-2 border-t border-white/5 text-[10px] text-gray-400 font-telemetry flex items-center justify-between">
          <span>Curvas analizadas</span>
          <span className="font-bold text-white">{comparison.corners.length}</span>
        </div>
      </div>
    </div>
  );
};
