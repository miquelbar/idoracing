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
import { EngineerView } from './views/EngineerView';
import { SessionsView } from './views/SessionsView';
import { SettingsView } from './views/SettingsView';
import { SetupHistoryView } from './views/SetupHistoryView';
import { TelemetryView } from './views/TelemetryView';

/** Fastest two valid laps, or the first two laps when fewer than two are valid. */
function pickDefaultLaps(session: SessionDetail | null): [number, number] {
  if (!session || session.laps.length < 2) return [1, 2];
  const valid = session.laps.filter((l) => l.lap_time > 0 && l.is_valid).sort((a, b) => a.lap_time - b.lap_time);
  const [ref, comp] = valid.length >= 2 ? valid : session.laps;
  return [ref.lap_number, comp.lap_number];
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

  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [hoverDistance, setHoverDistance] = useState<number | null>(null);
  const [selectedCorner, setSelectedCorner] = useState<CornerDTO | null>(null);

  const [coachReport, setCoachReport] = useState<CoachReport | null>(null);
  const [autoData, setAutoData] = useState<AutoDiscoverData | null>(null);
  const [isDebriefOpen, setIsDebriefOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const comparisonRequest = useRef<AbortController | null>(null);

  /** Fetch a comparison, cancelling any earlier one still in flight so a slow reply cannot overwrite a newer one. */
  const loadComparison = async (refLap: number, compLap: number, sessionId: string | null) => {
    comparisonRequest.current?.abort();
    const controller = new AbortController();
    comparisonRequest.current = controller;
    try {
      const comp = await fetchComparison(String(refLap), String(compLap), sessionId || undefined, controller.signal);
      setComparison(comp);
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

      const activeSession = sList[0];
      const activeSessionId = activeSession?.session_id || null;
      setSelectedSessionId(activeSessionId);

      const fullSess = activeSessionId ? await loadSessionDetail(activeSessionId) : null;
      const [p1, p2] = pickDefaultLaps(fullSess);
      setRefLapNumber(p1);
      setCompLapNumber(p2);

      // 4. Fetch telemetry comparison
      await loadComparison(p1, p2, activeSessionId);
    } catch (err) {
      setError(errorMessage(err, 'Error inicializando el sistema de telemetría'));
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
      await loadComparison(p1, p2, sessionId);
    } catch (err) {
      setError(errorMessage(err, 'Error cambiando de sesión'));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRefLap = async (lapNumber: number) => {
    if (lapNumber === refLapNumber) return;
    try {
      setRefLapNumber(lapNumber);
      await loadComparison(lapNumber, compLapNumber, selectedSessionId);
    } catch (err) {
      setError(errorMessage(err, 'Error seleccionando vuelta de referencia'));
    }
  };

  const handleSelectCompLap = async (lapNumber: number) => {
    if (lapNumber === compLapNumber) return;
    try {
      setCompLapNumber(lapNumber);
      await loadComparison(refLapNumber, lapNumber, selectedSessionId);
    } catch (err) {
      setError(errorMessage(err, 'Error seleccionando vuelta comparada'));
    }
  };

  const handleLoadDemo = async () => {
    try {
      setLoadingDemo(true);
      await generateDemoSession();
      await loadInitialData();
    } catch (err) {
      setError(errorMessage(err, 'Error cargando sesión demo'));
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
      setError(errorMessage(err, 'Error importando archivo local'));
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
      className={`bg-[#08090C] text-[#E2E8F0] flex flex-col font-sans selection:bg-[#00D2BE] selection:text-black ${
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
        onOpenDebrief={() => {
          setIsDebriefOpen(true);
          if (currentTab !== 'telemetry') {
            handleNavigateTab('telemetry');
          }
        }}
        reportAvailable={!!coachReport}
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
            <div className="w-12 h-12 border-4 border-[#00D2BE] border-t-transparent rounded-full animate-spin shadow-[0_0_25px_rgba(0,210,190,0.4)]" />
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
                onGoToTelemetry={() => handleNavigateTab('telemetry')}
                onLoadDemo={handleLoadDemo}
                autoData={autoData}
                onImportLocal={handleImportLocal}
                onRefreshAutoData={handleRefreshAutoData}
                loading={loadingDemo}
              />
            )}

            {currentTab === 'setup' && (
              <SetupHistoryView
                selectedSessionId={selectedSessionId}
                trackName={activeTrack}
                carName={activeCar}
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
            <span className="text-[#00D2BE] font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00D2BE] animate-pulse" />
              ACTIVO
            </span>
          </div>
        </footer>
      )}
    </div>
  );
};

export default App;
