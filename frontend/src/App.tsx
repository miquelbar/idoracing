import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { AIEngineerModal } from './components/AIEngineerModal';
import { CornerSelector } from './components/CornerSelector';
import { Header } from './components/Header';
import { ImportModal } from './components/ImportModal';
import { TelemetryCharts } from './components/TelemetryCharts';
import { TimingTower } from './components/TimingTower';
import { TrackMap } from './components/TrackMap';
import {
  fetchComparison,
  fetchHealth,
  fetchSessions,
  generateDemoSession,
} from './services/api';
import type {
  CoachReport,
  ComparisonResponse,
  CornerDTO,
  SessionSummary,
  SystemStatus,
} from './types/telemetry';

export const App: React.FC = () => {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [, setSessions] = useState<SessionSummary[]>([]);
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [hoverDistance, setHoverDistance] = useState<number | null>(null);
  const [selectedCorner, setSelectedCorner] = useState<CornerDTO | null>(null);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isCoachOpen, setIsCoachOpen] = useState(false);
  const [coachReport, setCoachReport] = useState<CoachReport | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load health
      const h = await fetchHealth();
      setStatus(h);

      // Load sessions
      const s = await fetchSessions();
      setSessions(s);

      // If no sessions exist, auto-generate demo
      if (s.length === 0) {
        await generateDemoSession();
        const updatedSessions = await fetchSessions();
        setSessions(updatedSessions);
      }

      // Load initial comparison
      const comp = await fetchComparison();
      setComparison(comp);
    } catch (err: any) {
      setError(err?.message || 'Error cargando datos de telemetría');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

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

  const handleCornerSelect = (corner: CornerDTO | null) => {
    setSelectedCorner(corner);
    if (corner) {
      setHoverDistance(corner.apex_distance);
    }
  };

  return (
    <div className="min-h-screen bg-[#08090C] text-[#E2E8F0] flex flex-col font-sans selection:bg-[#00D2BE] selection:text-black">
      {/* 2026 F1 Brand Navigation Header */}
      <Header
        status={status}
        onOpenImport={() => setIsImportOpen(true)}
        onLoadDemo={handleLoadDemo}
        onOpenCoach={() => setIsCoachOpen(true)}
        loadingDemo={loadingDemo}
      />

      {/* Main Studio Viewport */}
      <main className="flex-1 p-4 md:p-6 max-w-[1720px] mx-auto w-full">
        {/* Loading Spinner */}
        {loading && (
          <div className="py-24 text-center flex flex-col items-center justify-center space-y-4">
            <div className="w-14 h-14 border-4 border-[#00D2BE] border-t-transparent rounded-full animate-spin shadow-[0_0_25px_rgba(0,210,190,0.5)]" />
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white tracking-wide font-telemetry">
                INICIALIZANDO SIMCOACH F1 SUITE
              </h2>
              <p className="text-xs text-gray-400">
                Alineando vueltas por distancia métrica y calibrando micro-sectores...
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

        {/* Telemetry Dashboard */}
        {!loading && comparison && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* 1. Timing Tower with Micro Sectors & GAP */}
            <TimingTower comparison={comparison} />

            {/* 2. Dual Workspace: 2D Track Heatmap & 4-Row Telemetry Stack */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left Column: 2D Track Map */}
              <div className="lg:col-span-5 h-[480px]">
                <TrackMap
                  comparison={comparison}
                  hoverDistance={hoverDistance}
                  selectedCorner={selectedCorner}
                  onSelectCorner={handleCornerSelect}
                />
              </div>

              {/* Right Column: 4-Channel Synchronized Telemetry */}
              <div className="lg:col-span-7 h-[480px]">
                <TelemetryCharts
                  comparison={comparison}
                  hoverDistance={hoverDistance}
                  onHoverDistance={setHoverDistance}
                  selectedCorner={selectedCorner}
                  onResetZoom={() => setSelectedCorner(null)}
                />
              </div>
            </div>

            {/* 3. Corner-by-Corner Segment HUD Cards */}
            <CornerSelector
              corners={comparison.corners}
              selectedCorner={selectedCorner}
              onSelectCorner={handleCornerSelect}
            />
          </div>
        )}
      </main>

      {/* Footer Status Line */}
      <footer className="border-t border-[#1E2638] bg-[#0A0C12] px-6 py-2.5 text-xs text-gray-500 font-telemetry flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-4">
          <span>
            SIMCOACH v{status?.version || '2026.1'} • Formula 1 Telemetry Engine
          </span>
          <span className="hidden md:inline text-gray-700">|</span>
          <span className="hidden md:inline text-gray-400">
            Inferencia: {status?.ollama_available ? `Ollama (${status.ollama_model})` : 'Reglas Numéricas Deterministas'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-400">Circuit Ricardo Tormo (Valencia, 4005m)</span>
          <span className="text-emerald-400 font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            LIVE
          </span>
        </div>
      </footer>

      {/* Modals */}
      {comparison && (
        <AIEngineerModal
          isOpen={isCoachOpen}
          onClose={() => setIsCoachOpen(false)}
          refLapId={comparison.ref_lap_id}
          compLapId={comparison.comp_lap_id}
          report={coachReport}
          onReportGenerated={(rep) => setCoachReport(rep)}
        />
      )}

      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onSessionLoaded={loadInitialData}
      />
    </div>
  );
};

export default App;
