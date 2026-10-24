import React, { useRef, useState } from 'react';
import { AlertTriangle, FolderSearch, HelpCircle, Sparkles, Upload } from 'lucide-react';
import { AIDebriefDrawer } from '../components/AIDebriefDrawer';
import { TelemetryCharts } from '../components/TelemetryCharts';
import { UnifiedTrackInspector } from '../components/UnifiedTrackInspector';
import { fetchCoachReport, rescanSimulators, sendChatMessage, uploadTelemetryFile } from '../services/api';
import { useLanguage } from '../i18n';
import type {
  ChatMessage,
  CoachReport,
  ComparisonResponse,
  CornerDTO,
} from '../types/telemetry';
import { errorMessage, formatLapTime } from '../utils/formatters';

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
  showIdealGhost?: boolean;
  onToggleIdealGhost?: () => void;
  onSessionUploaded?: (sessionId: string) => void;
  onRescanComplete?: () => void;
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
  showIdealGhost = false,
  onToggleIdealGhost,
  onSessionUploaded,
  onRescanComplete,
}) => {
  const { lang, t } = useLanguage();
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [actionStatus, setActionStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
        comparison.session_id,
        comparison.ref_session_id,
        comparison.comp_session_id
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

  const handleUploadTraceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingFile(true);
      setActionStatus(null);
      const res = await uploadTelemetryFile(file);
      setActionStatus({
        type: 'ok',
        msg: lang === 'en'
          ? `File "${file.name}" imported (${res.track || comparison.track_name}).`
          : `Archivo "${file.name}" importado correctamente (${res.track || comparison.track_name}).`,
      });
      if (res.session_id && onSessionUploaded) {
        onSessionUploaded(res.session_id);
      }
    } catch (err) {
      setActionStatus({
        type: 'err',
        msg: errorMessage(err, t('err_upload')),
      });
    } finally {
      setUploadingFile(false);
    }
  };

  const handleRescanFolders = async () => {
    try {
      setRescanning(true);
      setActionStatus(null);
      const res = await rescanSimulators();
      setActionStatus({
        type: 'ok',
        msg: lang === 'en'
          ? `Scan complete: ${res.imported} new session(s) imported.`
          : `Escaneo completado: ${res.imported} sesión(es) nueva(s) detectada(s).`,
      });
      if (onRescanComplete) {
        onRescanComplete();
      }
    } catch (err) {
      setActionStatus({
        type: 'err',
        msg: errorMessage(err, 'Error escaneando carpetas de simuladores'),
      });
    } finally {
      setRescanning(false);
    }
  };

  const hasTelemetryTraces =
    comparison.has_telemetry !== false &&
    comparison.telemetry_source !== 'none' &&
    Array.isArray(comparison.distance) &&
    comparison.distance.length > 0;

  const gameUpper = (comparison.game_name || 'ACC').toUpperCase();
  const isLMU = gameUpper.includes('MANS') || gameUpper.includes('LMU');
  const isIRacing = gameUpper.includes('IRACING');
  const isACEvo = gameUpper.includes('EVO');

  const s1Ref = comparison.ref_sectors?.['S1'] || 0;
  const s1Comp = comparison.comp_sectors?.['S1'] || 0;
  const s2Ref = comparison.ref_sectors?.['S2'] || 0;
  const s2Comp = comparison.comp_sectors?.['S2'] || 0;
  const s3Ref = comparison.ref_sectors?.['S3'] || 0;
  const s3Comp = comparison.comp_sectors?.['S3'] || 0;
  const hasRealSectors = (s1Ref + s1Comp + s2Ref + s2Comp + s3Ref + s3Comp) > 0.05;

  return (
    <div className="flex flex-col gap-2 h-full min-h-0 overflow-hidden">
      {comparison.is_demo && comparison.telemetry_source === 'synthetic' && (
        <div
          role="status"
          className="shrink-0 flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-200"
        >
          <Sparkles className="w-4 h-4 shrink-0 text-cyan-400" />
          <span>
            <strong className="text-cyan-100">
              {lang === 'en' ? 'Interactive Demo Session (Valencia):' : 'Sesión Demo Interactiva (Valencia):'}
            </strong>{' '}
            {lang === 'en'
              ? 'Simulated reference telemetry for exploring the workspace.'
              : 'Telemetría de demostración cargada explícitamente para explorar el analizador.'}
          </span>
        </div>
      )}

      {!hasTelemetryTraces ? (
        <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center p-4">
          <div className="max-w-3xl w-full rounded-2xl border border-amber-500/30 bg-[#0B0F19] p-6 shadow-2xl space-y-5">
            {/* Warning Header */}
            <div className="flex items-start gap-3.5 border-b border-white/10 pb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-amber-200 tracking-wide">
                  {lang === 'en'
                    ? '⚠️ These laps only contain timed splits (no 50Hz telemetry channels)'
                    : '⚠️ Estas vueltas solo contienen tiempos cronometrados (sin canales de telemetría a 50Hz)'}
                </h2>
                <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                  {lang === 'en'
                    ? 'To analyze braking points, trail braking, GPS racing line and corner-by-corner diagnostics without inventing data, enable telemetry export in your simulator.'
                    : 'Para analizar puntos de frenada, trail braking, trazada GPS y diagnóstico por curva sin inventar datos, activa la exportación de telemetría en tu simulador.'}
                </p>
              </div>
            </div>

            {/* Real Lap Times & Sectors Summary */}
            <div className="rounded-xl bg-[#111726] border border-white/10 p-4 space-y-3 font-telemetry">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4 text-xs">
                  <span className="px-2.5 py-1 rounded-md bg-brand/15 border border-brand/40 text-brand font-bold">
                    REF · P1 (V{comparison.ref_lap_id ?? 1}): {formatLapTime(comparison.ref_lap_time)}
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-comp/15 border border-comp/40 text-[#D8B4FE] font-bold">
                    COMP · P2 (V{comparison.comp_lap_id ?? 2}): {formatLapTime(comparison.comp_lap_time)}
                  </span>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-md text-xs font-black border ${
                    comparison.delta_time_total > 0
                      ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  }`}
                >
                  Δ (P2 vs P1): {comparison.delta_time_total > 0 ? '+' : ''}
                  {comparison.delta_time_total.toFixed(3)}s
                </span>
              </div>

              {hasRealSectors && (
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5 text-[11px]">
                  {(['S1', 'S2', 'S3'] as const).map((sec) => {
                    const rVal = comparison.ref_sectors?.[sec] || 0;
                    const cVal = comparison.comp_sectors?.[sec] || 0;
                    const dVal = cVal - rVal;
                    return (
                      <div key={sec} className="rounded-lg bg-black/30 p-2 border border-white/5 flex items-center justify-between">
                        <span className="text-gray-400 font-bold">{sec}</span>
                        <span className="text-gray-300">
                          {rVal > 0 ? `${rVal.toFixed(3)}s` : '—'} vs {cVal > 0 ? `${cVal.toFixed(3)}s` : '—'}
                        </span>
                        {rVal > 0 && cVal > 0 && (
                          <span className={dVal > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                            {dVal > 0 ? '+' : ''}{dVal.toFixed(3)}s
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Simulator-Specific Activation Guide */}
            <div className="rounded-xl bg-[#0E1422] border border-brand/25 p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-brand uppercase tracking-wider font-telemetry">
                <HelpCircle className="w-4 h-4" />
                <span>
                  {lang === 'en'
                    ? `Step-by-Step Telemetry Activation Guide (${comparison.game_name || 'Simulator'})`
                    : `Guía Paso a Paso de Activación en ${comparison.game_name || 'tu Simulador'}`}
                </span>
              </div>

              {isLMU ? (
                <ol className="list-decimal pl-5 space-y-1.5 text-xs text-gray-200 leading-relaxed">
                  <li>
                    En <strong>Le Mans Ultimate</strong>, los archivos XML de <code className="text-brand">UserData/Log/Results/</code> solo guardan tiempos por vuelta y sectores.
                  </li>
                  <li>
                    Para grabar canales a 50Hz (velocidad, pedales, volante y GPS), activa el plugin de exportación <strong>MoTeC (.ld)</strong> en la configuración de LMU / DAMPlugin.
                  </li>
                  <li>
                    Vincula o sube el archivo <code className="text-brand">.ld</code> generado junto a la sesión para desbloquear las gráficas y el diagnóstico por curva.
                  </li>
                </ol>
              ) : isIRacing ? (
                <ol className="list-decimal pl-5 space-y-1.5 text-xs text-gray-200 leading-relaxed">
                  <li>
                    Dentro del coche en <strong>iRacing</strong>, pulsa <strong className="text-brand">Alt + L</strong> para activar la grabación de telemetría (icono <code className="text-brand">TELEM</code> encendido en pantalla).
                  </li>
                  <li>
                    iRacing guardará los archivos <code className="text-brand">.ibt</code> en <code className="text-gray-300">Documents/iRacing/telemetry/</code>.
                  </li>
                  <li>
                    Exporta o sube el archivo <code className="text-brand">.ld</code> / <code className="text-brand">.csv</code> aquí abajo para analizar la trazada.
                  </li>
                </ol>
              ) : isACEvo ? (
                <ol className="list-decimal pl-5 space-y-1.5 text-xs text-gray-200 leading-relaxed">
                  <li>
                    Entra a pista en <strong>Assetto Corsa EVO</strong> y abre <strong>Car Setup → Electronics</strong>.
                  </li>
                  <li>
                    Sube el parámetro <strong className="text-brand">Telemetry Laps</strong> de <code className="text-rose-400">0</code> a <strong className="text-emerald-300">10–20 vueltas</strong>.
                  </li>
                  <li>
                    Al volver a boxes, AC EVO guardará los archivos <code className="text-brand">.ld</code> en <code className="text-gray-300">Saved Games/ACE/MoTec/</code>.
                  </li>
                </ol>
              ) : (
                <ol className="list-decimal pl-5 space-y-1.5 text-xs text-gray-200 leading-relaxed">
                  <li>
                    Entra a pista en <strong>Assetto Corsa Competizione (ACC)</strong> y abre <strong>Car Setup</strong>.
                  </li>
                  <li>
                    Ve a la pestaña <strong>Electronics</strong> (o <strong>Fuel &amp; Strategy</strong>).
                  </li>
                  <li>
                    Sube <strong className="text-brand">Telemetry Laps</strong> de <code className="text-rose-400">0</code> a <strong className="text-emerald-300">10–20 vueltas</strong>.
                  </li>
                  <li>
                    Al volver a boxes, ACC guardará automáticamente los archivos <code className="text-brand">.ld</code> y <code className="text-brand">.ldx</code> en <code className="text-gray-300">Documents/Assetto Corsa Competizione/MoTeC/</code> (o ruta Proton en Linux).
                  </li>
                </ol>
              )}
            </div>

            {actionStatus && (
              <div
                className={`p-3 rounded-lg text-xs font-telemetry border ${
                  actionStatus.type === 'ok'
                    ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-950/50 border-rose-500/40 text-rose-200'
                }`}
              >
                {actionStatus.msg}
              </div>
            )}

            {/* Direct Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <input
                ref={fileInputRef}
                type="file"
                accept=".ld,.csv,.xml"
                onChange={handleUploadTraceFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-light text-black font-bold text-xs tracking-wide transition cursor-pointer shadow-lg disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                <span>
                  {uploadingFile
                    ? (lang === 'en' ? 'Uploading...' : 'Subiendo archivo...')
                    : (lang === 'en' ? '📂 Upload .ld / .csv file for this session' : '📂 Subir archivo .ld / .csv para esta sesión')}
                </span>
              </button>

              <button
                type="button"
                onClick={handleRescanFolders}
                disabled={rescanning}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/15 font-bold text-xs tracking-wide transition cursor-pointer disabled:opacity-50"
              >
                <FolderSearch className="w-4 h-4 text-brand" />
                <span>
                  {rescanning
                    ? (lang === 'en' ? 'Scanning folders...' : 'Escaneando carpetas...')
                    : (lang === 'en' ? '🔍 Rescan Steam / MoTeC folders' : '🔍 Escanear carpetas de Steam / MoTeC de nuevo')}
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 flex-1 min-h-0 overflow-hidden">
          {/* 1. Left Column (~58% = 7 cols): Canales de Telemetría Sincronizados de arriba a abajo */}
          <div className="lg:col-span-7 flex flex-col h-full min-h-0 overflow-hidden">
            <TelemetryCharts
              comparison={comparison}
              hoverDistance={hoverDistance}
              onHoverDistance={onHoverDistance}
              selectedCorner={selectedCorner}
              onResetZoom={() => onSelectCorner(null)}
              showIdealGhost={showIdealGhost}
              onToggleIdealGhost={onToggleIdealGhost}
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
        </div>
      )}

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
        comparison={comparison}
        initialTab={debriefTab}
      />
    </div>
  );
};
