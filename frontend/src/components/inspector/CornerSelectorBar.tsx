import React, { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Map } from 'lucide-react';
import type { CornerDTO } from '../../types/telemetry';
import { useLanguage } from '../../i18n';

interface CornerSelectorBarProps {
  corners: CornerDTO[];
  selectedCorner: CornerDTO | null;
  onSelectCorner: (corner: CornerDTO | null) => void;
}

/** Overview button plus a scrollable strip of T1, T2... pills. */
export const CornerSelectorBar: React.FC<CornerSelectorBarProps> = ({ corners, selectedCorner, onSelectCorner }) => {
  const { t } = useLanguage();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pillRefs = useRef<{ [key: number]: HTMLButtonElement | null }>({});

  // Autoscroll carousel when selectedCorner changes
  useEffect(() => {
    if (selectedCorner) {
      const el = pillRefs.current[selectedCorner.corner_number];
      if (el) {
        el.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        });
      }
    }
  }, [selectedCorner]);

  const handleCarouselWheel = (e: React.WheelEvent<HTMLDivElement>) => {
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

  return (
    <div className="flex items-center gap-1.5 shrink-0 select-text">
      {/* Botón [Vista General] */}
      <button
        onClick={() => onSelectCorner(null)}
        className={`px-2.5 py-1 rounded-lg text-xs font-telemetry font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
          selectedCorner === null
            ? 'bg-[#00D2BE] text-[#07090E] shadow-[0_0_12px_rgba(0,210,190,0.4)] ring-1 ring-white/20'
            : 'bg-[#0E121B] hover:bg-[#151B27] text-gray-300 hover:text-white border border-white/5'
        }`}
        title={t('view_full_circuit')}
      >
        <Map className="w-3.5 h-3.5" />
        <span>{t('overview_btn')}</span>
      </button>

      <span className="text-gray-600 font-thin">|</span>

      {/* Carousel Container with Scroll Controls */}
      <div className="relative flex-1 min-w-0 flex items-center">
        <button
          onClick={scrollLeft}
          type="button"
          className="w-5 h-6 rounded bg-black/60 hover:bg-[#B138FE] text-white flex items-center justify-center text-xs opacity-70 hover:opacity-100 transition cursor-pointer shrink-0 mr-1"
          title={t('scroll_left_hint')}
        >
          <ChevronLeft className="w-3 h-3" />
        </button>

        <div
          ref={scrollContainerRef}
          onWheel={handleCarouselWheel}
          className="flex items-center gap-1 overflow-x-auto py-0.5 scroll-smooth scrollbar-none flex-1 min-w-0"
          style={{ scrollbarWidth: 'none' }}
        >
          {corners.map((c) => {
            const isSelected = selectedCorner?.corner_number === c.corner_number;
            const lost = c.delta_time > 0.05;
            const gained = c.delta_time < -0.05;

            return (
              <button
                key={`pill-${c.corner_number}`}
                ref={(el) => {
                  pillRefs.current[c.corner_number] = el;
                }}
                onClick={() => onSelectCorner(c)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-telemetry font-bold transition flex items-center gap-1 shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-[#B138FE] text-white shadow-[0_0_10px_rgba(177,56,254,0.4)] ring-1 ring-white/30'
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
          className="w-5 h-6 rounded bg-black/60 hover:bg-[#B138FE] text-white flex items-center justify-center text-xs opacity-70 hover:opacity-100 transition cursor-pointer shrink-0 ml-1"
          title={t('scroll_right_hint')}
        >
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
