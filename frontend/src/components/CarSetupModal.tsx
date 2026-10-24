import React, { useEffect, useState } from 'react';
import { RefreshCw, Wrench, X } from 'lucide-react';
import { fetchCarSetup } from '../services/api';
import type { CarSetupData } from '../types/telemetry';
import { CarSetupInspector } from './CarSetupInspector';
import { SetupAdvicePanel } from './SetupAdvicePanel';
import { useLanguage } from '../i18n';
import { errorMessage } from '../utils/formatters';

interface CarSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId?: string | null;
  refLapId?: string | null;
  compLapId?: string | null;
  refSessionId?: string | null;
  compSessionId?: string | null;
}

export const CarSetupModal: React.FC<CarSetupModalProps> = ({
  isOpen,
  onClose,
  sessionId,
  refLapId,
  compLapId,
  refSessionId,
  compSessionId,
}) => {
  const { t } = useLanguage();
  const [setup, setSetup] = useState<CarSetupData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchCarSetup(sessionId || undefined, refLapId, compLapId, refSessionId, compSessionId)
      .then((data) => {
        if (isMounted) setSetup(data);
      })
      .catch((err) => {
        if (isMounted) setError(errorMessage(err, 'No se pudo cargar el reglaje del coche'));
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      isMounted = false;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, sessionId, refLapId, compLapId, refSessionId, compSessionId, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-[#0A0D14] border border-[#1E2638] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-white/10 bg-[#0E121D] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-brand/10 border border-brand/30 text-brand">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-telemetry">
                {t('car_setup_title')}
              </h3>
              <p className="text-[11px] text-gray-400 font-telemetry">
                {sessionId || 'Sesión activa'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white transition cursor-pointer"
            title={t('close_setup_modal')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {loading && !setup && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <RefreshCw className="w-8 h-8 text-brand animate-spin mb-3" />
              <p className="text-sm text-gray-400 font-telemetry">Cargando configuración de la telemetría...</p>
            </div>
          )}

          {error && (
            <div className="p-5 rounded-xl bg-red-950/40 border border-red-800 text-red-200 text-xs">
              <p className="font-bold mb-1">Error al obtener reglajes</p>
              <p className="text-gray-400">{error}</p>
            </div>
          )}

          {setup && !loading && (
            <>
              <CarSetupInspector setup={setup} />

              {/* Structured setup advice from Pep, based on telemetry */}
              <div className="mt-6 pt-6 border-t border-white/10">
                <SetupAdvicePanel
                  refLapId={refLapId || setup.ref_lap_id || (setup.ref_lap_number ? `Lap ${setup.ref_lap_number}` : null)}
                  compLapId={compLapId || setup.comp_lap_id || (setup.comp_lap_number ? `Lap ${setup.comp_lap_number}` : null)}
                  sessionId={sessionId || setup.session_id || null}
                  refSessionId={refSessionId || setup.ref_session_id || null}
                  compSessionId={compSessionId || setup.comp_session_id || null}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
