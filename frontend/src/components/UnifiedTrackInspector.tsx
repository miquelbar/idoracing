import React, { useMemo, useRef, useEffect } from 'react';
import type { ComparisonResponse, CornerDTO } from '../types/telemetry';
import { useLanguage } from '../i18n';
import {
  ChevronLeft,
  ChevronRight,
  Compass,
  Sliders,
  Map,
  CornerDownRight,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Sparkles,
} from 'lucide-react';

interface UnifiedTrackInspectorProps {
  comparison: ComparisonResponse;
  selectedCorner: CornerDTO | null;
  onSelectCorner: (corner: CornerDTO | null) => void;
  hoverDistance: number | null;
  onHoverDistance?: (dist: number | null) => void;
  onAskEngineerAboutCorner?: (corner: CornerDTO) => void;
}

export const UnifiedTrackInspector: React.FC<UnifiedTrackInspectorProps> = ({
  comparison,
  selectedCorner,
  onSelectCorner,
  hoverDistance,
  onHoverDistance,
  onAskEngineerAboutCorner,
}) => {
  const { t } = useLanguage();
  const corners = comparison.corners || [];
  const svgRef = useRef<SVGSVGElement>(null);
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

  // 1. Static Full Track Geometry with TIGHT Bounding Box (occupies ~90-95% of container)
  const staticTrack = useMemo(() => {
    const xs = comparison.track_x || [];
    const ys = comparison.track_y || [];
    const dists = comparison.distance || [];
    const deltas = comparison.delta_speed || [];

    if (xs.length === 0 || ys.length === 0) {
      return null;
    }

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;

    // Match physical aspect ratio tightly
    const normWidth = 600;
    const pad = 24; // minimal padding for corner labels
    const scale = (normWidth - pad * 2) / spanX;
    const normHeight = Math.max(220, Math.round(spanY * scale + pad * 2));

    const toSvg = (x: number, y: number) => ({
      x: pad + (x - minX) * scale,
      y: normHeight - (pad + (y - minY) * scale), // invert Cartesian Y for screen
    });

    const svgPts: Array<{ x: number; y: number; dist: number }> = [];
    for (let i = 0; i < xs.length; i++) {
      const pt = toSvg(xs[i], ys[i]);
      svgPts.push({ x: pt.x, y: pt.y, dist: dists[i] || 0 });
    }

    // Heatmap segments
    const segments: Array<{ d: string; color: string; speedDelta: number }> = [];
    const step = 3;
    for (let i = 0; i < xs.length - step; i += step) {
      const p1 = svgPts[i];
      const p2 = svgPts[i + step];
      const avgDelta = deltas[i] || 0;

      let color = '#798299';
      if (avgDelta > 8) color = '#00FF7F';
      else if (avgDelta > 2) color = '#00D2BE';
      else if (avgDelta < -8) color = '#FF1801';
      else if (avgDelta < -2) color = '#FF7B72';

      segments.push({
        d: `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} L ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`,
        color,
        speedDelta: avgDelta,
      });
    }

    // Corner positions
    const cornerPoints = corners.map((c) => {
      let closestIdx = 0;
      let minDiff = 999999;
      for (let i = 0; i < dists.length; i++) {
        const diff = Math.abs(dists[i] - c.apex_distance);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }
      const pt = svgPts[closestIdx] || toSvg(0, 0);
      return {
        ...c,
        svgX: pt.x,
        svgY: pt.y,
      };
    });

    // Full continuous outline for mini-map
    let fullOutline = '';
    if (svgPts.length > 0) {
      fullOutline =
        `M ${svgPts[0].x.toFixed(1)} ${svgPts[0].y.toFixed(1)} ` +
        svgPts.slice(1).map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
        ' Z';
    }

    return {
      width: normWidth,
      height: normHeight,
      viewBox: `0 0 ${normWidth} ${normHeight}`,
      svgPts,
      segments,
      cornerPoints,
      fullOutline,
    };
  }, [comparison.track_x, comparison.track_y, comparison.distance, comparison.delta_speed, corners]);

  // Car Cursor indicator on full track map
  const carPoint = useMemo(() => {
    if (hoverDistance === null || !staticTrack || staticTrack.svgPts.length === 0) return null;

    const dists = comparison.distance || [];
    if (dists.length === 0) return null;

    let low = 0;
    let high = dists.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (dists[mid] < hoverDistance) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const idx = Math.max(0, Math.min(dists.length - 1, low));
    return staticTrack.svgPts[idx] || null;
  }, [hoverDistance, staticTrack, comparison.distance]);

  // Track map scrubber
  const handleTrackMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onHoverDistance || !staticTrack || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * staticTrack.width;
    const mouseY = ((e.clientY - rect.top) / rect.height) * staticTrack.height;

    let minSqDist = 40 * 40;
    let nearestDist: number | null = null;

    for (let i = 0; i < staticTrack.svgPts.length; i += 3) {
      const pt = staticTrack.svgPts[i];
      const dx = pt.x - mouseX;
      const dy = pt.y - mouseY;
      const sq = dx * dx + dy * dy;
      if (sq < minSqDist) {
        minSqDist = sq;
        nearestDist = pt.dist;
      }
    }

    if (nearestDist !== null) {
      onHoverDistance(nearestDist);
    }
  };

  const handleTrackMouseLeave = () => {
    if (onHoverDistance) onHoverDistance(null);
  };

  // Identify corner with worst time loss for overview card
  const worstCorner = useMemo(() => {
    if (corners.length === 0) return null;
    return corners.reduce((worst, c) => (c.delta_time > (worst?.delta_time || -999) ? c : worst), corners[0]);
  }, [corners]);

  // Active Corner geometry for zoomed view
  const cornerSvgData = selectedCorner?.racing_line_svg;
  const isLeft = cornerSvgData?.turn_dir === 'left';
  const hasSubviraje = cornerSvgData?.has_subviraje;
  const isEarlyApex = (selectedCorner?.racing_line_eval || '').includes('Prematuro');
  const isOptimal = (selectedCorner?.racing_line_eval || '').includes('Óptima');

  // Overall lap delta
  const totalGap = comparison.delta_time && comparison.delta_time.length > 0
    ? comparison.delta_time[comparison.delta_time.length - 1]
    : 0;

  return (
    <div className="glass-panel rounded-xl p-3 flex flex-col h-full gap-2 overflow-hidden">
      {/* ================= FILA 1: SELECTOR T1, T2... + BOTÓN VISTA GENERAL ================= */}
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

      {/* ================= FILA 2: DATOS CLAVE EN UNA LÍNEA (FIJA) ================= */}
      {selectedCorner ? (
        <div className="px-3 py-1.5 rounded-lg bg-[#090D15] border border-white/5 flex items-center justify-between text-xs font-telemetry shrink-0 select-text gap-2">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="px-1.5 py-0.5 rounded bg-[#B138FE] text-white font-black text-[11px] shadow-sm shrink-0">
              T{selectedCorner.corner_number}
            </span>
            <span className="font-bold text-white tracking-wide shrink-0">
              {selectedCorner.name}
            </span>
            <span className="text-gray-500 shrink-0">•</span>
            <span className="text-gray-300 shrink-0">
              {t('apex_speed')}: <strong className="text-white">{selectedCorner.v_min_comp.toFixed(0)} km/h</strong>{' '}
              <span className="text-gray-500">(Ref: {selectedCorner.v_min_ref.toFixed(0)} km/h)</span>
            </span>
            <span className="text-gray-500 shrink-0">•</span>
            <span className="shrink-0">
              {t('delta_v_min')}:{' '}
              <strong className={selectedCorner.delta_v_min >= 0 ? 'text-[#00FF7F]' : 'text-[#FF1801]'}>
                {selectedCorner.delta_v_min > 0 ? '+' : ''}
                {selectedCorner.delta_v_min.toFixed(1)} km/h
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`px-2 py-0.5 rounded font-black font-telemetry text-xs ${
                selectedCorner.delta_time < -0.05
                  ? 'bg-[#00FF7F]/15 text-[#00FF7F]'
                  : selectedCorner.delta_time > 0.05
                  ? 'bg-[#FF1801]/15 text-[#FF7B72]'
                  : 'bg-white/5 text-gray-300'
              }`}
            >
              {selectedCorner.delta_time > 0 ? '+' : ''}
              {selectedCorner.delta_time.toFixed(3)}s
            </span>

            {onAskEngineerAboutCorner && (
              <button
                onClick={() => onAskEngineerAboutCorner(selectedCorner)}
                className="p-1 rounded bg-[#00D2BE]/10 hover:bg-[#00D2BE]/20 text-[#00D2BE] border border-[#00D2BE]/30 transition cursor-pointer"
                title={t('consult_engineer_hint')}
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="px-3 py-1.5 rounded-lg bg-[#090D15] border border-white/5 flex items-center justify-between text-xs font-telemetry shrink-0 select-text">
          <div className="flex items-center gap-2.5">
            <span className="px-1.5 py-0.5 rounded bg-[#00D2BE]/20 text-[#00D2BE] font-bold text-[10px] tracking-wider uppercase">
              {comparison.game_name || t('circuit_label')}
            </span>
            <strong className="text-white">{comparison.track_name || t('circuit_label')}</strong>
            <span className="text-gray-500">•</span>
            <span className="text-gray-400">
              {((comparison.distance?.[comparison.distance.length - 1] || 4000) / 1000).toFixed(3)} km
            </span>
            <span className="text-gray-500">•</span>
            <span className="text-gray-400">{corners.length} {t('corners_identified')}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-400 uppercase">{t('total_delta')}:</span>
            <span
              className={`font-black font-telemetry px-2 py-0.5 rounded text-xs ${
                totalGap < 0 ? 'bg-[#00FF7F]/15 text-[#00FF7F]' : 'bg-[#FF1801]/15 text-[#FF7B72]'
              }`}
            >
              {totalGap >= 0 ? '+' : ''}
              {totalGap.toFixed(3)}s
            </span>
          </div>
        </div>
      )}

      {/* ================= FILA 3: UN SOLO VISOR INTERACTIVO GRANDE (FLEX: 1) ================= */}
      <div className="relative flex-1 min-h-0 bg-[#05070B] rounded-xl border border-white/5 overflow-hidden flex items-center justify-center">
        {selectedCorner && cornerSvgData ? (
          /* ----- VISTA CURVA: ZOOM DETALLADO DE TRAZADA Y PIANOS ----- */
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Badges Flotantes Superior Izquierda */}
            <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
              <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-black/80 backdrop-blur-md border border-white/10 text-[10px] font-telemetry text-white font-bold shadow-md">
                <CornerDownRight
                  className={`w-3.5 h-3.5 ${isLeft ? '-scale-x-100 text-[#00D2BE]' : 'text-[#00D2BE]'}`}
                />
                <span>{isLeft ? t('turn_left') : t('turn_right')}</span>
              </div>

              <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-black/80 backdrop-blur-md border border-white/10 text-[10px] font-telemetry shadow-md">
                {hasSubviraje ? (
                  <>
                    <AlertTriangle className="w-3 h-3 text-[#FF1801]" />
                    <span className="text-[#FF7B72] font-bold">{t('understeer')}</span>
                  </>
                ) : isEarlyApex ? (
                  <>
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    <span className="text-amber-300 font-bold">{t('early_apex')}</span>
                  </>
                ) : isOptimal ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-[#00FF7F]" />
                    <span className="text-[#00FF7F] font-bold">{t('optimal_line')}</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3 h-3 text-[#00D2BE]" />
                    <span className="text-[#00D2BE] font-bold">{t('neutral_apex')}</span>
                  </>
                )}
              </div>
            </div>

            {/* Badges Flotantes Superior Derecha: Leyenda + Botón Circuito Completo */}
            <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
              <div className="flex items-center gap-2 px-2 py-0.5 rounded bg-black/80 backdrop-blur-md border border-white/10 text-[9px] font-telemetry shadow-md">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-0.5 bg-[#00FF7F] border-b border-dashed border-[#00FF7F]" />
                  <span className="text-gray-300">{t('optimal_badge')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-0.5 bg-[#B138FE]" />
                  <span className="text-gray-300">{t('your_line')}</span>
                </div>
              </div>

              <button
                onClick={() => onSelectCorner(null)}
                className="flex items-center gap-1 px-2 py-1 rounded bg-[#0E121B]/90 hover:bg-[#1A2234] border border-white/20 hover:border-[#00D2BE]/60 text-[10px] font-telemetry font-bold text-gray-200 hover:text-white transition cursor-pointer shadow-md backdrop-blur-sm"
                title={t('return_to_circuit')}
              >
                <Map className="w-3 h-3 text-[#00D2BE]" />
                <span>{t('view_full_circuit')}</span>
              </button>
            </div>

            {/* SVG Curva Detallada con Pianos */}
            <svg viewBox="0 0 440 230" preserveAspectRatio="xMidYMid meet" className="w-full h-full select-none">
              <defs>
                <pattern
                  id="unified-kerb-pattern"
                  width="16"
                  height="16"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <rect width="8" height="16" fill="#E10600" />
                  <rect x="8" width="8" height="16" fill="#F0F0F0" />
                </pattern>
                <filter id="glow-opt" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#00FF7F" floodOpacity="0.8" />
                </filter>
                <filter id="glow-act" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#B138FE" floodOpacity="0.9" />
                </filter>
                <filter id="glow-under" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#FF4D4D" floodOpacity="0.8" />
                </filter>
              </defs>

              {/* Road Asphalt Base */}
              <path d={cornerSvgData.asphalt_fill} fill="#141822" stroke="none" />

              {/* Outer Track Kerb Band */}
              <path
                d={cornerSvgData.outer_curb}
                fill="none"
                stroke="url(#unified-kerb-pattern)"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d={cornerSvgData.outer_curb}
                fill="none"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth="1"
              />

              {/* Inner Track Kerb Band (Apex) */}
              <path
                d={cornerSvgData.inner_curb}
                fill="none"
                stroke="url(#unified-kerb-pattern)"
                strokeWidth="12"
                strokeLinecap="round"
              />
              <path
                d={cornerSvgData.inner_curb}
                fill="none"
                stroke="rgba(255,255,255,0.22)"
                strokeWidth="1"
              />

              {/* Reference / Optimal Line */}
              <path
                d={cornerSvgData.optimal_line}
                fill="none"
                stroke="#00FF7F"
                strokeWidth="3"
                strokeDasharray="6 4"
                strokeLinecap="round"
                filter="url(#glow-opt)"
                opacity="0.95"
              />

              {/* Driver's Actual Line */}
              <path
                d={cornerSvgData.actual_line}
                fill="none"
                stroke={hasSubviraje ? '#FF385C' : '#B138FE'}
                strokeWidth="3.5"
                strokeLinecap="round"
                filter={hasSubviraje ? 'url(#glow-under)' : 'url(#glow-act)'}
              />

              {/* Turn-In Marker */}
              <g transform={`translate(${cornerSvgData.turn_in.x}, ${cornerSvgData.turn_in.y})`}>
                <circle r="4" fill="#00D2BE" />
                <circle r="7" fill="none" stroke="#00D2BE" strokeWidth="1" opacity="0.6" />
                <text
                  y={14}
                  x={isLeft ? 8 : -8}
                  textAnchor={isLeft ? 'start' : 'end'}
                  fill="#94A3B8"
                  fontSize="9px"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {t('turn_in')}
                </text>
              </g>

              {/* Optimal Apex Marker */}
              <g transform={`translate(${cornerSvgData.apex_ref.x}, ${cornerSvgData.apex_ref.y})`}>
                <circle r="4.5" fill="#00FF7F" />
                <circle r="8" fill="none" stroke="#00FF7F" strokeWidth="1" opacity="0.5" />
                <text
                  y="-8"
                  textAnchor="middle"
                  fill="#00FF7F"
                  fontSize="9px"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {t('apex')} {selectedCorner.v_min_ref.toFixed(0)} km/h
                </text>
              </g>

              {/* Actual Apex Marker */}
              <g transform={`translate(${cornerSvgData.apex_comp.x}, ${cornerSvgData.apex_comp.y})`}>
                <circle r="5" fill={hasSubviraje ? '#FF1801' : '#B138FE'} />
                <circle
                  r="9"
                  fill="none"
                  stroke={hasSubviraje ? '#FF1801' : '#B138FE'}
                  strokeWidth="1.5"
                  strokeDasharray="2 2"
                />
                <text
                  y="18"
                  textAnchor="middle"
                  fill={hasSubviraje ? '#FF7B72' : '#E9D5FF'}
                  fontSize="9px"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {selectedCorner.v_min_comp.toFixed(0)} km/h
                </text>
              </g>

              {/* Track-out Exit Marker */}
              <g transform={`translate(${cornerSvgData.exit_pt.x}, ${cornerSvgData.exit_pt.y})`}>
                <circle r="4" fill="#FFD700" />
                <text
                  y={-7}
                  textAnchor="middle"
                  fill="#FFD700"
                  fontSize="9px"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {t('exit')}
                </text>
              </g>
            </svg>

            {/* Minimapa Flotante en Inferior Derecha */}
            {staticTrack && (
              <button
                onClick={() => onSelectCorner(null)}
                className="absolute bottom-2 right-2 z-10 w-28 h-20 bg-[#090D15]/90 hover:bg-[#0E131F] border border-white/15 hover:border-[#00D2BE]/60 rounded-lg p-1.5 cursor-pointer transition shadow-xl group backdrop-blur-md flex flex-col justify-between"
                title={t('return_to_circuit')}
              >
                <div className="flex items-center justify-between w-full text-[8px] font-telemetry text-gray-400 group-hover:text-[#00D2BE] px-0.5">
                  <span className="font-bold">{t('circuit_label')}</span>
                  <span className="text-[7px] text-[#00D2BE] opacity-0 group-hover:opacity-100 transition-opacity">
                    {t('view_all')}
                  </span>
                </div>
                <div className="w-full h-12 flex items-center justify-center">
                  <svg viewBox={staticTrack.viewBox} className="w-full h-full select-none" preserveAspectRatio="xMidYMid meet">
                    <path
                      d={staticTrack.fullOutline}
                      fill="none"
                      stroke="#4A5568"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {(() => {
                      const activePt = staticTrack.cornerPoints.find(
                        (cp) => cp.corner_number === selectedCorner.corner_number
                      );
                      if (!activePt) return null;
                      return (
                        <g transform={`translate(${activePt.svgX}, ${activePt.svgY})`}>
                          <circle r="9" fill="#B138FE" opacity="0.4" className="animate-ping" />
                          <circle r="5" fill="#B138FE" stroke="#FFFFFF" strokeWidth="1.5" />
                        </g>
                      );
                    })()}
                  </svg>
                </div>
              </button>
            )}
          </div>
        ) : staticTrack ? (
          /* ----- VISTA GENERAL: MAPA DE CIRCUITO ENTERO TIGHT-BOUNDING BOX (90-95% ocupación) ----- */
          <div className="relative w-full h-full flex items-center justify-center p-2">
            {/* Leyenda Heatmap Flotante Superior Derecha */}
            <div className="absolute top-2 right-2 z-10 flex items-center gap-3 px-2.5 py-1 rounded-lg bg-black/80 backdrop-blur-md border border-white/10 text-[10px] font-telemetry shadow-md">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#00FF7F]" />
                <span className="text-gray-300">{t('fast')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#FF1801]" />
                <span className="text-gray-300">{t('slow')}</span>
              </div>
            </div>

            {/* Hint Flotante Inferior Izquierda */}
            <div className="absolute bottom-2 left-2 z-10 px-2 py-1 rounded bg-black/70 backdrop-blur-md border border-white/5 text-[9px] font-telemetry text-gray-400">
              {t('click_hint')}
            </div>

            <svg
              ref={svgRef}
              viewBox={staticTrack.viewBox}
              preserveAspectRatio="xMidYMid meet"
              className="w-full h-full select-none cursor-crosshair"
              onMouseMove={handleTrackMouseMove}
              onMouseLeave={handleTrackMouseLeave}
            >
              {/* Colored Heatmap Ribbon */}
              {staticTrack.segments.map((seg, i) => (
                <path
                  key={`seg-${i}`}
                  d={seg.d}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

              {/* Clickable Corner Badges on Track */}
              {staticTrack.cornerPoints.map((c) => {
                const lost = c.delta_time > 0.05;
                const gained = c.delta_time < -0.05;
                const badgeColor = gained ? '#00FF7F' : lost ? '#FF1801' : '#94A3B8';

                return (
                  <g
                    key={`corner-mark-${c.corner_number}`}
                    transform={`translate(${c.svgX}, ${c.svgY})`}
                    className="cursor-pointer group"
                    onClick={() => onSelectCorner(c)}
                  >
                    <circle r="7" fill="#090D15" stroke={badgeColor} strokeWidth="1.5" />
                    <text
                      y="3"
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize="7px"
                      fontFamily="'JetBrains Mono', monospace"
                      fontWeight="bold"
                    >
                      {c.corner_number}
                    </text>
                  </g>
                );
              })}

              {/* Synchronized Car Position Indicator */}
              {carPoint && (
                <g transform={`translate(${carPoint.x}, ${carPoint.y})`}>
                  <circle r="9" fill="#00D2BE" opacity="0.3" className="animate-ping" />
                  <circle r="5" fill="#00D2BE" stroke="#FFFFFF" strokeWidth="1.5" />
                </g>
              )}
            </svg>
          </div>
        ) : (
          <div className="text-gray-500 text-xs font-telemetry">...</div>
        )}
      </div>

      {/* ================= FILA 4: LAS 2 TARJETAS DE DIAGNÓSTICO HTML (FIJA ABAJO) ================= */}
      {selectedCorner ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 shrink-0 select-text">
          {/* Tarjeta 1: Trazada & Ápice */}
          <div className="p-2.5 rounded-lg bg-[#07090E] border border-white/5 space-y-1 select-text">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1 select-text">
                <Compass className="w-3 h-3 text-[#00D2BE]" />
                {t('racing_line_apex')}
              </span>
              <span className="text-[10px] font-telemetry font-bold px-1.5 py-0.5 rounded bg-white/5 text-[#00D2BE] select-text">
                {selectedCorner.racing_line_eval || t('optimal_badge')}
              </span>
            </div>
            <p className="text-[11px] text-gray-300 leading-snug select-text">
              {selectedCorner.racing_line_advice || selectedCorner.diagnosis}
            </p>
          </div>

          {/* Tarjeta 2: Marcha en Vértice */}
          <div className="p-2.5 rounded-lg bg-[#07090E] border border-white/5 space-y-1 select-text">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1 select-text">
                <Sliders className="w-3 h-3 text-amber-400" />
                {t('gear_at_apex')}
              </span>
              <span
                className={`text-[10px] font-telemetry font-bold px-1.5 py-0.5 rounded select-text ${
                  (selectedCorner.gear_eval || '').includes('Óptima')
                    ? 'bg-[#00FF7F]/15 text-[#00FF7F]'
                    : 'bg-amber-400/15 text-amber-300'
                }`}
              >
                {selectedCorner.comp_gear ? `${selectedCorner.comp_gear}${t('gear_nth')}` : `3${t('gear_nth')}`} •{' '}
                {selectedCorner.gear_eval || t('optimal_badge')}
              </span>
            </div>
            <p className="text-[11px] text-gray-300 leading-snug select-text">
              {selectedCorner.gear_advice || t('gear_advice_default')}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 shrink-0 select-text">
          {/* Tarjeta 1: Consistencia & Sectores */}
          <div className="p-2.5 rounded-lg bg-[#07090E] border border-white/5 space-y-1 select-text">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1 select-text">
                <Compass className="w-3 h-3 text-[#00D2BE]" />
                {t('overall_balance')}
              </span>
              <span className="text-[10px] font-telemetry font-bold px-1.5 py-0.5 rounded bg-white/5 text-[#00D2BE] select-text">
                {totalGap < 0.2 ? t('competitive_pace') : t('progressive_improvement')}
              </span>
            </div>
            <p className="text-[11px] text-gray-300 leading-snug select-text">
              {t('balance_card_desc')}
            </p>
          </div>

          {/* Tarjeta 2: Mayor Pérdida de Tiempo */}
          {worstCorner ? (
            <div className="p-2.5 rounded-lg bg-[#07090E] border border-white/5 space-y-1 select-text">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1 select-text">
                  <AlertTriangle className="w-3 h-3 text-[#FF1801]" />
                  {t('critical_point')}
                </span>
                <button
                  onClick={() => onSelectCorner(worstCorner)}
                  className="text-[10px] font-telemetry font-bold px-1.5 py-0.5 rounded bg-[#FF1801]/15 text-[#FF7B72] hover:bg-[#FF1801]/25 transition cursor-pointer select-text"
                >
                  T{worstCorner.corner_number}: +{worstCorner.delta_time.toFixed(3)}s ↗
                </button>
              </div>
              <p className="text-[11px] text-gray-300 leading-snug select-text">
                {worstCorner.name}: {t('worst_corner_desc')}
              </p>
            </div>
          ) : (
            <div className="p-2.5 rounded-lg bg-[#07090E] border border-white/5 space-y-1 select-text">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider select-text">
                {t('sync_telemetry')}
              </span>
              <p className="text-[11px] text-gray-300 leading-snug select-text">
                {t('sync_telemetry_desc')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
