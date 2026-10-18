import React, { useEffect, useState } from 'react';
import {
  Calendar,
  ChevronRight,
  Clock,
  RefreshCw,
  Sparkles,
  Trophy,
  Wrench,
} from 'lucide-react';
import { fetchCarSetup, fetchLapHistory } from '../services/api';
import type { CarSetupData, LapHistoryData } from '../types/telemetry';

interface SetupHistoryViewProps {
  selectedSessionId: string | null;
  trackName: string;
  carName: string;
  onGoToTelemetry: () => void;
}

export const SetupHistoryView: React.FC<SetupHistoryViewProps> = ({
  selectedSessionId,
  trackName,
  carName,
  onGoToTelemetry,
}) => {
  const [historyData, setHistoryData] = useState<LapHistoryData | null>(null);
  const [setupData, setSetupData] = useState<CarSetupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCompLapNum, setSelectedCompLapNum] = useState<number | null>(null);
  const [setupCategory, setSetupCategory] = useState<'tyres' | 'electronics' | 'brakes' | 'aero' | 'suspension'>('tyres');

  const loadData = async (compLap?: number) => {
    try {
      setLoading(true);
      setError(null);
      const [hist, setup] = await Promise.all([
        fetchLapHistory(selectedSessionId || undefined, compLap),
        fetchCarSetup(selectedSessionId || undefined),
      ]);
      setHistoryData(hist);
      setSetupData(setup);
      if (hist.comparison_lap && selectedCompLapNum === null) {
        setSelectedCompLapNum(hist.comparison_lap.lap_number);
      }
    } catch (err: any) {
      setError(err?.message || 'Error cargando datos de setup e historial');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedCompLapNum || undefined);
  }, [selectedSessionId, selectedCompLapNum]);

  if (loading && !historyData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <RefreshCw className="w-8 h-8 text-[#00D2BE] animate-spin mb-3" />
        <p className="text-sm text-gray-400">Cargando historial de vueltas y setup del coche...</p>
      </div>
    );
  }

  if (error || !historyData) {
    return (
      <div className="p-6 rounded-xl bg-red-950/40 border border-red-800 text-red-200 text-sm">
        <p className="font-bold mb-1">No se pudieron cargar los datos</p>
        <p className="text-xs text-gray-400">{error || 'Historial no disponible'}</p>
        <button
          onClick={() => loadData()}
          className="mt-3 px-3 py-1.5 rounded bg-white/10 hover:bg-white/15 text-xs text-white"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const pb = historyData.pb_lap;
  const comp = historyData.comparison_lap || (historyData.laps.length > 1 ? historyData.laps[1] : pb);
  const isSelf = comp.lap_number === pb.lap_number;

  return (
    <div className="space-y-6">
      {/* 1. Header: Comparative Overview */}
      <div className="glass-panel rounded-xl p-5 border-l-4 border-l-[#FFD700] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-4 h-4 text-[#FFD700]" />
            <h3 className="text-lg font-black text-white uppercase tracking-wide">
              Comparativa de Mejor Vuelta Personal (PB) vs Histórico
            </h3>
          </div>
          <p className="text-xs text-gray-400">
            {trackName} • {carName} • Analiza cómo evolucionó tu rendimiento frente a tandas o sesiones anteriores.
          </p>
        </div>

        <button
          onClick={onGoToTelemetry}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00D2BE] hover:bg-[#00E5CF] text-black text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-md self-start md:self-auto"
        >
          <span>Abrir en Telemetría & Trazada</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Top Split: PB Card vs Comparison Lap Card + Sector Deltas */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* PB Lap Card (4 cols) */}
        <div className="md:col-span-4 p-5 rounded-xl bg-gradient-to-b from-[#141C29] to-[#0A0D14] border border-[#FFD700]/40 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="px-2 py-0.5 rounded bg-[#FFD700]/20 text-[#FFD700] font-telemetry font-bold text-[10px] tracking-wider uppercase border border-[#FFD700]/30 flex items-center gap-1">
              <Trophy className="w-3 h-3" />
              Mejor Tiempo Personal (PB)
            </span>
            <span className="text-[11px] text-gray-400 font-telemetry">Vuelta #{pb.lap_number}</span>
          </div>

          <div className="text-3xl font-black font-telemetry text-white mb-2 drop-shadow-md">
            {pb.lap_time_str}
          </div>

          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/10 font-telemetry text-xs">
            <div>
              <span className="text-[10px] text-gray-400 block">S1</span>
              <span className="text-white font-bold">{pb.sector_times[0]?.toFixed(3) || '--'}s</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 block">S2</span>
              <span className="text-white font-bold">{pb.sector_times[1]?.toFixed(3) || '--'}s</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 block">S3</span>
              <span className="text-white font-bold">{pb.sector_times[2]?.toFixed(3) || '--'}s</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-gray-400 font-telemetry mt-3 pt-2 border-t border-white/5">
            <span>V-Max: <strong className="text-white">{pb.v_max} km/h</strong></span>
            <span>Fecha: {pb.date}</span>
          </div>
        </div>

        {/* Comparison Lap Card (4 cols) */}
        <div className="md:col-span-4 p-5 rounded-xl bg-gradient-to-b from-[#181528] to-[#0A0D14] border border-[#B138FE]/40 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="px-2 py-0.5 rounded bg-[#B138FE]/20 text-[#B138FE] font-telemetry font-bold text-[10px] tracking-wider uppercase border border-[#B138FE]/30 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Vuelta Comparada
            </span>
            <span className="text-[11px] text-gray-400 font-telemetry">Vuelta #{comp.lap_number}</span>
          </div>

          <div className="text-3xl font-black font-telemetry text-white mb-2 drop-shadow-md">
            {comp.lap_time_str}
          </div>

          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/10 font-telemetry text-xs">
            <div>
              <span className="text-[10px] text-gray-400 block">S1</span>
              <span className="text-white font-bold">{comp.sector_times[0]?.toFixed(3) || '--'}s</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 block">S2</span>
              <span className="text-white font-bold">{comp.sector_times[1]?.toFixed(3) || '--'}s</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 block">S3</span>
              <span className="text-white font-bold">{comp.sector_times[2]?.toFixed(3) || '--'}s</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-gray-400 font-telemetry mt-3 pt-2 border-t border-white/5">
            <span>V-Max: <strong className="text-white">{comp.v_max} km/h</strong></span>
            <span>Fecha: {comp.date}</span>
          </div>
        </div>

        {/* Delta Card (4 cols) */}
        <div className="md:col-span-4 p-5 rounded-xl bg-[#0C0F17] border border-white/10 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
              Diferencia Frente a Tu PB
            </span>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-3xl font-black font-telemetry ${
                  isSelf
                    ? 'text-gray-400'
                    : historyData.delta_total > 0
                    ? 'text-[#FF4D4D]'
                    : 'text-[#00FF7F]'
                }`}
              >
                {isSelf ? '0.000s' : `${historyData.delta_total > 0 ? '+' : ''}${historyData.delta_total.toFixed(3)}s`}
              </span>
              <span className="text-xs text-gray-400 font-telemetry">
                {isSelf ? '(Misma Vuelta)' : historyData.delta_total > 0 ? 'más lenta que PB' : 'más rápida'}
              </span>
            </div>
          </div>

          {/* Sector by Sector Delta */}
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/10 font-telemetry text-xs">
            <div className="p-2 rounded bg-black/40 border border-white/5 text-center">
              <span className="text-[9px] text-gray-400 block">Δ S1</span>
              <span className={historyData.delta_s1 > 0 ? 'text-[#FF4D4D] font-bold' : 'text-[#00FF7F] font-bold'}>
                {historyData.delta_s1 > 0 ? '+' : ''}{historyData.delta_s1.toFixed(3)}s
              </span>
            </div>
            <div className="p-2 rounded bg-black/40 border border-white/5 text-center">
              <span className="text-[9px] text-gray-400 block">Δ S2</span>
              <span className={historyData.delta_s2 > 0 ? 'text-[#FF4D4D] font-bold' : 'text-[#00FF7F] font-bold'}>
                {historyData.delta_s2 > 0 ? '+' : ''}{historyData.delta_s2.toFixed(3)}s
              </span>
            </div>
            <div className="p-2 rounded bg-black/40 border border-white/5 text-center">
              <span className="text-[9px] text-gray-400 block">Δ S3</span>
              <span className={historyData.delta_s3 > 0 ? 'text-[#FF4D4D] font-bold' : 'text-[#00FF7F] font-bold'}>
                {historyData.delta_s3 > 0 ? '+' : ''}{historyData.delta_s3.toFixed(3)}s
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Laps History Table */}
      <div className="glass-panel rounded-xl p-4 overflow-hidden">
        <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-[#00D2BE]" />
          Historial de Vueltas Registradas en este Circuito (Elige para Comparar)
        </h4>

        <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
          {historyData.laps.map((lap) => {
            const isPB = lap.is_pb;
            const isSelected = lap.lap_number === comp.lap_number;

            return (
              <div
                key={`hist-lap-${lap.lap_number}`}
                onClick={() => setSelectedCompLapNum(lap.lap_number)}
                className={`p-3 rounded-lg border transition flex items-center justify-between gap-4 cursor-pointer ${
                  isSelected
                    ? 'bg-[#B138FE]/15 border-[#B138FE]/50 shadow-sm'
                    : isPB
                    ? 'bg-[#FFD700]/10 border-[#FFD700]/40'
                    : 'bg-[#0A0E17] border-white/5 hover:border-white/15'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-telemetry font-bold text-xs ${
                      isPB ? 'bg-[#FFD700] text-black' : 'bg-black/50 text-white border border-white/10'
                    }`}
                  >
                    #{lap.lap_number}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-telemetry text-sm font-bold text-white">{lap.lap_time_str}</span>
                      {isPB && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#FFD700]/20 text-[#FFD700] border border-[#FFD700]/40">
                          PB
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-gray-400 font-telemetry">
                      <span>S1: {lap.sector_times[0]?.toFixed(3) || '--'}s</span>
                      <span>S2: {lap.sector_times[1]?.toFixed(3) || '--'}s</span>
                      <span>S3: {lap.sector_times[2]?.toFixed(3) || '--'}s</span>
                      <span>• V-Max: {lap.v_max} km/h</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 font-telemetry text-xs">
                  <span className={lap.gap_to_pb === 0 ? 'text-[#FFD700] font-bold' : 'text-[#FF7B72]'}>
                    {lap.gap_to_pb === 0 ? '0.000s' : `+${lap.gap_to_pb.toFixed(3)}s`}
                  </span>
                  <button
                    className={`px-2.5 py-1 rounded text-[11px] font-bold transition ${
                      isSelected ? 'bg-[#B138FE] text-white' : 'bg-white/5 hover:bg-white/10 text-gray-300'
                    }`}
                  >
                    {isSelected ? '✓ Comparando' : 'Comparar'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Car Setup Inspector (Settings Sheet) */}
      {setupData && (
        <div className="glass-panel rounded-xl p-5 border border-white/10 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#00D2BE]/20 border border-[#00D2BE]/40 flex items-center justify-center text-[#00D2BE]">
                <Wrench className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                  Hoja de Reglajes & Setup del Coche ({setupData.setup_name})
                </h4>
                <p className="text-xs text-gray-400 font-telemetry">
                  {setupData.car_name} • {setupData.track_name} • Competición GT3 / LMGT3
                </p>
              </div>
            </div>

            {/* Category Tabs */}
            <div className="flex items-center gap-1 bg-[#090D15] p-1 rounded-lg border border-white/5">
              <button
                onClick={() => setSetupCategory('tyres')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  setupCategory === 'tyres' ? 'bg-[#00D2BE] text-black' : 'text-gray-400 hover:text-white'
                }`}
              >
                Neumáticos
              </button>
              <button
                onClick={() => setSetupCategory('electronics')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  setupCategory === 'electronics' ? 'bg-[#00D2BE] text-black' : 'text-gray-400 hover:text-white'
                }`}
              >
                Electrónica
              </button>
              <button
                onClick={() => setSetupCategory('brakes')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  setupCategory === 'brakes' ? 'bg-[#00D2BE] text-black' : 'text-gray-400 hover:text-white'
                }`}
              >
                Frenos
              </button>
              <button
                onClick={() => setSetupCategory('aero')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  setupCategory === 'aero' ? 'bg-[#00D2BE] text-black' : 'text-gray-400 hover:text-white'
                }`}
              >
                Aerodinámica
              </button>
              <button
                onClick={() => setSetupCategory('suspension')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  setupCategory === 'suspension' ? 'bg-[#00D2BE] text-black' : 'text-gray-400 hover:text-white'
                }`}
              >
                Chasis
              </button>
            </div>
          </div>

          {/* Tab Content Display */}
          {setupCategory === 'tyres' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-[#090D15] border border-white/5">
                <h5 className="text-xs font-bold text-[#00D2BE] uppercase tracking-wider mb-3">
                  Presiones en Caliente (Hot Pressures)
                </h5>
                <div className="grid grid-cols-2 gap-3 font-telemetry">
                  <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                    <span className="text-[10px] text-gray-400 block">Delantero Izq (FL)</span>
                    <span className="text-lg font-bold text-white">{setupData.tyres.pressures_hot_psi.FL} PSI</span>
                    <span className="text-[10px] text-gray-500 block">Caída: {setupData.tyres.camber_deg.FL}°</span>
                  </div>
                  <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                    <span className="text-[10px] text-gray-400 block">Delantero Der (FR)</span>
                    <span className="text-lg font-bold text-white">{setupData.tyres.pressures_hot_psi.FR} PSI</span>
                    <span className="text-[10px] text-gray-500 block">Caída: {setupData.tyres.camber_deg.FR}°</span>
                  </div>
                  <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                    <span className="text-[10px] text-gray-400 block">Trasero Izq (RL)</span>
                    <span className="text-lg font-bold text-white">{setupData.tyres.pressures_hot_psi.RL} PSI</span>
                    <span className="text-[10px] text-gray-500 block">Caída: {setupData.tyres.camber_deg.RL}°</span>
                  </div>
                  <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                    <span className="text-[10px] text-gray-400 block">Trasero Der (RR)</span>
                    <span className="text-lg font-bold text-white">{setupData.tyres.pressures_hot_psi.RR} PSI</span>
                    <span className="text-[10px] text-gray-500 block">Caída: {setupData.tyres.camber_deg.RR}°</span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#090D15] border border-white/5 flex flex-col justify-between">
                <div>
                  <h5 className="text-xs font-bold text-white uppercase tracking-wider mb-2">
                    Compuesto & Alineación
                  </h5>
                  <p className="text-xs text-gray-300 font-telemetry mb-3">
                    Compuesto activo: <strong className="text-[#00D2BE]">{setupData.tyres.compound}</strong>
                  </p>
                  <div className="space-y-2 text-xs font-telemetry text-gray-400">
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span>Convergencia Delantera (Toe FL/FR):</span>
                      <span className="text-white font-bold">{setupData.tyres.toe_deg.FL}°</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span>Convergencia Trasera (Toe RL/RR):</span>
                      <span className="text-white font-bold">{setupData.tyres.toe_deg.RL}°</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 p-2.5 rounded bg-blue-950/40 border border-blue-500/20 text-[11px] text-blue-200">
                  💡 Ventana de presión óptima recomendada para GT3: 26.5 – 27.2 PSI en caliente.
                </div>
              </div>
            </div>
          )}

          {setupCategory === 'electronics' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-telemetry">
              <div className="p-4 rounded-xl bg-[#090D15] border border-white/5 text-center">
                <span className="text-[10px] text-gray-400 block uppercase">Control Tracción 1 (TC1)</span>
                <span className="text-2xl font-black text-[#00D2BE] my-1 block">{setupData.electronics.tc1}</span>
                <span className="text-[10px] text-gray-500">Corte de deslizamiento</span>
              </div>
              <div className="p-4 rounded-xl bg-[#090D15] border border-white/5 text-center">
                <span className="text-[10px] text-gray-400 block uppercase">Control Tracción 2 (TC2)</span>
                <span className="text-2xl font-black text-[#00D2BE] my-1 block">{setupData.electronics.tc2}</span>
                <span className="text-[10px] text-gray-500">Amplitud de corrección</span>
              </div>
              <div className="p-4 rounded-xl bg-[#090D15] border border-white/5 text-center">
                <span className="text-[10px] text-gray-400 block uppercase">Antibloqueo (ABS)</span>
                <span className="text-2xl font-black text-[#00FF7F] my-1 block">{setupData.electronics.abs}</span>
                <span className="text-[10px] text-gray-500">Sensibilidad de frenada</span>
              </div>
              <div className="p-4 rounded-xl bg-[#090D15] border border-white/5 text-center">
                <span className="text-[10px] text-gray-400 block uppercase">Mapa Motor (ECU Map)</span>
                <span className="text-2xl font-black text-[#FFD700] my-1 block">{setupData.electronics.ecu_map}</span>
                <span className="text-[10px] text-gray-500">Mapa seco competitivo</span>
              </div>
            </div>
          )}

          {setupCategory === 'brakes' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-telemetry">
              <div className="p-4 rounded-xl bg-[#090D15] border border-white/5">
                <span className="text-[10px] text-gray-400 block uppercase">Reparto de Frenada (Brake Bias)</span>
                <span className="text-2xl font-black text-[#FF1801] my-1 block">{setupData.brakes.bias_pct}%</span>
                <span className="text-[10px] text-gray-400">Reparto hacia el eje delantero</span>
              </div>
              <div className="p-4 rounded-xl bg-[#090D15] border border-white/5">
                <span className="text-[10px] text-gray-400 block uppercase">Compuesto de Pastillas</span>
                <span className="text-base font-bold text-white my-1 block">{setupData.brakes.pad_type}</span>
                <span className="text-[10px] text-gray-400">Máxima mordida inicial</span>
              </div>
              <div className="p-4 rounded-xl bg-[#090D15] border border-white/5">
                <span className="text-[10px] text-gray-400 block uppercase">Conductos de Freno (Ducts)</span>
                <span className="text-base font-bold text-white my-1 block">
                  Delanteros: {setupData.brakes.ducts.front} • Traseros: {setupData.brakes.ducts.rear}
                </span>
                <span className="text-[10px] text-gray-400">Refrigeración equilibrada</span>
              </div>
            </div>
          )}

          {setupCategory === 'aero' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-telemetry">
              <div className="p-4 rounded-xl bg-[#090D15] border border-white/5">
                <span className="text-[10px] text-gray-400 block uppercase">Alerón Trasero (Rear Wing)</span>
                <span className="text-2xl font-black text-[#00D2BE] my-1 block">{setupData.aerodynamics.rear_wing}</span>
                <span className="text-[10px] text-gray-400">Carga media-alta para virajes</span>
              </div>
              <div className="p-4 rounded-xl bg-[#090D15] border border-white/5">
                <span className="text-[10px] text-gray-400 block uppercase">Altura de Carrocería</span>
                <span className="text-base font-bold text-white my-1 block">
                  Del: {setupData.aerodynamics.ride_height_mm.front} mm • Tras: {setupData.aerodynamics.ride_height_mm.rear} mm
                </span>
                <span className="text-[10px] text-gray-400">Rake aerodinámico: +{setupData.aerodynamics.rake_mm} mm</span>
              </div>
              <div className="p-4 rounded-xl bg-[#090D15] border border-white/5">
                <span className="text-[10px] text-gray-400 block uppercase">Splitter Delantero</span>
                <span className="text-base font-bold text-white my-1 block">{setupData.aerodynamics.front_splitter}</span>
                <span className="text-[10px] text-gray-400">Agarre en entrada de curva</span>
              </div>
            </div>
          )}

          {setupCategory === 'suspension' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-telemetry">
              <div className="p-4 rounded-xl bg-[#090D15] border border-white/5">
                <span className="text-[10px] text-gray-400 block uppercase">Barra Estabilizadora Del. (ARB)</span>
                <span className="text-2xl font-black text-white my-1 block">{setupData.suspension.front_arb}</span>
                <span className="text-[10px] text-gray-400">Soporte en frenada fuerte</span>
              </div>
              <div className="p-4 rounded-xl bg-[#090D15] border border-white/5">
                <span className="text-[10px] text-gray-400 block uppercase">Barra Estabilizadora Tras. (ARB)</span>
                <span className="text-2xl font-black text-white my-1 block">{setupData.suspension.rear_arb}</span>
                <span className="text-[10px] text-gray-400">Tracción mecánica a la salida</span>
              </div>
              <div className="p-4 rounded-xl bg-[#090D15] border border-white/5">
                <span className="text-[10px] text-gray-400 block uppercase">Precarga Diferencial (Preload)</span>
                <span className="text-2xl font-black text-[#FFD700] my-1 block">{setupData.suspension.diff_preload_nm} Nm</span>
                <span className="text-[10px] text-gray-400">Bloqueo en deceleración</span>
              </div>
            </div>
          )}

          {/* Setup Notes from Race Engineer */}
          <div className="p-3.5 rounded-xl bg-[#0A0E17] border border-white/5">
            <h5 className="text-xs font-bold text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#00D2BE]" />
              Notas del Ingeniero de Pista sobre este Reglaje
            </h5>
            <ul className="space-y-1.5 text-xs text-gray-300">
              {setupData.notes.map((n, idx) => (
                <li key={`note-${idx}`} className="flex items-start gap-2">
                  <span className="text-[#00D2BE] mt-0.5">•</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
