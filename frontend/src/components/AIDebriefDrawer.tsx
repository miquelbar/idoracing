import React, { memo, useCallback, useState, useEffect, useRef } from 'react';
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle,
  Copy,
  FileText,
  Lightbulb,
  MessageSquare,
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  User,
  X,
  Zap,
} from 'lucide-react';
import { useLanguage } from '../i18n';
import { useWaitingChatter } from '../i18n/waitingChatter';
import type { CarSetupData, ChatMessage, CoachReport, ComparisonResponse, CornerDTO } from '../types/telemetry';
import { fetchCarSetup, getStoredInputDevice, setStoredInputDevice, type InputPeripheral } from '../services/api';
import { formatMetricKey, formatMetricValue } from '../utils/formatters';
import { renderFormattedMarkdown } from '../utils/markdown';
import { copyText } from '../utils/clipboard';
import { SpotterInfoCard } from './SpotterInfoCard';

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
  comparison?: ComparisonResponse | null;
  initialTab?: 'debrief' | 'radio';
}

interface ChatBubbleProps {
  message: ChatMessage;
  idx: number;
  copied: boolean;
  roleLabel: string;
  copyLabel: string;
  copiedLabel: string;
  peripheralQuestion: string;
  gamepadLabel: string;
  wheelLabel: string;
  keyboardLabel: string;
  activePeripheral: InputPeripheral | null;
  disabled: boolean;
  onCopy: (text: string, idx: number) => void;
  onSelectPeripheral: (device: InputPeripheral) => void;
}

/** One chat message. Memoized so typing in the input never re-renders (and re-parses markdown of) the history. */
const ChatBubble = memo(
  ({
    message: m,
    idx,
    copied,
    roleLabel,
    copyLabel,
    copiedLabel,
    peripheralQuestion,
    gamepadLabel,
    wheelLabel,
    keyboardLabel,
    activePeripheral,
    disabled,
    onCopy,
    onSelectPeripheral,
  }: ChatBubbleProps) => (
    <div className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} group`}>
      <div className={`flex gap-2.5 text-xs max-w-[90%] ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
        {m.role === 'assistant' && (
          <div className="w-6 h-6 rounded-md bg-brand/20 border border-brand/40 flex items-center justify-center text-brand shrink-0 mt-0.5">
            <Bot className="w-3.5 h-3.5" />
          </div>
        )}

        <div
          className={`p-3 rounded-xl leading-relaxed text-xs relative ${
            m.role === 'user'
              ? 'bg-comp/20 border border-comp/40 text-purple-100 font-sans'
              : 'bg-night-7 border border-white/5 text-gray-300 font-sans'
          }`}
        >
          {renderFormattedMarkdown(m.content)}

          {m.role === 'assistant' && (
            <div className="mt-3 pt-2.5 border-t border-white/10 space-y-1.5">
              <span className="block text-[10px] text-gray-400 font-telemetry font-bold">
                {peripheralQuestion}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'gamepad' as const, label: gamepadLabel },
                    { id: 'wheel' as const, label: wheelLabel },
                    { id: 'keyboard' as const, label: keyboardLabel },
                  ] as const
                ).map((opt) => {
                  const isSelected = activePeripheral === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => onSelectPeripheral(opt.id)}
                      className={`text-[11px] px-2.5 py-1 rounded border transition cursor-pointer disabled:opacity-50 ${
                        isSelected
                          ? 'bg-brand/20 border-brand/60 text-brand font-bold'
                          : 'bg-night-4 hover:bg-[#161D2E] text-gray-300 hover:text-white border-white/10'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-2 pt-1 border-t border-white/5 flex items-center justify-between text-[10px] text-gray-500 font-telemetry">
            <span>{roleLabel}</span>
            <button
              onClick={() => onCopy(m.content, idx)}
              className="hover:text-white flex items-center gap-1 transition cursor-pointer p-0.5 rounded"
              title={copyLabel}
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-brand" />
                  <span className="text-brand">{copiedLabel}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>{copyLabel}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {m.role === 'user' && (
          <div className="w-6 h-6 rounded-md bg-comp/20 border border-comp/40 flex items-center justify-center text-comp shrink-0 mt-0.5">
            <User className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
    </div>
  )
);

interface ChatInputBarProps {
  placeholder: string;
  sendLabel: string;
  disabled: boolean;
  onSend: (text: string) => void;
}

/** Owns the draft text so each keystroke re-renders only this small bar, not the whole drawer. */
const ChatInputBar = memo(({ placeholder, sendLabel, disabled, onSend }: ChatInputBarProps) => {
  const [text, setText] = useState('');
  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  };
  return (
    <div className="p-3 border-t border-white/10 bg-[#0E121E] shrink-0">
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={placeholder}
          className="flex-1 bg-night-4 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand font-telemetry"
        />
        <button
          onClick={submit}
          disabled={disabled || !text.trim()}
          className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-light text-black font-bold text-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{sendLabel}</span>
        </button>
      </div>
    </div>
  );
});

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
  comparison,
  initialTab,
}) => {
  const { lang, t } = useLanguage();
  const chatWaitingChatter = useWaitingChatter(chatLoading, lang);
  const reportWaitingChatter = useWaitingChatter(loadingReport, lang);
  const [activeTab, setActiveTab] = useState<'debrief' | 'radio'>(initialTab || 'debrief');
  const [debriefViewMode, setDebriefViewMode] = useState<'structured' | 'full'>('structured');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [reportCopied, setReportCopied] = useState(false);
  const [setupInfo, setSetupInfo] = useState<CarSetupData | null>(null);
  const [activePeripheral, setActivePeripheral] = useState<InputPeripheral | null>(() => getStoredInputDevice());
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncPeripheral = (e: Event) => {
      const custom = e as CustomEvent<InputPeripheral | null>;
      setActivePeripheral(custom.detail ?? getStoredInputDevice());
    };
    window.addEventListener('idoracing-peripheral-change', syncPeripheral);
    return () => window.removeEventListener('idoracing-peripheral-change', syncPeripheral);
  }, []);

  useEffect(() => {
    if (!isOpen || !comparison) return;
    let mounted = true;
    fetchCarSetup(
      comparison.session_id,
      comparison.ref_lap_id,
      comparison.comp_lap_id,
      comparison.ref_session_id,
      comparison.comp_session_id
    )
      .then((d) => {
        if (mounted) setSetupInfo(d);
      })
      .catch(() => {
        if (mounted) setSetupInfo(null);
      });
    return () => {
      mounted = false;
    };
  }, [
    isOpen,
    comparison?.session_id,
    comparison?.ref_lap_id,
    comparison?.comp_lap_id,
    comparison?.ref_session_id,
    comparison?.comp_session_id,
  ]);

  // Sync initialTab when drawer opens
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

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

  const copyToClipboard = useCallback((text: string, idx?: number) => {
    void copyText(text).then((ok) => {
      if (!ok) return;
      if (idx !== undefined) {
        setCopiedIdx(idx);
        setTimeout(() => setCopiedIdx(null), 2000);
      } else {
        setReportCopied(true);
        setTimeout(() => setReportCopied(false), 2000);
      }
    });
  }, []);

  const handleSelectPeripheral = useCallback(
    (device: InputPeripheral) => {
      setStoredInputDevice(device);
      setActivePeripheral(device);
      const queryKey =
        device === 'gamepad'
          ? 'qp_periph_gamepad'
          : device === 'wheel'
            ? 'qp_periph_wheel'
            : 'qp_periph_keyboard';
      onSendMessage(t(queryKey));
    },
    [onSendMessage, t]
  );

  if (!isOpen) return null;

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


  const signedDelta = (seconds: number) => `${seconds > 0 ? '+' : ''}${seconds.toFixed(3)}`;
  const quickPrompts = selectedCorner
    ? [
        t('qp_corner_line', { num: selectedCorner.corner_number, name: selectedCorner.name }),
        t('qp_corner_loss', { num: selectedCorner.corner_number, delta: signedDelta(selectedCorner.delta_time) }),
        t('qp_corner_gear', { num: selectedCorner.corner_number, gear: selectedCorner.comp_gear || 3 }),
        t('qp_corner_brake', { num: selectedCorner.corner_number }),
      ]
    : [
        t('qp_lap_sector', { track: trackName }),
        t('qp_lap_trail', { car: carName }),
        t('qp_lap_priority'),
        t('qp_lap_consistency'),
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
            <div className="w-8 h-8 rounded-lg bg-brand/20 border border-brand/40 flex items-center justify-center text-brand">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 font-telemetry">
                {t('engineer_panel_title')}
              </h2>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-400 font-telemetry mt-0.5">
                <span>{trackName}</span>
                <span>•</span>
                <strong className="text-brand">{activeModel}</strong>
                {comparison && (
                  <>
                    <span>•</span>
                    <span className="text-[#00D2BE] font-bold">
                      P1 (V{comparison.ref_lap_id.replace(/\D+/g, '') || '1'})
                    </span>
                    <span>vs</span>
                    <span className="text-[#D8B4FE] font-bold">
                      P2 (V{comparison.comp_lap_id.replace(/\D+/g, '') || '2'})
                    </span>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    window.location.hash = '#/setup';
                  }}
                  className="ml-1 px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-bold text-emerald-300 cursor-pointer"
                >
                  {setupInfo && setupInfo.same_garage_setup === false
                    ? `[ 🔧 Setup Diff: ${[...(setupInfo.garage_diff_summary || []), ...(setupInfo.thermal_diff_summary || [])].slice(0, 2).join(', ')} ]`
                    : '[ 🔧 Setup: Idéntico ]'}
                </button>
              </div>
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
                    <Check className="w-3.5 h-3.5 text-brand" />
                    <span className="text-brand font-bold">{t('copied')}</span>
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-light text-black text-xs font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-50 shadow-sm"
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
                  ? 'border-brand text-brand'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('debrief_tab')}</span>
              {report && <span className="w-1.5 h-1.5 rounded-full bg-brand" />}
            </button>
            <button
              onClick={() => setActiveTab('radio')}
              className={`py-2.5 px-4 border-b-2 flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'radio'
                  ? 'border-comp text-[#D8B4FE]'
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
                    ? 'bg-brand text-black shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {t('structured_view')}
              </button>
              <button
                onClick={() => setDebriefViewMode('full')}
                className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold transition cursor-pointer ${
                  debriefViewMode === 'full'
                    ? 'bg-brand text-black shadow-sm'
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
              <div className="mb-4">
                <SpotterInfoCard collapsible defaultCollapsed showGuide={false} showHotkey={false} />
              </div>
              {loadingReport && (
                <div className="p-5 rounded-xl bg-night-7 border border-brand/30 text-center space-y-3.5 mb-4 shadow-xl shadow-brand/5 animate-in fade-in duration-200">
                  <div className="flex items-center justify-center gap-2.5">
                    <RefreshCw className="w-5 h-5 text-brand animate-spin" />
                    <span className="text-sm font-bold text-white uppercase font-telemetry tracking-wide">
                      {t('analyzing')}
                    </span>
                    <span className="text-xs text-gray-400 font-telemetry">
                      • {activeModel}
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 font-telemetry">
                    {t('pep_analyzing_telemetry', { track: trackName })}
                  </p>
                  <div className="p-3.5 rounded-lg bg-black/60 border border-brand/20 max-w-lg mx-auto text-xs text-brand font-telemetry flex items-center gap-3 text-left shadow-inner">
                    <Radio className="w-4 h-4 shrink-0 text-brand animate-pulse" />
                    <span className="leading-relaxed">
                      {reportWaitingChatter ?? t('pep_thinking', { track: trackName })}
                    </span>
                  </div>
                </div>
              )}

              {report ? (
                <div className={loadingReport ? 'opacity-40 pointer-events-none' : ''}>
                  {debriefViewMode === 'full' && report.raw_report ? (
                  /* Full Markdown Technical Report View */
                  <div className="p-4 rounded-xl bg-night-7 border border-white/5 font-sans space-y-2">
                    <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-3">
                      <span className="text-[11px] font-bold text-brand uppercase font-telemetry tracking-wider">
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
                            className="p-2.5 rounded-lg bg-night-7 border border-white/5 font-telemetry"
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
                    <div className="p-3.5 rounded-xl bg-night-7 border border-white/5 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider font-telemetry">
                        <CheckCircle className="w-4 h-4 text-brand" />
                        <span>{t('facts_title')}</span>
                      </div>
                      <ul className="space-y-1.5 text-xs text-gray-300">
                        {report.facts && report.facts.length > 0 ? (
                          report.facts.map((fact, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="text-brand mt-0.5 font-bold">•</span>
                              <span className="leading-relaxed">{fact}</span>
                            </li>
                          ))
                        ) : (
                          <li className="text-gray-500">Sin hechos críticos registrados.</li>
                        )}
                      </ul>
                    </div>

                    {/* 2. Diagnóstico Técnico */}
                    <div className="p-3.5 rounded-xl bg-night-7 border border-white/5 space-y-2">
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

                    {/* 5. Plan de Ejercicios */}
                    <div className="p-3.5 rounded-xl bg-night-7 border border-white/5 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider font-telemetry">
                        <Target className="w-4 h-4 text-loss" />
                        <span>{t('exercises_title')}</span>
                      </div>
                      <ul className="space-y-1.5 text-xs text-gray-300">
                        {report.exercises && report.exercises.length > 0 ? (
                          report.exercises.map((ex, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="text-loss mt-0.5 font-bold">{idx + 1}.</span>
                              <span className="leading-relaxed">{ex}</span>
                            </li>
                          ))
                        ) : (
                          <li className="text-gray-500">Mantener el ritmo actual.</li>
                        )}
                      </ul>
                    </div>

                    {/* 6. Indicador Objetivo y Confianza */}
                    <div className="p-3.5 rounded-xl bg-night-7 border border-white/5 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider font-telemetry">
                          <FileText className="w-4 h-4 text-comp" />
                          <span>{t('kpi_title')}</span>
                        </div>
                        {report.confidence && (
                          <span className="text-[10px] font-telemetry px-2 py-0.5 rounded bg-brand/20 text-brand border border-brand/30">
                            {t('confidence_level')}: {report.confidence}
                          </span>
                        )}
                      </div>
                      <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 font-telemetry text-xs text-purple-200">
                        {report.verification_indicator || '—'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
                !loadingReport && (
                  <div className="p-8 rounded-xl bg-night-7 border border-white/5 text-center space-y-3 my-6">
                    <Sparkles className="w-10 h-10 text-brand mx-auto opacity-80" />
                    <h3 className="text-sm font-bold text-white">
                      {t('debrief_cta_title')}
                    </h3>
                    <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
                      {t('debrief_cta_body')}
                    </p>
                    <button
                      onClick={() => onGenerateDebrief(false)}
                      className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-light text-black text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-md inline-flex items-center gap-2"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>{t('debrief_cta_button')}</span>
                    </button>
                  </div>
                )
              )}
            </>
          )}

          {activeTab === 'radio' && (
            <div className="flex flex-col h-full space-y-3">
              {/* Circuit & Corner Awareness Banner */}
              <div className="px-3 py-1.5 rounded-lg bg-night-7 border border-white/5 flex items-center justify-between text-xs font-telemetry">
                <div className="flex items-center gap-2 truncate">
                  <span className="text-gray-400">{t('track_colon')}</span>
                  <span className="text-white font-bold truncate">{trackName}</span>
                  <span className="text-gray-600">·</span>
                  <span className="text-brand font-semibold truncate">{carName}</span>
                </div>
                {selectedCorner && (
                  <div className="flex items-center gap-1.5 shrink-0 pl-2 border-l border-white/10">
                    <span className="w-2 h-2 rounded-full bg-comp animate-pulse" />
                    <span className="text-[#D8B4FE] font-bold">
                      T{selectedCorner.corner_number}: {selectedCorner.name}
                    </span>
                    <span className={`text-[10px] font-bold ${selectedCorner.delta_time > 0 ? 'text-loss-light' : 'text-gain'}`}>
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
                      className="text-[11px] px-2.5 py-1 rounded bg-night-7 hover:bg-[#161D2E] text-gray-300 hover:text-white border border-white/5 transition text-left cursor-pointer disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat Message List with Rich Markdown Rendering */}
              <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                {chatMessages.map((m, idx) => (
                  <ChatBubble
                    key={idx}
                    message={m}
                    idx={idx}
                    copied={copiedIdx === idx}
                    roleLabel={m.role === 'assistant' ? t('pep_role') : t('you_role')}
                    copyLabel={t('copy')}
                    copiedLabel={t('copied')}
                    peripheralQuestion={t('pep_peripheral_question')}
                    gamepadLabel={t('periph_gamepad')}
                    wheelLabel={t('periph_wheel')}
                    keyboardLabel={t('periph_keyboard')}
                    activePeripheral={activePeripheral}
                    disabled={chatLoading}
                    onCopy={copyToClipboard}
                    onSelectPeripheral={handleSelectPeripheral}
                  />
                ))}
                {chatLoading && (
                  <div className="flex gap-2 text-xs text-gray-400 items-center p-2 rounded-lg bg-night-7/60 border border-white/5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand" />
                    <span>
                      {chatWaitingChatter ?? t('pep_thinking', { track: trackName })}
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
          <ChatInputBar
            placeholder={
              selectedCorner
                ? t('ask_pep_corner_placeholder', { num: selectedCorner.corner_number, name: selectedCorner.name })
                : t('ask_pep_track_placeholder', { track: trackName })
            }
            sendLabel={t('transmit')}
            disabled={chatLoading}
            onSend={(text) => onSendMessage(text)}
          />
        )}
      </div>
    </div>
  );
};
