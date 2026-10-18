import React from 'react';
import {
  ChevronRight,
  FolderOpen,
  Sparkles,
  Trophy,
} from 'lucide-react';
import type { AutoDiscoverData, SessionSummary } from '../types/telemetry';

interface SessionsViewProps {
  sessions: SessionSummary[];
  selectedSessionId: string | null;
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
}

function formatLapTime(seconds?: number): string {
  if (!seconds || seconds <= 0 || isNaN(seconds)) return '--:--.---';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(3).padStart(6, '0')}`;
}

export const SessionsView: React.FC<SessionsViewProps> = ({
  sessions,
  selectedSessionId,
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
}) => {
  const currentSession = sessions.find((s) => s.session_id === selectedSessionId) || sessions[0];

  return (
    <div className="space-y-6">
      {/* Top Banner: Local Detected Files if available */}
      {autoData && (autoData.acc_found > 0 || autoData.lmu_found > 0) && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-[#00D2BE]/10 via-[#121824] to-[#121824] border border-[#00D2BE]/30 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#00D2BE]/20 border border-[#00D2BE]/40 flex items-center justify-center text-[#00D2BE]">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">
                Archivos locales de telemetría detectados
              </h4>
              <p className="text-xs text-gray-400">
                Se han encontrado {autoData.acc_found} archivos de ACC y {autoData.lmu_found} sesiones de Le Mans Ultimate en tu equipo.
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
            <button
              onClick={onLoadDemo}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition cursor-pointer"
            >
              Cargar Demo Valencia
            </button>
          </div>
        </div>
      )}

      {/* Main Split: Sessions list (Left) & Laps in selected session (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Sessions List (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[#FFD700]" />
              Sesiones Registradas ({sessions.length})
            </h3>
            <button
              onClick={onLoadDemo}
              disabled={loading}
              className="text-xs text-[#00D2BE] hover:underline cursor-pointer flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" />
              Demo Porsche 992
            </button>
          </div>

          <div className="space-y-2.5 max-h-[620px] overflow-y-auto pr-1">
            {sessions.map((sess) => {
              const isSelected = sess.session_id === currentSession?.session_id;
              return (
                <div
                  key={sess.session_id}
                  onClick={() => onSelectSession(sess.session_id)}
                  className={`p-4 rounded-xl border transition cursor-pointer ${
                    isSelected
                      ? 'bg-[#161D2B] border-[#00D2BE] shadow-[0_0_20px_rgba(0,210,190,0.15)] ring-1 ring-[#00D2BE]'
                      : 'bg-[#0E121B] hover:bg-[#131924] border-white/5'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="text-sm font-bold text-white">{sess.track}</h4>
                      <p className="text-xs text-[#00D2BE] font-semibold">{sess.car}</p>
                    </div>
                    <span className="text-[10px] font-telemetry px-2 py-0.5 rounded bg-white/5 text-gray-400">
                      {sess.date ? new Date(sess.date).toLocaleDateString() : 'Reciente'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-white/5 font-telemetry text-xs">
                    <div>
                      <span className="text-[10px] text-gray-400 block">Mejor Vuelta</span>
                      <span className="text-white font-bold">{formatLapTime(sess.best_lap_time)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 block">Total Vueltas</span>
                      <span className="text-gray-300 font-bold">{sess.lap_count}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {sessions.length === 0 && (
              <div className="text-center py-12 p-6 rounded-xl bg-[#0E121B] border border-white/5">
                <p className="text-xs text-gray-400 mb-3">No hay sesiones grabadas aún.</p>
                <button
                  onClick={onLoadDemo}
                  className="px-4 py-2 bg-[#00D2BE] text-black text-xs font-bold rounded-lg cursor-pointer"
                >
                  Cargar Sesión Demo
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Selected Session Details & Laps (7 cols) */}
        {currentSession && (
          <div className="lg:col-span-7 space-y-4">
            {/* Session Header Card */}
            <div className="glass-panel rounded-xl p-5 border-l-4 border-l-[#00D2BE]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-white">{currentSession.track}</h3>
                  <p className="text-xs text-gray-400 font-medium">
                    Vehículo: <strong className="text-white">{currentSession.car}</strong>
                  </p>
                </div>

                <button
                  onClick={onGoToTelemetry}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00D2BE] hover:bg-[#00E5CF] text-black text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-md self-start sm:self-auto"
                >
                  <span>Comparar en Telemetría</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Laps Selection instructions */}
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

            {/* Laps Table */}
            <div className="glass-panel rounded-xl p-4 overflow-hidden">
              <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-3">
                Vueltas de la Sesión (Selecciona cuál comparar)
              </h4>

              <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                {(currentSession.laps || []).map((lap) => {
                  const isRef = lap.lap_number === refLapNumber;
                  const isComp = lap.lap_number === compLapNumber;
                  const s1 = lap.sector_times?.[0];
                  const s2 = lap.sector_times?.[1];
                  const s3 = lap.sector_times?.[2];

                  return (
                    <div
                      key={`lap-${lap.lap_number}`}
                      className={`p-3 rounded-lg border transition flex items-center justify-between gap-4 ${
                        isRef
                          ? 'bg-[#00D2BE]/10 border-[#00D2BE]/40'
                          : isComp
                          ? 'bg-[#B138FE]/10 border-[#B138FE]/40'
                          : 'bg-[#0C0F17] border-white/5 hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-lg bg-black/40 border border-white/5 flex items-center justify-center font-telemetry font-bold text-xs text-white">
                          #{lap.lap_number}
                        </span>
                        <div>
                          <span className="font-telemetry text-sm font-bold text-white block">
                            {formatLapTime(lap.lap_time)}
                          </span>
                          <div className="flex items-center gap-2 text-[10px] text-gray-400 font-telemetry">
                            {s1 && <span>S1: {s1.toFixed(3)}s</span>}
                            {s2 && <span>S2: {s2.toFixed(3)}s</span>}
                            {s3 && <span>S3: {s3.toFixed(3)}s</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onSelectRefLap(lap.lap_number)}
                          className={`px-2.5 py-1 rounded text-xs font-telemetry font-bold transition cursor-pointer ${
                            isRef
                              ? 'bg-[#00D2BE] text-black shadow-sm'
                              : 'bg-white/5 hover:bg-white/10 text-gray-300'
                          }`}
                        >
                          {isRef ? '✓ Referencia (P1)' : 'Elegir Ref (P1)'}
                        </button>
                        <button
                          onClick={() => onSelectCompLap(lap.lap_number)}
                          className={`px-2.5 py-1 rounded text-xs font-telemetry font-bold transition cursor-pointer ${
                            isComp
                              ? 'bg-[#B138FE] text-white shadow-sm'
                              : 'bg-white/5 hover:bg-white/10 text-gray-300'
                          }`}
                        >
                          {isComp ? '✓ Comparada (P2)' : 'Elegir Comp (P2)'}
                        </button>
                      </div>
                    </div>
                  );
                })}

                {(!currentSession.laps || currentSession.laps.length === 0) && (
                  <p className="text-xs text-gray-400 text-center py-6">
                    Esta sesión no contiene vueltas individuales segmentadas.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
