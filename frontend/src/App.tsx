import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { ActiveSessionBanner } from './components/ActiveSessionBanner';
import { Header, type NavTab } from './components/Header';
import { SessionSwitcherModal } from './components/SessionSwitcherModal';
import {
  autodiscoverSims,
  fetchComparison,
  fetchHealth,
  fetchSessions,
  generateDemoSession,
  importLocalFile,
} from './services/api';
import type {
  AutoDiscoverData,
  CoachReport,
  ComparisonResponse,
  CornerDTO,
  SessionSummary,
  SystemStatus,
} from './types/telemetry';
import { EngineerView } from './views/EngineerView';
import { FilesView } from './views/FilesView';
import { SessionsView } from './views/SessionsView';
import { SettingsView } from './views/SettingsView';
import { TelemetryView } from './views/TelemetryView';

function getTabFromHash(): NavTab {
  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
  if (['sessions', 'telemetry', 'engineer', 'files', 'settings'].includes(hash)) {
    return hash as NavTab;
  }
  return 'telemetry';
}

function detectGameName(sess?: SessionSummary | null, comp?: ComparisonResponse | null): string {
  if (comp?.game_name) return comp.game_name;
  if (!sess) return 'Assetto Corsa Competizione';
  const id = (sess.session_id || '').toLowerCase();
  const car = (sess.car || '').toLowerCase();
  if (id.startsWith('lmu') || car.includes('lmgt3') || car.includes('hypercar') || car.includes('lmp2')) {
    return 'Le Mans Ultimate';
  }
  if (id.includes('iracing')) {
    return 'iRacing';
  }
  return 'Assetto Corsa Competizione';
}

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>(getTabFromHash);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [refLapNumber, setRefLapNumber] = useState<number>(1);
  const [compLapNumber, setCompLapNumber] = useState<number>(2);

  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [hoverDistance, setHoverDistance] = useState<number | null>(null);
  const [selectedCorner, setSelectedCorner] = useState<CornerDTO | null>(null);

  const [coachReport, setCoachReport] = useState<CoachReport | null>(null);
  const [autoData, setAutoData] = useState<AutoDiscoverData | null>(null);

  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      // Determine default lap numbers to compare
      let p1 = 1;
      let p2 = 2;
      if (activeSession && activeSession.laps && activeSession.laps.length >= 2) {
        const valid = [...activeSession.laps]
          .filter((l) => l.lap_time > 0 && l.is_valid)
          .sort((a, b) => a.lap_time - b.lap_time);
        if (valid.length >= 2) {
          p1 = valid[0].lap_number;
          p2 = valid[1].lap_number;
        } else {
          p1 = activeSession.laps[0].lap_number;
          p2 = activeSession.laps[1].lap_number;
        }
      }
      setRefLapNumber(p1);
      setCompLapNumber(p2);

      // 4. Fetch telemetry comparison
      const comp = await fetchComparison(
        String(p1),
        String(p2),
        activeSessionId || undefined
      );
      setComparison(comp);
    } catch (err: any) {
      setError(err?.message || 'Error inicializando el sistema de telemetría');
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
      const sess = sessions.find((s) => s.session_id === sessionId);

      let p1 = 1;
      let p2 = 2;
      if (sess && sess.laps && sess.laps.length >= 2) {
        const valid = [...sess.laps]
          .filter((l) => l.lap_time > 0 && l.is_valid)
          .sort((a, b) => a.lap_time - b.lap_time);
        if (valid.length >= 2) {
          p1 = valid[0].lap_number;
          p2 = valid[1].lap_number;
        } else {
          p1 = sess.laps[0].lap_number;
          p2 = sess.laps[1].lap_number;
        }
      }
      setRefLapNumber(p1);
      setCompLapNumber(p2);

      const comp = await fetchComparison(String(p1), String(p2), sessionId);
      setComparison(comp);
      setSelectedCorner(null);
      setCoachReport(null);
    } catch (err: any) {
      setError(err?.message || 'Error cambiando de sesión');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRefLap = async (lapNumber: number) => {
    if (lapNumber === refLapNumber) return;
    try {
      setRefLapNumber(lapNumber);
      const comp = await fetchComparison(
        String(lapNumber),
        String(compLapNumber),
        selectedSessionId || undefined
      );
      setComparison(comp);
      setSelectedCorner(null);
    } catch (err: any) {
      setError(err?.message || 'Error seleccionando vuelta de referencia');
    }
  };

  const handleSelectCompLap = async (lapNumber: number) => {
    if (lapNumber === compLapNumber) return;
    try {
      setCompLapNumber(lapNumber);
      const comp = await fetchComparison(
        String(refLapNumber),
        String(lapNumber),
        selectedSessionId || undefined
      );
      setComparison(comp);
      setSelectedCorner(null);
    } catch (err: any) {
      setError(err?.message || 'Error seleccionando vuelta comparada');
    }
  };

  const handleLoadDemo = async () => {
    try {
      setLoadingDemo(true);
      await generateDemoSession();
      await loadInitialData();
    } catch (err: any) {
      setError(err?.message || 'Error cargando sesión demo');
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
    } catch (err: any) {
      setError(err?.message || 'Error importando archivo local');
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
  const activeGame = detectGameName(currentSession, comparison);
  const activeTrack = comparison?.track_name || currentSession?.track || 'Ricardo Tormo de Valencia';
  const activeCar = comparison?.car_name || currentSession?.car || 'Porsche 911 GT3 R (992)';

  return (
    <div className="min-h-screen bg-[#08090C] text-[#E2E8F0] flex flex-col font-sans selection:bg-[#00D2BE] selection:text-black">
      {/* 1. Header with Brand, Section Tabs & AI Status */}
      <Header
        currentTab={currentTab}
        onSelectTab={handleNavigateTab}
        status={status}
      />

      {/* 2. Prominent Active Session Banner (Outside Top Bar) */}
      <ActiveSessionBanner
        trackName={activeTrack}
        carName={activeCar}
        gameName={activeGame}
        lapCount={currentSession?.lap_count}
        bestLapTime={currentSession?.best_lap_time}
        refLapNumber={refLapNumber}
        compLapNumber={compLapNumber}
        onOpenSwitcher={() => setIsSwitcherOpen(true)}
      />

      {/* 3. Global Session Switcher Modal (Available across all screens) */}
      <SessionSwitcherModal
        isOpen={isSwitcherOpen}
        onClose={() => setIsSwitcherOpen(false)}
        sessions={sessions}
        selectedSessionId={selectedSessionId}
        onSelectSession={handleSelectSession}
        autoData={autoData}
        onImportLocal={handleImportLocal}
        onLoadDemo={handleLoadDemo}
        loading={loadingDemo}
      />

      {/* Main Viewport */}
      <main className="flex-1 p-4 md:p-6 max-w-[1720px] mx-auto w-full">
        {/* Loading Spinner */}
        {loading && (
          <div className="py-24 text-center flex flex-col items-center justify-center space-y-4">
            <div className="w-12 h-12 border-4 border-[#00D2BE] border-t-transparent rounded-full animate-spin shadow-[0_0_25px_rgba(0,210,190,0.4)]" />
            <div className="space-y-1">
              <h2 className="text-base font-bold text-white tracking-wide font-telemetry">
                SINCRONIZANDO TELEMETRÍA SIMCOACH
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
                activeModel={status?.active_model || 'qwen3.8:27b-32k'}
              />
            )}

            {currentTab === 'sessions' && (
              <SessionsView
                sessions={sessions}
                selectedSessionId={selectedSessionId}
                onSelectSession={handleSelectSession}
                refLapNumber={refLapNumber}
                compLapNumber={compLapNumber}
                onSelectRefLap={handleSelectRefLap}
                onSelectCompLap={handleSelectCompLap}
                onGoToTelemetry={() => handleNavigateTab('telemetry')}
                onLoadDemo={handleLoadDemo}
                autoData={autoData}
                onImportLocal={handleImportLocal}
                loading={loadingDemo}
              />
            )}

            {currentTab === 'engineer' && (
              <EngineerView
                comparison={comparison}
                report={coachReport}
                onReportGenerated={setCoachReport}
                activeModel={status?.active_model || 'qwen3.8:27b-32k'}
              />
            )}

            {currentTab === 'files' && (
              <FilesView
                autoData={autoData}
                onRefreshAutoData={handleRefreshAutoData}
                onSessionImported={loadInitialData}
                onLoadDemo={handleLoadDemo}
                loading={loading}
                activeTrackName={activeTrack}
                activeCarName={activeCar}
                activeGameName={activeGame}
                onOpenSwitcher={() => setIsSwitcherOpen(true)}
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

      {/* Clean Status Footer */}
      <footer className="border-t border-[#1E2638] bg-[#0A0C12] px-6 py-2.5 text-xs text-gray-500 font-telemetry flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-4">
          <span>
            SIMCOACH v{status?.version || '2026.2'} • {activeGame}
          </span>
          <span className="hidden md:inline text-gray-700">|</span>
          <span className="hidden md:inline text-gray-400">
            Motor IA: {status?.active_model || 'qwen3.8:27b-32k'} ({status?.provider || 'ollama'})
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
    </div>
  );
};

export default App;
