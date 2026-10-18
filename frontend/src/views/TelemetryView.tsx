import React, { useState } from 'react';
import { AIDebriefDrawer } from '../components/AIDebriefDrawer';
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
  const [isDebriefOpen, setIsDebriefOpen] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Live Team Radio Chat Messages
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Canal de radio abierto. He procesado la telemetría de tus vueltas. Selecciona cualquier curva para ver la trazada y el análisis técnico o pregúntame directamente.',
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
      setReportError(err?.message || 'Error al generar el informe con el modelo local');
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
    setIsDebriefOpen(true);
    handleSendChatMessage(question);
  };

  return (
    <div className="flex flex-col h-full gap-2.5 min-h-0 select-none">
      {/* 1. Timing Tower (Compact ribbon: ~44px) */}
      <TimingTower
        comparison={comparison}
        compact={true}
        onOpenDebrief={() => setIsDebriefOpen(true)}
        reportAvailable={!!report}
      />

      {/* 2. Compact Track Map Panel (~175px on laptop, aspect ratio preserved) */}
      <div className="h-[175px] sm:h-[185px] w-full shrink-0">
        <TrackMap
          comparison={comparison}
          hoverDistance={hoverDistance}
          onHoverDistance={onHoverDistance}
          selectedCorner={selectedCorner}
          onSelectCorner={onSelectCorner}
          compact={true}
        />
      </div>

      {/* 3. Lower 50/50 Split Deck: Synchronized Telemetry Channels (Left) & Corner/Trazada Inspector (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-h-0 items-stretch">
        {/* Left Column (6 cols): Canales de Telemetría Sincronizados */}
        <div className="lg:col-span-6 flex flex-col h-full min-h-0 overflow-hidden">
          <TelemetryCharts
            comparison={comparison}
            hoverDistance={hoverDistance}
            onHoverDistance={onHoverDistance}
            selectedCorner={selectedCorner}
            onResetZoom={() => onSelectCorner(null)}
          />
        </div>

        {/* Right Column (6 cols): Inspector de Curva, Trazada Real vs Óptima SVG, y Diagnóstico IA */}
        <div className="lg:col-span-6 flex flex-col h-full min-h-0 overflow-hidden">
          <CornerInspector
            corners={comparison.corners}
            selectedCorner={selectedCorner}
            onSelectCorner={onSelectCorner}
            onAskEngineerAboutCorner={handleAskAboutCorner}
          />
        </div>
      </div>

      {/* 4. Slide-over AI Debrief & Live Team Radio Drawer */}
      <AIDebriefDrawer
        isOpen={isDebriefOpen}
        onClose={() => setIsDebriefOpen(false)}
        report={report}
        loadingReport={loadingReport}
        reportError={reportError}
        onGenerateDebrief={handleGenerateDebrief}
        activeModel={activeModel}
        chatMessages={chatMessages}
        chatLoading={chatLoading}
        onSendMessage={handleSendChatMessage}
        selectedCorner={selectedCorner}
      />
    </div>
  );
};
