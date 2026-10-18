import React, { useState } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle,
  FileText,
  Lightbulb,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  User,
} from 'lucide-react';
import { CornerSelector } from '../components/CornerSelector';
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
        'Canal de radio abierto. He procesado la telemetría de tus vueltas. ¿Qué duda técnica o curva quieres revisar?',
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
      setReportError(err?.message || 'Error calculando debrief con IA');
    } finally {
      setLoadingReport(false);
    }
  };

  const handleSendChat = async (questionText?: string) => {
    const textToSend = questionText || inputMessage.trim();
    if (!textToSend || chatLoading) return;

    const newMsgs: ChatMessage[] = [...chatMessages, { role: 'user', content: textToSend }];
    setChatMessages(newMsgs);
    if (!questionText) setInputMessage('');

    try {
      setChatLoading(true);
      const reply = await sendChatMessage(newMsgs, comparison.ref_lap_id, comparison.comp_lap_id);
      setChatMessages((prev) => [...prev, { role: 'assistant', content: reply.content }]);
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Error de comunicación por radio: ' + (err?.message || 'Fallo de conexión'),
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Find key trail braking corners in current comparison
  const trailCorners = comparison.corners.filter((c) =>
    [1, 2, 4, 8, 11, 14].includes(c.corner_number)
  );

  return (
    <div className="space-y-4">
      {/* 1. Timing Tower */}
      <TimingTower comparison={comparison} />

      {/* 2. Dual Workspace: 2D Closed Track Map & 4-Row Telemetry Stack */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: 2D Track Map (5 cols) */}
        <div className="lg:col-span-5 h-[490px]">
          <TrackMap
            comparison={comparison}
            hoverDistance={hoverDistance}
            selectedCorner={selectedCorner}
            onSelectCorner={onSelectCorner}
          />
        </div>

        {/* Right Column: 4-Channel Synchronized Telemetry (7 cols) */}
        <div className="lg:col-span-7 h-[490px]">
          <TelemetryCharts
            comparison={comparison}
            hoverDistance={hoverDistance}
            onHoverDistance={onHoverDistance}
            selectedCorner={selectedCorner}
            onResetZoom={() => onSelectCorner(null)}
          />
        </div>
      </div>

      {/* 3. Corner-by-Corner Segment HUD Cards */}
      <CornerSelector
        corners={comparison.corners}
        selectedCorner={selectedCorner}
        onSelectCorner={onSelectCorner}
      />

      {/* 4. Integrated AI Debrief & Trail Braking Suite */}
      <div className="glass-panel rounded-xl p-5 border border-white/10 space-y-5">
        {/* Debrief Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#00D2BE]/20 border border-[#00D2BE]/40 flex items-center justify-center text-[#00D2BE]">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2">
                Debrief Integrado & Análisis de Trail Braking
              </h3>
              <p className="text-xs text-gray-400 font-telemetry">
                Ingeniero de Competición • Modelo:{' '}
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

        {/* Loading State */}
        {loadingReport && (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <div className="w-10 h-10 border-3 border-[#00D2BE] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-gray-300 font-telemetry">
              El ingeniero de pista está calculando deltas de acelerador, presión regresiva de freno y técnica de trail braking...
            </p>
          </div>
        )}

        {/* Call-to-action if no report generated yet */}
        {!report && !loadingReport && (
          <div className="p-6 rounded-xl bg-[#0B0E16] border border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">¿Quieres conocer dónde ganas o pierdes tiempo?</h4>
              <p className="text-xs text-gray-400 max-w-2xl leading-relaxed">
                Pulsa en <strong>Analizar Telemetría con IA</strong> para generar un debrief estructurado en 5 partes, análisis de modulación de freno hacia el ápice (trail braking) y ejercicios específicos para tu siguiente tanda.
              </p>
            </div>
            <button
              onClick={() => handleGenerateDebrief(false)}
              className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-xs font-bold rounded-lg cursor-pointer transition shrink-0"
            >
              Cargar Análisis Inicial
            </button>
          </div>
        )}

        {/* Full Integrated Debrief Content */}
        {report && !loadingReport && (
          <div className="space-y-5 animate-in fade-in duration-300">
            {/* Trail Braking Technical Guide Matrix */}
            <div className="p-4 rounded-xl bg-[#0D111A] border border-[#00D2BE]/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#00D2BE] uppercase tracking-wider flex items-center gap-1.5 font-telemetry">
                  <Target className="w-4 h-4" />
                  Técnica de Trail Braking (Modulación de Pedal en Apoyo)
                </span>
                <span className="text-[10px] font-telemetry px-2 py-0.5 rounded bg-[#00D2BE]/10 text-[#00D2BE] border border-[#00D2BE]/30">
                  GT3 / LMGT3 Dynamic
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Where to Trail Brake */}
                <div className="p-3.5 rounded-lg bg-[#0A0D14] border border-emerald-500/20 space-y-1.5">
                  <div className="flex items-center gap-2 text-[#00FF7F] font-bold">
                    <span className="w-2 h-2 rounded-full bg-[#00FF7F]" />
                    <span>Dónde SÍ aplicar Trail Braking:</span>
                  </div>
                  <p className="text-gray-300 text-[11px] leading-relaxed">
                    <strong>Curvas lentas y medias cerradas</strong> (T1 Aspar, T2 Doohan, T8 Bernat Martínez, T14 Adrián Campos).
                  </p>
                  <p className="text-gray-400 text-[11px] leading-relaxed">
                    <strong>Técnica:</strong> Frena al 100% en recta. Al iniciar el giro de volante, desvanece suavemente la presión del 100% al 15-20% manteniéndola hasta el vértice. Esto mantiene la masa sobre el eje delantero, dando rotación al morro y evitando subviraje en entrada.
                  </p>
                </div>

                {/* Where NOT to Trail Brake */}
                <div className="p-3.5 rounded-lg bg-[#0A0D14] border border-amber-500/20 space-y-1.5">
                  <div className="flex items-center gap-2 text-[#FFD700] font-bold">
                    <span className="w-2 h-2 rounded-full bg-[#FFD700]" />
                    <span>Dónde NO abusar del Trail Braking:</span>
                  </div>
                  <p className="text-gray-300 text-[11px] leading-relaxed">
                    <strong>Curvas rápidas en apoyo aerodinámico</strong> (T3, T7, T12).
                  </p>
                  <p className="text-gray-400 text-[11px] leading-relaxed">
                    <strong>Técnica:</strong> Suelta el pedal de freno en línea recta antes de meter volante o da un toque breve y desahogado. En virajes veloces, el alerón y difusor generan el agarre; mantener freno residual en apoyo desestabiliza la zaga.
                  </p>
                </div>
              </div>

              {/* Trail Braking Corner Badges */}
              <div className="mt-2 pt-2 border-t border-white/5">
                <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-2 font-telemetry">
                  Evaluación de tus virajes críticos de frenada:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 font-telemetry">
                  {trailCorners.map((tc) => (
                    <div
                      key={`tb-c-${tc.corner_number}`}
                      onClick={() => onSelectCorner(tc)}
                      className="p-2 rounded bg-[#131824] border border-white/5 hover:border-[#00D2BE]/40 cursor-pointer transition text-xs"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-white">T{tc.corner_number}</span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                            tc.trail_braking_eval?.includes('Efectivo') || tc.trail_braking_eval?.includes('Óptimo')
                              ? 'bg-[#00FF7F]/15 text-[#00FF7F]'
                              : tc.trail_braking_eval?.includes('Prematuro')
                              ? 'bg-[#FFD700]/15 text-[#FFD700]'
                              : 'bg-[#FF453A]/15 text-[#FF453A]'
                          }`}
                        >
                          {tc.trail_braking_eval?.replace('Trail Braking ', '') || 'Evaluada'}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400 block truncate">{tc.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Debrief 5 Sections Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Section 1: Facts */}
              <div className="p-4 rounded-xl bg-[#0D1017] border border-white/5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
                  <CheckCircle className="w-4 h-4 text-[#00D2BE]" />
                  <span>1. Hechos Observados en Telemetría</span>
                </div>
                <div className="space-y-1.5 text-xs text-gray-300 leading-relaxed font-telemetry">
                  {(report.facts || []).map((fact, idx) => (
                    <div key={`fact-${idx}`} className="flex items-start gap-2">
                      <span className="text-[#00D2BE] font-bold">•</span>
                      <span>{fact}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 2: Metrics */}
              <div className="p-4 rounded-xl bg-[#0D1017] border border-white/5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#00D2BE] uppercase tracking-wider">
                  <Target className="w-4 h-4" />
                  <span>2. Métricas de Apoyo</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-telemetry text-xs">
                  {Object.entries(report.metrics || {}).map(([k, v]) => (
                    <div key={k} className="p-2.5 rounded-lg bg-[#131722] border border-white/5">
                      <span className="text-[10px] text-gray-400 block mb-0.5">{formatMetricKey(k)}</span>
                      <span className="text-white font-bold text-xs block leading-snug">{formatMetricValue(v)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 3: Technical Hypothesis */}
              <div className="p-4 rounded-xl bg-[#0D1017] border border-white/5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#B138FE] uppercase tracking-wider">
                  <Lightbulb className="w-4 h-4" />
                  <span>3. Hipótesis Técnica de Conducción</span>
                </div>
                <div className="space-y-1.5 text-xs text-gray-300 leading-relaxed">
                  {(report.hypotheses || []).map((hypo, idx) => (
                    <p key={`hypo-${idx}`} className="flex items-start gap-2">
                      <span className="text-[#B138FE] font-bold">•</span>
                      <span>{hypo}</span>
                    </p>
                  ))}
                </div>
              </div>

              {/* Section 4: Practical Exercises */}
              <div className="p-4 rounded-xl bg-[#0D1017] border border-white/5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#00FF7F] uppercase tracking-wider">
                  <Sparkles className="w-4 h-4" />
                  <span>4. Ejercicios para la Siguiente Tanda</span>
                </div>
                <div className="space-y-1.5 text-xs text-gray-300 leading-relaxed">
                  {(report.exercises || []).map((ex, idx) => (
                    <div key={`ex-${idx}`} className="p-2.5 rounded-lg bg-[#00FF7F]/5 border border-[#00FF7F]/20 text-[#E2E8F0]">
                      <strong>Paso {idx + 1}:</strong> {ex}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Section 5: Verification Indicator Banner */}
            <div className="p-3.5 rounded-xl bg-[#121622] border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-telemetry">
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-[#00D2BE]" />
                <span className="text-gray-400">5. Criterio de Verificación:</span>
                <strong className="text-white">{report.verification_indicator}</strong>
              </div>
              <span className="px-2.5 py-1 rounded bg-[#00D2BE]/10 border border-[#00D2BE]/30 text-[#00D2BE] text-[11px] font-bold">
                Confianza: {report.confidence || 'Alta (Telemetría + IA)'}
              </span>
            </div>

            {/* Quick Radio Chat Bar */}
            <div className="p-4 rounded-xl bg-[#090C12] border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 font-telemetry">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Canal de Radio con Ingeniero ({activeModel})
                </span>
                <span className="text-[10px] text-gray-400 font-telemetry">Preguntas directas sobre tus vueltas</span>
              </div>

              {/* Quick Prompt Chips */}
              <div className="flex flex-wrap gap-2 text-[11px]">
                {[
                  '¿Cómo mejoro el trail braking en la T1?',
                  '¿Por qué pierdo tiempo en la horquilla T8?',
                  '¿Dónde debería acelerar antes?',
                ].map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleSendChat(chip)}
                    disabled={chatLoading}
                    className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 text-gray-300 border border-white/5 transition cursor-pointer text-xs"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Radio Messages */}
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {chatMessages.map((msg, i) => (
                  <div
                    key={`chat-${i}`}
                    className={`p-2.5 rounded-lg text-xs leading-relaxed ${
                      msg.role === 'assistant'
                        ? 'bg-[#121622] text-gray-200 border border-white/5'
                        : 'bg-[#00D2BE]/10 text-white border border-[#00D2BE]/30 ml-6'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold text-gray-400">
                      {msg.role === 'assistant' ? (
                        <>
                          <Bot className="w-3 h-3 text-[#00D2BE]" />
                          <span>Ingeniero de Pista</span>
                        </>
                      ) : (
                        <>
                          <User className="w-3 h-3 text-[#B138FE]" />
                          <span>Piloto</span>
                        </>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ))}
              </div>

              {/* Input row */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                  placeholder="Pregunta a tu ingeniero sobre cualquier curva, freno o trazada..."
                  disabled={chatLoading}
                  className="flex-1 bg-[#141824] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#00D2BE]"
                />
                <button
                  onClick={() => handleSendChat()}
                  disabled={chatLoading || !inputMessage.trim()}
                  className="px-3.5 py-2 rounded-lg bg-[#00D2BE] hover:bg-[#00E5CF] text-black text-xs font-bold transition cursor-pointer disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
