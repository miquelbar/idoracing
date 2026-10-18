import React, { useState, useEffect, useRef } from 'react';
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle,
  Copy,
  FileText,
  Lightbulb,
  MessageSquare,
  RefreshCw,
  Send,
  Sliders,
  Sparkles,
  Target,
  User,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { useLanguage } from '../i18n';
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
  trackName?: string;
  carName?: string;
}

function formatMetricKey(key: string, lang: 'es' | 'en' = 'es'): string {
  const map: Record<string, { es: string; en: string }> = {
    time_difference: { es: 'Diferencia Total', en: 'Total Delta' },
    diferencia_vuelta: { es: 'Diferencia Total', en: 'Total Delta' },
    sector_differences: { es: 'Diferencia por Sectores', en: 'Sector Deltas' },
    diferencia_sectores: { es: 'Diferencia por Sectores', en: 'Sector Deltas' },
    corners_evaluated: { es: 'Curvas Evaluadas', en: 'Corners Evaluated' },
    curvas_analizadas: { es: 'Curvas Evaluadas', en: 'Corners Evaluated' },
    eficiencia_trail_braking: { es: 'Eficiencia Trail Braking', en: 'Trail Braking Efficiency' },
    primary_loss_corner: { es: 'Punto Crítico', en: 'Critical Point' },
  };
  if (map[key]) return map[key][lang] || map[key].es;
  return key.replace(/_/g, ' ').toUpperCase();
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

/**
 * Format markdown text with headers, bolding, lists, code pills, and paragraph breaks
 */
function renderFormattedMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: { type: 'ul' | 'ol'; items: React.ReactNode[] } | null = null;

  const flushList = () => {
    if (currentList) {
      if (currentList.type === 'ul') {
        elements.push(
          <ul key={`ul-${elements.length}`} className="space-y-1.5 my-2">
            {currentList.items.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-[#00D2BE] font-bold mt-0.5">•</span>
                <span className="flex-1 leading-relaxed text-xs">{item}</span>
              </li>
            ))}
          </ul>
        );
      } else {
        elements.push(
          <ol key={`ol-${elements.length}`} className="space-y-1.5 my-2">
            {currentList.items.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-amber-400 font-bold font-telemetry text-xs mt-0.5">{idx + 1}.</span>
                <span className="flex-1 leading-relaxed text-xs">{item}</span>
              </li>
            ))}
          </ol>
        );
      }
      currentList = null;
    }
  };

  const formatInline = (str: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(str)) !== null) {
      if (match.index > lastIdx) {
        parts.push(str.substring(lastIdx, match.index));
      }
      const token = match[0];
      if (token.startsWith('**') && token.endsWith('**')) {
        parts.push(
          <strong key={match.index} className="text-white font-bold font-sans">
            {token.slice(2, -2)}
          </strong>
        );
      } else if (token.startsWith('`') && token.endsWith('`')) {
        parts.push(
          <code
            key={match.index}
            className="font-mono text-[#00D2BE] bg-white/10 px-1 py-0.5 rounded text-[11px]"
          >
            {token.slice(1, -1)}
          </code>
        );
      } else if (token.startsWith('*') && token.endsWith('*')) {
        parts.push(
          <em key={match.index} className="text-gray-200 italic">
            {token.slice(1, -1)}
          </em>
        );
      }
      lastIdx = regex.lastIndex;
    }
    if (lastIdx < str.length) {
      parts.push(str.substring(lastIdx));
    }
    return parts;
  };

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }

    // Markdown Headers
    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(
        <h4 key={`h4-${lineIdx}`} className="text-xs font-bold text-[#00D2BE] uppercase tracking-wider mt-3 mb-1 font-telemetry">
          {formatInline(trimmed.substring(4))}
        </h4>
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(
        <h3 key={`h3-${lineIdx}`} className="text-sm font-bold text-white uppercase tracking-wider mt-4 mb-1.5 font-telemetry border-b border-white/10 pb-1">
          {formatInline(trimmed.substring(3))}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(
        <h2 key={`h2-${lineIdx}`} className="text-base font-bold text-white uppercase tracking-wider mt-4 mb-2 font-telemetry">
          {formatInline(trimmed.substring(2))}
        </h2>
      );
      return;
    }
    if (trimmed === '---' || trimmed === '***') {
      flushList();
      elements.push(<hr key={`hr-${lineIdx}`} className="border-white/10 my-2.5" />);
      return;
    }

    // Bullet list: * or -
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!currentList || currentList.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(formatInline(trimmed.substring(2)));
      return;
    }

    // Numbered list: 1. 2.
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      if (!currentList || currentList.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(formatInline(numMatch[2]));
      return;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={`p-${lineIdx}`} className="leading-relaxed my-1 text-xs text-gray-300">
        {formatInline(trimmed)}
      </p>
    );
  });

  flushList();
  return <div className="space-y-1">{elements}</div>;
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
  trackName = 'Circuito',
  carName = 'GT3',
}) => {
  const { lang, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'debrief' | 'radio'>('debrief');
  const [debriefViewMode, setDebriefViewMode] = useState<'structured' | 'full'>('structured');
  const [inputMessage, setInputMessage] = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [reportCopied, setReportCopied] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

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

  const copyToClipboard = (text: string, idx?: number) => {
    navigator.clipboard.writeText(text);
    if (idx !== undefined) {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } else {
      setReportCopied(true);
      setTimeout(() => setReportCopied(false), 2000);
    }
  };

  const copyFullReport = () => {
    if (!report) return;
    if (report.raw_report) {
      copyToClipboard(report.raw_report);
      return;
    }
    const text = [
      `=== IDORACING TECHNICAL DEBRIEF: ${trackName} ===`,
      `Vehicle: ${carName}`,
      '',
      '--- HECHOS OBSERVADOS EN DATOS ---',
      ...(report.facts || []).map((f) => `• ${f}`),
      '',
      '--- DIAGNÓSTICO TÉCNICO DE CONDUCCIÓN ---',
      ...(report.hypotheses || []).map((h) => `• ${h}`),
      '',
      '--- PLAN DE EJERCICIOS ---',
      ...(report.exercises || []).map((e, i) => `${i + 1}. ${e}`),
      '',
      `INDICADOR DE MEJORA: ${report.verification_indicator || 'N/A'}`,
    ].join('\n');
    copyToClipboard(text);
  };

  const isEn = lang === 'en';
  const isPorsche = carName.toLowerCase().includes('911') || carName.toLowerCase().includes('porsche');

  // Dynamic quick prompts oriented to the active circuit and selected corner
  const quickPrompts = isEn
    ? selectedCorner
      ? [
          `How to optimize the racing line in T${selectedCorner.corner_number} (${selectedCorner.name})?`,
          `Why am I losing ${selectedCorner.delta_time > 0 ? '+' : ''}${selectedCorner.delta_time.toFixed(3)}s in T${selectedCorner.corner_number}?`,
          `Is gear ${selectedCorner.comp_gear || 3} optimal for exit in T${selectedCorner.corner_number}?`,
          `How to modulate brake pedal and trail braking in T${selectedCorner.corner_number}?`,
        ]
      : [
          `In which sector am I losing the most time at ${trackName}?`,
          `How can I optimize trail braking technique in the ${carName}?`,
          'Which corners should I prioritize to gain the most lap time?',
          'How would you evaluate my braking consistency across this stint?',
        ]
    : selectedCorner
    ? [
        `¿Cómo mejorar la trazada en T${selectedCorner.corner_number} (${selectedCorner.name})?`,
        `¿Por qué pierdo ${selectedCorner.delta_time > 0 ? '+' : ''}${selectedCorner.delta_time.toFixed(3)}s en T${selectedCorner.corner_number}?`,
        `¿La marcha ${selectedCorner.comp_gear || 3}ª es adecuada para la salida de T${selectedCorner.corner_number}?`,
        `¿Cómo modular el freno y trail braking en T${selectedCorner.corner_number}?`,
      ]
    : [
        `¿En qué sector pierdo más tiempo en ${trackName}?`,
        `¿Cómo puedo optimizar la técnica de trail braking con el ${carName}?`,
        '¿Qué curvas debería priorizar para ganar más tiempo?',
        '¿Cómo evalúas la consistencia de frenada en esta tanda?',
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
        <div className="p-3.5 border-b border-white/10 bg-[#0E121E] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00D2BE]/20 border border-[#00D2BE]/40 flex items-center justify-center text-[#00D2BE]">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 font-telemetry">
                {t('engineer_panel_title')}
              </h2>
              <p className="text-[11px] text-gray-400 font-telemetry">
                {trackName} • <strong className="text-[#00D2BE]">{activeModel}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'debrief' && report && (
              <button
                onClick={copyFullReport}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white text-xs font-telemetry transition cursor-pointer"
                title={t('copy')}
              >
                {reportCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#00D2BE]" />
                    <span className="text-[#00D2BE] font-bold">{t('copied')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>{t('copy')}</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={() => onGenerateDebrief(true)}
              disabled={loadingReport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00D2BE] hover:bg-[#00E5CF] text-black text-xs font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-50 shadow-sm"
              title={report ? t('update') : t('analyze')}
            >
              {loadingReport ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('analyzing')}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{report ? t('update') : t('analyze')}</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title={t('close_hint')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-white/10 bg-[#07090F] px-4 shrink-0 text-xs font-telemetry font-bold">
          <div className="flex">
            <button
              onClick={() => setActiveTab('debrief')}
              className={`py-2.5 px-4 border-b-2 flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'debrief'
                  ? 'border-[#00D2BE] text-[#00D2BE]'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('debrief_tab')}</span>
              {report && <span className="w-1.5 h-1.5 rounded-full bg-[#00D2BE]" />}
            </button>
            <button
              onClick={() => setActiveTab('radio')}
              className={`py-2.5 px-4 border-b-2 flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'radio'
                  ? 'border-[#B138FE] text-[#D8B4FE]'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{t('radio_tab')} ({chatMessages.length})</span>
            </button>
          </div>

          {/* View Mode Toggle when in Debrief */}
          {activeTab === 'debrief' && report && (
            <div className="flex items-center gap-1 bg-white/5 p-0.5 rounded border border-white/10">
              <button
                onClick={() => setDebriefViewMode('structured')}
                className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold transition cursor-pointer ${
                  debriefViewMode === 'structured'
                    ? 'bg-[#00D2BE] text-black shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {t('structured_view')}
              </button>
              <button
                onClick={() => setDebriefViewMode('full')}
                className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold transition cursor-pointer ${
                  debriefViewMode === 'full'
                    ? 'bg-[#00D2BE] text-black shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {t('full_report')}
              </button>
            </div>
          )}
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
                debriefViewMode === 'full' && report.raw_report ? (
                  /* Full Markdown Technical Report View */
                  <div className="p-4 rounded-xl bg-[#0E131E] border border-white/5 font-sans space-y-2">
                    <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-3">
                      <span className="text-[11px] font-bold text-[#00D2BE] uppercase font-telemetry tracking-wider">
                        {t('full_report')} • {activeModel}
                      </span>
                      <button
                        onClick={copyFullReport}
                        className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1 font-telemetry cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{t('copy')}</span>
                      </button>
                    </div>
                    {renderFormattedMarkdown(report.raw_report)}
                  </div>
                ) : (
                  /* Structured Executive Cards View */
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
                              {formatMetricKey(k, lang)}
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
                        <span>{t('facts_title')}</span>
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
                        <span>{t('diagnosis_title')}</span>
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

                    {/* 3. Dinámica del Vehículo & Transferencia de Pesos */}
                    <div className="p-3.5 rounded-xl bg-[#0E131E] border border-white/5 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider font-telemetry">
                        <Sliders className="w-4 h-4 text-[#00D2BE]" />
                        <span>{t('vehicle_dynamics_title')}</span>
                      </div>
                      <div className="space-y-2 text-xs text-gray-300">
                        <div className="flex items-start gap-2">
                          <span className="text-[#00D2BE] mt-0.5 font-bold">•</span>
                          <div>
                            <strong className="text-white">
                              {isEn ? 'Architecture & Weight Transfer: ' : 'Arquitectura y Comportamiento Dinámico: '}
                            </strong>
                            <span>
                              {isPorsche
                                ? isEn
                                  ? 'In the Porsche 911 GT3 R (992), rear-engine mass distribution (~38/62) requires trailing 15-20% residual brake pressure into the apex to load front tyres and prevent entry push. Releasing brake abruptly immediately unloads the front axle.'
                                  : 'En el Porsche 911 GT3 R (992), el reparto posterior (~38/62) exige mantener un 15-20% de freno residual hasta el ápice para asentar el morro y eliminar el subviraje de entrada. Soltar el freno bruscamente descarga el tren delantero.'
                                : isEn
                                  ? 'Balanced chassis platform provides stable high-speed braking; trail off progressively to maintain optimal lateral grip across the front axle.'
                                  : 'Plataforma equilibrada con frenada muy estable; requiere modular el soltado regresivo para mantener agarre lateral delantero.'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-[#00D2BE] mt-0.5 font-bold">•</span>
                          <div>
                            <strong className="text-white">
                              {isEn ? 'Apex Throttle Transition: ' : 'Transición al Acelerador en Ápice: '}
                            </strong>
                            <span>
                              {isEn
                                ? 'Avoid overlapping throttle while holding steering lock. Unwind the steering wheel at least 40% before stomping full throttle.'
                                : 'No aceleres con dirección cerrada al máximo. Abre volante al menos un 40% antes de hundir el pedal para no inducir subviraje por transferencia a la zaga.'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 4. Recomendaciones de Setup de Competición */}
                    <div className="p-3.5 rounded-xl bg-[#0E131E] border border-white/5 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider font-telemetry">
                        <Wrench className="w-4 h-4 text-emerald-400" />
                        <span>{t('setup_advice_title')}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 space-y-1">
                          <span className="text-[10px] text-gray-400 uppercase font-telemetry block">
                            {isEn ? 'Brake Bias' : 'Reparto de Frenada'}
                          </span>
                          <span className="text-emerald-300 font-bold font-telemetry block">
                            {isPorsche ? '54.0% – 55.0%' : '53.5% – 54.5%'}
                          </span>
                          <p className="text-[11px] text-gray-400 leading-tight">
                            {isEn
                              ? '1 click rearward if experiencing entry push; 0.5% forward if rear is nervous under straight braking.'
                              : 'Retrasar 1 clic si hay subviraje al entrar frenando; adelantar 0.5% si la trasera se insinúa a alta velocidad.'}
                          </p>
                        </div>

                        <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 space-y-1">
                          <span className="text-[10px] text-gray-400 uppercase font-telemetry block">
                            {isEn ? 'Hot Tyre Pressures' : 'Presiones en Caliente'}
                          </span>
                          <span className="text-emerald-300 font-bold font-telemetry block">
                            26.8 – 27.2 psi
                          </span>
                          <p className="text-[11px] text-gray-400 leading-tight">
                            {isEn
                              ? 'Target after 3 push laps for optimal contact patch.'
                              : 'Objetivo tras 3 vueltas lanzadas para máxima superficie de contacto.'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* 5. Plan de Ejercicios */}
                    <div className="p-3.5 rounded-xl bg-[#0E131E] border border-white/5 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider font-telemetry">
                        <Target className="w-4 h-4 text-[#FF1801]" />
                        <span>{t('exercises_title')}</span>
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

                    {/* 6. Indicador Objetivo y Confianza */}
                    <div className="p-3.5 rounded-xl bg-[#0E131E] border border-white/5 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider font-telemetry">
                          <FileText className="w-4 h-4 text-[#B138FE]" />
                          <span>{t('kpi_title')}</span>
                        </div>
                        {report.confidence && (
                          <span className="text-[10px] font-telemetry px-2 py-0.5 rounded bg-[#00D2BE]/20 text-[#00D2BE] border border-[#00D2BE]/30">
                            {t('confidence_level')}: {report.confidence}
                          </span>
                        )}
                      </div>
                      <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 font-telemetry text-xs text-purple-200">
                        {report.verification_indicator ||
                          'Comprobar aumento de velocidad mínima en vértice (+5 km/h) sin penalizar tracción.'}
                      </div>
                    </div>
                  </div>
                )
              ) : (
                !loadingReport && (
                  <div className="p-8 rounded-xl bg-[#0E131E] border border-white/5 text-center space-y-3 my-6">
                    <Sparkles className="w-10 h-10 text-[#00D2BE] mx-auto opacity-80" />
                    <h3 className="text-sm font-bold text-white">
                      {isEn ? 'Want a comprehensive AI telemetry debrief?' : '¿Quieres un debrief integral con IA?'}
                    </h3>
                    <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
                      {isEn
                        ? 'Synthesizes sector deltas, trail braking modulation, vehicle dynamics, setup recommendations, and actionable exercises.'
                        : 'Sintetiza pérdidas por sector, modulación de trail braking en todas las curvas, dinámica de pesos y recomendaciones de setup.'}
                    </p>
                    <button
                      onClick={() => onGenerateDebrief(false)}
                      className="px-4 py-2 rounded-lg bg-[#00D2BE] hover:bg-[#00E5CF] text-black text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-md inline-flex items-center gap-2"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Generate Lap Analysis' : 'Generar Análisis de Vuelta'}</span>
                    </button>
                  </div>
                )
              )}
            </>
          )}

          {activeTab === 'radio' && (
            <div className="flex flex-col h-full space-y-3">
              {/* Circuit & Corner Awareness Banner */}
              <div className="px-3 py-1.5 rounded-lg bg-[#0E131E] border border-white/5 flex items-center justify-between text-xs font-telemetry">
                <div className="flex items-center gap-2 truncate">
                  <span className="text-gray-400">{isEn ? 'Track:' : 'Pista:'}</span>
                  <span className="text-white font-bold truncate">{trackName}</span>
                  <span className="text-gray-600">·</span>
                  <span className="text-[#00D2BE] font-semibold truncate">{carName}</span>
                </div>
                {selectedCorner && (
                  <div className="flex items-center gap-1.5 shrink-0 pl-2 border-l border-white/10">
                    <span className="w-2 h-2 rounded-full bg-[#B138FE] animate-pulse" />
                    <span className="text-[#D8B4FE] font-bold">
                      T{selectedCorner.corner_number}: {selectedCorner.name}
                    </span>
                    <span className={`text-[10px] font-bold ${selectedCorner.delta_time > 0 ? 'text-[#FF4D4D]' : 'text-[#00FF7F]'}`}>
                      ({selectedCorner.delta_time > 0 ? '+' : ''}{selectedCorner.delta_time.toFixed(3)}s)
                    </span>
                  </div>
                )}
              </div>

              {/* Dynamic Quick Prompts */}
              <div className="space-y-1.5 shrink-0">
                <span className="text-[10px] text-gray-500 uppercase font-telemetry font-bold">
                  {t('suggested_queries')} {selectedCorner ? `(T${selectedCorner.corner_number})` : ''}
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

              {/* Chat Message List with Rich Markdown Rendering */}
              <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                {chatMessages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} group`}
                  >
                    <div
                      className={`flex gap-2.5 text-xs max-w-[90%] ${
                        m.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {m.role === 'assistant' && (
                        <div className="w-6 h-6 rounded-md bg-[#00D2BE]/20 border border-[#00D2BE]/40 flex items-center justify-center text-[#00D2BE] shrink-0 mt-0.5">
                          <Bot className="w-3.5 h-3.5" />
                        </div>
                      )}

                      <div
                        className={`p-3 rounded-xl leading-relaxed text-xs relative ${
                          m.role === 'user'
                            ? 'bg-[#B138FE]/20 border border-[#B138FE]/40 text-purple-100 font-sans'
                            : 'bg-[#0E131E] border border-white/5 text-gray-300 font-sans'
                        }`}
                      >
                        {/* Markdown Formatter */}
                        {renderFormattedMarkdown(m.content)}

                        {/* Copy button on message */}
                        <div className="mt-2 pt-1 border-t border-white/5 flex items-center justify-between text-[10px] text-gray-500 font-telemetry">
                          <span>{m.role === 'assistant' ? (isEn ? 'Race Engineer' : 'Ingeniero de Pista') : (isEn ? 'You' : 'Tú')}</span>
                          <button
                            onClick={() => copyToClipboard(m.content, idx)}
                            className="hover:text-white flex items-center gap-1 transition cursor-pointer p-0.5 rounded"
                            title={t('copy')}
                          >
                            {copiedIdx === idx ? (
                              <>
                                <Check className="w-3 h-3 text-[#00D2BE]" />
                                <span className="text-[#00D2BE]">{t('copied')}</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>{t('copy')}</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {m.role === 'user' && (
                        <div className="w-6 h-6 rounded-md bg-[#B138FE]/20 border border-[#B138FE]/40 flex items-center justify-center text-[#B138FE] shrink-0 mt-0.5">
                          <User className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex gap-2 text-xs text-gray-400 items-center p-2 rounded-lg bg-[#0E131E]/60 border border-white/5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#00D2BE]" />
                    <span>
                      {isEn
                        ? `The engineer is inspecting telemetry channels for ${trackName}...`
                        : `El ingeniero está consultando los canales de telemetría de ${trackName}...`}
                    </span>
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
                placeholder={
                  selectedCorner
                    ? isEn
                      ? `Ask about Turn ${selectedCorner.corner_number} (${selectedCorner.name}) or setup...`
                      : `Pregunta sobre Curva ${selectedCorner.corner_number} (${selectedCorner.name}) o setup...`
                    : isEn
                    ? `Ask about ${trackName}, braking points or technique...`
                    : `Pregunta sobre ${trackName}, puntos de frenada o técnica...`
                }
                className="flex-1 bg-[#090D15] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#00D2BE] font-telemetry"
              />
              <button
                onClick={handleSend}
                disabled={chatLoading || !inputMessage.trim()}
                className="px-4 py-2 rounded-lg bg-[#00D2BE] hover:bg-[#00E5CF] text-black font-bold text-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{t('transmit')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
