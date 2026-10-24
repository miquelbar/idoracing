import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Flag,
  FolderOpen,
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
import { errorMessage, formatDate, formatLapTime, simBadge } from '../utils/formatters';
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
  const [filterGame, setFilterGame] = useState<'all' | 'acc' | 'lmu' | 'iracing' | 'acevo' | 'ac1' | 'dr2'>('all');
  const [uploading, setUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [sessionGroups, setSessionGroups] = useState<SessionGroup[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [workspaceSessionFilter, setWorkspaceSessionFilter] = useState<string>('all');

  // Load session groups for cross-session comparison (deduplicating by canonical track)
  useEffect(() => {
    fetchSessionGroups()
      .then((rawGroups) => {
        const byTrack = new Map<string, SessionGroup>();
        for (const g of rawGroups) {
          const existing = byTrack.get(g.track);
          if (!existing) {
            byTrack.set(g.track, { ...g, sessions: [...g.sessions] });
          } else {
            const seen = new Set(existing.sessions.map((s) => s.session_id));
            for (const s of g.sessions) {
              if (!seen.has(s.session_id)) {
                existing.sessions.push(s);
                seen.add(s.session_id);
              }
            }
            if (existing.simulator === 'Unknown' && g.simulator && g.simulator !== 'Unknown') {
              existing.simulator = g.simulator;
            }
          }
        }
        const merged = Array.from(byTrack.values()).map((g) => {
          const realSess = g.sessions.filter((s) => !s.is_demo && !s.session_id.startsWith('synth_'));
          const sessList = realSess.length > 0 ? realSess : g.sessions;
          sessList.sort((a, b) => b.date.localeCompare(a.date));
          const pbs = sessList.filter((s) => s.best_lap_time > 0).map((s) => s.best_lap_time);
          return {
            ...g,
            sessions: sessList,
            total_laps: sessList.reduce((acc, s) => acc + s.lap_count, 0),
            best_lap_time: pbs.length > 0 ? Math.min(...pbs) : g.best_lap_time,
          };
        });
        merged.sort((a, b) => b.sessions.length - a.sessions.length || b.total_laps - a.total_laps);

        setSessionGroups(merged);
        if (merged.length > 0) {
          setExpandedGroups((prev) => {
            if (prev.size > 0) return prev;
            const next = new Set<string>();
            for (const g of merged.slice(0, 2)) {
              next.add(`${g.simulator}|${g.track}`);
            }
            return next;
          });
        }
      })
      .catch(() => setSessionGroups([]));
  }, [sessions]);

  const activeSessionSummary =
    sessions.find((s) => s.session_id === selectedSessionId) || sessions[0];

  // Reset workspace filter when switching to a different track/car
  useEffect(() => {
    setWorkspaceSessionFilter('all');
  }, [activeSessionSummary?.track, activeSessionSummary?.car]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filteredGroups = sessionGroups.filter((g) => {
    if (filterGame === 'acc') return g.simulator === 'Assetto Corsa Competizione';
    if (filterGame === 'lmu') return g.simulator === 'Le Mans Ultimate';
    if (filterGame === 'iracing') return g.simulator === 'iRacing';
    if (filterGame === 'acevo') return g.simulator === 'Assetto Corsa EVO';
    if (filterGame === 'ac1') return g.simulator === 'Assetto Corsa' || g.simulator === 'Assetto Corsa Rally';
    if (filterGame === 'dr2') return g.simulator === 'DiRT Rally 2.0' || g.simulator === 'EA SPORTS WRC';
    return true;
  });

  // Find all sessions belonging to the active [Track + Car] across all groups
  const activeTrackName = comparison?.track_name || activeSessionSummary?.track || '';
  const activeCarName = comparison?.car_name || activeSessionSummary?.car || '';

  const matchingTrackGroup = sessionGroups.find(
    (g) =>
      g.track.toLowerCase() === activeTrackName.toLowerCase() ||
      g.sessions.some((s) => s.session_id === selectedSessionId)
  );

  const rawMatchingCarSessions = (matchingTrackGroup?.sessions || []).filter(
    (s) => s.car.toLowerCase() === activeCarName.toLowerCase() || s.session_id === selectedSessionId
  );
  const isCurrentDemo = Boolean(selectedSessionId?.startsWith('synth_'));
  const nonDemoMatching = rawMatchingCarSessions.filter((s) => !s.is_demo && !s.session_id.startsWith('synth_'));
  const matchingCarSessions =
    !isCurrentDemo && nonDemoMatching.length > 0 ? nonDemoMatching : rawMatchingCarSessions;
  const hasWorkspace50Hz = matchingCarSessions.some((s) => Boolean(s.has_telemetry));

  const formatSessionChipDate = (isoDate: string) => {
    try {
      const d = new Date(isoDate);
      if (Number.isNaN(d.getTime())) return formatDate(isoDate, lang);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${dd}/${mm} ${hh}:${min}`;
    } catch {
      return formatDate(isoDate, lang);
    }
  };

  interface HistoricalLapRow {
    sessionId: string;
    sessionDate: string;
    lap_number: number;
    lap_time: number;
    is_valid: boolean;
    has_telemetry: boolean;
    is_outlap: boolean;
    sector_times?: number[];
  }

  const allHistoricalLaps: HistoricalLapRow[] =
    matchingCarSessions.length > 0
      ? matchingCarSessions.flatMap((sess) => {
          const fullLaps =
            sess.session_id === activeFullSession?.session_id
              ? activeFullSession.laps
              : null;
          const posTimes = sess.laps.filter((l) => l.lap_time > 20).map((l) => l.lap_time);
          const sessBest = sess.best_lap_time > 0 ? sess.best_lap_time : posTimes.length > 0 ? Math.min(...posTimes) : 0;
          return sess.laps
            .filter((l) => l.lap_time >= 20.0)
            .map((l) => {
              const detailLap = fullLaps?.find((fl) => fl.lap_number === l.lap_number);
              const lap1Slow = l.lap_number === 1 && (!l.is_valid || (sessBest > 0 && l.lap_time > sessBest * 1.05));
              const exceeds107 = sessBest > 0 && l.lap_time > sessBest * 1.07;
              return {
                sessionId: sess.session_id,
                sessionDate: sess.date,
                lap_number: l.lap_number,
                lap_time: l.lap_time,
                is_valid: l.is_valid,
                has_telemetry: l.has_telemetry ?? sess.has_telemetry ?? false,
                is_outlap: Boolean(l.is_outlap || detailLap?.is_outlap || l.lap_time > 150 || lap1Slow || exceeds107),
                sector_times: detailLap?.sector_times,
              };
            });
        })
      : (activeFullSession?.laps || []).map((l) => {
          const posTimes = (activeFullSession?.laps || []).filter((x) => x.lap_time > 20).map((x) => x.lap_time);
          const sessBest = posTimes.length > 0 ? Math.min(...posTimes) : 0;
          const lap1Slow = l.lap_number === 1 && (!l.is_valid || (sessBest > 0 && l.lap_time > sessBest * 1.05));
          const exceeds107 = sessBest > 0 && l.lap_time > sessBest * 1.07;
          return {
            sessionId: activeFullSession?.session_id || selectedSessionId || '',
            sessionDate: activeSessionSummary?.date || '',
            lap_number: l.lap_number,
            lap_time: l.lap_time,
            is_valid: l.is_valid,
            has_telemetry: l.has_telemetry ?? activeSessionSummary?.has_telemetry ?? false,
            is_outlap: Boolean(l.is_outlap || l.lap_time > 150 || lap1Slow || exceeds107),
            sector_times: l.sector_times,
          };
        });

  const filteredHistoricalLaps =
    workspaceSessionFilter === 'all'
      ? allHistoricalLaps
      : allHistoricalLaps.filter((l) => l.sessionId === workspaceSessionFilter);

  // Best historical flying lap (PB) across all sessions of this [Track + Car]
  const flyingHistoricalLaps = allHistoricalLaps.filter(
    (l) => l.is_valid && !l.is_outlap && l.lap_time > 20
  );
  const historicalPbLap =
    (flyingHistoricalLaps.length > 0 ? flyingHistoricalLaps : allHistoricalLaps).reduce<HistoricalLapRow | null>(
      (best, curr) => (!best || curr.lap_time < best.lap_time ? curr : best),
      null
    );

  const handleUseHistoricalPbAsRef = () => {
    if (!historicalPbLap) return;
    if (onSelectRefLapCross) {
      onSelectRefLapCross(historicalPbLap.sessionId, historicalPbLap.lap_number);
    } else {
      onSelectRefLap(historicalPbLap.lap_number);
    }
  };

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
              <button
                onClick={() => setFilterGame('acevo')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  filterGame === 'acevo'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                AC EVO
              </button>
              <button
                onClick={() => setFilterGame('ac1')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  filterGame === 'ac1'
                    ? 'bg-orange-600 text-white'
                    : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                AC / Rally
              </button>
              <button
                onClick={() => setFilterGame('dr2')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  filterGame === 'dr2'
                    ? 'bg-amber-600 text-white'
                    : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                DiRT / WRC
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
          {/* Left: Groups by track with sessions & laps (7 cols) */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider font-telemetry flex items-center gap-2">
                <Flag className="w-4 h-4 text-brand" />
                {t('groups_by_track')} ({filteredGroups.length})
              </h3>
              <span className="text-[11px] text-gray-500 font-telemetry">
                {t('click_to_load_workspace')}
              </span>
            </div>

            <div className="space-y-3">
              {filteredGroups.map((group) => {
                const groupKey = `${group.simulator}|${group.track}`;
                const isExpanded = expandedGroups.has(groupKey);
                const badge = simBadge(group.simulator);
                const isCrossRef = refSessionId
                  ? group.sessions.some((s) => s.session_id === refSessionId)
                  : false;
                const isCrossComp = compSessionId
                  ? group.sessions.some((s) => s.session_id === compSessionId)
                  : false;

                return (
                  <div
                    key={groupKey}
                    className="rounded-2xl bg-night-6 border border-white/5 overflow-hidden"
                  >
                    {/* Group header */}
                    <button
                      onClick={() => toggleGroup(groupKey)}
                      className="w-full flex items-center justify-between gap-3 p-4 hover:bg-white/5 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <ChevronDown
                          className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isExpanded ? '' : '-rotate-90'}`}
                        />
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider font-telemetry border shrink-0 ${badge.className}`}>
                          {badge.label}
                        </span>
                        <span className="text-sm font-bold text-white font-brand truncate">
                          {group.track}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs font-telemetry text-gray-400 shrink-0">
                        <span>{group.sessions.length} {t('sessions_count')}</span>
                        <span>{group.total_laps} {t('laps_count')}</span>
                        <span className="text-brand font-bold">{formatLapTime(group.best_lap_time)}</span>
                      </div>
                    </button>

                    {/* Cross-session indicator when collapsed */}
                    {(isCrossRef || isCrossComp) && !isExpanded && (
                      <div className="px-4 pb-3 flex items-center gap-2 text-[11px] font-telemetry">
                        {isCrossRef && (
                          <span className="px-2 py-0.5 rounded bg-brand/20 text-brand border border-brand/40">
                            {t('cross_ref_label')}
                          </span>
                        )}
                        {isCrossComp && (
                          <span className="px-2 py-0.5 rounded bg-comp/20 text-comp border border-comp/40">
                            {t('cross_comp_label')}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Cars within the circuit group (1 row per Car, no nested sessions or laps on the left) */}
                    {isExpanded && (
                      <div className="border-t border-white/5 divide-y divide-white/5">
                        {Array.from(
                          group.sessions.reduce((map, s) => {
                            const list = map.get(s.car) || [];
                            list.push(s);
                            map.set(s.car, list);
                            return map;
                          }, new Map<string, typeof group.sessions>())
                        ).map(([carName, carSessions]) => {
                          const totalCarLaps = carSessions.reduce((acc, s) => acc + s.lap_count, 0);
                          const has50Hz = carSessions.some((s) => Boolean(s.has_telemetry));
                          const realPbs = carSessions
                            .filter((s) => s.best_lap_time > 0 && !s.is_demo)
                            .map((s) => s.best_lap_time);
                          const allPbs = carSessions.filter((s) => s.best_lap_time > 0).map((s) => s.best_lap_time);
                          const bestCarLap =
                            realPbs.length > 0
                              ? Math.min(...realPbs)
                              : allPbs.length > 0
                              ? Math.min(...allPbs)
                              : 0;

                          const isCarActive =
                            carSessions.some((s) => s.session_id === selectedSessionId) ||
                            (activeTrackName.toLowerCase() === group.track.toLowerCase() &&
                              activeCarName.toLowerCase() === carName.toLowerCase());

                          // Best default session to load when clicking this [Track + Car]: prefer sessions with >=2 flying laps
                          const targetSession =
                            carSessions.find((s) => s.has_telemetry && !s.is_demo && s.lap_count >= 5) ||
                            carSessions.find((s) => s.has_telemetry && !s.is_demo && s.lap_count >= 3) ||
                            carSessions.find((s) => s.has_telemetry && !s.is_demo && s.lap_count >= 2) ||
                            carSessions.find((s) => s.has_telemetry && !s.is_demo) ||
                            carSessions.find((s) => s.has_telemetry) ||
                            carSessions[0];

                          return (
                            <div
                              key={carName}
                              onClick={() => {
                                if (!isCarActive && targetSession) {
                                  onSelectSession(targetSession.session_id);
                                }
                              }}
                              className={`p-4 pl-6 flex items-center justify-between gap-3 transition cursor-pointer ${
                                isCarActive
                                  ? 'bg-brand/10 border-l-2 border-l-brand'
                                  : 'bg-black/15 hover:bg-white/5'
                              }`}
                            >
                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-bold text-white font-telemetry flex items-center gap-1.5">
                                    <span>🏎️</span>
                                    <span>{carName}</span>
                                  </span>
                                  {has50Hz ? (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold font-telemetry">
                                      📈 Telemetría 50Hz
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold font-telemetry">
                                      ⏱️ Solo Tiempos
                                    </span>
                                  )}
                                  {isCarActive && (
                                    <span className="px-1.5 py-0.5 rounded bg-brand/20 text-brand border border-brand/40 text-[9px] font-bold font-telemetry uppercase">
                                      Activo en Workspace
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-[11px] font-telemetry text-gray-400">
                                  <span>
                                    {carSessions.length} {t('sessions_count')}
                                  </span>
                                  <span>•</span>
                                  <span>
                                    {totalCarLaps} {t('laps_count')}
                                  </span>
                                  {bestCarLap > 0 && (
                                    <>
                                      <span>•</span>
                                      <span className="text-brand font-bold">
                                        PB: {formatLapTime(bestCarLap)}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div
                                className="flex items-center gap-2 shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {isCarActive ? (
                                  <button
                                    onClick={onGoToTelemetry}
                                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-brand hover:bg-brand-light text-black text-xs font-bold tracking-wide transition cursor-pointer shadow-md"
                                  >
                                    <Zap className="w-3.5 h-3.5" />
                                    <span>{t('view_telemetry_arrow')}</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => targetSession && onSelectSession(targetSession.session_id)}
                                    disabled={loading}
                                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-brand text-white hover:text-black border border-white/10 hover:border-brand text-xs font-bold tracking-wide transition cursor-pointer"
                                  >
                                    <Zap className="w-3.5 h-3.5 text-brand" />
                                    <span>{t('load_in_workspace')}</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredGroups.length === 0 && (
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

          {/* Right: Active Cross-Session Workspace Details & Laps (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
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
                        {activeTrackName}
                      </h3>
                      <p className="text-xs text-gray-300 font-medium mt-0.5">
                        {t('car_label')}: <strong className="text-white">{activeCarName}</strong>
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
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-brand" />
                          <span className="text-gray-300">
                            REF · <strong className="text-brand">P1 (V{refLapNumber})</strong> ({formatLapTime(comparison?.ref_lap_time)})
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-comp" />
                          <span className="text-gray-300">
                            COMP · <strong className="text-[#D8B4FE]">P2 (V{compLapNumber})</strong> ({formatLapTime(comparison?.comp_lap_time)})
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

                    {/* Direct button: Use Historical PB as Ref P1 */}
                    {historicalPbLap && (
                      <div className="pt-1 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={handleUseHistoricalPbAsRef}
                          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-brand/15 hover:bg-brand/25 text-brand border border-brand/40 text-[11px] font-bold font-telemetry transition cursor-pointer"
                        >
                          <Trophy className="w-3.5 h-3.5" />
                          <span>
                            🏆 Usar PB Histórico como Ref P1 (V{historicalPbLap.lap_number} · {formatLapTime(historicalPbLap.lap_time)})
                          </span>
                        </button>
                      </div>
                    )}

                    {!hasWorkspace50Hz && (
                      <div className="mt-2 p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-xs text-amber-200 space-y-2 font-telemetry">
                        <div className="flex items-center gap-2 font-bold text-amber-300 text-[11px]">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>Vueltas sin telemetría física a 50Hz (Solo tiempos de vuelta)</span>
                        </div>
                        <p className="text-[11px] text-gray-300 leading-relaxed">
                          Para registrar acelerador, freno, volante, fuerzas G y trazada GPS completa a 50Hz sin inventar datos, añade a Parámetros de lanzamiento en Steam:
                        </p>
                        <code className="block p-1.5 rounded bg-black/60 border border-white/10 text-brand text-[10px] font-mono select-all">
                          /home/miquel/git/acc-coach/recorder/linux/sim-with-recorder.sh %command%
                        </code>
                        <div className="pt-1 text-[10px] text-gray-400 border-t border-white/5 space-y-1">
                          <div>
                            • <strong>DiRT Rally 2.0 / EA WRC:</strong> Habilita UDP en <code className="text-amber-200">hardware_settings_config.xml</code>: <code className="text-amber-200">&lt;udp enabled=&quot;true&quot; extradata=&quot;3&quot; port=&quot;20777&quot; /&gt;</code>
                          </div>
                          <div>
                            • <strong>Windows / Nativo:</strong> Ejecuta <code className="text-amber-200">idoracing-recorder.exe -sim auto</code> antes o durante tu sesión.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cross-Session Historical Laps List */}
                <div className="glass-panel rounded-2xl p-5 bg-night-5 border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider font-telemetry">
                      {t('registered_laps')} ({filteredHistoricalLaps.length})
                    </h4>
                    <span className="text-[10px] text-gray-400 font-telemetry">
                      {matchingCarSessions.length > 1
                        ? `${matchingCarSessions.length} sesiones combinadas`
                        : t('select_laps_hint')}
                    </span>
                  </div>

                  {/* Quick Session/Date Filter at top of workspace */}
                  {matchingCarSessions.length > 1 && (
                    <div className="flex flex-wrap items-center gap-1.5 pb-1 font-telemetry text-[10px]">
                      <button
                        type="button"
                        onClick={() => setWorkspaceSessionFilter('all')}
                        className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer border ${
                          workspaceSessionFilter === 'all'
                            ? 'bg-brand text-black border-brand'
                            : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        Todas ({allHistoricalLaps.length})
                      </button>
                      {matchingCarSessions.map((ms) => (
                        <button
                          key={ms.session_id}
                          type="button"
                          onClick={() => setWorkspaceSessionFilter(ms.session_id)}
                          className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer border ${
                            workspaceSessionFilter === ms.session_id
                              ? 'bg-brand text-black border-brand'
                              : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10'
                          }`}
                        >
                          {formatSessionChipDate(ms.date)} ({ms.lap_count}v)
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {filteredHistoricalLaps.map((lap) => {
                      const effectiveRefSess = refSessionId || selectedSessionId;
                      const effectiveCompSess = compSessionId || selectedSessionId;
                      const isRef =
                        lap.sessionId === effectiveRefSess && lap.lap_number === refLapNumber;
                      const isComp =
                        lap.sessionId === effectiveCompSess && lap.lap_number === compLapNumber;
                      const isHistoricalPb =
                        historicalPbLap &&
                        historicalPbLap.sessionId === lap.sessionId &&
                        historicalPbLap.lap_number === lap.lap_number;

                      return (
                        <div
                          key={`${lap.sessionId}-lap-${lap.lap_number}`}
                          className={`p-3 rounded-xl border transition flex items-center justify-between gap-3 ${
                            isRef
                              ? 'bg-brand/10 border-brand/50 shadow-sm'
                              : isComp
                              ? 'bg-comp/10 border-comp/50 shadow-sm'
                              : 'bg-night-3 border-white/5 hover:border-white/10'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className={`w-9 h-9 rounded-lg border flex items-center justify-center font-telemetry font-bold text-xs shrink-0 ${
                                isRef
                                  ? 'bg-brand text-black border-brand'
                                  : isComp
                                  ? 'bg-comp text-white border-comp'
                                  : 'bg-black/40 border-white/5 text-white'
                              }`}
                            >
                              V{lap.lap_number}
                            </span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-telemetry text-sm font-bold text-white">
                                  {formatLapTime(lap.lap_time)}
                                </span>
                                {isHistoricalPb && (
                                  <span className="px-1.5 py-0.5 rounded bg-brand/20 text-brand border border-brand/40 text-[9px] font-bold font-telemetry">
                                    🏆 PB
                                  </span>
                                )}
                                {lap.is_outlap && (
                                  <span className="px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-300 border border-gray-500/30 text-[9px] font-bold font-telemetry">
                                    Out-lap / Pit
                                  </span>
                                )}
                                {lap.has_telemetry ? (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold font-telemetry">
                                    📈 Telemetría 50Hz
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[9px] font-bold font-telemetry">
                                    ⏱️ Solo Tiempos
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-gray-400 font-telemetry mt-0.5">
                                {lap.sessionDate && (
                                  <span className="text-gray-400">{formatDate(lap.sessionDate, lang)}</span>
                                )}
                                {!lap.is_valid && (
                                  <span className="text-rose-400">({t('invalid_lap')})</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() =>
                                onSelectRefLapCross
                                  ? onSelectRefLapCross(lap.sessionId, lap.lap_number)
                                  : onSelectRefLap(lap.lap_number)
                              }
                              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-telemetry font-bold transition cursor-pointer ${
                                isRef
                                  ? 'bg-brand text-black shadow-sm'
                                  : 'bg-white/5 hover:bg-white/10 text-gray-300'
                              }`}
                            >
                              {isRef ? t('ref_btn_active') : 'Ref P1'}
                            </button>
                            <button
                              onClick={() =>
                                onSelectCompLapCross
                                  ? onSelectCompLapCross(lap.sessionId, lap.lap_number)
                                  : onSelectCompLap(lap.lap_number)
                              }
                              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-telemetry font-bold transition cursor-pointer ${
                                isComp
                                  ? 'bg-comp text-white shadow-sm'
                                  : 'bg-white/5 hover:bg-white/10 text-gray-300'
                              }`}
                            >
                              {isComp ? t('comp_btn_active') : 'Comp P2'}
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {filteredHistoricalLaps.length === 0 && (
                      <div className="text-center py-10 px-4 rounded-xl bg-black/30 border border-white/5">
                        <p className="text-xs text-gray-400">
                          {t('loading_active_laps')}
                        </p>
                      </div>
                    )}
                  </div>

                  {filteredHistoricalLaps.some((l) => !l.has_telemetry) && (
                    <div className="p-3 rounded-xl bg-night-3 border border-amber-500/25 text-xs text-gray-300 space-y-1.5 font-telemetry">
                      <div className="flex items-center gap-1.5 text-amber-300 font-bold text-[11px]">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>¿Tienes vueltas marcadas con "⏱️ Solo Tiempos"?</span>
                      </div>
                      <p className="text-[11px] text-gray-400 leading-relaxed">
                        Estas vueltas se importaron de un archivo XML o resumen sin telemetría física. Para grabar automáticamente a 50Hz (frenada, acelerador, volante y trazada GPS), añade a los parámetros de lanzamiento en Steam:
                      </p>
                      <code className="block p-1.5 rounded bg-black/60 border border-white/10 text-brand text-[10px] font-mono select-all">
                        /home/miquel/git/acc-coach/recorder/linux/sim-with-recorder.sh %command%
                      </code>
                    </div>
                  )}
                </div>
              </>
            )}
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

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pt-2 text-xs text-gray-300">
              <div className="p-4 rounded-xl bg-night-3 border border-accent/20 space-y-1.5">
                <span className="font-bold text-accent block text-sm">Assetto Corsa Competizione</span>
                <p className="text-gray-400">
                  Abre el setup en el garaje. En <strong>Electrónica</strong>, pon <strong>Telemetry Laps &gt; 0</strong> para generar archivos <code className="text-gray-300">.ld</code> en MoTeC.
                </p>
                <p className="text-[11px] text-gray-400">
                  Para registrar trazada GPS: lanza en Steam con <code className="text-brand">acc-with-recorder.sh %command%</code>.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-night-3 border border-blue-500/20 space-y-1.5">
                <span className="font-bold text-blue-400 block text-sm">Le Mans Ultimate</span>
                <p className="text-gray-300">
                  <strong>Grabador IdoRacing (50Hz + GPS):</strong> Lanza LMU en Steam con <code className="text-brand">lmu-with-recorder.sh %command%</code>.
                </p>
                <p className="text-[11px] text-gray-400">
                  Resultados XML: se importan automáticamente desde <code className="text-gray-300">UserData/Log/Results</code>.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-night-3 border border-purple-500/20 space-y-1.5">
                <span className="font-bold text-purple-400 block text-sm">Assetto Corsa EVO</span>
                <p className="text-gray-400">
                  En el garaje, pon <strong>Telemetry Laps &gt; 0</strong>. Guarda los .ld en <code className="text-gray-300">Saved Games/ACE/MoTec/</code>.
                </p>
                <p className="text-[11px] text-gray-400">
                  O usa el grabador con <code className="text-brand">acevo-with-recorder.sh %command%</code>.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-night-3 border border-orange-500/20 space-y-1.5">
                <span className="font-bold text-orange-400 block text-sm">Assetto Corsa 1 & AC Rally</span>
                <p className="text-gray-400">
                  Tanto en circuito como en tramos de rally: lanza en Steam con <code className="text-brand">ac-with-recorder.sh %command%</code> para capturar 50Hz, pedales y trazada abierta.
                </p>
                <p className="text-[11px] text-gray-400">
                  O exporta telemetría MoTeC con Content Manager / ACTIR a archivos .ld.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-night-3 border border-amber-500/20 space-y-1.5">
                <span className="font-bold text-amber-400 block text-sm">DiRT Rally 2.0 & EA WRC</span>
                <p className="text-gray-300">
                  En <code className="text-gray-300">hardware_settings_config.xml</code> activa:
                  <code className="block mt-1 p-1 bg-black/40 rounded text-amber-300 text-[10px] select-all">&lt;udp enabled="true" extradata="3" ip="127.0.0.1" port="20777" /&gt;</code>
                </p>
                <p className="text-[11px] text-gray-400">
                  Lanza en Steam con <code className="text-brand">dr2-with-recorder.sh %command%</code>.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-night-3 border border-red-500/20 space-y-1.5">
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
