import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  Fuel,
  Gauge,
  Radio,
  RefreshCw,
  Sparkles,
  Timer,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { fetchStintAnalysis } from '../services/api';
import type { StintAnalysisData } from '../types/telemetry';
import { formatLapTime } from '../utils/formatters';

interface StintDegradationViewProps {
  sessionId?: string | null;
  refLapNumber: number;
  compLapNumber: number;
  onSelectRefLap: (lap: number) => void;
  onSelectCompLap: (lap: number) => void;
  onGoToTelemetry: () => void;
}

export const StintDegradationView: React.FC<StintDegradationViewProps> = ({
  sessionId,
  refLapNumber,
  compLapNumber,
  onSelectRefLap,
  onSelectCompLap,
  onGoToTelemetry,
}) => {
  const [data, setData] = useState<StintAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredLapIdx, setHoveredLapIdx] = useState<number | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchStintAnalysis(sessionId || undefined);
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Error al calcular la degradación de stint');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [sessionId]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <RefreshCw className="w-8 h-8 text-brand animate-spin mb-3" />
        <p className="text-sm text-gray-400 font-telemetry">
          Analizando degradación de neumáticos y evolución de ritmo...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-2xl bg-red-950/40 border border-red-800 text-red-200 text-sm">
        <div className="flex items-center gap-3 mb-2">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <h4 className="font-bold">No se pudo cargar el análisis de stint</h4>
        </div>
        <p className="text-xs text-gray-400 mb-4">{error || 'Datos no disponibles'}</p>
        <button
          onClick={loadData}
          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white transition cursor-pointer"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const {
    track_name,
    car_name,
    valid_laps,
    best_lap_s,
    avg_lap_s,
    std_dev_s,
    pace_trend_s_per_lap,
    consistency_rating,
    fuel_burned_litres,
    degradation_type,
    degradation_diagnosis,
    pit_wall_strategy,
    lap_numbers,
    lap_times,
  } = data;

  const hasMultipleLaps = valid_laps >= 2 && lap_times.length >= 2;

  // Chart coordinate calculation
  const chartHeight = 220;
  const chartWidth = 700;
  const paddingX = 60;
  const paddingY = 30;

  const minLapTime = hasMultipleLaps ? Math.min(...lap_times) : best_lap_s;
  const maxLapTime = hasMultipleLaps ? Math.max(...lap_times) : best_lap_s;
  const timeRange = Math.max(0.4, maxLapTime - minLapTime);
  const yMin = minLapTime - timeRange * 0.15;
  const yMax = maxLapTime + timeRange * 0.15;

  const getX = (idx: number) => {
    if (lap_times.length <= 1) return chartWidth / 2;
    return paddingX + (idx / (lap_times.length - 1)) * (chartWidth - paddingX * 2);
  };

  const getY = (time: number) => {
    return chartHeight - paddingY - ((time - yMin) / (yMax - yMin)) * (chartHeight - paddingY * 2);
  };

  const points = lap_times.map((time, idx) => ({
    x: getX(idx),
    y: getY(time),
    lap: lap_numbers[idx],
    time,
  }));

  const pointsString = points.map((p) => `${p.x},${p.y}`).join(' ');

  // SVG Trend Line calculation
  const trendLineY1 = getY(lap_times[0] ?? best_lap_s);
  const trendLineY2 = getY((lap_times[0] ?? best_lap_s) + pace_trend_s_per_lap * (lap_times.length - 1));

  // Visual status of degradation
  const isPaceDegrading = pace_trend_s_per_lap > 0.15;
  const isPaceImproving = pace_trend_s_per_lap < -0.05;

  return (
    <div className="space-y-6">
      {/* 1. Header Overview Bar */}
      <div className="glass-panel rounded-2xl p-5 border border-white/10 bg-night-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-brand/20 text-brand border border-brand/30 font-telemetry">
                Evolución de Carrera
              </span>
              <span className="text-[11px] text-gray-400 font-telemetry">
                {valid_laps} vueltas cronometradas analizadas
              </span>
            </div>
            <h2 className="text-xl font-bold text-white font-brand mt-1">
              {track_name} • <span className="text-gray-300 font-sans font-medium text-base">{car_name}</span>
            </h2>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={loadData}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer border border-white/5"
              title="Actualizar análisis de stint"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onGoToTelemetry}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand hover:bg-brand-light text-black text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-lg"
            >
              <span>Ver Telemetría</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Key Performance Indicators Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pace Trend */}
        <div className="glass-panel rounded-2xl p-4 bg-night-5 border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-400 font-telemetry">
            <span>Tendencia de Ritmo</span>
            {isPaceDegrading ? (
              <TrendingDown className="w-4 h-4 text-rose-400" />
            ) : isPaceImproving ? (
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            ) : (
              <Activity className="w-4 h-4 text-cyan-400" />
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-black font-telemetry ${
                isPaceDegrading
                  ? 'text-rose-400'
                  : isPaceImproving
                  ? 'text-emerald-400'
                  : 'text-white'
              }`}
            >
              {hasMultipleLaps ? `${pace_trend_s_per_lap > 0 ? '+' : ''}${pace_trend_s_per_lap.toFixed(3)}s` : '±0.000s'}
            </span>
            <span className="text-xs text-gray-400 font-telemetry">/ vuelta</span>
          </div>
          <span
            className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
              isPaceDegrading
                ? 'bg-rose-950/60 border border-rose-800 text-rose-300'
                : isPaceImproving
                ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                : 'bg-white/10 text-gray-300'
            }`}
          >
            {isPaceDegrading
              ? 'Degradación térmica'
              : isPaceImproving
              ? 'Ritmo en progresión'
              : 'Ritmo sostenido'}
          </span>
        </div>

        {/* Consistency */}
        <div className="glass-panel rounded-2xl p-4 bg-night-5 border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-400 font-telemetry">
            <span>Consistencia de Stint</span>
            <Gauge className="w-4 h-4 text-brand" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-telemetry text-white">
              {consistency_rating.split(' ')[0]}
            </span>
            <span className="text-xs text-gray-400 font-telemetry">
              ±{std_dev_s.toFixed(2)}s
            </span>
          </div>
          <span className="inline-block text-[10px] font-bold text-gray-400 font-telemetry">
            Desviación estándar de vuelta
          </span>
        </div>

        {/* Best vs Average Lap */}
        <div className="glass-panel rounded-2xl p-4 bg-night-5 border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-400 font-telemetry">
            <span>Mejor Vuelta vs Media</span>
            <Timer className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-telemetry text-yellow-400">
              {formatLapTime(best_lap_s)}
            </span>
          </div>
          <span className="inline-block text-[10px] text-gray-400 font-telemetry">
            Media: <strong className="text-gray-300">{formatLapTime(avg_lap_s)}</strong> (Δ +{(avg_lap_s - best_lap_s).toFixed(3)}s)
          </span>
        </div>

        {/* Fuel Consumption */}
        <div className="glass-panel rounded-2xl p-4 bg-night-5 border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-400 font-telemetry">
            <span>Combustible Quemado</span>
            <Fuel className="w-4 h-4 text-orange-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-telemetry text-orange-400">
              ~{fuel_burned_litres} L
            </span>
          </div>
          <span className="inline-block text-[10px] text-gray-400 font-telemetry">
            -{(fuel_burned_litres * 0.75).toFixed(1)} kg masa (-{((valid_laps * 0.08)).toFixed(2)}s ganancia)
          </span>
        </div>
      </div>

      {/* 3. Interactive Pace Progression Chart */}
      <div className="glass-panel rounded-2xl p-6 bg-night-5 border border-white/5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/5">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-brand flex items-center gap-2">
              <Activity className="w-4 h-4 text-brand" />
              Curva de Ritmo Vuelta a Vuelta
            </h3>
            <p className="text-xs text-gray-400 font-telemetry mt-0.5">
              Evolución cronometrada del stint vs línea de regresión de degradación
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-telemetry">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-brand" />
              <span className="text-gray-400">Vuelta Ref (#{refLapNumber})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-comp" />
              <span className="text-gray-400">Vuelta Comp (#{compLapNumber})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-yellow-400/80 border-dashed" />
              <span className="text-gray-400">Tendencia</span>
            </div>
          </div>
        </div>

        {hasMultipleLaps ? (
          <div className="relative w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-auto min-w-[500px] select-none"
            >
              {/* Grid Lines */}
              <line
                x1={paddingX}
                y1={paddingY}
                x2={chartWidth - paddingX}
                y2={paddingY}
                stroke="rgba(255,255,255,0.08)"
                strokeDasharray="4,4"
              />
              <line
                x1={paddingX}
                y1={chartHeight / 2}
                x2={chartWidth - paddingX}
                y2={chartHeight / 2}
                stroke="rgba(255,255,255,0.08)"
                strokeDasharray="4,4"
              />
              <line
                x1={paddingX}
                y1={chartHeight - paddingY}
                x2={chartWidth - paddingX}
                y2={chartHeight - paddingY}
                stroke="rgba(255,255,255,0.12)"
              />

              {/* Y-axis Labels */}
              <text
                x={paddingX - 10}
                y={paddingY + 4}
                textAnchor="end"
                className="text-[10px] fill-gray-500 font-telemetry"
              >
                {formatLapTime(yMax)}
              </text>
              <text
                x={paddingX - 10}
                y={chartHeight / 2 + 4}
                textAnchor="end"
                className="text-[10px] fill-gray-500 font-telemetry"
              >
                {formatLapTime((yMax + yMin) / 2)}
              </text>
              <text
                x={paddingX - 10}
                y={chartHeight - paddingY + 4}
                textAnchor="end"
                className="text-[10px] fill-gray-500 font-telemetry"
              >
                {formatLapTime(yMin)}
              </text>

              {/* Area Gradient under curve */}
              <defs>
                <linearGradient id="stintGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#00E5FF" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <polygon
                points={`${paddingX},${chartHeight - paddingY} ${pointsString} ${chartWidth - paddingX},${chartHeight - paddingY}`}
                fill="url(#stintGradient)"
              />

              {/* Trend / Regression Line */}
              <line
                x1={points[0].x}
                y1={trendLineY1}
                x2={points[points.length - 1].x}
                y2={trendLineY2}
                stroke="#FACC15"
                strokeWidth="2"
                strokeDasharray="6,4"
                strokeOpacity="0.75"
              />

              {/* Main Connecting Polyline */}
              <polyline
                fill="none"
                stroke="#00E5FF"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={pointsString}
              />

              {/* Points for each lap */}
              {points.map((p, idx) => {
                const isBest = p.time === best_lap_s;
                const isRef = p.lap === refLapNumber;
                const isComp = p.lap === compLapNumber;
                const isHovered = hoveredLapIdx === idx;

                return (
                  <g
                    key={`point-${p.lap}`}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredLapIdx(idx)}
                    onMouseLeave={() => setHoveredLapIdx(null)}
                    onClick={() => {
                      if (!isRef) onSelectRefLap(p.lap);
                      else onSelectCompLap(p.lap);
                    }}
                  >
                    {/* Ring aura for selected laps */}
                    {(isRef || isComp || isHovered) && (
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={isHovered ? 12 : 9}
                        fill="none"
                        stroke={isRef ? '#00E5FF' : isComp ? '#FF6B00' : '#FFFFFF'}
                        strokeWidth="2"
                        strokeOpacity="0.6"
                        className="animate-pulse"
                      />
                    )}

                    {/* Main circle */}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={isBest ? 6 : 4.5}
                      fill={isRef ? '#00E5FF' : isComp ? '#FF6B00' : isBest ? '#FACC15' : '#FFFFFF'}
                      stroke="#0A0C12"
                      strokeWidth="2"
                    />

                    {/* X-axis Lap Label */}
                    <text
                      x={p.x}
                      y={chartHeight - 8}
                      textAnchor="middle"
                      className={`text-[10px] font-telemetry ${
                        isRef ? 'fill-brand font-bold' : isComp ? 'fill-comp font-bold' : 'fill-gray-400'
                      }`}
                    >
                      #{p.lap}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Hover Tooltip */}
            {hoveredLapIdx !== null && points[hoveredLapIdx] && (
              <div
                className="absolute z-20 pointer-events-none transform -translate-x-1/2 -translate-y-full bg-night-2/95 border border-white/20 p-2.5 rounded-xl shadow-2xl backdrop-blur-md text-xs font-telemetry"
                style={{
                  left: `${(points[hoveredLapIdx].x / chartWidth) * 100}%`,
                  top: `${(points[hoveredLapIdx].y / chartHeight) * 100 - 6}%`,
                }}
              >
                <div className="flex items-center gap-1.5 font-bold text-white mb-0.5">
                  <span>Vuelta #{points[hoveredLapIdx].lap}</span>
                  {points[hoveredLapIdx].time === best_lap_s && (
                    <span className="text-[10px] bg-yellow-400/20 text-yellow-300 px-1 rounded">PB</span>
                  )}
                </div>
                <div className="text-brand font-bold">{formatLapTime(points[hoveredLapIdx].time)}</div>
                <div className="text-[10px] text-gray-400">
                  Δ vs mejor: +{(points[hoveredLapIdx].time - best_lap_s).toFixed(3)}s
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 p-6 rounded-2xl bg-black/30 border border-white/5 space-y-2">
            <p className="text-xs text-gray-400">{degradation_diagnosis}</p>
            <p className="text-[11px] text-gray-500 font-telemetry">
              Se requiere una tanda de al menos 2 vueltas consecutivas para proyectar la gráfica de degradación.
            </p>
          </div>
        )}
      </div>

      {/* 4. Race Engineer Pit-Wall Tactical Board */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Tactical Diagnosis & Strategy */}
        <div className="lg:col-span-8 glass-panel rounded-2xl p-6 bg-night-5 border border-white/10 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-brand/20 border border-brand/40 flex items-center justify-center text-brand">
                <Radio className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-brand uppercase tracking-wider font-telemetry block">
                  CANAL DE RADIO BOXES • FREQ 454.125 MHz
                </span>
                <h4 className="text-sm font-bold text-white font-brand">
                  Debrief de Ingeniero de Pista (Pep)
                </h4>
              </div>
            </div>

            <span
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider font-telemetry ${
                degradation_type === 'rear_traction_decay'
                  ? 'bg-rose-950/80 border border-rose-700 text-rose-300'
                  : degradation_type === 'front_tire_wear'
                  ? 'bg-amber-950/80 border border-amber-700 text-amber-300'
                  : degradation_type === 'improving_pace'
                  ? 'bg-emerald-950/80 border border-emerald-700 text-emerald-300'
                  : 'bg-blue-950/80 border border-blue-700 text-blue-300'
              }`}
            >
              {degradation_type === 'rear_traction_decay'
                ? 'Pérdida de Tracción Trasera (S3)'
                : degradation_type === 'front_tire_wear'
                ? 'Degradación Térmica Delantera'
                : degradation_type === 'improving_pace'
                ? 'Ritmo en Progresión'
                : 'Gestión Óptima de Gomas'}
            </span>
          </div>

          {/* Detailed Diagnosis */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-gray-300 uppercase tracking-wider font-telemetry">
              Diagnóstico de Balance Dinámico
            </span>
            <p className="text-xs text-gray-300 leading-relaxed bg-black/30 p-3.5 rounded-xl border border-white/5">
              {degradation_diagnosis}
            </p>
          </div>

          {/* Pit-Wall Cockpit Radio Action Plan */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-brand uppercase tracking-wider font-telemetry flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Acciones Inmediatas en Cockpit
            </span>
            <div className="p-4 rounded-xl bg-gradient-to-r from-brand/10 to-transparent border-l-4 border-l-brand border-y border-r border-white/5 text-xs text-white leading-relaxed">
              {pit_wall_strategy}
            </div>
          </div>
        </div>

        {/* Laps Selection Table (4 cols) */}
        <div className="lg:col-span-4 glass-panel rounded-2xl p-6 bg-night-5 border border-white/10 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/5">
            <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider font-telemetry">
              Vueltas del Stint ({lap_numbers.length})
            </h4>
            <span className="text-[10px] text-gray-500 font-telemetry">
              Click para comparar
            </span>
          </div>

          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {lap_numbers.map((lapNum, idx) => {
              const time = lap_times[idx];
              const isRef = lapNum === refLapNumber;
              const isComp = lapNum === compLapNumber;
              const isPb = time === best_lap_s;

              return (
                <div
                  key={`lap-row-${lapNum}`}
                  className={`p-2.5 rounded-xl border transition flex items-center justify-between gap-2 ${
                    isRef
                      ? 'bg-brand/15 border-brand/50'
                      : isComp
                      ? 'bg-comp/15 border-comp/50'
                      : 'bg-night-3 border-white/5 hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center font-telemetry ${
                        isRef
                          ? 'bg-brand text-black'
                          : isComp
                          ? 'bg-comp text-white'
                          : 'bg-black/40 text-gray-300'
                      }`}
                    >
                      #{lapNum}
                    </span>
                    <div>
                      <span className="font-telemetry text-xs font-bold text-white flex items-center gap-1">
                        {formatLapTime(time)}
                        {isPb && <span className="text-[9px] text-yellow-400 font-bold">PB</span>}
                      </span>
                      <span className="text-[10px] text-gray-400 font-telemetry block">
                        Δ +{(time - best_lap_s).toFixed(3)}s
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onSelectRefLap(lapNum)}
                      className={`px-2 py-1 rounded text-[10px] font-bold font-telemetry transition cursor-pointer ${
                        isRef
                          ? 'bg-brand text-black'
                          : 'bg-white/5 hover:bg-white/10 text-gray-300'
                      }`}
                      title="Fijar como vuelta de referencia"
                    >
                      {isRef ? 'REF' : 'Ref'}
                    </button>
                    <button
                      onClick={() => onSelectCompLap(lapNum)}
                      className={`px-2 py-1 rounded text-[10px] font-bold font-telemetry transition cursor-pointer ${
                        isComp
                          ? 'bg-comp text-white'
                          : 'bg-white/5 hover:bg-white/10 text-gray-300'
                      }`}
                      title="Fijar como vuelta de comparación"
                    >
                      {isComp ? 'COMP' : 'Comp'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
