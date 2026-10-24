import React, { useMemo, useRef, useState } from 'react';
import type { ComparisonResponse, CornerDTO } from '../../types/telemetry';
import { useLanguage } from '../../i18n';
import type { TrackGeometry } from './trackGeometry';
import { COLORS } from '../../theme';

interface TrackOverviewProps {
  comparison: ComparisonResponse;
  staticTrack: TrackGeometry;
  hoverDistance: number | null;
  onHoverDistance?: (dist: number | null) => void;
  handleOpenCornerDirectly: (corner: CornerDTO) => void;
}

/** Whole-track map with the speed-delta heatmap, clickable corners and the synchronised car cursor. */
export const TrackOverview: React.FC<TrackOverviewProps> = ({
  comparison,
  staticTrack,
  hoverDistance,
  onHoverDistance,
  handleOpenCornerDirectly,
}) => {
  const { t } = useLanguage();
  const corners = comparison.corners;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredCornerNum, setHoveredCornerNum] = useState<number | null>(null);
  const hoveredCorner = useMemo(
    () => (hoveredCornerNum === null ? null : corners.find((c) => c.corner_number === hoveredCornerNum) || null),
    [hoveredCornerNum, corners]
  );

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

  const getSvgCoords = (svg: SVGSVGElement, clientX: number, clientY: number) => {
    try {
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svg.getScreenCTM();
      if (ctm) {
        const p = pt.matrixTransform(ctm.inverse());
        return { x: p.x, y: p.y };
      }
    } catch {
      // fallback
    }
    const rect = svg.getBoundingClientRect();
    const scaleX = (staticTrack?.width || 600) / (rect.width || 1);
    const scaleY = (staticTrack?.height || 260) / (rect.height || 1);
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  // Track map scrubber and corner proximity detection
  const handleTrackMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!staticTrack || !svgRef.current) return;

    const { x: mouseX, y: mouseY } = getSvgCoords(svgRef.current, e.clientX, e.clientY);

    let minSqDist = 45 * 45;
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
      if (onHoverDistance) onHoverDistance(nearestDist);

      const matched = corners.find((c) => {
        if (c.start_distance <= c.end_distance) {
          return nearestDist! >= c.start_distance - 20 && nearestDist! <= c.end_distance + 20;
        } else {
          return nearestDist! >= c.start_distance - 20 || nearestDist! <= c.end_distance + 20;
        }
      });
      setHoveredCornerNum(matched ? matched.corner_number : null);
    } else {
      setHoveredCornerNum(null);
    }
  };

  const handleTrackMouseLeave = () => {
    if (onHoverDistance) onHoverDistance(null);
    setHoveredCornerNum(null);
  };

  const handleTrackSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!staticTrack || !svgRef.current) return;
    const { x: clickX, y: clickY } = getSvgCoords(svgRef.current, e.clientX, e.clientY);

    // 1. Proximity to corner badge
    let bestCorner: CornerDTO | null = null;
    let minCornerDist = 36;
    for (const cp of staticTrack.cornerPoints) {
      const dx = cp.svgX - clickX;
      const dy = cp.svgY - clickY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < minCornerDist) {
        minCornerDist = d;
        bestCorner = cp;
      }
    }

    // 2. Proximity to track points
    if (!bestCorner) {
      let minTrackDist = 45;
      let closestTrackPt: { dist: number } | null = null;
      for (const p of staticTrack.svgPts) {
        const dx = p.x - clickX;
        const dy = p.y - clickY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minTrackDist) {
          minTrackDist = d;
          closestTrackPt = p;
        }
      }
      if (closestTrackPt) {
        const matched = corners.find((c) => {
          if (c.start_distance <= c.end_distance) {
            return closestTrackPt!.dist >= c.start_distance - 30 && closestTrackPt!.dist <= c.end_distance + 30;
          } else {
            return closestTrackPt!.dist >= c.start_distance - 30 || closestTrackPt!.dist <= c.end_distance + 30;
          }
        });
        if (matched) {
          bestCorner = matched;
        } else {
          let minApexDiff = 90;
          for (const c of corners) {
            const diff = Math.abs(closestTrackPt.dist - c.apex_distance);
            if (diff < minApexDiff) {
              minApexDiff = diff;
              bestCorner = c;
            }
          }
        }
      }
    }

    if (bestCorner) {
      handleOpenCornerDirectly(bestCorner);
    }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center px-2 pt-8 pb-9">
      {/* The top and bottom padding reserves the strips used by the floating legend and
          the click hint, so tall track outlines never draw underneath them. */}
      {/* Leyenda Heatmap Flotante Superior Derecha */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-3 px-2.5 py-1 rounded-lg bg-black/80 backdrop-blur-md border border-white/10 text-[10px] font-telemetry shadow-md">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-gain" />
          <span className="text-gray-300">{t('fast')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-loss" />
          <span className="text-gray-300">{t('slow')}</span>
        </div>
      </div>

      {/* Hint Flotante Inferior Izquierda */}
      <div className="absolute bottom-2 left-2 z-10 px-2 py-1 rounded bg-black/70 backdrop-blur-md border border-white/5 text-[9px] font-telemetry text-gray-400">
        {hoveredCorner ? (
          <span className="text-brand font-bold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
            T{hoveredCorner.corner_number}: {hoveredCorner.name} • {t('click_to_open_corner')}
          </span>
        ) : (
          t('click_hint')
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={staticTrack.viewBox}
        preserveAspectRatio="xMidYMid meet"
        className={`w-full h-full select-none ${
          hoveredCornerNum !== null ? 'cursor-pointer' : 'cursor-crosshair'
        }`}
        onMouseMove={handleTrackMouseMove}
        onMouseLeave={handleTrackMouseLeave}
        onClick={handleTrackSvgClick}
      >
        {/* Base Closed Circuit Outline */}
        {staticTrack.fullOutline && (
          <path
            d={staticTrack.fullOutline}
            fill="none"
            stroke="#475569"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.65"
          />
        )}

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

        {/* Start/Finish Line & Direction-of-Travel Arrow */}
        {staticTrack.startFinish && (
          <g
            data-testid="track-direction-arrow"
            transform={`translate(${staticTrack.startFinish.x.toFixed(1)}, ${staticTrack.startFinish.y.toFixed(1)}) rotate(${staticTrack.startFinish.angleDeg.toFixed(1)})`}
            className="pointer-events-none"
          >
            {/* Perpendicular Start/Finish Line */}
            <line x1="0" y1="-8" x2="0" y2="8" stroke="#FFFFFF" strokeWidth="2.5" />
            <line x1="0" y1="-8" x2="0" y2="8" stroke={COLORS.night1} strokeWidth="2.5" strokeDasharray="3 3" />
            {/* Direction Arrow pointing along direction of travel */}
            <polygon
              points="15,0 6,-5 8,0 6,5"
              fill={COLORS.brand}
              stroke={COLORS.night1}
              strokeWidth="1"
            />
          </g>
        )}

        {/* Interactive Corner Track Hit Areas (Wide Ribbons & Hover Glow) */}
        {staticTrack.cornerArcs.map((c) => {
          if (!c.pathD) return null;
          const isHovered = hoveredCornerNum === c.corner_number;
          return (
            <g
              key={`corner-arc-${c.corner_number}`}
              className="cursor-pointer group"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenCornerDirectly(c);
              }}
              onMouseEnter={() => setHoveredCornerNum(c.corner_number)}
              onMouseLeave={() => setHoveredCornerNum(null)}
            >
              {/* Visual Hover Glow on the Curve */}
              {isHovered && (
                <path
                  d={c.pathD}
                  fill="none"
                  stroke={COLORS.comp}
                  strokeWidth="11"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.55"
                  className="transition-all duration-150"
                />
              )}
              {/* Invisible Wide Hit Target along entire curve */}
              <path
                d={c.pathD}
                fill="none"
                stroke="transparent"
                strokeWidth="28"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          );
        })}

        {/* Clickable Corner Badges on Track */}
        {staticTrack.cornerPoints.map((c) => {
          const lost = c.delta_time > 0.05;
          const gained = c.delta_time < -0.05;
          const badgeColor = gained ? COLORS.gain : lost ? COLORS.loss : '#94A3B8';
          const isHovered = hoveredCornerNum === c.corner_number;

          return (
            <g
              key={`corner-mark-${c.corner_number}`}
              transform={`translate(${c.svgX}, ${c.svgY})`}
              className="cursor-pointer group"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenCornerDirectly(c);
              }}
              onMouseEnter={() => setHoveredCornerNum(c.corner_number)}
              onMouseLeave={() => setHoveredCornerNum(null)}
            >
              {/* Invisible Generous Hit Area (Diameter 44px) */}
              <circle r="22" fill="transparent" />

              {/* Hover Pulse Ring */}
              {isHovered && (
                <circle r="13" fill={COLORS.comp} opacity="0.35" className="animate-ping" />
              )}

              <circle
                r={isHovered ? 9 : 7}
                fill={COLORS.night4}
                stroke={isHovered ? COLORS.comp : badgeColor}
                strokeWidth={isHovered ? 2.5 : 1.5}
                className="transition-all duration-150"
              />
              <text
                y="3"
                textAnchor="middle"
                fill="#FFFFFF"
                fontSize={isHovered ? '8px' : '7px'}
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
            <circle r="9" fill={COLORS.brand} opacity="0.3" className="animate-ping" />
            <circle r="5" fill={COLORS.brand} stroke="#FFFFFF" strokeWidth="1.5" />
          </g>
        )}
      </svg>
    </div>
  );
};
