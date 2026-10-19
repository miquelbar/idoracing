import React, { useCallback, useEffect, useState } from 'react';
import {
  Calendar,
  ChevronRight,
  Clock,
  RefreshCw,
  Trophy,
} from 'lucide-react';
import { fetchLapHistory } from '../services/api';
import type { LapHistoryData } from '../types/telemetry';
import { translate, useLanguage } from '../i18n';
import { errorMessage } from '../utils/formatters';

const formatSpeed = (kmh: number | null) => (kmh === null ? '—' : `${kmh} km/h`);

interface SetupHistoryViewProps {
  selectedSessionId: string | null;
  trackName: string;
  carName: string;
  onGoToTelemetry: () => void;
}

export const SetupHistoryView: React.FC<SetupHistoryViewProps> = ({
  selectedSessionId,
  trackName,
  carName,
  onGoToTelemetry,
}) => {
  const { t } = useLanguage();
  const [historyData, setHistoryData] = useState<LapHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCompLapNum, setSelectedCompLapNum] = useState<number | null>(null);

  const loadData = useCallback(async (compLap?: number) => {
    try {
      setLoading(true);
      setError(null);
      const hist = await fetchLapHistory(selectedSessionId || undefined, compLap);
      setHistoryData(hist);
    } catch (err) {
      setError(errorMessage(err, translate('err_load_history')));
    } finally {
      setLoading(false);
    }
  }, [selectedSessionId]);

  useEffect(() => {
    loadData(selectedCompLapNum ?? undefined);
  }, [loadData, selectedCompLapNum]);

  if (loading && !historyData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <RefreshCw className="w-8 h-8 text-brand animate-spin mb-3" />
        <p className="text-sm text-gray-400">{t('loading_history_setup')}</p>
      </div>
    );
  }

  if (error || !historyData) {
    return (
      <div className="p-6 rounded-xl bg-red-950/40 border border-red-800 text-red-200 text-sm">
        <p className="font-bold mb-1">{t('could_not_load_data')}</p>
        <p className="text-xs text-gray-400">{error || t('history_not_available')}</p>
        <button
          onClick={() => loadData()}
          className="mt-3 px-3 py-1.5 rounded bg-white/10 hover:bg-white/15 text-xs text-white cursor-pointer"
        >
          {t('retry')}
        </button>
      </div>
    );
  }

  const pb = historyData.pb_lap;
  const comp = historyData.comparison_lap || (historyData.laps.length > 1 ? historyData.laps[1] : pb);
  const isSelf = comp.lap_number === pb.lap_number;

  return (
    <div className="space-y-6">
      {/* 1. Header: Comparative Overview */}
      <div className="glass-panel rounded-xl p-5 border-l-4 border-l-best flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-4 h-4 text-best" />
            <h3 className="text-lg font-black text-white uppercase tracking-wide">
              {t('pb_vs_history_title')}
            </h3>
          </div>
          <p className="text-xs text-gray-400">
            {trackName} • {carName} • {t('pb_vs_history_desc')}
          </p>
        </div>

        <button
          onClick={onGoToTelemetry}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand hover:bg-brand-light text-black text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-md self-start md:self-auto"
        >
          <span>{t('open_in_telemetry')}</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Top Split: PB Card vs Comparison Lap Card + Sector Deltas */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* PB Lap Card (4 cols) */}
        <div className="md:col-span-4 p-5 rounded-xl bg-gradient-to-b from-[#141C29] to-[#0A0D14] border border-best/40 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="px-2 py-0.5 rounded bg-best/20 text-best font-telemetry font-bold text-[10px] tracking-wider uppercase border border-best/30 flex items-center gap-1">
              <Trophy className="w-3 h-3" />
              {t('pb_title')}
            </span>
            <span className="text-[11px] text-gray-400 font-telemetry">{t('lap_word')} #{pb.lap_number}</span>
          </div>

          <div className="text-3xl font-black font-telemetry text-white mb-2 drop-shadow-md">
            {pb.lap_time_str}
          </div>

          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/10 font-telemetry text-xs">
            <div>
              <span className="text-[10px] text-gray-400 block">S1</span>
              <span className="text-white font-bold">{pb.sector_times[0]?.toFixed(3) || '--'}s</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 block">S2</span>
              <span className="text-white font-bold">{pb.sector_times[1]?.toFixed(3) || '--'}s</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 block">S3</span>
              <span className="text-white font-bold">{pb.sector_times[2]?.toFixed(3) || '--'}s</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-gray-400 font-telemetry mt-3 pt-2 border-t border-white/5">
            <span>{t('vmax_label')}: <strong className="text-white">{formatSpeed(pb.v_max)}</strong></span>
            <span>{t('date_col')}: {pb.date}</span>
          </div>
        </div>

        {/* Comparison Lap Card (4 cols) */}
        <div className="md:col-span-4 p-5 rounded-xl bg-gradient-to-b from-[#181528] to-[#0A0D14] border border-comp/40 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="px-2 py-0.5 rounded bg-comp/20 text-comp font-telemetry font-bold text-[10px] tracking-wider uppercase border border-comp/30 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {t('comp_lap_title')}
            </span>
            <span className="text-[11px] text-gray-400 font-telemetry">{t('lap_word')} #{comp.lap_number}</span>
          </div>

          <div className="text-3xl font-black font-telemetry text-white mb-2 drop-shadow-md">
            {comp.lap_time_str}
          </div>

          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/10 font-telemetry text-xs">
            <div>
              <span className="text-[10px] text-gray-400 block">S1</span>
              <span className="text-white font-bold">{comp.sector_times[0]?.toFixed(3) || '--'}s</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 block">S2</span>
              <span className="text-white font-bold">{comp.sector_times[1]?.toFixed(3) || '--'}s</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 block">S3</span>
              <span className="text-white font-bold">{comp.sector_times[2]?.toFixed(3) || '--'}s</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-gray-400 font-telemetry mt-3 pt-2 border-t border-white/5">
            <span>{t('vmax_label')}: <strong className="text-white">{formatSpeed(comp.v_max)}</strong></span>
            <span>{t('date_col')}: {comp.date}</span>
          </div>
        </div>

        {/* Delta Card (4 cols) */}
        <div className="md:col-span-4 p-5 rounded-xl bg-[#0C0F17] border border-white/10 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
              {t('diff_vs_pb')}
            </span>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-3xl font-black font-telemetry ${
                  isSelf
                    ? 'text-gray-400'
                    : historyData.delta_total > 0
                    ? 'text-loss-light'
                    : 'text-gain'
                }`}
              >
                {isSelf ? '0.000s' : `${historyData.delta_total > 0 ? '+' : ''}${historyData.delta_total.toFixed(3)}s`}
              </span>
              <span className="text-xs text-gray-400 font-telemetry">
                {isSelf ? t('same_lap') : historyData.delta_total > 0 ? t('slower_than_pb') : t('faster_than_pb')}
              </span>
            </div>
          </div>

          {/* Sector by Sector Delta */}
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/10 font-telemetry text-xs">
            <div className="p-2 rounded bg-black/40 border border-white/5 text-center">
              <span className="text-[9px] text-gray-400 block">Δ S1</span>
              <span className={historyData.delta_s1 > 0 ? 'text-loss-light font-bold' : 'text-gain font-bold'}>
                {historyData.delta_s1 > 0 ? '+' : ''}{historyData.delta_s1.toFixed(3)}s
              </span>
            </div>
            <div className="p-2 rounded bg-black/40 border border-white/5 text-center">
              <span className="text-[9px] text-gray-400 block">Δ S2</span>
              <span className={historyData.delta_s2 > 0 ? 'text-loss-light font-bold' : 'text-gain font-bold'}>
                {historyData.delta_s2 > 0 ? '+' : ''}{historyData.delta_s2.toFixed(3)}s
              </span>
            </div>
            <div className="p-2 rounded bg-black/40 border border-white/5 text-center">
              <span className="text-[9px] text-gray-400 block">Δ S3</span>
              <span className={historyData.delta_s3 > 0 ? 'text-loss-light font-bold' : 'text-gain font-bold'}>
                {historyData.delta_s3 > 0 ? '+' : ''}{historyData.delta_s3.toFixed(3)}s
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Laps History Table */}
      <div className="glass-panel rounded-xl p-4 overflow-hidden">
        <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-brand" />
          {t('laps_history_title')}
        </h4>

        <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
          {historyData.laps.map((lap) => {
            const isPB = lap.is_pb;
            const isSelected = lap.lap_number === comp.lap_number;

            return (
              <div
                key={`hist-lap-${lap.lap_number}`}
                onClick={() => setSelectedCompLapNum(lap.lap_number)}
                className={`p-3 rounded-lg border transition flex items-center justify-between gap-4 cursor-pointer ${
                  isSelected
                    ? 'bg-comp/15 border-comp/50 shadow-sm'
                    : isPB
                    ? 'bg-best/10 border-best/40'
                    : 'bg-[#0A0E17] border-white/5 hover:border-white/15'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-telemetry font-bold text-xs ${
                      isPB ? 'bg-best text-black' : 'bg-black/50 text-white border border-white/10'
                    }`}
                  >
                    #{lap.lap_number}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-telemetry text-sm font-bold text-white">{lap.lap_time_str}</span>
                      {isPB && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-best/20 text-best border border-best/40">
                          PB
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-gray-400 font-telemetry">
                      <span>S1: {lap.sector_times[0]?.toFixed(3) || '--'}s</span>
                      <span>S2: {lap.sector_times[1]?.toFixed(3) || '--'}s</span>
                      <span>S3: {lap.sector_times[2]?.toFixed(3) || '--'}s</span>
                      <span>• {t('vmax_label')}: {formatSpeed(lap.v_max)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 font-telemetry text-xs">
                  <span className={lap.gap_to_pb === 0 ? 'text-best font-bold' : 'text-loss-soft'}>
                    {lap.gap_to_pb === 0 ? '0.000s' : `+${lap.gap_to_pb.toFixed(3)}s`}
                  </span>
                  <button
                    className={`px-2.5 py-1 rounded text-[11px] font-bold transition ${
                      isSelected ? 'bg-comp text-white' : 'bg-white/5 hover:bg-white/10 text-gray-300'
                    }`}
                  >
                    {isSelected ? t('comparing_btn') : t('compare_btn')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};
