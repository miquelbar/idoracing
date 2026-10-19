import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AIDebriefDrawer } from '../components/AIDebriefDrawer';
import { TelemetryCharts } from '../components/TelemetryCharts';
import { UnifiedTrackInspector } from '../components/UnifiedTrackInspector';
import { fetchCoachReport, sendChatMessage } from '../services/api';
import { useLanguage } from '../i18n';
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
  isDebriefOpen: boolean;
  onOpenDebrief: () => void;
  onCloseDebrief: () => void;
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
  isDebriefOpen,
  onOpenDebrief,
  onCloseDebrief,
}) => {
  const { lang, t } = useLanguage();
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Live Team Radio Chat Messages contextualized to current track and car
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        lang === 'en'
          ? `Pit wall radio check. I'm Pep, your Performance Engineering Partner at **${comparison.track_name || 'track'}** with the **${comparison.car_name || 'car'}**.\n\nSelect any corner to evaluate braking points, trail braking, and apex speeds, or ask me directly over the radio.`
          : `Copiado en el muro por radio. Soy Pep, tu ingeniero de pista en **${comparison.track_name || 'pista'}** con el **${comparison.car_name || 'vehículo'}**.\n\nPuedes seleccionar cualquier curva para evaluar puntos de frenada, trail braking y velocidades de paso, o preguntarme directamente por la radio.`,
    },
  ]);
  const [chatLoading, setChatLoading] = useState(false);

  const handleGenerateDebrief = async (forceRefresh = false) => {
    try {
      setLoadingReport(true);
      setReportError(null);
      const rep = await fetchCoachReport(
        comparison.ref_lap_id,
        comparison.comp_lap_id,
        forceRefresh,
        comparison.session_id
      );
      onReportGenerated(rep);
    } catch (err: any) {
      setReportError(err?.message || (lang === 'en' ? 'Error generating technical report' : 'Error al generar el informe'));
    } finally {
      setLoadingReport(false);
    }
  };

  const handleSendChatMessage = async (msgText?: string) => {
    const textToSend = (msgText || '').trim();
    if (!textToSend || chatLoading) return;

    const newMsgs: ChatMessage[] = [...chatMessages, { role: 'user', content: textToSend }];
    setChatMessages(newMsgs);
    setChatLoading(true);

    try {
      const res = await sendChatMessage(
        newMsgs,
        comparison.ref_lap_id,
        comparison.comp_lap_id,
        comparison.track_name,
        comparison.car_name,
        selectedCorner
          ? {
              corner_number: selectedCorner.corner_number,
              name: selectedCorner.name,
              delta_time: selectedCorner.delta_time,
              v_min_ref: selectedCorner.v_min_ref,
              v_min_comp: selectedCorner.v_min_comp,
              delta_v_min: selectedCorner.delta_v_min,
              v_entry_ref: selectedCorner.v_entry_ref,
              v_entry_comp: selectedCorner.v_entry_comp,
              delta_v_entry: selectedCorner.delta_v_entry,
              v_exit_ref: selectedCorner.v_exit_ref,
              v_exit_comp: selectedCorner.v_exit_comp,
              delta_v_exit: selectedCorner.delta_v_exit,
              comp_gear: selectedCorner.comp_gear,
              gear_eval: selectedCorner.gear_eval,
              balance_eval: selectedCorner.balance_eval,
              trail_braking_eval: selectedCorner.trail_braking_eval,
              racing_line_eval: selectedCorner.racing_line_eval,
              racing_line_advice: selectedCorner.racing_line_advice,
            }
          : undefined,
        lang
      );
      setChatMessages((prev) => [...prev, { role: 'assistant', content: res.content }]);
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            lang === 'en'
              ? 'Radio communication error. Please ensure local backend server is operational.'
              : 'Error de comunicación en radio. Comprueba que el servidor local esté activo.',
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const [debriefTab, setDebriefTab] = useState<'debrief' | 'radio'>('debrief');

  const handleAskAboutCorner = (corner: CornerDTO) => {
    const isEn = lang === 'en';
    const question = isEn
      ? `How can I optimize Turn ${corner.corner_number} (${corner.name})? I lost ${
          corner.delta_time > 0 ? '+' : ''
        }${corner.delta_time.toFixed(3)}s. Telemetry diagnosis: ${corner.balance_eval} and ${corner.gear_eval}.`
      : `¿Cómo puedo optimizar la Curva ${corner.corner_number} (${corner.name})? He cedido ${
          corner.delta_time > 0 ? '+' : ''
        }${corner.delta_time.toFixed(3)}s. La telemetría detecta: ${corner.balance_eval} y ${corner.gear_eval}.`;
    setDebriefTab('radio');
    onOpenDebrief();
    handleSendChatMessage(question);
  };

  return (
    <div className="flex flex-col gap-2 h-full min-h-0 overflow-hidden">
      {comparison.telemetry_source === 'synthetic' && (
        <div
          role="status"
          className="shrink-0 flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-200"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <span>
            <strong className="text-amber-100">{t('synthetic_banner_title')}</strong> {t('synthetic_banner_body')}
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 flex-1 min-h-0 overflow-hidden">
        {/* 1. Left Column (~58% = 7 cols): Canales de Telemetría Sincronizados de arriba a abajo */}
        <div className="lg:col-span-7 flex flex-col h-full min-h-0 overflow-hidden">
          <TelemetryCharts
            comparison={comparison}
            hoverDistance={hoverDistance}
            onHoverDistance={onHoverDistance}
            selectedCorner={selectedCorner}
            onResetZoom={() => onSelectCorner(null)}
          />
        </div>

        {/* 2. Right Column (~42% = 5 cols): Un solo Visor Unificado de Pista & Curvas */}
        <div className="lg:col-span-5 flex flex-col h-full min-h-0 overflow-hidden">
          <UnifiedTrackInspector
            comparison={comparison}
            selectedCorner={selectedCorner}
            onSelectCorner={onSelectCorner}
            hoverDistance={hoverDistance}
            onHoverDistance={onHoverDistance}
            onAskEngineerAboutCorner={handleAskAboutCorner}
          />
        </div>

        {/* 3. Slide-over AI Debrief & Live Team Radio Drawer */}
        <AIDebriefDrawer
          isOpen={isDebriefOpen}
          onClose={onCloseDebrief}
          report={report}
          loadingReport={loadingReport}
          reportError={reportError}
          onGenerateDebrief={handleGenerateDebrief}
          activeModel={activeModel}
          chatMessages={chatMessages}
          chatLoading={chatLoading}
          onSendMessage={handleSendChatMessage}
          selectedCorner={selectedCorner}
          trackName={comparison.track_name}
          carName={comparison.car_name}
          initialTab={debriefTab}
        />
      </div>
    </div>
  );
};
