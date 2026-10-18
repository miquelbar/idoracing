import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Flag,
  FolderOpen,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import type { AutoDiscoverData, SessionSummary } from '../types/telemetry';

interface SessionSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: SessionSummary[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  autoData: AutoDiscoverData | null;
  onImportLocal: (path: string) => void;
  onLoadDemo: () => void;
  loading: boolean;
}

function detectSimGame(session?: { session_id?: string; car?: string; track?: string } | null): string {
  if (!session) return 'Assetto Corsa Competizione';
  const id = (session.session_id || '').toLowerCase();
  const car = (session.car || '').toLowerCase();
  if (id.startsWith('lmu') || car.includes('lmgt3') || car.includes('hypercar') || car.includes('lmp2')) {
    return 'Le Mans Ultimate';
  }
  if (id.includes('iracing')) {
    return 'iRacing';
  }
  return 'Assetto Corsa Competizione';
}

function formatLapTime(seconds?: number): string {
  if (!seconds || seconds <= 0 || isNaN(seconds)) return '--:--.---';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(3).padStart(6, '0')}`;
}

export const SessionSwitcherModal: React.FC<SessionSwitcherModalProps> = ({
  isOpen,
  onClose,
  sessions,
  selectedSessionId,
  onSelectSession,
  autoData,
  onImportLocal,
  onLoadDemo,
  loading,
}) => {
  const [filterGame, setFilterGame] = useState<'all' | 'acc' | 'lmu'>('all');

  if (!isOpen) return null;

  const filteredSessions = sessions.filter((s) => {
    const game = detectSimGame(s);
    if (filterGame === 'acc') return game.includes('Assetto');
    if (filterGame === 'lmu') return game.includes('Le Mans');
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0D111A] border border-white/10 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-[#080B11]">
          <div>
            <h3 className="text-base font-bold text-white tracking-wide uppercase font-f1-brand">
              Selector Global de Pista y Simulador
            </h3>
            <p className="text-xs text-gray-400 font-telemetry">
              Elige el juego y circuito que deseas cargar en el workspace activo de telemetría
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Pills & Actions */}
        <div className="px-6 py-3 border-b border-white/5 bg-[#0A0D15] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs font-telemetry">
            <button
              onClick={() => setFilterGame('all')}
              className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                filterGame === 'all'
                  ? 'bg-[#00D2BE] text-black shadow-sm'
                  : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white'
              }`}
            >
              Todos ({sessions.length})
            </button>
            <button
              onClick={() => setFilterGame('acc')}
              className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                filterGame === 'acc'
                  ? 'bg-[#E10600] text-white shadow-sm'
                  : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white'
              }`}
            >
              Assetto Corsa Competizione
            </button>
            <button
              onClick={() => setFilterGame('lmu')}
              className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                filterGame === 'lmu'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white'
              }`}
            >
              Le Mans Ultimate
            </button>
          </div>

          <button
            onClick={() => {
              onLoadDemo();
              onClose();
            }}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-[#00D2BE] hover:underline font-telemetry cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Reset Demo Valencia (ACC)</span>
          </button>
        </div>

        {/* Sessions List */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1">
          {filteredSessions.map((sess) => {
            const isSelected = sess.session_id === selectedSessionId;
            const game = detectSimGame(sess);
            const isLMU = game.includes('Le Mans');

            return (
              <div
                key={sess.session_id}
                className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isSelected
                    ? 'bg-[#151D2C] border-[#00D2BE] shadow-[0_0_20px_rgba(0,210,190,0.15)] ring-1 ring-[#00D2BE]'
                    : 'bg-[#0A0D15] hover:bg-[#101522] border-white/5'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase font-telemetry border ${
                        isLMU
                          ? 'bg-blue-950/70 border-blue-500/40 text-blue-300'
                          : 'bg-red-950/60 border-red-500/40 text-red-300'
                      }`}
                    >
                      {game}
                    </span>
                    {isSelected && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-[#00D2BE]/20 text-[#00D2BE] border border-[#00D2BE]/40 flex items-center gap-1 font-telemetry">
                        <CheckCircle2 className="w-3 h-3" />
                        CARGADA EN WORKSPACE
                      </span>
                    )}
                  </div>

                  <h4 className="text-base font-bold text-white font-f1-brand tracking-wide uppercase">
                    {sess.track}
                  </h4>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 font-telemetry">
                    <span className="text-[#00D2BE] font-semibold">{sess.car}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Flag className="w-3 h-3 text-gray-500" />
                      {sess.lap_count} vueltas
                    </span>
                    {sess.best_lap_time && sess.best_lap_time > 0 && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-white font-bold">
                          <Trophy className="w-3 h-3 text-[#FFD700]" />
                          Mejor: {formatLapTime(sess.best_lap_time)}
                        </span>
                      </>
                    )}
                    {sess.date && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-gray-500">
                          <Calendar className="w-3 h-3" />
                          {new Date(sess.date).toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Switch Action */}
                <div>
                  {isSelected ? (
                    <button
                      onClick={onClose}
                      className="px-4 py-2 rounded-lg bg-[#00D2BE] text-black text-xs font-bold uppercase tracking-wider transition cursor-pointer"
                    >
                      Continuar
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        onSelectSession(sess.session_id);
                        onClose();
                      }}
                      className="px-4 py-2 rounded-lg bg-white/10 hover:bg-[#00D2BE] hover:text-black text-white text-xs font-bold uppercase tracking-wider transition cursor-pointer border border-white/5"
                    >
                      Cargar en Workspace
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {filteredSessions.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-xs font-telemetry">
              No se encontraron sesiones para el filtro seleccionado.
            </div>
          )}

          {/* Quick Import from Detected Files if any */}
          {autoData && autoData.lmu_files.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 font-telemetry">
                <FolderOpen className="w-3.5 h-3.5 text-[#00D2BE]" />
                Otras sesiones detectadas en tu disco (Le Mans Ultimate)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {autoData.lmu_files.slice(0, 4).map((f) => (
                  <button
                    key={f.path}
                    onClick={() => {
                      onImportLocal(f.path);
                      onClose();
                    }}
                    className="p-2.5 rounded-lg bg-[#080B11] hover:bg-[#131924] border border-white/5 text-left flex items-center justify-between text-xs text-gray-300 transition cursor-pointer"
                  >
                    <span className="truncate pr-2 font-telemetry text-[11px]">{f.filename}</span>
                    <span className="text-[10px] text-[#00D2BE] font-bold shrink-0">Importar</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
