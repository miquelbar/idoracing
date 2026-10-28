import React, { useEffect, useState } from 'react';
import { ChevronRight, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { fetchCarSetup } from '../services/api';
import type { CarSetupData } from '../types/telemetry';
import { CarSetupInspector } from '../components/CarSetupInspector';
import { SetupAdvicePanel } from '../components/SetupAdvicePanel';
import { useLanguage } from '../i18n';
import { errorMessage } from '../utils/formatters';

interface CarSetupViewProps {
  selectedSessionId: string | null;
  trackName: string;
  carName: string;
  refLapId: string | null;
  compLapId: string | null;
  refSessionId?: string | null;
  compSessionId?: string | null;
  onGoToTelemetry: () => void;
}

export const CarSetupView: React.FC<CarSetupViewProps> = ({
  selectedSessionId,
  trackName: _trackName,
  carName: _carName,
  refLapId,
  compLapId,
  refSessionId,
  compSessionId,
  onGoToTelemetry,
}) => {
  const { t } = useLanguage();
  const [setup, setSetup] = useState<CarSetupData | null>(null);
  const [selectedSetupFile, setSelectedSetupFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSetup = async (customSetup?: string | null) => {
    try {
      setLoading(true);
      setError(null);
      const activeSetupTarget = customSetup !== undefined ? customSetup : selectedSetupFile;
      const data = await fetchCarSetup(
        selectedSessionId || undefined,
        refLapId,
        compLapId,
        refSessionId,
        compSessionId,
        activeSetupTarget
      );
      setSetup(data);
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cargar la configuración del vehículo'));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSetup = (fileName: string) => {
    setSelectedSetupFile(fileName);
    loadSetup(fileName);
  };

  useEffect(() => {
    setSelectedSetupFile(null);
    loadSetup(null);
  }, [selectedSessionId, refLapId, compLapId, refSessionId, compSessionId]);

  if (loading && !setup) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <RefreshCw className="w-8 h-8 text-brand animate-spin mb-3" />
        <p className="text-sm text-gray-400 font-telemetry">{t('loading_history_setup')}</p>
      </div>
    );
  }

  if (error || !setup) {
    return (
      <div className="p-6 rounded-2xl bg-red-950/40 border border-red-800 text-red-200 text-sm">
        <p className="font-bold mb-1">{t('could_not_load_data')}</p>
        <p className="text-xs text-gray-400">{error || 'Configuración no disponible'}</p>
        <button
          onClick={() => loadSetup()}
          className="mt-3 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white cursor-pointer font-telemetry"
        >
          {t('retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top action row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-brand/10 border border-brand/30 text-brand">
            <SlidersHorizontal className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white font-brand tracking-wide">
              {t('car_setup_title')}
            </h2>
            <p className="text-[11px] text-gray-400 font-telemetry">
              En AC EVO y AC Rally, recuerda pulsar &quot;Guardar Setup&quot; en el garaje del simulador (.carsetup / .ini) para vincular los reglajes mecánicos estáticos.
            </p>
          </div>
        </div>

        <button
          onClick={onGoToTelemetry}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand hover:bg-brand-light text-black text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-md"
        >
          <span>{t('open_in_telemetry')}</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <CarSetupInspector setup={setup} onSelectSetup={handleSelectSetup} />

      {/* Structured setup advice from Pep, based on telemetry */}
      <SetupAdvicePanel
        refLapId={refLapId || setup.ref_lap_id || (setup.ref_lap_number ? `Lap ${setup.ref_lap_number}` : null)}
        compLapId={compLapId || setup.comp_lap_id || (setup.comp_lap_number ? `Lap ${setup.comp_lap_number}` : null)}
        sessionId={selectedSessionId || setup.session_id || null}
        refSessionId={refSessionId || setup.ref_session_id || null}
        compSessionId={compSessionId || setup.comp_session_id || null}
      />
    </div>
  );
};
