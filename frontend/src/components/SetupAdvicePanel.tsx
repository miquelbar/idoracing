import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Gauge,
  Info,
  Lightbulb,
  MessageSquare,
  Radio,
  RefreshCw,
  Target,
  Wrench,
  Zap,
} from 'lucide-react';
import { fetchSetupAdviceReview } from '../services/api';
import type { SetupAdviceReport, SetupAdviceReview, SetupRecommendation } from '../types/telemetry';
import { useLanguage, type TranslationKey } from '../i18n';
import { useWaitingChatter } from '../i18n/waitingChatter';
import { errorMessage } from '../utils/formatters';
import { renderFormattedMarkdown } from '../utils/markdown';

interface SetupAdvicePanelProps {
  refLapId?: string | null;
  compLapId?: string | null;
  sessionId?: string | null;
  refSessionId?: string | null;
  compSessionId?: string | null;
}

const PRIORITY_STYLES: Record<string, { bg: string; text: string; border: string; label: TranslationKey }> = {
  high: {
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    border: 'border-red-500/30',
    label: 'setup_advice_priority_high',
  },
  medium: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    label: 'setup_advice_priority_medium',
  },
  low: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    label: 'setup_advice_priority_low',
  },
};

const CONFIDENCE_STYLES: Record<string, { text: string; label: TranslationKey }> = {
  high: { text: 'text-emerald-400', label: 'setup_advice_confidence_high' },
  medium: { text: 'text-amber-400', label: 'setup_advice_confidence_medium' },
  low: { text: 'text-gray-400', label: 'setup_advice_confidence_low' },
};

const BALANCE_STYLES: Record<string, { text: string; label: TranslationKey; icon: React.ReactNode }> = {
  understeer: {
    text: 'text-amber-400',
    label: 'setup_advice_balance_understeer',
    icon: <ArrowRight className="w-4 h-4" />,
  },
  oversteer: {
    text: 'text-red-400',
    label: 'setup_advice_balance_oversteer',
    icon: <ArrowRight className="w-4 h-4 rotate-180" />,
  },
  neutral: {
    text: 'text-emerald-400',
    label: 'setup_advice_balance_neutral',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  mixed: {
    text: 'text-purple-400',
    label: 'setup_advice_balance_mixed',
    icon: <Gauge className="w-4 h-4" />,
  },
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  brake_bias: <Gauge className="w-4 h-4" />,
  arb_front: <Wrench className="w-4 h-4" />,
  arb_rear: <Wrench className="w-4 h-4" />,
  tc: <Zap className="w-4 h-4" />,
  abs: <AlertTriangle className="w-4 h-4" />,
  wing: <ArrowRight className="w-4 h-4" />,
  ride_height: <Gauge className="w-4 h-4" />,
  camber: <Target className="w-4 h-4" />,
  pressure: <Gauge className="w-4 h-4" />,
  dampers: <Wrench className="w-4 h-4" />,
  electronics: <Zap className="w-4 h-4" />,
};

function RecommendationCard({ rec, t }: { rec: SetupRecommendation; t: (key: TranslationKey) => string }) {
  const [expanded, setExpanded] = useState(false);
  const priority = PRIORITY_STYLES[rec.priority] || PRIORITY_STYLES.medium;
  const confidence = CONFIDENCE_STYLES[rec.confidence] || CONFIDENCE_STYLES.medium;
  const categoryKey = `setup_advice_category_${rec.category}` as TranslationKey;
  const categoryLabel = t(categoryKey);
  const icon = CATEGORY_ICONS[rec.category] || <Wrench className="w-4 h-4" />;

  return (
    <div className={`rounded-xl border ${priority.border} ${priority.bg} overflow-hidden transition-all`}>
      {/* Card header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 text-left cursor-pointer hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2 rounded-lg ${priority.bg} ${priority.text} border ${priority.border} shrink-0`}>
            {icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-white font-telemetry truncate">
                {rec.parameter}
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${priority.text} ${priority.bg} border ${priority.border}`}>
                {t(priority.label)}
              </span>
            </div>
            <p className="text-xs text-gray-400 font-telemetry mt-0.5 truncate">
              {categoryLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-telemetry">
              {t('setup_advice_confidence_high').split(' ')[0]}
            </p>
            <p className={`text-xs font-bold font-telemetry ${confidence.text}`}>
              {t(confidence.label)}
            </p>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Suggested change banner */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
          <Lightbulb className="w-4 h-4 text-brand shrink-0" />
          <span className="text-xs font-bold text-brand font-telemetry">{rec.suggested_change}</span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
          {/* Reason */}
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-telemetry mb-1">
              {t('setup_advice_primary_issue')}
            </p>
            <p className="text-xs text-gray-300 leading-relaxed">{rec.reason}</p>
          </div>

          {/* Evidence */}
          {rec.evidence.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-telemetry mb-1.5">
                {t('setup_advice_evidence')}
              </p>
              <ul className="space-y-1">
                {rec.evidence.map((ev, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                    <span className="text-brand mt-0.5 shrink-0">•</span>
                    <span className="font-telemetry">{ev}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Affected corners */}
          {rec.affected_corners.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-telemetry mb-1.5">
                {t('setup_advice_affected_corners')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {rec.affected_corners.map((corner, i) => (
                  <span
                    key={i}
                    className="text-[10px] font-telemetry px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-300"
                  >
                    {corner}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const SetupAdvicePanel: React.FC<SetupAdvicePanelProps> = ({
  refLapId,
  compLapId,
  sessionId,
  refSessionId,
  compSessionId,
}) => {
  const { t, lang } = useLanguage();
  const [review, setReview] = useState<SetupAdviceReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waitingChatter = useWaitingChatter(loading, lang);

  const report: SetupAdviceReport | null = review?.report ?? null;
  const canLoad = Boolean(refLapId || compLapId || sessionId || refSessionId);

  const loadAdvice = async () => {
    if (!canLoad) return;
    try {
      setLoading(true);
      setError(null);
      const data = await fetchSetupAdviceReview(
        refLapId,
        compLapId,
        sessionId || undefined,
        lang,
        refSessionId || undefined,
        compSessionId || undefined
      );
      setReview(data);
    } catch (err) {
      setError(errorMessage(err, t('setup_advice_error')));
    } finally {
      setLoading(false);
    }
  };

  const balanceStyle = report ? BALANCE_STYLES[report.overall_balance] || BALANCE_STYLES.neutral : BALANCE_STYLES.neutral;
  const confidenceStyle = report ? CONFIDENCE_STYLES[report.confidence] || CONFIDENCE_STYLES.medium : CONFIDENCE_STYLES.medium;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-brand/10 border border-brand/30 text-brand">
            <Lightbulb className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white font-brand tracking-wide">
                {t('setup_advice_title')}
              </h3>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-white/5 border border-white/10 text-gray-400 font-telemetry">
                {t('setup_advice_badge_rules')}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 font-telemetry">
              {t('setup_advice_subtitle')}
            </p>
          </div>
        </div>
        <button
          onClick={loadAdvice}
          disabled={loading || !canLoad}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand/10 hover:bg-brand/20 border border-brand/30 text-brand text-xs font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : report ? (
            <RefreshCw className="w-3.5 h-3.5" />
          ) : (
            <Zap className="w-3.5 h-3.5" />
          )}
          <span>{report ? t('setup_advice_regenerate') : t('setup_advice_generate')}</span>
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
          <RefreshCw className="w-6 h-6 text-brand animate-spin" />
          <p className="text-xs text-gray-300 font-telemetry">{t('setup_advice_loading')}</p>
          <div className="p-3 rounded-lg bg-black/60 border border-brand/20 max-w-md mx-auto text-xs text-brand font-telemetry flex items-center gap-2.5 text-left shadow-inner">
            <Radio className="w-4 h-4 shrink-0 text-brand animate-pulse" />
            <span className="leading-relaxed">
              {waitingChatter ?? t('pep_thinking', { track: 'setup' })}
            </span>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800 text-red-200 text-xs">
          <p className="font-bold mb-1">{t('setup_advice_error')}</p>
          <p className="text-gray-400">{error}</p>
        </div>
      )}

      {/* Empty state (no report yet) */}
      {!report && !loading && !error && (
        <div className="p-6 rounded-xl bg-white/5 border border-white/10 text-center">
          <Lightbulb className="w-8 h-8 text-gray-600 mx-auto mb-2" />
          <p className="text-xs text-gray-400 font-telemetry">
            {t('setup_advice_generate')}
          </p>
        </div>
      )}

      {/* Report content */}
      {report && !loading && (
        <>
          {/* Summary banner */}
          <div className="glass-panel rounded-xl p-4 border-l-4 border-l-brand">
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-brand shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-300 leading-relaxed">{report.summary}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/5 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-telemetry">
                  {t('setup_advice_overall_balance')}:
                </span>
                <span className={`text-xs font-bold font-telemetry flex items-center gap-1 ${balanceStyle.text}`}>
                  {balanceStyle.icon}
                  {t(balanceStyle.label)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-telemetry">
                  {t('setup_advice_confidence_high').split(' ')[0]}:
                </span>
                <span className={`text-xs font-bold font-telemetry ${confidenceStyle.text}`}>
                  {t(confidenceStyle.label)}
                </span>
              </div>
            </div>
          </div>

          {/* Primary issue */}
          {report.primary_issue && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] text-amber-400/70 uppercase tracking-wider font-telemetry mb-0.5">
                  {t('setup_advice_primary_issue')}
                </p>
                <p className="text-xs text-amber-200">{report.primary_issue}</p>
              </div>
            </div>
          )}

          {/* Recommendations */}
          {report.recommendations.length > 0 ? (
            <div className="space-y-3">
              {report.recommendations.map((rec, i) => (
                <RecommendationCard key={i} rec={rec} t={t} />
              ))}
            </div>
          ) : (
            <div className="p-6 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-xs text-emerald-300 font-telemetry">{t('setup_advice_empty')}</p>
            </div>
          )}

          {/* Pep's review */}
          {review && review.pep_review && (
            <div className="rounded-xl border border-brand/30 bg-gradient-to-br from-brand/5 to-transparent overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-brand/20 bg-brand/5">
                <div className="p-1.5 rounded-lg bg-brand/10 border border-brand/30 text-brand">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-white font-brand tracking-wide">
                    {t('setup_advice_pep_review_title')}
                  </h4>
                  <p className="text-[10px] text-gray-400 font-telemetry">
                    {review.review_source === 'llm'
                      ? `${t('setup_advice_pep_review_llm')} · ${review.review_model ?? ''}`
                      : t('setup_advice_pep_review_rules')}
                  </p>
                </div>
                {review.review_source === 'llm' && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-brand uppercase tracking-wider font-telemetry">
                    <Bot className="w-3 h-3" />
                    AI
                  </span>
                )}
              </div>
              <div className="px-4 py-3">
                {renderFormattedMarkdown(review.pep_review)}
              </div>
            </div>
          )}

          {/* Footer hint */}
          {report.recommendations.length > 0 && (
            <p className="text-[10px] text-gray-500 text-center font-telemetry">
              {t('setup_advice_one_change_at_a_time')}
            </p>
          )}
        </>
      )}
    </div>
  );
};
