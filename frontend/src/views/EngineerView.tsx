import React, { useState } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle,
  Cpu,
  FileText,
  Lightbulb,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  User,
} from 'lucide-react';
import { fetchCoachReport, sendChatMessage } from '../services/api';
import { useLanguage } from '../i18n';
import { useWaitingChatter } from '../i18n/waitingChatter';
import type { ChatMessage, CoachReport, ComparisonResponse } from '../types/telemetry';
import { formatMetricKey, formatMetricValue, errorMessage } from '../utils/formatters';

interface EngineerViewProps {
  comparison: ComparisonResponse | null;
  report: CoachReport | null;
  onReportGenerated: (r: CoachReport) => void;
  activeModel: string;
}

export const EngineerView: React.FC<EngineerViewProps> = ({
  comparison,
  report,
  onReportGenerated,
  activeModel,
}) => {
  const { lang, t } = useLanguage();
  const [loadingReport, setLoadingReport] = useState(false);
  const [errorReport, setErrorReport] = useState<string | null>(null);

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: t('engineer_radio_intro'),
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const waitingChatter = useWaitingChatter(chatLoading, lang);

  const handleGenerateReport = async (forceRefresh = false) => {
    if (!comparison) return;
    try {
      setLoadingReport(true);
      setErrorReport(null);
      const rep = await fetchCoachReport(comparison.ref_lap_id, comparison.comp_lap_id, forceRefresh, comparison.session_id);
      onReportGenerated(rep);
    } catch (err) {
      setErrorReport(errorMessage(err, t('debrief_error')));
    } finally {
      setLoadingReport(false);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputMessage.trim();
    if (!text || chatLoading) return;

    const newMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: text }];
    setChatMessages(newMessages);
    setInputMessage('');
    setChatLoading(true);

    try {
      const res = await sendChatMessage(
        newMessages,
        comparison?.ref_lap_id,
        comparison?.comp_lap_id,
        comparison?.track_name,
        comparison?.car_name,
        undefined,
        lang
      );
      setChatMessages([...newMessages, { role: 'assistant', content: res.content }]);
    } catch {
      setChatMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: t('radio_error_engineer'),
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Official Structured Debrief (7 cols) */}
      <div className="lg:col-span-7 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-comp" />
            <h3 className="text-base font-bold text-white uppercase tracking-wider">
              Informe Técnico del Ingeniero
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-telemetry px-2.5 py-1 rounded-full bg-night-8 text-brand border border-[#242D40]">
              {activeModel}
            </span>
            <button
              onClick={() => handleGenerateReport(true)}
              disabled={loadingReport || !comparison}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18202F] hover:bg-[#202B3F] border border-[#2D3A52] text-xs text-gray-300 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-brand ${loadingReport ? 'animate-spin' : ''}`} />
              <span>{report ? 'Regenerar' : 'Generar Informe'}</span>
            </button>
          </div>
        </div>

        {errorReport && (
          <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorReport}</span>
          </div>
        )}

        {/* Loading Spinner */}
        {loadingReport && (
          <div className="py-20 text-center flex flex-col items-center justify-center space-y-3 glass-panel rounded-xl">
            <div className="w-10 h-10 border-3 border-brand border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-gray-300 font-telemetry">
              Procesando telemetría e inferencia con {activeModel}...
            </p>
          </div>
        )}

        {/* Empty State */}
        {!report && !loadingReport && (
          <div className="p-8 text-center glass-panel rounded-xl flex flex-col items-center justify-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-comp/10 border border-comp/30 flex items-center justify-center text-comp">
              <Sparkles className="w-7 h-7" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Análisis de Telemetría Listo</h4>
              <p className="text-xs text-gray-400 max-w-md mx-auto mt-1">
                Haz clic en el botón para que el ingeniero de pista analice tus ápices, pérdidas por sector y
                proponga un plan de mejora para la siguiente vuelta.
              </p>
            </div>
            <button
              onClick={() => handleGenerateReport(false)}
              className="px-5 py-2.5 rounded-lg bg-brand hover:bg-brand-light text-black text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-md"
            >
              Generar Debrief Ahora
            </button>
          </div>
        )}

        {/* Rendered Report */}
        {report && !loadingReport && (
          <div className="space-y-4">
            {/* Executive Summary */}
            <div className="p-4 rounded-xl bg-[#131926] border border-[#2D3A52] text-xs text-gray-200 leading-relaxed font-sans shadow-sm">
              <span className="font-bold text-brand block mb-1 uppercase tracking-wider text-[11px]">
                Diagnóstico del Ingeniero ({report.confidence || 'Alta'} Confianza):
              </span>
              {report.raw_report ? report.raw_report.split('\n\n')[0] : t('report_available')}
            </div>

            {/* Section 1: Facts */}
            <div className="p-4 rounded-xl bg-[#0D1017] border border-white/5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-best uppercase tracking-wider">
                <FileText className="w-4 h-4" />
                <span>1. Hechos Observados (Datos Directos)</span>
              </div>
              <ul className="space-y-1 pl-4 list-disc text-xs text-gray-300">
                {(report.facts || []).map((fact, idx) => (
                  <li key={`fact-${idx}`}>{fact}</li>
                ))}
              </ul>
            </div>

            {/* Section 2: Metrics */}
            <div className="p-4 rounded-xl bg-[#0D1017] border border-white/5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-brand uppercase tracking-wider">
                <Target className="w-4 h-4" />
                <span>2. Métricas de Apoyo (Cálculos de Telemetría)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 font-telemetry text-xs">
                {Object.entries(report.metrics || {}).map(([k, v]) => (
                  <div key={k} className="p-2.5 rounded-lg bg-[#131722] border border-white/5">
                    <span className="text-[10px] text-gray-400 block mb-0.5">{formatMetricKey(k, lang)}</span>
                    <span className="text-white font-bold text-xs block leading-snug">{formatMetricValue(v)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 3: Technical Hypothesis */}
            <div className="p-4 rounded-xl bg-[#0D1017] border border-white/5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-comp uppercase tracking-wider">
                <Lightbulb className="w-4 h-4" />
                <span>3. Hipótesis Técnica de Conducción</span>
              </div>
              <div className="space-y-1 text-xs text-gray-300 leading-relaxed">
                {(report.hypotheses || []).map((hypo, idx) => (
                  <p key={`hypo-${idx}`}>• {hypo}</p>
                ))}
              </div>
            </div>

            {/* Section 4: Practical Exercises */}
            <div className="p-4 rounded-xl bg-[#0D1017] border border-white/5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-gain uppercase tracking-wider">
                <CheckCircle className="w-4 h-4" />
                <span>4. Ejercicios Concretos para la Pista</span>
              </div>
              <ul className="space-y-1.5 pl-4 list-decimal text-xs text-gray-300">
                {(report.exercises || []).map((ex, idx) => (
                  <li key={`ex-${idx}`}>{ex}</li>
                ))}
              </ul>
            </div>

            {/* Section 5: Verification Indicator */}
            <div className="p-4 rounded-xl bg-brand/10 border border-brand/30">
              <span className="text-xs font-bold text-brand uppercase tracking-wider block mb-1">
                5. Indicador Numérico de Verificación:
              </span>
              <p className="text-xs text-gray-200">{report.verification_indicator}</p>
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Live Chat with Race Engineer (5 cols) */}
      <div className="lg:col-span-5 flex flex-col h-[700px] glass-panel rounded-xl overflow-hidden">
        {/* Chat Header */}
        <div className="p-4 border-b border-white/10 bg-[#111624] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand/20 border border-brand/40 flex items-center justify-center text-brand">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Radio de Equipo • Ingeniero
              </h4>
              <p className="text-[10px] text-gray-400">Pregunta sobre trazadas, frenadas o setup</p>
            </div>
          </div>

          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>

        {/* Chat Messages */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 font-sans text-xs">
          {chatMessages.map((m, idx) => {
            const isUser = m.role === 'user';
            return (
              <div
                key={`msg-${idx}`}
                className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-6 h-6 rounded-full bg-[#182133] border border-white/10 flex items-center justify-center text-brand shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] p-3 rounded-xl leading-relaxed ${
                    isUser
                      ? 'bg-brand text-black font-medium shadow-sm'
                      : 'bg-night-8 text-gray-200 border border-white/5'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
                {isUser && (
                  <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            );
          })}

          {chatLoading && (
            <div className="flex gap-2 items-center text-gray-400 text-xs italic">
              <Bot className="w-4 h-4 text-brand animate-spin" />
              <span>{waitingChatter ?? 'El ingeniero está analizando la telemetría...'}</span>
            </div>
          )}
        </div>

        {/* Chat Input */}
        <form onSubmit={handleSendMessage} className="p-3 border-t border-white/10 bg-night-5 flex gap-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={t('engineer_question_placeholder')}
            className="flex-1 bg-[#141A28] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand"
          />
          <button
            type="submit"
            disabled={chatLoading || !inputMessage.trim()}
            className="px-3.5 py-2 bg-brand hover:bg-brand-light text-black rounded-lg transition cursor-pointer disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
