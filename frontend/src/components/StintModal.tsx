import React, { useEffect } from 'react';
import { TrendingDown, X } from 'lucide-react';
import { StintDegradationView } from './StintDegradationView';

interface StintModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId?: string | null;
  refLapNumber: number;
  compLapNumber: number;
  onSelectRefLap: (lap: number) => void;
  onSelectCompLap: (lap: number) => void;
}

export const StintModal: React.FC<StintModalProps> = ({
  isOpen,
  onClose,
  sessionId,
  refLapNumber,
  compLapNumber,
  onSelectRefLap,
  onSelectCompLap,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-[#0A0D14] border border-[#1E2638] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E2638] bg-[#0E121D]/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand/20 border border-brand/40 flex items-center justify-center text-brand">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-brand font-black text-white text-base tracking-wide">
                  EVOLUCIÓN DE STINT & DEGRADACIÓN
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand/10 border border-brand/30 text-brand font-telemetry">
                  MURO DE BOXES
                </span>
              </div>
              <p className="text-xs text-gray-400 font-telemetry mt-0.5">
                Regresión matemática de ritmo por vuelta, desbalance de neumáticos y estrategia táctica
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer border border-transparent hover:border-white/10"
            title="Cerrar modal (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content Scrollable Area */}
        <div className="p-6 overflow-y-auto max-h-[calc(92vh-80px)] space-y-6">
          <StintDegradationView
            sessionId={sessionId}
            refLapNumber={refLapNumber}
            compLapNumber={compLapNumber}
            onSelectRefLap={onSelectRefLap}
            onSelectCompLap={onSelectCompLap}
            onGoToTelemetry={onClose}
          />
        </div>
      </div>
    </div>
  );
};
