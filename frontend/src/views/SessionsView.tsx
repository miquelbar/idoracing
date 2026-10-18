import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Flag,
  FolderOpen,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react';
import type { AutoDiscoverData, ComparisonResponse, SessionSummary } from '../types/telemetry';
import { detectSimGame, formatDate, formatLapTime } from '../utils/formatters';

interface SessionsViewProps {
  sessions: SessionSummary[];
  selectedSessionId: string | null;
  activeFullSession: any | null;
  onSelectSession: (id: string) => void;
  refLapNumber: number;
  compLapNumber: number;
  onSelectRefLap: (lapNumber: number) => void;
  onSelectCompLap: (lapNumber: number) => void;
  onGoToTelemetry: () => void;
  onLoadDemo: () => void;
  autoData: AutoDiscoverData | null;
  onImportLocal: (path: string) => void;
  loading: boolean;
  comparison?: ComparisonResponse | null;
}

export const SessionsView: React.FC<SessionsViewProps> = ({
  sessions,
  selectedSessionId,
  activeFullSession,
  onSelectSession,
  refLapNumber,
  compLapNumber,
  onSelectRefLap,
  onSelectCompLap,
  onGoToTelemetry,
  onLoadDemo,
  autoData,
  onImportLocal,
  loading,
  comparison,
}) => {
  const [filterGame, setFilterGame] = useState<'all' | 'acc' | 'lmu' | 'iracing'>('all');

  const filteredSessions = sessions.filter((s) => {
    const game = detectSimGame(s);
    if (filterGame === 'acc') return game.includes('Assetto');
    if (filterGame === 'lmu') return game.includes('Le Mans');
    if (filterGame === 'iracing') return game.includes('iRacing');
    return true;
  });

  const activeSessionSummary =
    sessions.find((s) => s.session_id === selectedSessionId) || sessions[0];

  const lapsToDisplay = activeFullSession?.laps && activeFullSession.laps.length > 0
    ? activeFullSession.laps
    : [];

  return (
    <div className="space-y-6">
      {/* Header & Simulator Filter Bar */}
      <div className="glass-panel rounded-2xl p-6 border border-white/10 bg-[#0C101A]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/5">
          <div>
            <h2 className="text-xl font-black text-white tracking-wide uppercase font-f1-brand flex items-center gap-2">
              <Trophy className="w-5 h-5 text-[#FFD700]" />
              Gestor de Sesiones & Workspace Multisimulador
            </h2>
            <p className="text-xs text-gray-400 font-telemetry mt-1">
              Selecciona cualquier circuito o simulador para cargarlo en el workspace activo de análisis. Sin modales ni configuraciones ocultas.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onLoadDemo}
              disabled={loading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-semibold border border-white/10 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#00D2BE]" />
              <span>Cargar Demo Valencia (ACC)</span>
            </button>
          </div>
        </div>

        {/* Simulator Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="flex items-center gap-2 text-xs font-telemetry">
            <button
              onClick={() => setFilterGame('all')}
              className={`px-3.5 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                filterGame === 'all'
                  ? 'bg-[#00D2BE] text-black shadow-md'
                  : 'bg-white/5 hover:bg-white/10 text-gray-300'
              }`}
            >
              Todos los Simuladores ({sessions.length})
            </button>
            <button
              onClick={() => setFilterGame('acc')}
              className={`px-3.5 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                filterGame === 'acc'
                  ? 'bg-[#E10600] text-white shadow-md'
                  : 'bg-white/5 hover:bg-white/10 text-gray-300'
              }`}
            >
              Assetto Corsa Competizione
            </button>
            <button
              onClick={() => setFilterGame('lmu')}
              className={`px-3.5 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                filterGame === 'lmu'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white/5 hover:bg-white/10 text-gray-300'
              }`}
            >
              Le Mans Ultimate
            </button>
            <button
              onClick={() => setFilterGame('iracing')}
              className={`px-3.5 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                filterGame === 'iracing'
                  ? 'bg-red-700 text-white shadow-md'
                  : 'bg-white/5 hover:bg-white/10 text-gray-300'
              }`}
            >
              iRacing
            </button>
          </div>

          <span className="text-xs text-gray-400 font-telemetry">
            {filteredSessions.length} {filteredSessions.length === 1 ? 'sesión encontrada' : 'sesiones encontradas'}
          </span>
        </div>
      </div>

      {/* Local Auto-discovered Files Banner if available */}
      {autoData && (autoData.acc_found > 0 || autoData.lmu_found > 0) && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-[#00D2BE]/10 via-[#121824] to-[#121824] border border-[#00D2BE]/30 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#00D2BE]/20 border border-[#00D2BE]/40 flex items-center justify-center text-[#00D2BE] shrink-0">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">
                Archivos locales de telemetría detectados automáticamente
              </h4>
              <p className="text-xs text-gray-400">
                {autoData.acc_found} archivos ACC y {autoData.lmu_found} sesiones Le Mans Ultimate detectados en Steam.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {autoData.lmu_files.length > 0 && (
              <button
                onClick={() => onImportLocal(autoData.lmu_files[0].path)}
                disabled={loading}
                className="px-3.5 py-1.5 rounded-lg bg-[#00D2BE] hover:bg-[#00E5CF] text-black text-xs font-bold transition cursor-pointer disabled:opacity-50"
              >
                Cargar {autoData.lmu_files[0].filename}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main 2-Column Hub: Sessions List (Left) & Active Workspace Laps (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Sessions List (6 cols) */}
        <div className="lg:col-span-6 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider font-telemetry flex items-center gap-2">
              <Flag className="w-4 h-4 text-[#00D2BE]" />
              Sesiones Disponibles ({filteredSessions.length})
            </h3>
            <span className="text-[11px] text-gray-500 font-telemetry">
              Click en "Cargar en Workspace" para cambiar
            </span>
          </div>

          <div className="space-y-3">
            {filteredSessions.map((sess) => {
              const isActive = sess.session_id === selectedSessionId;
              const simName = detectSimGame(sess);
              const isLMU = simName.toLowerCase().includes('le mans');
              const isiRacing = simName.toLowerCase().includes('iracing');

              return (
                <div
                  key={sess.session_id}
                  className={`p-5 rounded-2xl border transition-all duration-200 ${
                    isActive
                      ? 'bg-[#101726] border-[#00D2BE] shadow-[0_0_25px_rgba(0,210,190,0.18)] ring-2 ring-[#00D2BE]/40'
                      : 'bg-[#0E121B] hover:bg-[#131924] border-white/5 hover:border-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      {/* Sim Badge */}
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider font-telemetry mb-1.5 border ${
                          isLMU
                            ? 'bg-blue-950/70 border-blue-500/40 text-blue-300'
                            : isiRacing
                            ? 'bg-red-950/70 border-red-500/40 text-red-300'
                            : 'bg-red-950/60 border-[#E10600]/40 text-[#FF4D4D]'
                        }`}
                      >
                        {simName}
                      </span>

                      {/* Track & Car */}
                      <h4 className="text-base font-bold text-white tracking-wide font-f1-brand">
                        {sess.track}
                      </h4>
                      <p className="text-xs text-[#00D2BE] font-semibold mt-0.5">
                        {sess.car}
                      </p>
                    </div>

                    {/* Active Status Badge */}
                    <div>
                      {isActive ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00D2BE]/20 border border-[#00D2BE]/60 text-[#00D2BE] text-[11px] font-bold tracking-wider uppercase font-telemetry animate-pulse">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>ACTIVA EN WORKSPACE</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400 text-[10px] font-medium tracking-wider uppercase font-telemetry">
                          <span>DISPONIBLE</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Metrics Row */}
                  <div className="grid grid-cols-3 gap-3 my-3 pt-3 border-t border-white/5 font-telemetry text-xs">
                    <div>
                      <span className="text-[10px] text-gray-400 block uppercase">Mejor Vuelta</span>
                      <span className="text-white font-bold text-sm">
                        {formatLapTime(sess.best_lap_time)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 block uppercase">Vueltas Totales</span>
                      <span className="text-gray-200 font-bold text-sm">
                        {sess.lap_count}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 block uppercase">Fecha</span>
                      <span className="text-gray-300 font-semibold text-xs flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3 text-gray-500" />
                        {formatDate(sess.date)}
                      </span>
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="flex items-center justify-between pt-3 border-t border-white/5">
                    <span className="text-[11px] text-gray-400 font-telemetry">
                      ID: <span className="text-gray-300">{sess.session_id}</span>
                    </span>

                    {isActive ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={onGoToTelemetry}
                          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#00D2BE] hover:bg-[#00E5CF] text-black text-xs font-bold tracking-wide transition cursor-pointer shadow-md"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>Ver Telemetría →</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => onSelectSession(sess.session_id)}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white/10 hover:bg-[#00D2BE] text-white hover:text-black border border-white/10 hover:border-[#00D2BE] text-xs font-bold tracking-wide transition cursor-pointer"
                      >
                        <Zap className="w-3.5 h-3.5 text-[#00D2BE] group-hover:text-black" />
                        <span>Cargar en Workspace</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredSessions.length === 0 && (
              <div className="text-center py-12 p-6 rounded-2xl bg-[#0E121B] border border-white/5">
                <p className="text-xs text-gray-400 mb-3">No hay sesiones para este filtro.</p>
                <button
                  onClick={() => setFilterGame('all')}
                  className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-xs font-bold rounded-lg cursor-pointer"
                >
                  Mostrar Todas
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Active Session Workspace Details & Laps (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          {activeSessionSummary && (
            <>
              {/* Active Workspace Banner */}
              <div className="glass-panel rounded-2xl p-5 border-l-4 border-l-[#00D2BE] bg-[#0C101A]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-[#00D2BE] uppercase tracking-wider font-telemetry block mb-0.5">
                      CIRCUITO ACTIVO EN EL WORKSPACE
                    </span>
                    <h3 className="text-lg font-bold text-white font-f1-brand">
                      {comparison?.track_name || activeSessionSummary.track}
                    </h3>
                    <p className="text-xs text-gray-300 font-medium mt-0.5">
                      Vehículo: <strong className="text-white">{comparison?.car_name || activeSessionSummary.car}</strong>
                    </p>
                  </div>

                  <button
                    onClick={onGoToTelemetry}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#00D2BE] hover:bg-[#00E5CF] text-black text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-lg self-start sm:self-auto"
                  >
                    <span>Analizar Telemetría</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Lap Pair Indicator */}
                <div className="mt-4 pt-3 border-t border-white/5 flex flex-wrap items-center gap-4 text-xs font-telemetry">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#00D2BE]" />
                    <span className="text-gray-300">
                      Vuelta Referencia (P1): <strong>Vuelta {refLapNumber}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#B138FE]" />
                    <span className="text-gray-300">
                      Vuelta Comparada (P2): <strong>Vuelta {compLapNumber}</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Laps List */}
              <div className="glass-panel rounded-2xl p-5 bg-[#0C101A] border border-white/5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider font-telemetry">
                    Vueltas Registradas ({lapsToDisplay.length})
                  </h4>
                  <span className="text-[10px] text-gray-400 font-telemetry">
                    Selecciona qué vueltas comparar
                  </span>
                </div>

                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {lapsToDisplay.map((lap: any) => {
                    const isRef = lap.lap_number === refLapNumber;
                    const isComp = lap.lap_number === compLapNumber;
                    const s1 = lap.sector_times?.[0];
                    const s2 = lap.sector_times?.[1];
                    const s3 = lap.sector_times?.[2];

                    return (
                      <div
                        key={`lap-${lap.lap_number}`}
                        className={`p-3.5 rounded-xl border transition flex items-center justify-between gap-4 ${
                          isRef
                            ? 'bg-[#00D2BE]/10 border-[#00D2BE]/50 shadow-sm'
                            : isComp
                            ? 'bg-[#B138FE]/10 border-[#B138FE]/50 shadow-sm'
                            : 'bg-[#080B11] border-white/5 hover:border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`w-9 h-9 rounded-lg border flex items-center justify-center font-telemetry font-bold text-xs ${
                              isRef
                                ? 'bg-[#00D2BE] text-black border-[#00D2BE]'
                                : isComp
                                ? 'bg-[#B138FE] text-white border-[#B138FE]'
                                : 'bg-black/40 border-white/5 text-white'
                            }`}
                          >
                            #{lap.lap_number}
                          </span>
                          <div>
                            <span className="font-telemetry text-sm font-bold text-white block">
                              {formatLapTime(lap.lap_time)}
                            </span>
                            <div className="flex items-center gap-2 text-[10px] text-gray-400 font-telemetry mt-0.5">
                              {s1 && <span>S1: {s1.toFixed(3)}s</span>}
                              {s2 && <span>S2: {s2.toFixed(3)}s</span>}
                              {s3 && <span>S3: {s3.toFixed(3)}s</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onSelectRefLap(lap.lap_number)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-telemetry font-bold transition cursor-pointer ${
                              isRef
                                ? 'bg-[#00D2BE] text-black shadow-sm'
                                : 'bg-white/5 hover:bg-white/10 text-gray-300'
                            }`}
                          >
                            {isRef ? '✓ Ref (P1)' : 'Elegir Ref'}
                          </button>
                          <button
                            onClick={() => onSelectCompLap(lap.lap_number)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-telemetry font-bold transition cursor-pointer ${
                              isComp
                                ? 'bg-[#B138FE] text-white shadow-sm'
                                : 'bg-white/5 hover:bg-white/10 text-gray-300'
                            }`}
                          >
                            {isComp ? '✓ Comp (P2)' : 'Elegir Comp'}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {lapsToDisplay.length === 0 && (
                    <div className="text-center py-10 px-4 rounded-xl bg-black/30 border border-white/5">
                      <p className="text-xs text-gray-400">
                        Cargando vueltas de la sesión activa...
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
