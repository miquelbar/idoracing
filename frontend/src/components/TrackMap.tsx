import React, { useMemo, useRef } from 'react';
import { Navigation } from 'lucide-react';
import type { ComparisonResponse, CornerDTO } from '../types/telemetry';

interface TrackMapProps {
  comparison: ComparisonResponse;
  hoverDistance: number | null;
  onHoverDistance?: (dist: number | null) => void;
  selectedCorner: CornerDTO | null;
  onSelectCorner: (corner: CornerDTO | null) => void;
  compact?: boolean;
}

export const TrackMap: React.FC<TrackMapProps> = ({
  comparison,
  hoverDistance,
  onHoverDistance,
  selectedCorner,
  onSelectCorner,
  compact = false,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  // 1. Static Track Geometry (Recomputed ONLY when comparison data changes, NOT on pointer move!)
  const staticTrack = useMemo(() => {
    const xs = comparison.track_x || [];
    const ys = comparison.track_y || [];
    const dists = comparison.distance || [];
    const deltas = comparison.delta_speed || [];

    if (xs.length === 0 || ys.length === 0) {
      return {
        pathSegments: [],
        cornerPoints: [],
        svgPoints: [],
        viewBox: '0 0 1000 240',
        width: 1000,
        height: 240,
      };
    }

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // Dimensions for widescreen horizontal layout
    const width = 1000;
    const height = compact ? 220 : 250;
    const pad = compact ? 24 : 32;

    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;

    // Preserve exact aspect ratio
    const scaleX = (width - pad * 2) / spanX;
    const scaleY = (height - pad * 2) / spanY;
    const scale = Math.min(scaleX, scaleY);

    const offsetX = (width - spanX * scale) / 2;
    const offsetY = (height - spanY * scale) / 2;

    const toSvg = (x: number, y: number) => ({
      x: offsetX + (x - minX) * scale,
      y: height - (offsetY + (y - minY) * scale), // invert Y for SVG Cartesian
    });

    // Pre-calculate all SVG projected points for fast O(1) cursor lookup and track interaction
    const svgPts: Array<{ x: number; y: number; dist: number }> = [];
    for (let i = 0; i < xs.length; i++) {
      const pt = toSvg(xs[i], ys[i]);
      svgPts.push({ x: pt.x, y: pt.y, dist: dists[i] || 0 });
    }

    // Subdivide track into colored segments
    const segments: Array<{ d: string; color: string; speedDelta: number; startIdx: number; endIdx: number }> = [];
    const step = 3;

    for (let i = 0; i < xs.length - step; i += step) {
      const p1 = svgPts[i];
      const p2 = svgPts[i + step];
      const avgDelta = deltas[i] || 0;

      // Color coding: green if faster (delta > 0), red if slower (delta < 0)
      let color = '#4A5568';
      if (avgDelta > 8) color = '#00FF7F'; // bright green
      else if (avgDelta > 2) color = '#00D2BE'; // cyan green
      else if (avgDelta < -8) color = '#FF1801'; // bright red
      else if (avgDelta < -2) color = '#FF7B72'; // light red
      else color = '#798299'; // neutral

      segments.push({
        d: `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} L ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`,
        color,
        speedDelta: avgDelta,
        startIdx: i,
        endIdx: i + step,
      });
    }

    // Corner positions
    const corners = (comparison.corners || []).map((c) => {
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

    return {
      pathSegments: segments,
      cornerPoints: corners,
      svgPoints: svgPts,
      viewBox: `0 0 ${width} ${height}`,
      width,
      height,
    };
  }, [comparison.track_x, comparison.track_y, comparison.distance, comparison.delta_speed, comparison.corners, compact]);

  // 2. Highlight segments for the selected corner (Only recomputed when selected corner changes)
  const selectedCornerSegments = useMemo(() => {
    if (!selectedCorner || staticTrack.svgPoints.length === 0) return [];

    const dists = comparison.distance || [];
    const cornerSegments: Array<{ d: string }> = [];
    const step = 3;

    for (let i = 0; i < staticTrack.svgPoints.length - step; i += step) {
      const dCurrent = dists[i] || 0;
      if (dCurrent >= selectedCorner.start_distance - 20 && dCurrent <= selectedCorner.end_distance + 20) {
        const p1 = staticTrack.svgPoints[i];
        const p2 = staticTrack.svgPoints[i + step];
        cornerSegments.push({
          d: `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} L ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`,
        });
      }
    }
    return cornerSegments;
  }, [selectedCorner, staticTrack.svgPoints, comparison.distance]);

  // 3. Fast O(log N) Dynamic Car Cursor (Zero track rebuild on pointer movements!)
  const carPoint = useMemo(() => {
    if (hoverDistance === null || staticTrack.svgPoints.length === 0) return null;

    const dists = comparison.distance || [];
    if (dists.length === 0) return null;

    // Fast binary search for closest distance along monotonic distance array
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
    return staticTrack.svgPoints[idx] || null;
  }, [hoverDistance, staticTrack.svgPoints, comparison.distance]);

  // 4. Interactive Track Scrubbing (Hovering / clicking directly on track ribbon)
  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onHoverDistance || staticTrack.svgPoints.length === 0 || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * staticTrack.width;
    const mouseY = ((e.clientY - rect.top) / rect.height) * staticTrack.height;

    // Find nearest point on the track ribbon within radius
    let minSqDist = 35 * 35; // 35px hover threshold
    let nearestDist: number | null = null;

    // Check sampled points for high responsiveness
    for (let i = 0; i < staticTrack.svgPoints.length; i += 4) {
      const pt = staticTrack.svgPoints[i];
      const dx = pt.x - mouseX;
      const dy = pt.y - mouseY;
      const sqDist = dx * dx + dy * dy;
      if (sqDist < minSqDist) {
        minSqDist = sqDist;
        nearestDist = pt.dist;
      }
    }

    if (nearestDist !== null) {
      onHoverDistance(nearestDist);
    }
  };

  const handleSvgMouseLeave = () => {
    // Only reset if user was hovering on track directly
    if (onHoverDistance) {
      onHoverDistance(null);
    }
  };

  return (
    <div className={`glass-panel rounded-xl flex flex-col h-full relative overflow-hidden ${compact ? 'p-2.5' : 'p-3.5'}`}>
      {/* Title & Legend Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5 shrink-0">
        <div className="flex items-center gap-2">
          <Navigation className="w-3.5 h-3.5 text-[#00D2BE]" />
          <h3 className="font-bold text-xs text-white tracking-wide uppercase font-telemetry">
            {comparison.track_name || 'Circuito'} • Trazada 2D & Heatmap
          </h3>
        </div>

        {/* Center: Active Corner Navigation when selected */}
        {selectedCorner && (
          <div className="flex items-center gap-1.5 bg-[#121824] px-2 py-0.5 rounded-lg border border-[#B138FE]/50 shadow-sm">
            <button
              onClick={() => {
                const allCorners = comparison.corners || [];
                const idx = allCorners.findIndex((c) => c.corner_number === selectedCorner.corner_number);
                const prevIdx = idx > 0 ? idx - 1 : allCorners.length - 1;
                onSelectCorner(allCorners[prevIdx]);
              }}
              className="text-gray-400 hover:text-white px-1 text-xs font-bold transition cursor-pointer"
              title="Curva anterior"
            >
              ◀
            </button>
            <span className="text-xs font-bold text-white font-telemetry flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#FFB800] animate-pulse" />
              T{selectedCorner.corner_number}: {selectedCorner.name}
            </span>
            <button
              onClick={() => {
                const allCorners = comparison.corners || [];
                const idx = allCorners.findIndex((c) => c.corner_number === selectedCorner.corner_number);
                const nextIdx = idx < allCorners.length - 1 ? idx + 1 : 0;
                onSelectCorner(allCorners[nextIdx]);
              }}
              className="text-gray-400 hover:text-white px-1 text-xs font-bold transition cursor-pointer"
              title="Curva siguiente"
            >
              ▶
            </button>
            <button
              onClick={() => onSelectCorner(null)}
              className="text-gray-400 hover:text-white ml-1 text-xs transition cursor-pointer font-bold"
              title="Ver vuelta completa"
            >
              ✕
            </button>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-3 text-[10px] font-telemetry">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#00FF7F]" />
            <span className="text-gray-300">+V (Rápido)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#FF1801]" />
            <span className="text-gray-300">-V (Lento)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#FFB800]" />
            <span className="text-gray-300">Curva Activa</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas (Widescreen Horizontal Layout with aspect ratio preserved) */}
      <div className="relative flex-1 w-full min-h-0 flex items-center justify-center bg-[#07090E]/80 rounded-lg border border-white/5 overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={staticTrack.viewBox}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full select-none cursor-crosshair"
          onMouseMove={handleSvgMouseMove}
          onMouseLeave={handleSvgMouseLeave}
        >
          {/* Subtle Grid Pattern */}
          <defs>
            <pattern id="track-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="1" />
            </pattern>
            <filter id="glow-car" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#00D2BE" floodOpacity="0.9" />
            </filter>
            <filter id="glow-corner" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#B138FE" floodOpacity="0.7" />
            </filter>
            <filter id="glow-active-corner" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#FFB800" floodOpacity="0.95" />
            </filter>
          </defs>

          <rect width="100%" height="100%" fill="url(#track-grid)" />

          {/* Underlay glow track */}
          {staticTrack.pathSegments.map((seg, idx) => (
            <path
              key={`glow-${idx}`}
              d={seg.d}
              stroke={seg.color}
              strokeWidth="7"
              strokeLinecap="round"
              strokeOpacity="0.2"
              fill="none"
            />
          ))}

          {/* Main Heatmap Track Ribbon */}
          {staticTrack.pathSegments.map((seg, idx) => (
            <path
              key={`track-${idx}`}
              d={seg.d}
              stroke={seg.color}
              strokeWidth="3.5"
              strokeLinecap="round"
              fill="none"
            />
          ))}

          {/* Glowing Highlight for Selected Corner Segment */}
          {selectedCornerSegments.map((seg, idx) => (
            <path
              key={`active-corner-${idx}`}
              d={seg.d}
              stroke="#FFB800"
              strokeWidth="7"
              strokeLinecap="round"
              fill="none"
              filter="url(#glow-active-corner)"
            />
          ))}

          {/* Start / Finish Line */}
          {staticTrack.pathSegments.length > 0 && (
            <g transform={`translate(${staticTrack.pathSegments[0].d.split(' ')[1]}, ${staticTrack.pathSegments[0].d.split(' ')[2]})`}>
              <line x1="-6" y1="-6" x2="6" y2="6" stroke="#FFFFFF" strokeWidth="2.5" />
              <line x1="-6" y1="-6" x2="6" y2="6" stroke="#E10600" strokeWidth="2" strokeDasharray="2,2" />
            </g>
          )}

          {/* Corner Apex Badges */}
          {staticTrack.cornerPoints.map((c) => {
            const isSelected = selectedCorner?.corner_number === c.corner_number;
            return (
              <g
                key={`corner-${c.corner_number}`}
                className="cursor-pointer group"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectCorner(isSelected ? null : c);
                }}
              >
                <circle
                  cx={c.svgX}
                  cy={c.svgY}
                  r={isSelected ? 11 : 8}
                  fill={isSelected ? '#B138FE' : '#141824'}
                  stroke={isSelected ? '#FFFFFF' : '#8A2BE2'}
                  strokeWidth={isSelected ? 2 : 1.2}
                  filter={isSelected ? 'url(#glow-corner)' : undefined}
                  className="transition-all duration-150"
                />
                <text
                  x={c.svgX}
                  y={c.svgY + 3}
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize={isSelected ? '10px' : '8px'}
                  fontWeight="bold"
                  fontFamily="'JetBrains Mono', monospace"
                  pointerEvents="none"
                >
                  {c.corner_number}
                </text>
              </g>
            );
          })}

          {/* Dynamic Car Marker (Fast update on hover, zero track re-rendering) */}
          {carPoint && (
            <g transform={`translate(${carPoint.x}, ${carPoint.y})`} filter="url(#glow-car)" className="pointer-events-none">
              <circle r="7" fill="#00D2BE" />
              <circle r="12" fill="none" stroke="#00D2BE" strokeWidth="1.5" strokeOpacity="0.6" className="animate-ping" />
              <circle r="2.5" fill="#FFFFFF" />
            </g>
          )}
        </svg>

        {/* Selected Corner Floating Mini-Banner */}
        {selectedCorner && (
          <div className="absolute bottom-2 left-2 bg-[#111622]/90 border border-[#B138FE]/50 backdrop-blur-md rounded-lg px-2.5 py-1 text-xs flex items-center gap-2.5 shadow-lg">
            <span className="w-4 h-4 rounded-full bg-[#B138FE] text-white font-telemetry font-bold flex items-center justify-center text-[9px]">
              {selectedCorner.corner_number}
            </span>
            <div>
              <span className="font-bold text-white text-[11px] block">{selectedCorner.name}</span>
              <span className="text-[10px] text-gray-400 font-telemetry">
                ΔV min: {selectedCorner.delta_v_min > 0 ? '+' : ''}
                {selectedCorner.delta_v_min.toFixed(1)} km/h • Δt: {selectedCorner.delta_time > 0 ? '+' : ''}
                {selectedCorner.delta_time.toFixed(3)}s
              </span>
            </div>
            <button
              onClick={() => onSelectCorner(null)}
              className="text-gray-400 hover:text-white text-xs ml-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrackMap;
