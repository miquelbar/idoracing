import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Header, type NavTab } from './components/Header';
import { TelemetryHeaderBar } from './components/TelemetryHeaderBar';
import {
  autodiscoverSims,
  fetchComparison,
  fetchHealth,
  fetchSession,
  fetchSessions,
  generateDemoSession,
  importLocalFile,
} from './services/api';
import type {
  AutoDiscoverData,
  CoachReport,
  ComparisonResponse,
  CornerDTO,
  SessionDetail,
  SessionSummary,
  SystemStatus,
} from './types/telemetry';
import { detectSimGame, errorMessage } from './utils/formatters';
import { translate } from './i18n';
import { EngineerView } from './views/EngineerView';
import { SessionsView } from './views/SessionsView';
import { SettingsView } from './views/SettingsView';
import { CarSetupView } from './views/CarSetupView';
import { TelemetryView } from './views/TelemetryView';
import { CarSetupModal } from './components/CarSetupModal';
import { StintModal } from './components/StintModal';

const ACTIVE_SESSION_KEY = 'idoracing.activeSessionId';
const ACTIVE_LAPS_KEY = 'idoracing.activeLaps';

/** Remember what the user loaded so an F5 reloads the same session and laps. */
function storeActiveSelection(sessionId: string | null, refLap: number, compLap: number) {
  try {
    if (sessionId) localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
    localStorage.setItem(ACTIVE_LAPS_KEY, JSON.stringify({ sessionId, ref: refLap, comp: compLap }));
  } catch {
    /* storage unavailable */
  }
}

function readStoredSessionId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_SESSION_KEY);
  } catch {
    return null;
  }
}

/** Remember the session but let the default lap pair be picked fresh. */
function storePreferredSession(sessionId: string) {
  try {
    localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
    localStorage.removeItem(ACTIVE_LAPS_KEY);
  } catch {
    /* storage unavailable */
  }
}

function readStoredLaps(sessionId: string): { ref: number; comp: number } | null {
  try {
    const raw = localStorage.getItem(ACTIVE_LAPS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.sessionId === sessionId && Number.isFinite(parsed.ref) && Number.isFinite(parsed.comp)) {
      return { ref: parsed.ref, comp: parsed.comp };
    }
  } catch {
    /* ignore malformed storage */
  }
  return null;
}

function isLapOutlap(
  lap: {
    lap_number: number;
    lap_time: number;
    is_valid: boolean;
    is_outlap?: boolean;
    is_incomplete?: boolean;
    telemetry?: { speed?: number[]; distance?: number[] };
  },
  bestLapTime: number,
): boolean {
  if (lap.is_outlap || lap.is_incomplete || lap.lap_time > 150 || (lap.lap_time > 0 && lap.lap_time < 20)) {
    return true;
  }
  if (bestLapTime > 0 && lap.lap_time > bestLapTime * 1.07) {
    return true;
  }
  if (lap.lap_number === 1) {
    if (!lap.is_valid) return true;
    if (bestLapTime > 0 && lap.lap_time > bestLapTime * 1.05) return true;
    const speeds = lap.telemetry?.speed || [];
    const dists = lap.telemetry?.distance || [];
    if (speeds.length > 0) {
      const initSpeeds =
        dists.length === speeds.length
          ? speeds.filter((_, i) => dists[i] >= 0 && dists[i] < 50)
          : speeds.slice(0, 12);
      if (initSpeeds.length > 0) {
        const avgInit = initSpeeds.reduce((a, b) => a + b, 0) / initSpeeds.length;
        if (initSpeeds[0] < 180 || avgInit < 180) return true;
      }
    }
  }
  return false;
}

/** Fastest valid flying lap (PB) as P1, paired with the second fastest valid flying lap within 107% of PB as P2. */
function pickDefaultLaps(session: SessionDetail | null): [number, number] {
  if (!session || session.laps.length === 0) return [1, 2];
  if (session.laps.length === 1) return [session.laps[0].lap_number, session.laps[0].lap_number];

  const positiveTimes = session.laps.filter((l) => l.lap_time > 20).map((l) => l.lap_time);
  const bestLapTime = positiveTimes.length > 0 ? Math.min(...positiveTimes) : 0;

  const flyingValid = session.laps
    .filter((l) => l.lap_time > 20 && l.lap_time <= 150 && l.is_valid && !isLapOutlap(l, bestLapTime))
    .sort((a, b) => a.lap_time - b.lap_time);
  if (flyingValid.length >= 2) {
    return [flyingValid[0].lap_number, flyingValid[1].lap_number];
  }

  const flyingAny = session.laps
    .filter((l) => l.lap_time > 20 && !isLapOutlap(l, bestLapTime))
    .sort((a, b) => a.lap_time - b.lap_time);
  if (flyingAny.length >= 2) {
    return [flyingAny[0].lap_number, flyingAny[1].lap_number];
  }
  if (flyingValid.length === 1) {
    return [flyingValid[0].lap_number, flyingValid[0].lap_number];
  }
  if (flyingAny.length === 1) {
    return [flyingAny[0].lap_number, flyingAny[0].lap_number];
  }

  const sorted = [...session.laps].sort((a, b) => {
    const aOut = isLapOutlap(a, bestLapTime) ? 1 : 0;
    const bOut = isLapOutlap(b, bestLapTime) ? 1 : 0;
    if (aOut !== bOut) return aOut - bOut;
    if (a.lap_time <= 0) return 1;
    if (b.lap_time <= 0) return -1;
    return a.lap_time - b.lap_time;
  });
  return [sorted[0].lap_number, sorted[1]?.lap_number ?? sorted[0].lap_number];
}

function getTabFromHash(): NavTab {
  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
  if (['sessions', 'telemetry', 'setup', 'engineer', 'settings'].includes(hash)) {
    return hash as NavTab;
  }
  return 'telemetry';
}

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>(getTabFromHash);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [activeFullSession, setActiveFullSession] = useState<SessionDetail | null>(null);
  const [refLapNumber, setRefLapNumber] = useState<number>(1);
  const [compLapNumber, setCompLapNumber] = useState<number>(2);
  const [refSessionId, setRefSessionId] = useState<string | null>(null);
  const [compSessionId, setCompSessionId] = useState<string | null>(null);

  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [hoverDistance, setHoverDistance] = useState<number | null>(null);
  const [selectedCorner, setSelectedCorner] = useState<CornerDTO | null>(null);

  const [coachReport, setCoachReport] = useState<CoachReport | null>(null);
  const [autoData, setAutoData] = useState<AutoDiscoverData | null>(null);
  const [isDebriefOpen, setIsDebriefOpen] = useState(false);
  const [isCarSetupModalOpen, setIsCarSetupModalOpen] = useState(false);
  const [isStintModalOpen, setIsStintModalOpen] = useState(false);
  const [showIdealGhost, setShowIdealGhost] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const comparisonRequest = useRef<AbortController | null>(null);

  /** Fetch a comparison, cancelling any earlier one still in flight so a slow reply cannot overwrite a newer one. */
  const loadComparison = async (
    refLap: number,
    compLap: number,
    sessionId: string | null,
    crossRefSessionId?: string | null,
    crossCompSessionId?: string | null,
  ) => {
    comparisonRequest.current?.abort();
    const controller = new AbortController();
    comparisonRequest.current = controller;
    try {
      const comp = await fetchComparison(
        String(refLap),
        String(compLap),
        sessionId || undefined,
        controller.signal,
        crossRefSessionId || undefined,
        crossCompSessionId || undefined,
      );
      setComparison(comp);
      const returnedRefNum = Number(String(comp.ref_lap_id || '').replace(/\D+/g, ''));
      const returnedCompNum = Number(String(comp.comp_lap_id || '').replace(/\D+/g, ''));
      if (Number.isFinite(returnedRefNum) && returnedRefNum > 0) setRefLapNumber(returnedRefNum);
      if (Number.isFinite(returnedCompNum) && returnedCompNum > 0) setCompLapNumber(returnedCompNum);
      if (comp.ref_session_id) setRefSessionId(comp.ref_session_id);
      if (comp.comp_session_id) setCompSessionId(comp.comp_session_id);
      setSelectedCorner(null);
      setCoachReport(null);
    } catch (err) {
      if (controller.signal.aborted) return;
      throw err;
    }
  };

  const loadSessionDetail = async (sessionId: string): Promise<SessionDetail | null> => {
    try {
      const detail = await fetchSession(sessionId);
      setActiveFullSession(detail);
      return detail;
    } catch (e) {
      console.warn('Could not load full session:', e);
      return null;
    }
  };

  // Sync state with URL hash routing
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentTab(getTabFromHash());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleNavigateTab = (tab: NavTab) => {
    setCurrentTab(tab);
    window.location.hash = `#/${tab}`;
  };

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch system status
      const h = await fetchHealth();
      setStatus(h);

      // 2. Fetch local autodiscovered sim files
      try {
        const ad = await autodiscoverSims();
        setAutoData(ad);
      } catch (err) {
        console.warn('Auto-discover warning:', err);
      }

      // 3. Fetch existing sessions
      let sList = await fetchSessions();
      if (sList.length === 0) {
        await generateDemoSession();
        sList = await fetchSessions();
      }
      setSessions(sList);

      const storedSessionId = readStoredSessionId();
      const storedCandidate = sList.find((s) => s.session_id === storedSessionId);
      const activeSession =
        (storedCandidate && storedCandidate.lap_count >= 3 ? storedCandidate : null) ||
        sList.find((s) => !s.session_id.startsWith('synth_') && s.has_telemetry !== false && s.lap_count >= 5) ||
        sList.find((s) => !s.session_id.startsWith('synth_') && s.has_telemetry !== false && s.lap_count >= 3) ||
        storedCandidate ||
        sList.find((s) => !s.session_id.startsWith('synth_') && s.has_telemetry !== false) ||
        sList.find((s) => !s.session_id.startsWith('synth_')) || // default to real data over the demo
        sList[0];
      const activeSessionId = activeSession?.session_id || null;
      setSelectedSessionId(activeSessionId);

      const fullSess = activeSessionId ? await loadSessionDetail(activeSessionId) : null;
      const [defaultRef, defaultComp] = pickDefaultLaps(fullSess);
      let refLap = defaultRef;
      let compLap = defaultComp;
      const storedLaps = activeSessionId ? readStoredLaps(activeSessionId) : null;
      if (storedLaps && fullSess) {
        const posTimes = fullSess.laps.filter((l) => l.lap_time > 20).map((l) => l.lap_time);
        const bestT = posTimes.length > 0 ? Math.min(...posTimes) : 0;
        const refLapObj = fullSess.laps.find((l) => l.lap_number === storedLaps.ref);
        const compLapObj = fullSess.laps.find((l) => l.lap_number === storedLaps.comp);
        if (
          refLapObj &&
          compLapObj &&
          !isLapOutlap(refLapObj, bestT) &&
          !isLapOutlap(compLapObj, bestT) &&
          (storedLaps.ref !== storedLaps.comp || defaultRef === defaultComp)
        ) {
          refLap = storedLaps.ref;
          compLap = storedLaps.comp;
        }
      }
      setRefLapNumber(refLap);
      setCompLapNumber(compLap);
      storeActiveSelection(activeSessionId, refLap, compLap);

      // 4. Fetch telemetry comparison
      await loadComparison(refLap, compLap, activeSessionId);
    } catch (err) {
      setError(errorMessage(err, translate('err_init')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const handleSelectSession = async (sessionId: string) => {
    try {
      setLoading(true);
      setSelectedSessionId(sessionId);

      const fullSess = await loadSessionDetail(sessionId);
      const [p1, p2] = pickDefaultLaps(fullSess);
      setRefLapNumber(p1);
      setCompLapNumber(p2);
      storeActiveSelection(sessionId, p1, p2);
      await loadComparison(p1, p2, sessionId);
    } catch (err) {
      setError(errorMessage(err, translate('err_switch_session')));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRefLap = async (lapNumber: number) => {
    if (lapNumber === refLapNumber) return;
    try {
      setRefLapNumber(lapNumber);
      storeActiveSelection(selectedSessionId, lapNumber, compLapNumber);
      await loadComparison(lapNumber, compLapNumber, selectedSessionId);
    } catch (err) {
      setError(errorMessage(err, translate('err_select_ref')));
    }
  };

  const handleSelectCompLap = async (lapNumber: number) => {
    if (lapNumber === compLapNumber) return;
    try {
      setCompLapNumber(lapNumber);
      storeActiveSelection(selectedSessionId, refLapNumber, lapNumber);
      await loadComparison(refLapNumber, lapNumber, selectedSessionId);
    } catch (err) {
      setError(errorMessage(err, translate('err_select_comp')));
    }
  };

  /** Select a reference lap from any session (cross-session comparison). */
  const handleSelectRefLapCross = async (sessionId: string, lapNumber: number) => {
    try {
      setRefSessionId(sessionId);
      setRefLapNumber(lapNumber);
      await loadComparison(lapNumber, compLapNumber, selectedSessionId, sessionId, compSessionId);
    } catch (err) {
      setError(errorMessage(err, translate('err_select_ref')));
    }
  };

  /** Select a comparison lap from any session (cross-session comparison). */
  const handleSelectCompLapCross = async (sessionId: string, lapNumber: number) => {
    try {
      setCompSessionId(sessionId);
      setCompLapNumber(lapNumber);
      await loadComparison(refLapNumber, lapNumber, selectedSessionId, refSessionId, sessionId);
    } catch (err) {
      setError(errorMessage(err, translate('err_select_comp')));
    }
  };

  const handleLoadDemo = async () => {
    try {
      setLoadingDemo(true);
      const demo = await generateDemoSession();
      storePreferredSession(demo.session_id);
      await loadInitialData();
    } catch (err) {
      setError(errorMessage(err, translate('err_load_demo')));
    } finally {
      setLoadingDemo(false);
    }
  };

  const handleImportLocal = async (filepath: string) => {
    try {
      setLoading(true);
      await importLocalFile(filepath);
      await loadInitialData();
      handleNavigateTab('telemetry');
    } catch (err) {
      setError(errorMessage(err, translate('err_import_local')));
      setLoading(false);
    }
  };

  const handleCornerSelect = (corner: CornerDTO | null) => {
    setSelectedCorner(corner);
    if (corner) {
      setHoverDistance(corner.apex_distance);
    }
  };

  const handleRefreshAutoData = async () => {
    try {
      const ad = await autodiscoverSims();
      setAutoData(ad);
    } catch (e) {
      console.warn(e);
    }
  };

  const handleSettingsSaved = async () => {
    try {
      const h = await fetchHealth();
      setStatus(h);
    } catch (e) {
      console.warn(e);
    }
  };

  const currentSession = sessions.find((s) => s.session_id === selectedSessionId) || sessions[0];
  const activeGame = detectSimGame(currentSession, comparison);
  const activeTrack = comparison?.track_name || currentSession?.track || '—';
  const activeCar = comparison?.car_name || currentSession?.car || '—';

  return (
    <div
      className={`bg-[#08090C] text-[#E2E8F0] flex flex-col font-sans selection:bg-brand selection:text-black ${
        currentTab === 'telemetry' ? 'h-screen overflow-hidden' : 'min-h-screen'
      }`}
    >
      {/* 1. Header with Brand, Section Tabs & AI Status */}
      <Header
        currentTab={currentTab}
        onSelectTab={handleNavigateTab}
        status={status}
      />

      {/* 2. Sub-topbar unificado en todas las vistas (Telemetría, Sesiones, Setup, Ingeniero, Ajustes) */}
      <TelemetryHeaderBar
        comparison={comparison}
        gameName={activeGame}
        trackName={activeTrack}
        carName={activeCar}
        lapCount={currentSession?.lap_count}
        bestLapTime={currentSession?.best_lap_time}
        refLapNumber={refLapNumber}
        compLapNumber={compLapNumber}
        onNavigateToSessions={() => handleNavigateTab('sessions')}
        onOpenCarSetup={() => setIsCarSetupModalOpen(true)}
        onOpenStint={() => setIsStintModalOpen(true)}
        onOpenDebrief={() => {
          setIsDebriefOpen(true);
          if (currentTab !== 'telemetry') {
            handleNavigateTab('telemetry');
          }
        }}
        reportAvailable={!!coachReport}
        showIdealGhost={showIdealGhost}
        onToggleIdealGhost={() => setShowIdealGhost((v) => !v)}
      />

      {/* Main Viewport */}
      <main
        className={`max-w-[1920px] mx-auto w-full ${
          currentTab === 'telemetry'
            ? 'flex-1 p-2 flex flex-col min-h-0 overflow-hidden'
            : 'flex-1 p-4 md:p-6'
        }`}
      >
        {/* Loading Spinner */}
        {loading && (
          <div className="py-24 text-center flex flex-col items-center justify-center space-y-4">
            <div className="w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin shadow-[0_0_25px_rgba(0,210,190,0.4)]" />
            <div className="space-y-1">
              <h2 className="text-base font-bold text-white tracking-wide font-telemetry">
                SINCRONIZANDO TELEMETRÍA IDORACING ANALYTICS
              </h2>
              <p className="text-xs text-gray-400">
                Cargando datos de pista y alineando canales métricos...
              </p>
            </div>
          </div>
        )}

        {/* Global Error Banner */}
        {error && !loading && (
          <div className="p-4 mb-4 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={loadInitialData}
              className="px-3 py-1 bg-red-900/60 hover:bg-red-800 text-white rounded text-xs font-semibold cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Active View Tab Content (Driven by URL Hash Routing) */}
        {!loading && (
          <>
            {currentTab === 'telemetry' && comparison && (
              <TelemetryView
                comparison={comparison}
                hoverDistance={hoverDistance}
                onHoverDistance={setHoverDistance}
                selectedCorner={selectedCorner}
                onSelectCorner={handleCornerSelect}
                report={coachReport}
                onReportGenerated={setCoachReport}
                activeModel={status?.active_model || '—'}
                isDebriefOpen={isDebriefOpen}
                onOpenDebrief={() => setIsDebriefOpen(true)}
                onCloseDebrief={() => setIsDebriefOpen(false)}
                showIdealGhost={showIdealGhost}
                onToggleIdealGhost={() => setShowIdealGhost((v) => !v)}
                onSessionUploaded={async (newSessionId) => {
                  await loadInitialData();
                  await handleSelectSession(newSessionId);
                }}
                onRescanComplete={loadInitialData}
              />
            )}

            {currentTab === 'sessions' && (
              <SessionsView
                sessions={sessions}
                selectedSessionId={selectedSessionId}
                activeFullSession={activeFullSession}
                comparison={comparison}
                onSelectSession={handleSelectSession}
                refLapNumber={refLapNumber}
                compLapNumber={compLapNumber}
                onSelectRefLap={handleSelectRefLap}
                onSelectCompLap={handleSelectCompLap}
                refSessionId={refSessionId}
                compSessionId={compSessionId}
                onSelectRefLapCross={handleSelectRefLapCross}
                onSelectCompLapCross={handleSelectCompLapCross}
                onGoToTelemetry={() => handleNavigateTab('telemetry')}
                onLoadDemo={handleLoadDemo}
                autoData={autoData}
                onImportLocal={handleImportLocal}
                onRefreshAutoData={handleRefreshAutoData}
                loading={loadingDemo}
              />
            )}

            {currentTab === 'setup' && (
              <CarSetupView
                selectedSessionId={selectedSessionId}
                trackName={activeTrack}
                carName={activeCar}
                refLapId={comparison?.ref_lap_id || null}
                compLapId={comparison?.comp_lap_id || null}
                refSessionId={comparison?.ref_session_id || refSessionId}
                compSessionId={comparison?.comp_session_id || compSessionId}
                onGoToTelemetry={() => handleNavigateTab('telemetry')}
              />
            )}

            {currentTab === 'engineer' && (
              <EngineerView
                comparison={comparison}
                report={coachReport}
                onReportGenerated={setCoachReport}
                activeModel={status?.active_model || '—'}
              />
            )}

            {currentTab === 'settings' && (
              <SettingsView
                status={status}
                onSettingsSaved={handleSettingsSaved}
              />
            )}
          </>
        )}
      </main>

      {/* Clean Status Footer (Hidden on telemetry view to maximize dashboard height) */}
      {currentTab !== 'telemetry' && (
        <footer className="border-t border-[#1E2638] bg-[#0A0C12] px-6 py-2.5 text-xs text-gray-500 font-telemetry flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-4">
            <span>
              IDORACING ANALYTICS v{status?.version || '2026.2'}{activeGame ? ` • ${activeGame}` : ''}
            </span>
            <span className="hidden md:inline text-gray-700">|</span>
            <span className="hidden md:inline text-gray-400">
              Motor IA: {status?.active_model || '—'} ({status?.provider || 'ollama'})
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-400">
              {activeTrack} • {activeCar}
            </span>
            <span className="text-brand font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
              ACTIVO
            </span>
          </div>
        </footer>
      )}

      {/* Global Car Setup Inspector Modal (Opened by clicking car badge or telemetry car pill) */}
      <CarSetupModal
        isOpen={isCarSetupModalOpen}
        onClose={() => setIsCarSetupModalOpen(false)}
        sessionId={selectedSessionId}
        refLapId={comparison?.ref_lap_id || null}
        compLapId={comparison?.comp_lap_id || null}
        refSessionId={comparison?.ref_session_id || refSessionId}
        compSessionId={comparison?.comp_session_id || compSessionId}
      />

      {/* Global Stint & Tyre Degradation Modal (Opened from Telemetry header pill) */}
      <StintModal
        isOpen={isStintModalOpen}
        onClose={() => setIsStintModalOpen(false)}
        sessionId={selectedSessionId}
        refLapNumber={refLapNumber}
        compLapNumber={compLapNumber}
        onSelectRefLap={(lap) => {
          setRefLapNumber(lap);
          loadComparison(lap, compLapNumber, selectedSessionId);
        }}
        onSelectCompLap={(lap) => {
          setCompLapNumber(lap);
          loadComparison(refLapNumber, lap, selectedSessionId);
        }}
      />
    </div>
  );
};

export default App;
