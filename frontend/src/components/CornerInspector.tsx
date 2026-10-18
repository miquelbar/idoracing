import React from 'react';
import type { CornerDTO } from '../types/telemetry';
import { RacingLineVisualizer } from './RacingLineVisualizer';
import {
  ChevronLeft,
  ChevronRight,
  Compass,
  Gauge,
  Sparkles,
  Sliders,
  Zap,
} from 'lucide-react';

interface CornerInspectorProps {
  corners: CornerDTO[];
  selectedCorner: CornerDTO | null;
  onSelectCorner: (corner: CornerDTO | null) => void;
  onAskEngineerAboutCorner?: (corner: CornerDTO) => void;
}

export const CornerInspector: React.FC<CornerInspectorProps> = ({
  corners,
  selectedCorner,
  onSelectCorner,
  onAskEngineerAboutCorner,
}) => {
  if (corners.length === 0) return null;

  const activeCorner = selectedCorner || corners[0];
  const activeIdx = corners.findIndex((c) => c.corner_number === activeCorner.corner_number);

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const pillRefs = React.useRef<{ [key: number]: HTMLButtonElement | null }>({});

  React.useEffect(() => {
    const el = pillRefs.current[activeCorner.corner_number];
    if (el) {
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [activeCorner.corner_number]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollContainerRef.current && e.deltaY !== 0) {
      scrollContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -140, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 140, behavior: 'smooth' });
    }
  };

  const handlePrev = () => {
    const prevIdx = activeIdx > 0 ? activeIdx - 1 : corners.length - 1;
    onSelectCorner(corners[prevIdx]);
  };

  const handleNext = () => {
    const nextIdx = activeIdx < corners.length - 1 ? activeIdx + 1 : 0;
    onSelectCorner(corners[nextIdx]);
  };

  const isTimeLost = activeCorner.delta_time > 0.05;
  const isTimeGained = activeCorner.delta_time < -0.05;

  return (
    <div className="glass-panel rounded-xl p-3 sm:p-3.5 flex flex-col h-full space-y-2.5 overflow-hidden">
      {/* Top: Corner Carousel / Selector Bar (Pinned) */}
      <div className="shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-[#00D2BE]" />
            <h3 className="font-bold text-xs text-white uppercase tracking-wider">
              Análisis Curva a Curva & Trazada (T1 — T{corners.length})
            </h3>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrev}
              title="Curva anterior"
              className="p-1 rounded bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleNext}
              title="Curva siguiente"
              className="p-1 rounded bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Carousel Container with explicit scroll buttons & smooth scroll */}
        <div className="relative group/carousel">
          <button
            onClick={scrollLeft}
            type="button"
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-black/80 hover:bg-[#B138FE] text-white border border-white/20 flex items-center justify-center text-xs opacity-75 hover:opacity-100 transition shadow-md cursor-pointer"
            title="Desplazar curvas hacia la izquierda"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <div
            ref={scrollContainerRef}
            onWheel={handleWheel}
            className="flex items-center gap-1.5 overflow-x-auto px-7 py-1 scroll-smooth scrollbar-thin"
            style={{ scrollbarWidth: 'thin' }}
          >
            {corners.map((c) => {
              const isSelected = c.corner_number === activeCorner.corner_number;
              const lost = c.delta_time > 0.05;
              const gained = c.delta_time < -0.05;

              return (
                <button
                  key={`pill-${c.corner_number}`}
                  ref={(el) => {
                    pillRefs.current[c.corner_number] = el;
                  }}
                  onClick={() => onSelectCorner(c)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-telemetry font-bold transition flex items-center gap-1.5 flex-shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-[#B138FE] text-white shadow-[0_0_12px_rgba(177,56,254,0.4)] ring-1 ring-white/30'
                      : 'bg-[#0E121B] hover:bg-[#151B27] text-gray-400 hover:text-white border border-white/5'
                  }`}
                >
                  <span>T{c.corner_number}</span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      gained ? 'bg-[#00FF7F]' : lost ? 'bg-[#FF1801]' : 'bg-gray-500'
                    }`}
                  />
                </button>
              );
            })}
          </div>

          <button
            onClick={scrollRight}
            type="button"
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-black/80 hover:bg-[#B138FE] text-white border border-white/20 flex items-center justify-center text-xs opacity-75 hover:opacity-100 transition shadow-md cursor-pointer"
            title="Desplazar curvas hacia la derecha"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable Content Body */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1">
        {/* Active Corner Header Info */}
        <div className="p-2.5 sm:p-3 rounded-xl bg-[#090D15] border border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-[#B138FE] text-white font-telemetry font-black text-xs flex items-center justify-center shadow-md">
              T{activeCorner.corner_number}
            </span>
            <div>
            <h4 className="text-sm font-bold text-white tracking-wide">{activeCorner.name}</h4>
            <div className="flex items-center gap-3 text-[11px] font-telemetry text-gray-400 mt-0.5">
              <span>
                V. Vértice: <strong className="text-white">{activeCorner.v_min_comp.toFixed(0)} km/h</strong>{' '}
                <span className="text-gray-500">(Ref: {activeCorner.v_min_ref.toFixed(0)} km/h)</span>
              </span>
              <span>•</span>
              <span>
                ΔV min:{' '}
                <strong className={activeCorner.delta_v_min >= 0 ? 'text-[#00FF7F]' : 'text-[#FF1801]'}>
                  {activeCorner.delta_v_min > 0 ? '+' : ''}
                  {activeCorner.delta_v_min.toFixed(1)} km/h
                </strong>
              </span>
            </div>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] text-gray-400 font-telemetry block uppercase">Diferencia Curva</span>
          <span
            className={`text-sm font-black font-telemetry px-2 py-0.5 rounded ${
              isTimeGained
                ? 'bg-[#00FF7F]/15 text-[#00FF7F]'
                : isTimeLost
                ? 'bg-[#FF1801]/15 text-[#FF4D4D]'
                : 'bg-white/5 text-gray-300'
            }`}
          >
            {activeCorner.delta_time > 0 ? '+' : ''}
            {activeCorner.delta_time.toFixed(3)}s
          </span>
        </div>
      </div>

      {/* Visual Trazada SVG Comparison */}
      <RacingLineVisualizer corner={activeCorner} />

      {/* 4 Performance Pillars: Trazada, Marcha, Subviraje, Trail Braking */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* Pillar 1: Trazada */}
        <div className="p-3 rounded-lg bg-[#07090E] border border-white/5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <Compass className="w-3 h-3 text-[#00D2BE]" />
              Trazada & Ápice
            </span>
            <span className="text-[10px] font-telemetry font-bold px-1.5 py-0.5 rounded bg-white/5 text-[#00D2BE]">
              {activeCorner.racing_line_eval || 'Óptima'}
            </span>
          </div>
          <p className="text-[11px] text-gray-300 leading-snug">
            {activeCorner.racing_line_advice || activeCorner.diagnosis}
          </p>
        </div>

        {/* Pillar 2: Marcha Utilizada */}
        <div className="p-3 rounded-lg bg-[#07090E] border border-white/5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <Sliders className="w-3 h-3 text-amber-400" />
              Marcha en Vértice
            </span>
            <span
              className={`text-[10px] font-telemetry font-bold px-1.5 py-0.5 rounded ${
                (activeCorner.gear_eval || '').includes('Óptima')
                  ? 'bg-[#00FF7F]/15 text-[#00FF7F]'
                  : 'bg-amber-400/15 text-amber-300'
              }`}
            >
              {activeCorner.comp_gear ? `${activeCorner.comp_gear}ª Marcha` : '3ª Marcha'} • {activeCorner.gear_eval || 'Óptima'}
            </span>
          </div>
          <p className="text-[11px] text-gray-300 leading-snug">
            {activeCorner.gear_advice || `Marcha ${activeCorner.comp_gear || 3}ª recomendada para entrega óptima de par.`}
          </p>
        </div>

        {/* Pillar 3: Subviraje vs Sobreviraje */}
        <div className="p-3 rounded-lg bg-[#07090E] border border-white/5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <Gauge className="w-3 h-3 text-cyan-400" />
              Balance Dinámico
            </span>
            <span
              className={`text-[10px] font-telemetry font-bold px-1.5 py-0.5 rounded ${
                (activeCorner.balance_eval || '').includes('Subviraje')
                  ? 'bg-[#FF1801]/15 text-[#FF7B72]'
                  : (activeCorner.balance_eval || '').includes('Sobreviraje')
                  ? 'bg-amber-400/15 text-amber-300'
                  : 'bg-[#00FF7F]/15 text-[#00FF7F]'
              }`}
            >
              {activeCorner.balance_eval || 'Equilibrio Neutro'}
            </span>
          </div>
          <p className="text-[11px] text-gray-300 leading-snug">
            {activeCorner.balance_advice || 'Adherencia homogénea en ambos ejes durante el apoyo lateral.'}
          </p>
        </div>

        {/* Pillar 4: Trail Braking */}
        <div className="p-3 rounded-lg bg-[#07090E] border border-white/5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <Zap className="w-3 h-3 text-[#E10600]" />
              Trail Braking
            </span>
            <span
              className={`text-[10px] font-telemetry font-bold px-1.5 py-0.5 rounded ${
                (activeCorner.trail_braking_eval || '').includes('Efectivo')
                  ? 'bg-[#00FF7F]/15 text-[#00FF7F]'
                  : (activeCorner.trail_braking_eval || '').includes('Soltado') || (activeCorner.trail_braking_eval || '').includes('Exceso')
                  ? 'bg-amber-400/15 text-amber-300'
                  : 'bg-white/5 text-gray-400'
              }`}
            >
              {activeCorner.trail_braking_eval || 'Óptimo'}
            </span>
          </div>
          <p className="text-[11px] text-gray-300 leading-snug">
            {activeCorner.trail_braking_advice || 'Modulación progresiva adecuada en fase de aproximación.'}
          </p>
        </div>
      </div>

      {/* Direct AI Engineer Corner Consultation Button */}
      {onAskEngineerAboutCorner && (
        <button
          onClick={() => onAskEngineerAboutCorner(activeCorner)}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-gradient-to-r from-[#00D2BE]/15 to-[#B138FE]/15 hover:from-[#00D2BE]/25 hover:to-[#B138FE]/25 border border-[#00D2BE]/30 hover:border-[#00D2BE]/60 text-xs font-bold text-white transition cursor-pointer shadow-sm group"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#00D2BE] group-hover:rotate-12 transition-transform" />
          <span>Preguntar al Ingeniero IA sobre la Curva {activeCorner.corner_number} ({activeCorner.name})</span>
        </button>
      )}
      </div>
    </div>
  );
};
