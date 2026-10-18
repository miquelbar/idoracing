import React, { useState } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle,
  FileText,
  Lightbulb,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  User,
} from 'lucide-react';
import { CornerInspector } from '../components/CornerInspector';
import { TelemetryCharts } from '../components/TelemetryCharts';
import { TimingTower } from '../components/TimingTower';
import { TrackMap } from '../components/TrackMap';
import { fetchCoachReport, sendChatMessage } from '../services/api';
import type {
  ChatMessage,
  CoachReport,
  ComparisonResponse,
  CornerDTO,
} from '../types/telemetry';

interface TelemetryViewProps {
  comparison: ComparisonResponse;
  hoverDistance: number | null;
  onHoverDistance: (d: number | null) => void;
  selectedCorner: CornerDTO | null;
  onSelectCorner: (c: CornerDTO | null) => void;
  report: CoachReport | null;
  onReportGenerated: (r: CoachReport) => void;
  activeModel: string;
}

function formatMetricKey(key: string): string {
  const map: Record<string, string> = {
    time_difference: 'Diferencia Total',
    diferencia_vuelta: 'Diferencia Total',
    sector_differences: 'Diferencia por Sectores',
    diferencia_sectores: 'Diferencia por Sectores',
    corners_evaluated: 'Curvas Evaluadas',
    curvas_analizadas: 'Curvas Evaluadas',
    eficiencia_trail_braking: 'Eficiencia Trail Braking',
    primary_loss_corner: 'Punto Crítico',
  };
  return map[key] || key.replace(/_/g, ' ').toUpperCase();
}

function formatMetricValue(val: any): string {
  if (val === null || val === undefined) return '--';
  if (typeof val === 'number') {
    return val > 0 ? `+${val.toFixed(3)}s` : `${val.toFixed(3)}s`;
  }
  if (typeof val === 'object') {
    if (Array.isArray(val)) return val.join(', ');
    return Object.entries(val)
      .map(([k, v]) => {
        const secLabel = k.replace(/sector_?(\d+)/i, 'S$1').toUpperCase();
        const num = Number(v);
        const numStr = !isNaN(num) ? (num > 0 ? `+${num.toFixed(3)}s` : `${num.toFixed(3)}s`) : String(v);
        return `${secLabel}: ${numStr}`;
      })
      .join(' | ');
  }
  return String(val);
}

export const TelemetryView: React.FC<TelemetryViewProps> = ({
  comparison,
  hoverDistance,
  onHoverDistance,
  selectedCorner,
  onSelectCorner,
  report,
  onReportGenerated,
  activeModel,
}) => {
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Inline Radio Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Canal de radio abierto. He procesado la telemetría de tus vueltas. Selecciona cualquier curva para ver la trazada y el análisis técnico o pregúntame directamente.',
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const handleGenerateDebrief = async (forceRefresh = false) => {
    try {
      setLoadingReport(true);
      setReportError(null);
      const rep = await fetchCoachReport(
        comparison.ref_lap_id,
        comparison.comp_lap_id,
        forceRefresh
      );
      onReportGenerated(rep);
    } catch (err: any) {
      setReportError(err?.message || 'Error al generar el informe con el modelo local');
    } finally {
      setLoadingReport(false);
    }
  };

  const handleSendChatMessage = async (msgText?: string) => {
    const textToSend = (msgText || inputMessage).trim();
    if (!textToSend || chatLoading) return;

    const newMsgs: ChatMessage[] = [...chatMessages, { role: 'user', content: textToSend }];
    setChatMessages(newMsgs);
    if (!msgText) setInputMessage('');
    setChatLoading(true);

    try {
      const res = await sendChatMessage(newMsgs, comparison.ref_lap_id, comparison.comp_lap_id);
      setChatMessages((prev) => [...prev, { role: 'assistant', content: res.content }]);
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Error de comunicación en radio. Comprueba que el servidor local esté activo.',
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleAskAboutCorner = (corner: CornerDTO) => {
    const question = `¿Cómo puedo optimizar la Curva ${corner.corner_number} (${corner.name})? He cedido ${corner.delta_time > 0 ? '+' : ''}${corner.delta_time.toFixed(3)}s. La telemetría detecta: ${corner.balance_eval} y ${corner.gear_eval}.`;
    handleSendChatMessage(question);
  };

  return (
    <div className="space-y-5">
      {/* 1. Timing Tower */}
      <TimingTower comparison={comparison} />

      {/* 2. Top Section: Large Track Map & Trazada Explorer */}
      <div className="h-[440px] w-full">
        <TrackMap
          comparison={comparison}
          hoverDistance={hoverDistance}
          selectedCorner={selectedCorner}
          onSelectCorner={onSelectCorner}
        />
      </div>

      {/* 3. Bottom 50/50 Split: Synchronized Telemetry Charts (Left) & Corner/Trazada Inspector (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left Column (6 cols): Canales de Telemetría Sincronizados */}
        <div className="lg:col-span-6 flex flex-col h-full min-h-[520px]">
          <TelemetryCharts
            comparison={comparison}
            hoverDistance={hoverDistance}
            onHoverDistance={onHoverDistance}
            selectedCorner={selectedCorner}
            onResetZoom={() => onSelectCorner(null)}
          />
        </div>

        {/* Right Column (6 cols): Inspector de Curva, Trazada Real vs Óptima SVG, y Diagnóstico IA */}
        <div className="lg:col-span-6 flex flex-col h-full min-h-[520px]">
          <CornerInspector
            corners={comparison.corners}
            selectedCorner={selectedCorner}
            onSelectCorner={onSelectCorner}
            onAskEngineerAboutCorner={handleAskAboutCorner}
          />
        </div>
      </div>

      {/* 4. Integrated Deep AI Debrief & Live Engineer Radio Console */}
      <div className="glass-panel rounded-xl p-5 border border-white/10 space-y-5">
        {/* Debrief Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#00D2BE]/20 border border-[#00D2BE]/40 flex items-center justify-center text-[#00D2BE]">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2">
                Debrief Integral de Competición & Radio de Equipo
              </h3>
              <p className="text-xs text-gray-400 font-telemetry">
                Ingeniero de Competición • Modelo Activo:{' '}
                <strong className="text-[#00D2BE]">{activeModel}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={() => handleGenerateDebrief(true)}
            disabled={loadingReport}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00D2BE] hover:bg-[#00E5CF] text-black text-xs font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-50 shadow-md self-start sm:self-auto"
          >
            {loadingReport ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Analizando Telemetría...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>{report ? 'Actualizar Debrief' : 'Analizar Telemetría con IA'}</span>
              </>
            )}
          </button>
        </div>

        {/* Error message */}
        {reportError && (
          <div className="p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{reportError}</span>
          </div>
        )}

        {/* Report Content Grid */}
        {report ? (
          <div className="space-y-5">
            {/* 1. Numerical Metrics Overview */}
            {report.metrics && Object.keys(report.metrics).length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(report.metrics).map(([k, v]) => (
                  <div
                    key={k}
                    className="p-3 rounded-lg bg-[#0E121B] border border-white/5 font-telemetry"
                  >
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">
                      {formatMetricKey(k)}
                    </span>
                    <span className="text-sm font-bold text-white block truncate">
                      {formatMetricValue(v)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* 2. Structured Analysis Columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Facts (Left) */}
              <div className="p-4 rounded-xl bg-[#090D15] border border-white/5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
                  <CheckCircle className="w-4 h-4 text-[#00D2BE]" />
                  <span>1. Hechos Observados en Datos</span>
                </div>
                <ul className="space-y-2 text-xs text-gray-300">
                  {report.facts && report.facts.length > 0 ? (
                    report.facts.map((fact, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-[#00D2BE] mt-0.5">•</span>
                        <span>{fact}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-gray-500">Sin hechos críticos registrados.</li>
                  )}
                </ul>
              </div>

              {/* Hypotheses & Technique (Right) */}
              <div className="p-4 rounded-xl bg-[#090D15] border border-white/5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
                  <Lightbulb className="w-4 h-4 text-amber-400" />
                  <span>2. Diagnóstico Técnico de Conducción</span>
                </div>
                <ul className="space-y-2 text-xs text-gray-300">
                  {report.hypotheses && report.hypotheses.length > 0 ? (
                    report.hypotheses.map((hyp, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-amber-400 mt-0.5">•</span>
                        <span>{hyp}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-gray-500">Técnica consistente sin desviaciones mayores.</li>
                  )}
                </ul>
              </div>
            </div>

            {/* 3. Actionable Exercises & Verification */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Exercises */}
              <div className="p-4 rounded-xl bg-[#090D15] border border-white/5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
                  <Target className="w-4 h-4 text-[#FF1801]" />
                  <span>3. Plan de Ejercicios para la Siguiente Tanda</span>
                </div>
                <ul className="space-y-2 text-xs text-gray-300">
                  {report.exercises && report.exercises.length > 0 ? (
                    report.exercises.map((ex, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-[#FF1801] mt-0.5 font-bold">{idx + 1}.</span>
                        <span>{ex}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-gray-500">Mantener el ritmo actual.</li>
                  )}
                </ul>
              </div>

              {/* Verification Indicator & Raw Report */}
              <div className="p-4 rounded-xl bg-[#090D15] border border-white/5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
                  <FileText className="w-4 h-4 text-[#B138FE]" />
                  <span>4. Indicador Objetivo de Mejora</span>
                </div>
                <div className="p-3 rounded-lg bg-black/40 border border-white/5 font-telemetry text-xs text-purple-200">
                  {report.verification_indicator ||
                    'Comprobar aumento de velocidad mínima en vértice (+5 km/h) sin penalizar tracción.'}
                </div>
              </div>
            </div>
          </div>
        ) : (
          !loadingReport && (
            <div className="p-6 rounded-xl bg-[#090D15] border border-white/5 text-center space-y-3">
              <Sparkles className="w-8 h-8 text-[#00D2BE] mx-auto opacity-70" />
              <h4 className="text-sm font-bold text-white">¿Quieres un debrief integral con IA?</h4>
              <p className="text-xs text-gray-400 max-w-lg mx-auto">
                Pulsa en <strong>Analizar Telemetría con IA</strong> para sintetizar pérdidas por sector,
                modulación de trail braking en las 14 curvas y ejercicios concretos para tu próxima tanda.
              </p>
              <button
                onClick={() => handleGenerateDebrief(false)}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition cursor-pointer"
              >
                Cargar Análisis Inicial
              </button>
            </div>
          )
        )}

        {/* 5. Integrated Live Team Radio Console */}
        <div className="mt-5 pt-5 border-t border-white/10">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-[#00D2BE]" />
              Canal de Radio • Preguntas Directas al Ingeniero IA
            </h4>
            <span className="text-[10px] text-gray-400 font-telemetry">
              Respuestas calibradas sobre tus datos de vuelta
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#07090E] border border-white/5 space-y-3 max-h-[220px] overflow-y-auto mb-3">
            {chatMessages.map((m, idx) => (
              <div
                key={idx}
                className={`flex gap-2.5 text-xs ${
                  m.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {m.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-md bg-[#00D2BE]/20 border border-[#00D2BE]/40 flex items-center justify-center text-[#00D2BE] shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}
                <div
                  className={`p-2.5 rounded-lg max-w-[85%] leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-[#B138FE]/20 border border-[#B138FE]/40 text-purple-100'
                      : 'bg-[#0E131F] border border-white/5 text-gray-300'
                  }`}
                >
                  {m.content}
                </div>
                {m.role === 'user' && (
                  <div className="w-6 h-6 rounded-md bg-[#B138FE]/20 border border-[#B138FE]/40 flex items-center justify-center text-[#B138FE] shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="flex gap-2 text-xs text-gray-400 items-center">
                <RefreshCw className="w-3 h-3 animate-spin text-[#00D2BE]" />
                <span>El ingeniero está consultando los canales de telemetría...</span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendChatMessage()}
              placeholder="Ej: ¿Dónde pierdo más tiempo entre T1 y T4? ¿Cómo mejoro la frenada en T11?"
              className="flex-1 bg-[#090D15] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#00D2BE] font-telemetry"
            />
            <button
              onClick={() => handleSendChatMessage()}
              disabled={chatLoading || !inputMessage.trim()}
              className="px-4 py-2 rounded-lg bg-[#00D2BE] hover:bg-[#00E5CF] text-black font-bold text-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Transmitir</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
