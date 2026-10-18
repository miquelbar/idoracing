import { useMemo } from 'react';
import { Navigation } from 'lucide-react';
import type { ComparisonResponse, CornerDTO } from '../types/telemetry';

interface TrackMapProps {
  comparison: ComparisonResponse;
  hoverDistance: number | null;
  selectedCorner: CornerDTO | null;
  onSelectCorner: (corner: CornerDTO | null) => void;
}

export const TrackMap: React.FC<TrackMapProps> = ({
  comparison,
  hoverDistance,
  selectedCorner,
  onSelectCorner,
}) => {
  const { pathSegments, cornerPoints, carPoint, viewBox } = useMemo(() => {
    const xs = comparison.track_x || [];
    const ys = comparison.track_y || [];
    const dists = comparison.distance || [];
    const deltas = comparison.delta_speed || [];

    if (xs.length === 0 || ys.length === 0) {
      return { pathSegments: [], cornerPoints: [], carPoint: null, viewBox: '0 0 800 600' };
    }

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const pad = 60;
    const width = 800;
    const height = 550;

    const scaleX = (width - pad * 2) / (maxX - minX || 1);
    const scaleY = (height - pad * 2) / (maxY - minY || 1);
    const scale = Math.min(scaleX, scaleY);

    const offsetX = (width - (maxX - minX) * scale) / 2;
    const offsetY = (height - (maxY - minY) * scale) / 2;

    const toSvg = (x: number, y: number) => ({
      x: offsetX + (x - minX) * scale,
      y: height - (offsetY + (y - minY) * scale), // invert Y for SVG
    });

    // Subdivide track into colored segments
    const segments: Array<{ d: string; color: string; speedDelta: number }> = [];
    const step = 4; // every few points

    for (let i = 0; i < xs.length - step; i += step) {
      const p1 = toSvg(xs[i], ys[i]);
      const p2 = toSvg(xs[i + step], ys[i + step]);
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
      });
    }

    // Corner positions
    const corners = (comparison.corners || []).map((c) => {
      // Find closest index for c.apex_distance
      let closestIdx = 0;
      let minDiff = 999999;
      for (let i = 0; i < dists.length; i++) {
        const diff = Math.abs(dists[i] - c.apex_distance);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }
      const pt = toSvg(xs[closestIdx] || 0, ys[closestIdx] || 0);
      return {
        ...c,
        svgX: pt.x,
        svgY: pt.y,
      };
    });

    // Car scrub point
    let currentCar = null;
    if (hoverDistance !== null && dists.length > 0) {
      let closestIdx = 0;
      let minDiff = 999999;
      for (let i = 0; i < dists.length; i++) {
        const diff = Math.abs(dists[i] - hoverDistance);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }
      currentCar = toSvg(xs[closestIdx], ys[closestIdx]);
    }

    return {
      pathSegments: segments,
      cornerPoints: corners,
      carPoint: currentCar,
      viewBox: `0 0 ${width} ${height}`,
    };
  }, [comparison, hoverDistance]);

  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col h-full relative overflow-hidden">
      {/* Title & Legend Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4 text-[#00D2BE]" />
          <h3 className="font-bold text-sm text-white tracking-wide uppercase">
            Mapa de Pista 2D • Heatmap de Delta ($\Delta V$)
          </h3>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] font-telemetry">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00FF7F]" />
            <span className="text-gray-300">Más Rápido (+V)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF1801]" />
            <span className="text-gray-300">Más Lento (-V)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#B138FE]" />
            <span className="text-gray-300">Curva</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative flex-1 w-full flex items-center justify-center min-h-[360px] bg-[#07090E]/60 rounded-lg border border-white/5 overflow-hidden">
        <svg viewBox={viewBox} className="w-full h-full max-h-[460px] select-none">
          {/* Subtle Grid Pattern */}
          <defs>
            <pattern id="f1-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="1" />
            </pattern>
            <filter id="glow-car" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#00D2BE" floodOpacity="0.8" />
            </filter>
            <filter id="glow-corner" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#B138FE" floodOpacity="0.7" />
            </filter>
          </defs>

          <rect width="100%" height="100%" fill="url(#f1-grid)" />

          {/* Underlay glow track */}
          {pathSegments.map((seg, idx) => (
            <path
              key={`glow-${idx}`}
              d={seg.d}
              stroke={seg.color}
              strokeWidth="9"
              strokeLinecap="round"
              strokeOpacity="0.25"
              fill="none"
            />
          ))}

          {/* Main Heatmap Track Ribbon */}
          {pathSegments.map((seg, idx) => (
            <path
              key={`track-${idx}`}
              d={seg.d}
              stroke={seg.color}
              strokeWidth="4.5"
              strokeLinecap="round"
              fill="none"
            />
          ))}

          {/* Corner Apex Markers */}
          {cornerPoints.map((c) => {
            const isSelected = selectedCorner?.corner_number === c.corner_number;
            return (
              <g
                key={`corner-${c.corner_number}`}
                className="cursor-pointer group"
                onClick={() => onSelectCorner(isSelected ? null : c)}
              >
                <circle
                  cx={c.svgX}
                  cy={c.svgY}
                  r={isSelected ? 13 : 9}
                  fill={isSelected ? '#B138FE' : '#161B26'}
                  stroke={isSelected ? '#FFFFFF' : '#8A2BE2'}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  filter={isSelected ? 'url(#glow-corner)' : undefined}
                  className="transition-all duration-150"
                />
                <text
                  x={c.svgX}
                  y={c.svgY + 3.5}
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize={isSelected ? '11px' : '9px'}
                  fontWeight="bold"
                  fontFamily="'JetBrains Mono', monospace"
                  pointerEvents="none"
                >
                  {c.corner_number}
                </text>
              </g>
            );
          })}

          {/* Start / Finish Line */}
          {pathSegments.length > 0 && (
            <g transform={`translate(${pathSegments[0].d.split(' ')[1]}, ${pathSegments[0].d.split(' ')[2]})`}>
              <line x1="-8" y1="-8" x2="8" y2="8" stroke="#FFFFFF" strokeWidth="3" />
              <line x1="-8" y1="-8" x2="8" y2="8" stroke="#E10600" strokeWidth="2" strokeDasharray="3,3" />
            </g>
          )}

          {/* Interactive Car Marker */}
          {carPoint && (
            <g transform={`translate(${carPoint.x}, ${carPoint.y})`} filter="url(#glow-car)">
              <circle r="8" fill="#00D2BE" />
              <circle r="14" fill="none" stroke="#00D2BE" strokeWidth="2" strokeOpacity="0.5" className="animate-ping" />
              <circle r="3" fill="#FFFFFF" />
            </g>
          )}
        </svg>

        {/* Selected Corner Floating Mini-Banner */}
        {selectedCorner && (
          <div className="absolute bottom-3 left-3 bg-[#111622]/90 border border-[#B138FE]/50 backdrop-blur-md rounded-lg px-3 py-2 text-xs flex items-center gap-3 shadow-lg">
            <span className="w-5 h-5 rounded-full bg-[#B138FE] text-white font-telemetry font-bold flex items-center justify-center text-[10px]">
              {selectedCorner.corner_number}
            </span>
            <div>
              <span className="font-bold text-white block">{selectedCorner.name}</span>
              <span className="text-[11px] text-gray-400 font-telemetry">
                ΔV min: {selectedCorner.delta_v_min > 0 ? '+' : ''}
                {selectedCorner.delta_v_min.toFixed(1)} km/h • Δt: {selectedCorner.delta_time > 0 ? '+' : ''}
                {selectedCorner.delta_time.toFixed(3)}s
              </span>
            </div>
            <button
              onClick={() => onSelectCorner(null)}
              className="text-gray-400 hover:text-white text-xs ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
