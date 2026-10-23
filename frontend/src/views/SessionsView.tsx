import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Flag,
  FolderOpen,
  GitCompare,
  HelpCircle,
  RefreshCw,
  Sparkles,
  TrendingDown,
  Trophy,
  Upload,
  Zap,
} from 'lucide-react';
import { fetchSessionGroups, uploadTelemetryFile } from '../services/api';
import type { AutoDiscoverData, AutoDiscoverFile, ComparisonResponse, SessionDetail, SessionGroup, SessionSummary } from '../types/telemetry';
import { detectSimGame, errorMessage, formatDate, formatLapTime, simBadge } from '../utils/formatters';
import { useLanguage, type TranslationKey } from '../i18n';
import { StintDegradationView } from '../components/StintDegradationView';

// --- Reusable sub-component for each simulator's discovered files ---
interface SimDiscoverySectionProps {
  label: string;
  dotColor: string;
  files: AutoDiscoverFile[];
  onImport: (path: string) => void;
  emptyText: string;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const SimDiscoverySection: React.FC<SimDiscoverySectionProps> = ({
  label,
  dotColor,
  files,
  onImport,
  emptyText,
  t,
}) => (
  <div className="p-3.5 rounded-xl bg-night-3 border border-white/5">
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs font-bold text-white flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        {label}
      </span>
      <span className="text-[10px] text-gray-400 font-telemetry">
        {files.length} {t('sessions_found')}
      </span>
    </div>

    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
      {files.slice(0, 10).map((f) => (
        <div
          key={f.path}
          className="flex items-center justify-between p-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-telemetry"
        >
          <span className="truncate max-w-[220px] text-gray-300">{f.filename}</span>
          <button
            onClick={() => onImport(f.path)}
            className="px-2 py-0.5 rounded bg-brand text-black font-bold text-[10px] hover:bg-brand-light cursor-pointer"
          >
            {t('load_action')}
          </button>
        </div>
      ))}
      {files.length === 0 && (
        <p className="text-[11px] text-gray-500 text-center py-2">{emptyText}</p>
      )}
    </div>
  </div>
);

interface SessionsViewProps {
  sessions: SessionSummary[];
  selectedSessionId: string | null;
  activeFullSession: SessionDetail | null;
  onSelectSession: (id: string) => void;
  refLapNumber: number;
  compLapNumber: number;
  onSelectRefLap: (lapNumber: number) => void;
  onSelectCompLap: (lapNumber: number) => void;
  refSessionId?: string | null;
  compSessionId?: string | null;
  onSelectRefLapCross?: (sessionId: string, lapNumber: number) => void;
  onSelectCompLapCross?: (sessionId: string, lapNumber: number) => void;
  onGoToTelemetry: () => void;
  onLoadDemo: () => void;
  autoData: AutoDiscoverData | null;
  onImportLocal: (path: string) => void;
  onRefreshAutoData?: () => void;
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
  refSessionId,
  compSessionId,
  onSelectRefLapCross,
  onSelectCompLapCross,
  onGoToTelemetry,
  onLoadDemo,
  autoData,
  onImportLocal,
  onRefreshAutoData,
  loading,
  comparison,
}) => {
  const { lang, t } = useLanguage();
  const [activeSubTab, setActiveSubTab] = useState<'sessions' | 'stint' | 'import'>('sessions');
  const [filterGame, setFilterGame] = useState<'all' | 'acc' | 'lmu' | 'iracing'>('all');
  const [uploading, setUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [sessionGroups, setSessionGroups] = useState<SessionGroup[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Load session groups for cross-session comparison
  useEffect(() => {
    fetchSessionGroups()
      .then(setSessionGroups)
      .catch(() => setSessionGroups([]));
  }, [sessions]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filteredSessions = sessions.filter((s) => {
    const game = detectSimGame(s);
    if (filterGame === 'acc') return game === 'Assetto Corsa Competizione';
    if (filterGame === 'lmu') return game === 'Le Mans Ultimate';
    if (filterGame === 'iracing') return game === 'iRacing';
    return true;
  });

  const activeSessionSummary =
    sessions.find((s) => s.session_id === selectedSessionId) || sessions[0];

  const lapsToDisplay =
    activeFullSession?.laps && activeFullSession.laps.length > 0
      ? activeFullSession.laps
      : [];

  const handleManualUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setStatusMsg(null);
      const res = await uploadTelemetryFile(file);
      setStatusMsg({
        type: 'success',
        text: t('upload_ok', { file: file.name, track: res.track || t('imported_session') }),
      });
      if (res.session_id) {
        onSelectSession(res.session_id);
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: errorMessage(err, t('err_upload')) });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Vision Banner */}
      <div className="glass-panel rounded-2xl p-6 border border-white/10 bg-night-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/5">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-brand text-lg font-black italic tracking-wider text-white">
                IDORACING <span className="text-brand">ANALYTICS</span>
              </span>
              <span className="text-[10px] text-gray-500 font-telemetry uppercase tracking-widest hidden sm:inline">
                • {t('sessions_view_title')}
              </span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-wide mt-1">
              {t('every_lap_vision')}
            </h2>
            <p className="text-xs text-gray-400 font-telemetry mt-0.5">
              {t('amateur_tagline')}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onLoadDemo}
              disabled={loading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-semibold border border-white/10 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-brand" />
              <span>{t('load_valencia_demo')}</span>
            </button>
          </div>
        </div>

        {/* Sub-navigation: Sessions vs Import Hub */}
        <div className="flex items-center justify-between pt-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveSubTab('sessions')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeSubTab === 'sessions'
                  ? 'bg-brand text-black shadow-lg shadow-brand/20'
                  : 'bg-white/5 hover:bg-white/10 text-gray-300'
              }`}
            >
              <Trophy className="w-4 h-4" />
              <span>{t('sessions_and_laps')} ({sessions.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('stint')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeSubTab === 'stint'
                  ? 'bg-brand text-black shadow-lg shadow-brand/20'
                  : 'bg-white/5 hover:bg-white/10 text-gray-300'
              }`}
            >
              <TrendingDown className="w-4 h-4" />
              <span>{t('stint_evolution_tab')}</span>
            </button>

            <button
              onClick={() => setActiveSubTab('import')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeSubTab === 'import'
                  ? 'bg-brand text-black shadow-lg shadow-brand/20'
                  : 'bg-white/5 hover:bg-white/10 text-gray-300'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              <span>{t('upload_files_sims')}</span>
            </button>
          </div>

          {activeSubTab === 'sessions' && (
            <div className="hidden lg:flex items-center gap-2 text-xs font-telemetry">
              <button
                onClick={() => setFilterGame('all')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  filterGame === 'all'
                    ? 'bg-white/20 text-white'
                    : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                {t('all_filter')} ({sessions.length})
              </button>
              <button
                onClick={() => setFilterGame('acc')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  filterGame === 'acc'
                    ? 'bg-accent text-white'
                    : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                ACC
              </button>
              <button
                onClick={() => setFilterGame('lmu')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  filterGame === 'lmu'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                LMU
              </button>
              <button
                onClick={() => setFilterGame('iracing')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  filterGame === 'iracing'
                    ? 'bg-red-700 text-white'
                    : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                iRacing
              </button>
            </div>
          )}
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center justify-between gap-3 ${
            statusMsg.type === 'success'
              ? 'bg-emerald-950/60 border border-emerald-600 text-emerald-200'
              : 'bg-red-950/60 border border-red-600 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {statusMsg.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
          <button
            onClick={() => setStatusMsg(null)}
            className="text-xs underline hover:no-underline opacity-80 hover:opacity-100 cursor-pointer"
          >
            {t('close_btn')}
          </button>
        </div>
      )}

      {/* Sessions and laps */}
      {activeSubTab === 'sessions' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Sessions List (6 cols) */}
          <div className="lg:col-span-6 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider font-telemetry flex items-center gap-2">
                <Flag className="w-4 h-4 text-brand" />
                {t('available_sessions')} ({filteredSessions.length})
              </h3>
              <span className="text-[11px] text-gray-500 font-telemetry">
                {t('click_to_load_workspace')}
              </span>
            </div>

            <div className="space-y-3">
              {filteredSessions.map((sess) => {
                const isActive = sess.session_id === selectedSessionId;
                const simName = detectSimGame(sess);
                const badge = simBadge(simName);

                return (
                  <div
                    key={sess.session_id}
                    className={`p-5 rounded-2xl border transition-all duration-200 ${
                      isActive
                        ? 'bg-[#101726] border-brand shadow-[0_0_25px_rgba(0,210,190,0.18)] ring-2 ring-brand/40'
                        : 'bg-night-6 hover:bg-[#131924] border-white/5 hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        {/* Sim Badge */}
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider font-telemetry mb-1.5 border ${badge.className}`}
                        >
                          {simName ?? badge.label}
                        </span>

                        {/* Track & Car */}
                        <h4 className="text-base font-bold text-white tracking-wide font-brand">
                          {sess.track}
                        </h4>
                        <p className="text-xs text-brand font-semibold mt-0.5">
                          {sess.car}
                        </p>
                      </div>

                      {/* Active Status Badge */}
                      <div>
                        {isActive ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand/20 border border-brand/60 text-brand text-[11px] font-bold tracking-wider uppercase font-telemetry animate-pulse">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{t('active_in_workspace')}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400 text-[10px] font-medium tracking-wider uppercase font-telemetry">
                            <span>{t('available_status')}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Metrics Row */}
                    <div className="grid grid-cols-3 gap-3 my-3 pt-3 border-t border-white/5 font-telemetry text-xs">
                      <div>
                        <span className="text-[10px] text-gray-400 block uppercase">{t('best_lap')}</span>
                        <span className="text-white font-bold text-sm">
                          {formatLapTime(sess.best_lap_time)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400 block uppercase">{t('total_laps')}</span>
                        <span className="text-gray-200 font-bold text-sm">
                          {sess.lap_count}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400 block uppercase">{t('date_col')}</span>
                        <span className="text-gray-300 font-semibold text-xs flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3 text-gray-500" />
                          {sess.date ? formatDate(sess.date, lang) : t('recent_date')}
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
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand hover:bg-brand-light text-black text-xs font-bold tracking-wide transition cursor-pointer shadow-md"
                          >
                            <Zap className="w-3.5 h-3.5" />
                            <span>{t('view_telemetry_arrow')}</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => onSelectSession(sess.session_id)}
                          disabled={loading}
                          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white/10 hover:bg-brand text-white hover:text-black border border-white/10 hover:border-brand text-xs font-bold tracking-wide transition cursor-pointer"
                        >
                          <Zap className="w-3.5 h-3.5 text-brand group-hover:text-black" />
                          <span>{t('load_in_workspace')}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredSessions.length === 0 && (
                <div className="text-center py-12 p-6 rounded-2xl bg-night-6 border border-white/5">
                  <p className="text-xs text-gray-400 mb-3">{t('no_sessions_for_filter')}</p>
                  <button
                    onClick={() => setFilterGame('all')}
                    className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-xs font-bold rounded-lg cursor-pointer"
                  >
                    {t('show_all')}
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
                <div className="glass-panel rounded-2xl p-5 border-l-4 border-l-brand bg-night-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-bold text-brand uppercase tracking-wider font-telemetry block mb-0.5">
                        {t('active_track_workspace')}
                      </span>
                      <h3 className="text-lg font-bold text-white font-brand">
                        {comparison?.track_name || activeSessionSummary.track}
                      </h3>
                      <p className="text-xs text-gray-300 font-medium mt-0.5">
                        {t('car_label')}: <strong className="text-white">{comparison?.car_name || activeSessionSummary.car}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <button
                        onClick={() => setActiveSubTab('stint')}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-bold transition cursor-pointer border border-white/5 font-telemetry"
                        title="Ver análisis de degradación y stint"
                      >
                        <TrendingDown className="w-3.5 h-3.5 text-brand" />
                        <span>Ver Stint</span>
                      </button>
                      <button
                        onClick={onGoToTelemetry}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand hover:bg-brand-light text-black text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-lg"
                      >
                        <span>{t('analyze_telemetry')}</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Lap Pair Indicator & Delta Overview */}
                  <div className="mt-4 pt-3 border-t border-white/5 space-y-2 text-xs font-telemetry">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-brand" />
                          <span className="text-gray-300">
                            {t('ref_lap_header')}: <strong>{t('lap_word')} {refLapNumber}</strong> ({formatLapTime(comparison?.ref_lap_time)})
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-comp" />
                          <span className="text-gray-300">
                            {t('comp_lap_header')}: <strong>{t('lap_word')} {compLapNumber}</strong> ({formatLapTime(comparison?.comp_lap_time)})
                          </span>
                        </div>
                      </div>

                      {comparison && comparison.delta_time_total !== undefined && (
                        <span
                          className={`font-black px-2 py-0.5 rounded text-xs ${
                            comparison.delta_time_total > 0
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          Δ {comparison.delta_time_total > 0 ? '+' : ''}{comparison.delta_time_total.toFixed(3)}s
                        </span>
                      )}
                    </div>

                    {/* Sector Deltas if available */}
                    {comparison?.comp_sectors?.['S1'] && comparison?.ref_sectors?.['S1'] && (
                      <div className="flex items-center gap-3 text-[11px] text-gray-400 pt-1">
                        <span>
                          Δ S1:{' '}
                          <strong
                            className={
                              (comparison.comp_sectors['S1'] - comparison.ref_sectors['S1']) > 0
                                ? 'text-rose-400'
                                : 'text-emerald-400'
                            }
                          >
                            {(comparison.comp_sectors['S1'] - comparison.ref_sectors['S1']) > 0 ? '+' : ''}
                            {(comparison.comp_sectors['S1'] - comparison.ref_sectors['S1']).toFixed(3)}s
                          </strong>
                        </span>
                        <span>•</span>
                        <span>
                          Δ S2:{' '}
                          <strong
                            className={
                              (comparison.comp_sectors['S2'] - comparison.ref_sectors['S2']) > 0
                                ? 'text-rose-400'
                                : 'text-emerald-400'
                            }
                          >
                            {(comparison.comp_sectors['S2'] - comparison.ref_sectors['S2']) > 0 ? '+' : ''}
                            {(comparison.comp_sectors['S2'] - comparison.ref_sectors['S2']).toFixed(3)}s
                          </strong>
                        </span>
                        <span>•</span>
                        <span>
                          Δ S3:{' '}
                          <strong
                            className={
                              (comparison.comp_sectors['S3'] - comparison.ref_sectors['S3']) > 0
                                ? 'text-rose-400'
                                : 'text-emerald-400'
                            }
                          >
                            {(comparison.comp_sectors['S3'] - comparison.ref_sectors['S3']) > 0 ? '+' : ''}
                            {(comparison.comp_sectors['S3'] - comparison.ref_sectors['S3']).toFixed(3)}s
                          </strong>
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Laps List */}
                <div className="glass-panel rounded-2xl p-5 bg-night-5 border border-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider font-telemetry">
                      {t('registered_laps')} ({lapsToDisplay.length})
                    </h4>
                    <span className="text-[10px] text-gray-400 font-telemetry">
                      {t('select_laps_hint')}
                    </span>
                  </div>

                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {lapsToDisplay.map((lap) => {
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
                              ? 'bg-brand/10 border-brand/50 shadow-sm'
                              : isComp
                              ? 'bg-comp/10 border-comp/50 shadow-sm'
                              : 'bg-night-3 border-white/5 hover:border-white/10'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`w-9 h-9 rounded-lg border flex items-center justify-center font-telemetry font-bold text-xs ${
                                isRef
                                  ? 'bg-brand text-black border-brand'
                                  : isComp
                                  ? 'bg-comp text-white border-comp'
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
                                  ? 'bg-brand text-black shadow-sm'
                                  : 'bg-white/5 hover:bg-white/10 text-gray-300'
                              }`}
                            >
                              {isRef ? t('ref_btn_active') : t('ref_btn_choose')}
                            </button>
                            <button
                              onClick={() => onSelectCompLap(lap.lap_number)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-telemetry font-bold transition cursor-pointer ${
                                isComp
                                  ? 'bg-comp text-white shadow-sm'
                                  : 'bg-white/5 hover:bg-white/10 text-gray-300'
                              }`}
                            >
                              {isComp ? t('comp_btn_active') : t('comp_btn_choose')}
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {lapsToDisplay.length === 0 && (
                      <div className="text-center py-10 px-4 rounded-xl bg-black/30 border border-white/5">
                        <p className="text-xs text-gray-400">
                          {t('loading_active_laps')}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Cross-Session Comparison: Groups by track */}
      {activeSubTab === 'sessions' && sessionGroups.length > 0 && (
        <div className="glass-panel rounded-2xl p-6 border border-white/10 bg-night-5 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-white/5">
            <div className="w-10 h-10 rounded-xl bg-brand/20 border border-brand/40 flex items-center justify-center text-brand">
              <GitCompare className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white uppercase tracking-wider font-brand">
                {t('compare_across_sessions')}
              </h4>
              <p className="text-xs text-gray-400">
                {t('compare_across_sessions_desc')}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {sessionGroups.map((group) => {
              const groupKey = `${group.simulator}|${group.track}`;
              const isExpanded = expandedGroups.has(groupKey);
              const badge = simBadge(group.simulator);
              const isCrossRef = refSessionId && group.sessions.some((s) => s.session_id === refSessionId);
              const isCrossComp = compSessionId && group.sessions.some((s) => s.session_id === compSessionId);

              return (
                <div key={groupKey} className="rounded-xl bg-night-3 border border-white/5 overflow-hidden">
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(groupKey)}
                    className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <ChevronDown
                        className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? '' : '-rotate-90'}`}
                      />
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider font-telemetry border ${badge.className}`}>
                        {group.simulator}
                      </span>
                      <span className="text-sm font-bold text-white font-brand">{group.track}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-telemetry text-gray-400">
                      <span>{group.sessions.length} {t('sessions_count')}</span>
                      <span>{group.total_laps} {t('laps_count')}</span>
                      <span className="text-brand font-bold">{formatLapTime(group.best_lap_time)}</span>
                    </div>
                  </button>

                  {/* Group sessions */}
                  {isExpanded && (
                    <div className="border-t border-white/5 divide-y divide-white/5">
                      {group.sessions.map((sess) => {
                        const isRefSession = refSessionId === sess.session_id;
                        const isCompSession = compSessionId === sess.session_id;
                        const isActive = selectedSessionId === sess.session_id;

                        return (
                          <div
                            key={sess.session_id}
                            className={`p-4 flex items-center justify-between gap-4 ${
                              isActive ? 'bg-brand/5' : 'hover:bg-white/5'
                            }`}
                          >
                            <div className="flex items-center gap-4 min-w-0">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-bold text-white">{sess.car}</span>
                                  <span className="text-[10px] text-gray-500 font-telemetry">
                                    {formatDate(sess.date, lang)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] font-telemetry text-gray-400">
                                  <span>{sess.lap_count} {t('laps_count')}</span>
                                  <span className="text-gray-300">PB: {formatLapTime(sess.best_lap_time)}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {/* Cross-session ref/comp buttons */}
                              {onSelectRefLapCross && (
                                <button
                                  onClick={() => onSelectRefLapCross(sess.session_id, 1)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-telemetry font-bold transition cursor-pointer ${
                                    isRefSession
                                      ? 'bg-brand text-black shadow-sm'
                                      : 'bg-white/5 hover:bg-white/10 text-gray-300'
                                  }`}
                                  title={t('select_as_reference')}
                                >
                                  {isRefSession ? t('ref_btn_active') : 'Ref'}
                                </button>
                              )}
                              {onSelectCompLapCross && (
                                <button
                                  onClick={() => onSelectCompLapCross(sess.session_id, 1)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-telemetry font-bold transition cursor-pointer ${
                                    isCompSession
                                      ? 'bg-comp text-white shadow-sm'
                                      : 'bg-white/5 hover:bg-white/10 text-gray-300'
                                  }`}
                                  title={t('select_as_comparison')}
                                >
                                  {isCompSession ? t('comp_btn_active') : 'Comp'}
                                </button>
                              )}
                              {/* Load session button */}
                              <button
                                onClick={() => onSelectSession(sess.session_id)}
                                disabled={loading}
                                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-brand text-white hover:text-black border border-white/10 hover:border-brand text-xs font-bold transition cursor-pointer"
                              >
                                {t('load_in_workspace')}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Cross-session indicator */}
                  {(isCrossRef || isCrossComp) && !isExpanded && (
                    <div className="px-4 py-2 flex items-center gap-2 text-[11px] font-telemetry">
                      {isCrossRef && (
                        <span className="px-2 py-0.5 rounded bg-brand/20 text-brand border border-brand/40">
                          Ref session
                        </span>
                      )}
                      {isCrossComp && (
                        <span className="px-2 py-0.5 rounded bg-comp/20 text-comp border border-comp/40">
                          Comp session
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stint & Degradation */}
      {activeSubTab === 'stint' && (
        <StintDegradationView
          sessionId={selectedSessionId}
          refLapNumber={refLapNumber}
          compLapNumber={compLapNumber}
          onSelectRefLap={onSelectRefLap}
          onSelectCompLap={onSelectCompLap}
          onGoToTelemetry={onGoToTelemetry}
        />
      )}

      {/* Import */}
      {activeSubTab === 'import' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Manual File Upload Card */}
            <div className="glass-panel rounded-2xl p-6 space-y-4 border border-white/10 bg-night-5">
              <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                <div className="w-10 h-10 rounded-xl bg-brand/20 border border-brand/40 flex items-center justify-center text-brand">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider font-brand">
                    {t('upload_telemetry_title')}
                  </h4>
                  <p className="text-xs text-gray-400">
                    {t('upload_formats_desc')}
                  </p>
                </div>
              </div>

              <div className="border-2 border-dashed border-white/10 hover:border-brand/50 rounded-xl p-8 text-center transition cursor-pointer relative group bg-black/20">
                <input
                  type="file"
                  accept=".ld,.xml,.csv"
                  onChange={handleManualUpload}
                  disabled={uploading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
                <Upload className="w-8 h-8 text-gray-400 group-hover:text-brand mx-auto mb-2 transition" />
                <p className="text-sm font-bold text-white mb-1">
                  {t('drag_drop_click')}
                </p>
                <p className="text-xs text-gray-500">
                  {t('upload_types_note')}
                </p>
                {uploading && (
                  <p className="text-xs text-brand font-bold mt-3 animate-pulse">
                    {t('processing_telemetry')}
                  </p>
                )}
              </div>
            </div>

            {/* Local Simulators Auto-discovery */}
            <div className="glass-panel rounded-2xl p-6 space-y-4 border border-white/10 bg-night-5">
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                    <FolderOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider font-brand">
                      {t('auto_detect_pc')}
                    </h4>
                    <p className="text-xs text-gray-400">
                      {t('steam_scan_desc')}
                    </p>
                  </div>
                </div>

                {onRefreshAutoData && (
                  <button
                    onClick={onRefreshAutoData}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
                    title={t('refresh_scanner')}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                )}
              </div>

              {autoData && (
                <div className="space-y-3">
                  <SimDiscoverySection
                    label="Assetto Corsa Competizione"
                    dotColor="bg-accent"
                    files={autoData.acc_files}
                    onImport={onImportLocal}
                    emptyText={t('no_acc_files_found')}
                    t={t}
                  />
                  <SimDiscoverySection
                    label="Le Mans Ultimate"
                    dotColor="bg-blue-500"
                    files={autoData.lmu_files}
                    onImport={onImportLocal}
                    emptyText={t('no_lmu_files_found')}
                    t={t}
                  />
                  <SimDiscoverySection
                    label="Assetto Corsa EVO"
                    dotColor="bg-purple-500"
                    files={autoData.acevo_files}
                    onImport={onImportLocal}
                    emptyText={t('no_acevo_files_found')}
                    t={t}
                  />
                  <SimDiscoverySection
                    label="Assetto Corsa"
                    dotColor="bg-orange-500"
                    files={autoData.ac1_files}
                    onImport={onImportLocal}
                    emptyText={t('no_ac1_files_found')}
                    t={t}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Quick Setup Guide for Amateur Simracers */}
          <div className="glass-panel rounded-2xl p-6 border border-white/10 bg-night-5 space-y-3">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider font-brand flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-best" />
              {t('how_to_record_title')}
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 text-xs text-gray-300">
              <div className="p-4 rounded-xl bg-night-3 border border-white/5 space-y-1.5">
                <span className="font-bold text-accent block text-sm">Assetto Corsa Competizione</span>
                <p className="text-gray-400">
                  Abre el setup del coche en el garaje del juego. En la pestaña <strong>Electrónica</strong> o <strong>Setup</strong>, pon <strong>Telemetry Laps &gt; 0</strong> (ej. 99).
                </p>
                <p className="text-[11px] text-gray-500">
                  Guarda los archivos .ld en <code className="text-gray-300">Documentos/Assetto Corsa Competizione/MoTeC</code>.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-night-3 border border-white/5 space-y-1.5">
                <span className="font-bold text-blue-400 block text-sm">Le Mans Ultimate</span>
                <p className="text-gray-400">
                  LMU registra automáticamente cada tanda en archivos XML en tu carpeta de Steam.
                </p>
                <p className="text-[11px] text-gray-500">
                  Ruta típica: <code className="text-gray-300">Steam/steamapps/common/Le Mans Ultimate/UserData/Log/Results</code>.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-night-3 border border-white/5 space-y-1.5">
                <span className="font-bold text-red-400 block text-sm">iRacing & Otros</span>
                <p className="text-gray-400">
                  Pulsa <strong>Alt + L</strong> dentro del simulador para iniciar la grabación de telemetría en formato IBT o exporta a CSV.
                </p>
                <p className="text-[11px] text-gray-500">
                  IdoRacing Analytics procesará los canales de velocidad, pedales y tiempos automáticamente.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
