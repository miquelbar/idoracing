import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Cpu,
  FileText,
  Lightbulb,
  RefreshCw,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { fetchCoachReport } from '../services/api';
import type { CoachReport } from '../types/telemetry';

interface AIEngineerModalProps {
  isOpen: boolean;
  onClose: () => void;
  refLapId: string;
  compLapId: string;
  report: CoachReport | null;
  onReportGenerated: (report: CoachReport) => void;
}

export const AIEngineerModal: React.FC<AIEngineerModalProps> = ({
  isOpen,
  onClose,
  refLapId,
  compLapId,
  report,
  onReportGenerated,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);
      const rep = await fetchCoachReport(refLapId, compLapId, forceRefresh);
      onReportGenerated(rep);
    } catch (err: any) {
      setError(err?.message || 'Error generando informe de telemetría');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0D111A] border border-[#2A364F] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-[#111723]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#B138FE]/20 border border-[#B138FE]/40 flex items-center justify-center text-[#B138FE]">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Debrief del Ingeniero de Pista F1
                <span className="text-[10px] font-telemetry uppercase px-2 py-0.5 rounded bg-[#00D2BE]/20 text-[#00D2BE] border border-[#00D2BE]/30">
                  {report?.model_used || 'IA Local'}
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                Análisis técnico basado en telemetría determinista y modelo local Ollama
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {error && (
            <div className="p-4 rounded-lg bg-red-950/50 border border-red-800 text-red-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!report && !loading && (
            <div className="py-12 text-center flex flex-col items-center justify-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#B138FE]/10 border border-[#B138FE]/30 flex items-center justify-center text-[#B138FE]">
                <Sparkles className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Debrief listo para generar</h3>
                <p className="text-xs text-gray-400 max-w-md mt-1">
                  El ingeniero de pista procesará la telemetría espacial de ambas vueltas, identificará los
                  puntos de pérdida de tiempo y estructurará un plan de acción para tu próxima tanda.
                </p>
              </div>
              <button
                onClick={() => handleGenerate(false)}
                className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#B138FE] to-[#7928CA] hover:from-[#C084FC] hover:to-[#8B5CF6] text-white text-xs font-bold uppercase tracking-wider transition shadow-[0_0_20px_rgba(177,56,254,0.4)] cursor-pointer"
              >
                Generar Debrief F1 con IA
              </button>
            </div>
          )}

          {loading && (
            <div className="py-16 text-center flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 border-3 border-[#00D2BE] border-t-transparent rounded-full animate-spin" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-white">Analizando telemetría multicanal...</p>
                <p className="text-xs text-gray-400 font-telemetry">
                  Procesando ápices, frenadas regresivas e inferencia local en Ollama
                </p>
              </div>
            </div>
          )}

          {report && !loading && (
            <div className="space-y-4">
              {/* Summary Banner */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-[#161D2C] to-[#0F141F] border border-[#2D3A52] text-sm text-gray-200 leading-relaxed font-sans shadow-sm">
                <span className="font-bold text-[#00D2BE] block mb-1 uppercase tracking-wider text-xs">
                  Resumen Ejecutivo del Ingeniero ({report.confidence || 'Alta'} Confianza):
                </span>
                {report.raw_report ? report.raw_report.split('\n\n')[0] : 'Análisis telemétrico completado.'}
              </div>

              {/* Section 1: Facts */}
              <div className="p-4 rounded-xl bg-[#0F131C] border border-white/5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#FFD700] uppercase tracking-wider">
                  <FileText className="w-4 h-4" />
                  <span>1. Hechos Observados (Factos Críticos)</span>
                </div>
                <ul className="space-y-1.5 pl-4 list-disc text-xs text-gray-300">
                  {(report.facts || []).map((fact, idx) => (
                    <li key={`fact-${idx}`}>{fact}</li>
                  ))}
                </ul>
              </div>

              {/* Section 2: Supporting Metrics */}
              <div className="p-4 rounded-xl bg-[#0F131C] border border-white/5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#00D2BE] uppercase tracking-wider">
                  <Target className="w-4 h-4" />
                  <span>2. Métricas de Apoyo (Telemetría de Precisión)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 font-telemetry text-xs">
                  {Object.entries(report.metrics || {}).map(([key, val]) => {
                    const label = key.replace(/_/g, ' ').toUpperCase();
                    let valStr = String(val);
                    if (typeof val === 'number') {
                      valStr = val > 0 ? `+${val.toFixed(3)}s` : `${val.toFixed(3)}s`;
                    } else if (typeof val === 'object' && val !== null) {
                      valStr = Object.entries(val)
                        .map(([k, v]) => {
                          const num = Number(v);
                          return `${k.replace(/sector_?(\d+)/i, 'S$1').toUpperCase()}: ${!isNaN(num) && num > 0 ? '+' : ''}${!isNaN(num) ? num.toFixed(3) : String(v)}s`;
                        })
                        .join(' | ');
                    }
                    return (
                      <div key={key} className="p-2.5 rounded bg-[#151B27] border border-white/5">
                        <span className="text-[10px] text-gray-400 block mb-0.5">{label}</span>
                        <span className="text-white font-bold text-xs">{valStr}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 3: Technical Hypothesis */}
              <div className="p-4 rounded-xl bg-[#0F131C] border border-white/5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#B138FE] uppercase tracking-wider">
                  <Lightbulb className="w-4 h-4" />
                  <span>3. Hipótesis Técnica (Causa Raíz)</span>
                </div>
                <div className="space-y-1.5 text-xs text-gray-300 leading-relaxed">
                  {(report.hypotheses || []).map((hypo, idx) => (
                    <p key={`hypo-${idx}`}>• {hypo}</p>
                  ))}
                </div>
              </div>

              {/* Section 4: Track Exercises */}
              <div className="p-4 rounded-xl bg-[#0F131C] border border-white/5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#00FF7F] uppercase tracking-wider">
                  <CheckCircle className="w-4 h-4" />
                  <span>4. Ejercicios de Pista (Plan de Acción Concreto)</span>
                </div>
                <ul className="space-y-1.5 pl-4 list-decimal text-xs text-gray-300">
                  {(report.exercises || []).map((ex, idx) => (
                    <li key={`ex-${idx}`}>{ex}</li>
                  ))}
                </ul>
              </div>

              {/* Section 5: Verification Indicator */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-[#00D2BE]/10 to-transparent border border-[#00D2BE]/30 space-y-1.5">
                <span className="text-xs font-bold text-[#00D2BE] uppercase tracking-wider block">
                  5. Indicador de Verificación (Objetivo Próxima Vuelta):
                </span>
                <p className="text-xs text-gray-200">{report.verification_indicator}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3 border-t border-white/10 bg-[#111723] flex items-center justify-between">
          <span className="text-xs text-gray-400 font-telemetry">
            {report?.created_at ? `Generado: ${new Date(report.created_at).toLocaleTimeString()}` : ''}
          </span>

          <div className="flex items-center gap-3">
            {report && (
              <button
                onClick={() => handleGenerate(true)}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#18202F] hover:bg-[#202B3F] border border-[#2D3A52] text-xs text-gray-300 transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#00D2BE]" />
                Regenerar Debrief
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
