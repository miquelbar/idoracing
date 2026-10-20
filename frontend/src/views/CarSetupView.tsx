import React, { useEffect, useState } from 'react';
import { ChevronRight, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { fetchCarSetup } from '../services/api';
import type { CarSetupData } from '../types/telemetry';
import { CarSetupInspector } from '../components/CarSetupInspector';
import { useLanguage } from '../i18n';
import { errorMessage } from '../utils/formatters';

interface CarSetupViewProps {
  selectedSessionId: string | null;
  trackName: string;
  carName: string;
  onGoToTelemetry: () => void;
}

export const CarSetupView: React.FC<CarSetupViewProps> = ({
  selectedSessionId,
  trackName: _trackName,
  carName: _carName,
  onGoToTelemetry,
}) => {
  const { t } = useLanguage();
  const [setup, setSetup] = useState<CarSetupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSetup = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchCarSetup(selectedSessionId || undefined);
      setSetup(data);
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cargar la configuración del vehículo'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSetup();
  }, [selectedSessionId]);

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
          onClick={loadSetup}
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
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-brand/10 border border-brand/30 text-brand">
            <SlidersHorizontal className="w-4 h-4" />
          </div>
          <h2 className="text-lg font-bold text-white font-brand tracking-wide">
            {t('car_setup_title')}
          </h2>
        </div>

        <button
          onClick={onGoToTelemetry}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand hover:bg-brand-light text-black text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-md"
        >
          <span>{t('open_in_telemetry')}</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <CarSetupInspector setup={setup} />
    </div>
  );
};
