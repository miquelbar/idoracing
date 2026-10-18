import React, { useState } from 'react';
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
  const { lang } = useLanguage();
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Live Team Radio Chat Messages contextualized to current track and car
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        lang === 'en'
          ? `Radio channel open at **${comparison.track_name || 'track'}** with the **${comparison.car_name || 'car'}**.\n\nYou can select any corner to evaluate braking technique, trail braking and racing line, or talk to me directly over the radio.`
          : `Canal de radio abierto en **${comparison.track_name || 'pista'}**. He procesado la telemetría del **${comparison.car_name || 'vehículo'}**.\n\nPuedes seleccionar cualquier curva para evaluar tu técnica de frenada, trail braking y trazada, o preguntarme directamente por la radio.`,
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
        forceRefresh
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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 h-full min-h-0 overflow-hidden">
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
  );
};
