import React, { useState, useEffect } from 'react';
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
  X,
  Zap,
} from 'lucide-react';
import type { ChatMessage, CoachReport, CornerDTO } from '../types/telemetry';

interface AIDebriefDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  report: CoachReport | null;
  loadingReport: boolean;
  reportError: string | null;
  onGenerateDebrief: (forceRefresh?: boolean) => void;
  activeModel: string;
  chatMessages: ChatMessage[];
  chatLoading: boolean;
  onSendMessage: (msgText?: string) => void;
  selectedCorner?: CornerDTO | null;
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

export const AIDebriefDrawer: React.FC<AIDebriefDrawerProps> = ({
  isOpen,
  onClose,
  report,
  loadingReport,
  reportError,
  onGenerateDebrief,
  activeModel,
  chatMessages,
  chatLoading,
  onSendMessage,
  selectedCorner,
}) => {
  const [activeTab, setActiveTab] = useState<'debrief' | 'radio'>('debrief');
  const [inputMessage, setInputMessage] = useState('');
  const chatBottomRef = React.useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Scroll chat to bottom when messages update
  useEffect(() => {
    if (activeTab === 'radio' && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeTab]);

  if (!isOpen) return null;

  const handleSend = () => {
    const text = inputMessage.trim();
    if (!text || chatLoading) return;
    onSendMessage(text);
    setInputMessage('');
  };

  const quickPrompts = [
    '¿Dónde pierdo más tiempo en la vuelta?',
    '¿Cómo puedo mejorar mi trail braking?',
    selectedCorner
      ? `¿Cómo mejorar la Curva ${selectedCorner.corner_number} (${selectedCorner.name})?`
      : '¿Qué curva debería priorizar para ganar más tiempo?',
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="relative w-full max-w-2xl bg-[#090C14] border-l border-white/10 h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-4 border-b border-white/10 bg-[#0E121E] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#00D2BE]/20 border border-[#00D2BE]/40 flex items-center justify-center text-[#00D2BE]">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 font-telemetry">
                Ingeniero de Competición & Radio
              </h2>
              <p className="text-[11px] text-gray-400 font-telemetry">
                Modelo Activo: <strong className="text-[#00D2BE]">{activeModel}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onGenerateDebrief(true)}
              disabled={loadingReport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00D2BE] hover:bg-[#00E5CF] text-black text-xs font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-50 shadow-sm"
              title="Generar o recalcular análisis integral"
            >
              {loadingReport ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Analizando...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{report ? 'Actualizar' : 'Analizar'}</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Cerrar panel (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-white/10 bg-[#07090F] px-4 shrink-0 text-xs font-telemetry font-bold">
          <button
            onClick={() => setActiveTab('debrief')}
            className={`py-3 px-4 border-b-2 flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'debrief'
                ? 'border-[#00D2BE] text-[#00D2BE]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Debrief Técnico Integral</span>
            {report && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#00D2BE]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('radio')}
            className={`py-3 px-4 border-b-2 flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'radio'
                ? 'border-[#B138FE] text-[#D8B4FE]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Canal de Radio ({chatMessages.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {reportError && (
            <div className="p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{reportError}</span>
            </div>
          )}

          {activeTab === 'debrief' && (
            <>
              {report ? (
                <div className="space-y-4 font-sans">
                  {/* Numerical Metrics Overview */}
                  {report.metrics && Object.keys(report.metrics).length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {Object.entries(report.metrics).map(([k, v]) => (
                        <div
                          key={k}
                          className="p-2.5 rounded-lg bg-[#0E131E] border border-white/5 font-telemetry"
                        >
                          <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">
                            {formatMetricKey(k)}
                          </span>
                          <span className="text-xs font-bold text-white block truncate">
                            {formatMetricValue(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 1. Hechos Observados */}
                  <div className="p-3.5 rounded-xl bg-[#0E131E] border border-white/5 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider font-telemetry">
                      <CheckCircle className="w-4 h-4 text-[#00D2BE]" />
                      <span>1. Hechos Observados en Datos</span>
                    </div>
                    <ul className="space-y-1.5 text-xs text-gray-300">
                      {report.facts && report.facts.length > 0 ? (
                        report.facts.map((fact, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-[#00D2BE] mt-0.5 font-bold">•</span>
                            <span className="leading-relaxed">{fact}</span>
                          </li>
                        ))
                      ) : (
                        <li className="text-gray-500">Sin hechos críticos registrados.</li>
                      )}
                    </ul>
                  </div>

                  {/* 2. Diagnóstico Técnico */}
                  <div className="p-3.5 rounded-xl bg-[#0E131E] border border-white/5 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider font-telemetry">
                      <Lightbulb className="w-4 h-4 text-amber-400" />
                      <span>2. Diagnóstico Técnico de Conducción</span>
                    </div>
                    <ul className="space-y-1.5 text-xs text-gray-300">
                      {report.hypotheses && report.hypotheses.length > 0 ? (
                        report.hypotheses.map((hyp, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-amber-400 mt-0.5 font-bold">•</span>
                            <span className="leading-relaxed">{hyp}</span>
                          </li>
                        ))
                      ) : (
                        <li className="text-gray-500">Técnica consistente sin desviaciones mayores.</li>
                      )}
                    </ul>
                  </div>

                  {/* 3. Plan de Ejercicios */}
                  <div className="p-3.5 rounded-xl bg-[#0E131E] border border-white/5 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider font-telemetry">
                      <Target className="w-4 h-4 text-[#FF1801]" />
                      <span>3. Plan de Ejercicios para la Siguiente Tanda</span>
                    </div>
                    <ul className="space-y-1.5 text-xs text-gray-300">
                      {report.exercises && report.exercises.length > 0 ? (
                        report.exercises.map((ex, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-[#FF1801] mt-0.5 font-bold">{idx + 1}.</span>
                            <span className="leading-relaxed">{ex}</span>
                          </li>
                        ))
                      ) : (
                        <li className="text-gray-500">Mantener el ritmo actual.</li>
                      )}
                    </ul>
                  </div>

                  {/* 4. Indicador Objetivo */}
                  <div className="p-3.5 rounded-xl bg-[#0E131E] border border-white/5 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider font-telemetry">
                      <FileText className="w-4 h-4 text-[#B138FE]" />
                      <span>4. Indicador Objetivo de Mejora</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 font-telemetry text-xs text-purple-200">
                      {report.verification_indicator ||
                        'Comprobar aumento de velocidad mínima en vértice (+5 km/h) sin penalizar tracción.'}
                    </div>
                  </div>
                </div>
              ) : (
                !loadingReport && (
                  <div className="p-8 rounded-xl bg-[#0E131E] border border-white/5 text-center space-y-3 my-6">
                    <Sparkles className="w-10 h-10 text-[#00D2BE] mx-auto opacity-80" />
                    <h3 className="text-sm font-bold text-white">¿Quieres un debrief integral con IA?</h3>
                    <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
                      Sintetiza pérdidas por sector, modulación de trail braking en todas las curvas y ejercicios concretos para tu próxima tanda.
                    </p>
                    <button
                      onClick={() => onGenerateDebrief(false)}
                      className="px-4 py-2 rounded-lg bg-[#00D2BE] hover:bg-[#00E5CF] text-black text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-md inline-flex items-center gap-2"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>Generar Análisis de Vuelta</span>
                    </button>
                  </div>
                )
              )}
            </>
          )}

          {activeTab === 'radio' && (
            <div className="flex flex-col h-full space-y-3">
              {/* Quick Prompts */}
              <div className="space-y-1.5 shrink-0">
                <span className="text-[10px] text-gray-500 uppercase font-telemetry font-bold">
                  Sugerencias Rápidas
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {quickPrompts.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => onSendMessage(q)}
                      disabled={chatLoading}
                      className="text-[11px] px-2.5 py-1 rounded bg-[#0E131E] hover:bg-[#161D2E] text-gray-300 hover:text-white border border-white/5 transition text-left cursor-pointer disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat Message List */}
              <div className="flex-1 space-y-3 overflow-y-auto pr-1">
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
                      className={`p-3 rounded-xl max-w-[85%] leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-[#B138FE]/20 border border-[#B138FE]/40 text-purple-100 font-sans'
                          : 'bg-[#0E131E] border border-white/5 text-gray-300 font-sans'
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
                  <div className="flex gap-2 text-xs text-gray-400 items-center p-2 rounded-lg bg-[#0E131E]/60 border border-white/5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#00D2BE]" />
                    <span>El ingeniero está consultando los canales de telemetría...</span>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>
            </div>
          )}
        </div>

        {/* Fixed Chat Input Bar at Bottom (Always available in radio mode) */}
        {activeTab === 'radio' && (
          <div className="p-3 border-t border-white/10 bg-[#0E121E] shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ej: ¿Dónde pierdo más tiempo? ¿Cómo mejoro la frenada en T7?"
                className="flex-1 bg-[#090D15] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#00D2BE] font-telemetry"
              />
              <button
                onClick={handleSend}
                disabled={chatLoading || !inputMessage.trim()}
                className="px-4 py-2 rounded-lg bg-[#00D2BE] hover:bg-[#00E5CF] text-black font-bold text-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Transmitir</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
