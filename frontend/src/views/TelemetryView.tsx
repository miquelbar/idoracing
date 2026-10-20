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
import { errorMessage } from '../utils/formatters';

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
      content: t('telemetry_radio_intro', {
        track: comparison.track_name || t('fallback_track'),
        car: comparison.car_name || t('fallback_car'),
      }),
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
    } catch (err) {
      setReportError(errorMessage(err, t('report_error')));
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
              braking_point_delta: selectedCorner.braking_point_delta,
              throttle_pickup_delta: selectedCorner.throttle_pickup_delta,
              diagnosis: selectedCorner.diagnosis,
              excess_steer_deg: selectedCorner.excess_steer_deg,
              steer_to_g: selectedCorner.steer_to_g,
              kerb_strike_detected: selectedCorner.kerb_strike_detected,
              damping_advice: selectedCorner.damping_advice,
            }
          : undefined,
        lang
      );
      setChatMessages((prev) => [...prev, { role: 'assistant', content: res.content }]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: t('radio_error_backend'),
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const [debriefTab, setDebriefTab] = useState<'debrief' | 'radio'>('debrief');

  const handleAskAboutCorner = (corner: CornerDTO) => {
    const question = t('ask_about_corner_question', {
      num: corner.corner_number,
      name: corner.name,
      delta: `${corner.delta_time > 0 ? '+' : ''}${corner.delta_time.toFixed(3)}`,
      balance: corner.balance_eval ?? '',
      gear: corner.gear_eval ?? '',
    });
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
