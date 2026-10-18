import { useMemo, useRef } from 'react';
import { Activity, RotateCcw } from 'lucide-react';
import type { ComparisonResponse, CornerDTO } from '../types/telemetry';

interface TelemetryChartsProps {
  comparison: ComparisonResponse;
  hoverDistance: number | null;
  onHoverDistance: (d: number | null) => void;
  selectedCorner: CornerDTO | null;
  onResetZoom: () => void;
}

export const TelemetryCharts: React.FC<TelemetryChartsProps> = ({
  comparison,
  hoverDistance,
  onHoverDistance,
  selectedCorner,
  onResetZoom,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter or slice distance window based on selected corner
  const { filteredIndices, domainMin, domainMax } = useMemo(() => {
    const dists = comparison.distance || [];
    if (dists.length === 0) return { filteredIndices: [], domainMin: 0, domainMax: 1000 };

    if (!selectedCorner) {
      return {
        filteredIndices: Array.from({ length: dists.length }, (_, i) => i),
        domainMin: dists[0],
        domainMax: dists[dists.length - 1],
      };
    }

    const start = Math.max(0, selectedCorner.start_distance - 60);
    const end = Math.min(dists[dists.length - 1], selectedCorner.end_distance + 60);

    const idxs: number[] = [];
    for (let i = 0; i < dists.length; i++) {
      if (dists[i] >= start && dists[i] <= end) {
        idxs.push(i);
      }
    }
    return {
      filteredIndices: idxs,
      domainMin: start,
      domainMax: end,
    };
  }, [comparison, selectedCorner]);

  // SVG Chart Geometry
  const width = 850;
  const hSpeed = 160;
  const hDelta = 80;
  const hPedals = 110;
  const hGear = 55;
  const padLeft = 45;
  const padRight = 20;

  const chartWidth = width - padLeft - padRight;

  const toX = (dist: number) => {
    const span = domainMax - domainMin || 1;
    return padLeft + ((dist - domainMin) / span) * chartWidth;
  };

  const toDist = (svgX: number) => {
    const ratio = Math.max(0, Math.min(1, (svgX - padLeft) / chartWidth));
    return domainMin + ratio * (domainMax - domainMin);
  };

  // Paths construction
  const {
    speedRefPath,
    speedCompPath,
    deltaPath,
    deltaFillPath,
    thrRefPath,
    thrCompPath,
    brkRefPath,
    brkCompPath,
    brkCompFillPath,
    gearRefPath,
    gearCompPath,
    hoverData,
  } = useMemo(() => {
    const dists = comparison.distance;
    const refSp = comparison.ref_speed;
    const compSp = comparison.comp_speed;
    const deltaT = comparison.delta_time;
    const refThr = comparison.ref_throttle;
    const compThr = comparison.comp_throttle;
    const refBrk = comparison.ref_brake;
    const compBrk = comparison.comp_brake;
    const refGr = comparison.ref_gear;
    const compGr = comparison.comp_gear;

    if (filteredIndices.length === 0) {
      return {
        speedRefPath: '',
        speedCompPath: '',
        deltaPath: '',
        deltaFillPath: '',
        thrRefPath: '',
        thrCompPath: '',
        brkRefPath: '',
        brkCompPath: '',
        brkCompFillPath: '',
        gearRefPath: '',
        gearCompPath: '',
        hoverData: null,
      };
    }

    // Scale mappings
    const maxSpeed = Math.max(260, ...filteredIndices.map((i) => Math.max(refSp[i] || 0, compSp[i] || 0)));
    const minSpeed = Math.max(0, Math.min(50, ...filteredIndices.map((i) => Math.min(refSp[i] || 200, compSp[i] || 200))));
    const speedSpan = maxSpeed - minSpeed || 1;

    const toYSpeed = (s: number) => hSpeed - 15 - ((s - minSpeed) / speedSpan) * (hSpeed - 30);

    // Delta scale (-1.5s to +1.5s or dynamic)
    const deltasInView = filteredIndices.map((i) => deltaT[i] || 0);
    const maxDelta = Math.max(0.5, ...deltasInView.map(Math.abs));
    const toYDelta = (dt: number) => (hDelta / 2) - (dt / maxDelta) * ((hDelta - 16) / 2);

    // Pedals (0 to 100%)
    const toPct = (val: number) => (val <= 1.05 ? val * 100 : val);
    const toYPedal = (val: number) => {
      const pct = toPct(val);
      return hPedals - 10 - (Math.min(100, Math.max(0, pct)) / 100) * (hPedals - 20);
    };

    // Gear (1 to 7)
    const toYGear = (g: number) => hGear - 8 - ((g - 1) / 6) * (hGear - 16);

    let spR = '';
    let spC = '';
    let dLine = '';
    let dFill = '';
    let tR = '';
    let tC = '';
    let bR = '';
    let bC = '';
    let bC_Fill = '';
    let gR = '';
    let gC = '';

    const yDeltaZero = toYDelta(0);
    const yPedalZero = toYPedal(0);

    filteredIndices.forEach((idx, i) => {
      const d = dists[idx];
      const x = toX(d).toFixed(1);

      const ySpR = toYSpeed(refSp[idx]).toFixed(1);
      const ySpC = toYSpeed(compSp[idx]).toFixed(1);
      const yDt = toYDelta(deltaT[idx]).toFixed(1);
      const yTr = toYPedal(refThr[idx]).toFixed(1);
      const yTc = toYPedal(compThr[idx]).toFixed(1);
      const yBr = toYPedal(refBrk[idx]).toFixed(1);
      const yBc = toYPedal(compBrk[idx]).toFixed(1);
      const yGr = toYGear(refGr[idx]).toFixed(1);
      const yGc = toYGear(compGr[idx]).toFixed(1);

      if (i === 0) {
        spR += `M ${x} ${ySpR}`;
        spC += `M ${x} ${ySpC}`;
        dLine += `M ${x} ${yDt}`;
        dFill += `M ${x} ${yDeltaZero} L ${x} ${yDt}`;
        tR += `M ${x} ${yTr}`;
        tC += `M ${x} ${yTc}`;
        bR += `M ${x} ${yBr}`;
        bC += `M ${x} ${yBc}`;
        bC_Fill += `M ${x} ${yPedalZero} L ${x} ${yBc}`;
        gR += `M ${x} ${yGr}`;
        gC += `M ${x} ${yGc}`;
      } else {
        spR += ` L ${x} ${ySpR}`;
        spC += ` L ${x} ${ySpC}`;
        dLine += ` L ${x} ${yDt}`;
        dFill += ` L ${x} ${yDt}`;
        tR += ` L ${x} ${yTr}`;
        tC += ` L ${x} ${yTc}`;
        bR += ` L ${x} ${yBr}`;
        bC += ` L ${x} ${yBc}`;
        bC_Fill += ` L ${x} ${yBc}`;
        gR += ` L ${x} ${yGr}`;
        gC += ` L ${x} ${yGc}`;
      }
    });

    // Close delta fill & brake fill
    if (filteredIndices.length > 0) {
      const lastX = toX(dists[filteredIndices[filteredIndices.length - 1]]).toFixed(1);
      dFill += ` L ${lastX} ${yDeltaZero} Z`;
      bC_Fill += ` L ${lastX} ${yPedalZero} Z`;
    }

    // Hover readout calculation
    let hData = null;
    if (hoverDistance !== null) {
      let closestIdx = 0;
      let minDiff = 999999;
      for (let i = 0; i < dists.length; i++) {
        const diff = Math.abs(dists[i] - hoverDistance);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }
      hData = {
        distance: dists[closestIdx],
        refSpeed: refSp[closestIdx],
        compSpeed: compSp[closestIdx],
        deltaSpeed: compSp[closestIdx] - refSp[closestIdx],
        deltaTime: deltaT[closestIdx],
        refThr: toPct(refThr[closestIdx]),
        compThr: toPct(compThr[closestIdx]),
        refBrk: toPct(refBrk[closestIdx]),
        compBrk: toPct(compBrk[closestIdx]),
        refGear: refGr[closestIdx],
        compGear: compGr[closestIdx],
        x: toX(dists[closestIdx]),
      };
    }

    return {
      speedRefPath: spR,
      speedCompPath: spC,
      deltaPath: dLine,
      deltaFillPath: dFill,
      thrRefPath: tR,
      thrCompPath: tC,
      brkRefPath: bR,
      brkCompPath: bC,
      brkCompFillPath: bC_Fill,
      gearRefPath: gR,
      gearCompPath: gC,
      hoverData: hData,
    };
  }, [comparison, filteredIndices, domainMin, domainMax, hoverDistance]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (width / rect.width);
    if (svgX >= padLeft && svgX <= width - padRight) {
      const dist = toDist(svgX);
      onHoverDistance(dist);
    }
  };

  const handleMouseLeave = () => {
    onHoverDistance(null);
  };

  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col h-full relative" ref={containerRef}>
      {/* Header Controls */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Activity className="w-4 h-4 text-[#00D2BE]" />
          <h3 className="font-bold text-sm text-white tracking-wide uppercase">
            Canales de Telemetría Sincronizados
          </h3>
          {selectedCorner && (
            <span className="px-2 py-0.5 rounded bg-[#B138FE]/20 text-[#D8B4FE] border border-[#B138FE]/40 text-xs font-telemetry">
              Enfoque: Curva {selectedCorner.corner_number} ({selectedCorner.name})
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Zoom Reset */}
          {selectedCorner && (
            <button
              onClick={onResetZoom}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#18202F] hover:bg-[#222E42] border border-[#2D3A52] text-xs text-gray-300 transition cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 text-[#00D2BE]" />
              Vuelta Completa
            </button>
          )}

          {/* Trace & Pedal Legend */}
          <div className="flex items-center gap-3 text-[10px] font-telemetry">
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-1 bg-[#00D2BE] rounded" />
              <span className="text-[#00D2BE] font-bold">P1 (Ref)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-1 bg-[#B138FE] rounded" />
              <span className="text-[#B138FE] font-bold">P2 (Comp)</span>
            </div>
            <div className="flex items-center gap-1 pl-2 border-l border-white/10">
              <span className="w-2 h-2 rounded-full bg-[#FF1801]" />
              <span className="text-[#FF1801] font-semibold">Freno</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#00FF7F]" />
              <span className="text-[#00FF7F] font-semibold">Gas</span>
            </div>
          </div>
        </div>
      </div>

      {/* Synchronized Hover HUD Bar (Fixed height to prevent layout shifts) */}
      <div className="mb-2 px-3 py-1.5 bg-[#0A0D14]/90 border border-white/10 rounded-lg flex items-center justify-between text-xs font-telemetry shadow-md min-h-[38px]">
        {hoverData ? (
          <>
            <div className="flex items-center gap-4">
              <span className="text-gray-400">
                Dist: <strong className="text-white">{Math.round(hoverData.distance)}m</strong>
              </span>
              <span>
                Vel Ref: <strong className="text-[#00D2BE]">{Math.round(hoverData.refSpeed)} km/h</strong> | Comp:{' '}
                <strong className="text-[#B138FE]">{Math.round(hoverData.compSpeed)} km/h</strong> (
                <span className={hoverData.deltaSpeed >= 0 ? 'text-[#00FF7F]' : 'text-[#FF1801]'}>
                  {hoverData.deltaSpeed >= 0 ? '+' : ''}
                  {Math.round(hoverData.deltaSpeed)} km/h
                </span>
                )
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span>
                Δt:{' '}
                <strong className={hoverData.deltaTime > 0 ? 'text-[#FF1801]' : 'text-[#00FF7F]'}>
                  {hoverData.deltaTime > 0 ? '+' : ''}
                  {hoverData.deltaTime.toFixed(3)}s
                </strong>
              </span>
              <span>
                Gas: <strong className="text-[#00FF7F]">{Math.round(hoverData.compThr)}%</strong> (Ref: <span className="text-[#10B981]">{Math.round(hoverData.refThr)}%</span>) | Freno:{' '}
                <strong className="text-[#FF1801]">{Math.round(hoverData.compBrk)}%</strong> (Ref: <span className="text-[#00D2BE]">{Math.round(hoverData.refBrk)}%</span>)
              </span>
              <span>
                Marcha: <strong className="text-white">G{hoverData.compGear}</strong> (Ref: G{hoverData.refGear})
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between w-full text-gray-500 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00D2BE] animate-pulse" />
              <span className="text-gray-300 font-medium">Telemetría Sincronizada</span>
              <span className="hidden sm:inline text-gray-500">• Mueve el cursor sobre las gráficas para inspeccionar telemetría métrica</span>
            </div>
            <div className="flex items-center gap-3 font-telemetry text-gray-500 text-[10px]">
              <span>Dist: --- m</span>
              <span>Vel: --- km/h</span>
              <span>Δt: --- s</span>
              <span>Gas/Freno: --- %</span>
            </div>
          </div>
        )}
      </div>

      {/* SVG Stack Chart Canvas */}
      <div className="relative flex-1 bg-[#07090E]/60 rounded-lg border border-white/5 select-none overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${hSpeed + hDelta + hPedals + hGear}`}
          className="w-full h-full cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id="delta-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF1801" stopOpacity="0.4" />
              <stop offset="50%" stopColor="#00D2BE" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#00FF7F" stopOpacity="0.4" />
            </linearGradient>
          </defs>

          {/* Vertical Gridlines */}
          {[0.25, 0.5, 0.75].map((pct) => {
            const x = padLeft + pct * chartWidth;
            const distLabel = Math.round(domainMin + pct * (domainMax - domainMin));
            return (
              <g key={`grid-${pct}`}>
                <line
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={hSpeed + hDelta + hPedals + hGear}
                  stroke="rgba(255, 255, 255, 0.05)"
                  strokeDasharray="4,4"
                />
                <text
                  x={x}
                  y={hSpeed + hDelta + hPedals + hGear - 2}
                  fill="#718096"
                  fontSize="9px"
                  fontFamily="'JetBrains Mono', monospace"
                  textAnchor="middle"
                >
                  {distLabel}m
                </text>
              </g>
            );
          })}

          {/* ================= CHANNEL 1: SPEED ================= */}
          <g transform="translate(0, 0)">
            <rect x={padLeft} y={0} width={chartWidth} height={hSpeed} fill="rgba(0,0,0,0.2)" />
            <line x1={padLeft} y1={hSpeed} x2={width - padRight} y2={hSpeed} stroke="rgba(255,255,255,0.1)" />
            <text x={padLeft + 8} y={18} fill="#A0AEC0" fontSize="10px" fontWeight="bold" fontFamily="'JetBrains Mono', monospace">
              VELOCIDAD (KM/H)
            </text>

            <path d={speedRefPath} fill="none" stroke="#00D2BE" strokeWidth="2" strokeOpacity="0.85" />
            <path d={speedCompPath} fill="none" stroke="#B138FE" strokeWidth="2.5" />
          </g>

          {/* ================= CHANNEL 2: DELTA TIME ================= */}
          <g transform={`translate(0, ${hSpeed})`}>
            <rect x={padLeft} y={0} width={chartWidth} height={hDelta} fill="rgba(0,0,0,0.3)" />
            <line x1={padLeft} y1={hDelta / 2} x2={width - padRight} y2={hDelta / 2} stroke="rgba(255,255,255,0.2)" strokeDasharray="2,2" />
            <line x1={padLeft} y1={hDelta} x2={width - padRight} y2={hDelta} stroke="rgba(255,255,255,0.1)" />
            <text x={padLeft + 8} y={15} fill="#A0AEC0" fontSize="10px" fontWeight="bold" fontFamily="'JetBrains Mono', monospace">
              TIEMPO DELTA Δt (S)
            </text>

            {/* Delta Area Fill */}
            <path d={deltaFillPath} fill="url(#delta-gradient)" />
            {/* Delta Line */}
            <path d={deltaPath} fill="none" stroke="#FFD700" strokeWidth="1.8" />
          </g>

          {/* ================= CHANNEL 3: THROTTLE & BRAKE (TRAIL BRAKING) ================= */}
          <g transform={`translate(0, ${hSpeed + hDelta})`}>
            <rect x={padLeft} y={0} width={chartWidth} height={hPedals} fill="rgba(0,0,0,0.2)" />
            <line x1={padLeft} y1={hPedals} x2={width - padRight} y2={hPedals} stroke="rgba(255,255,255,0.1)" />
            <line x1={padLeft} y1={hPedals / 2} x2={width - padRight} y2={hPedals / 2} stroke="rgba(255,255,255,0.06)" strokeDasharray="2,2" />

            {/* Y-Axis Labels */}
            <text x={padLeft - 6} y={15} fill="#718096" fontSize="8px" fontFamily="'JetBrains Mono', monospace" textAnchor="end">100%</text>
            <text x={padLeft - 6} y={hPedals / 2 + 3} fill="#718096" fontSize="8px" fontFamily="'JetBrains Mono', monospace" textAnchor="end">50%</text>
            <text x={padLeft - 6} y={hPedals - 5} fill="#718096" fontSize="8px" fontFamily="'JetBrains Mono', monospace" textAnchor="end">0%</text>

            <text x={padLeft + 8} y={15} fill="#A0AEC0" fontSize="10px" fontWeight="bold" fontFamily="'JetBrains Mono', monospace">
              PEDALES • TRAIL BRAKING (GAS VERDE / FRENO ROJO)
            </text>

            {/* Brake translucent fill under comp braking curve */}
            <path d={brkCompFillPath} fill="rgba(255, 24, 1, 0.18)" />

            {/* Throttle traces: Ref (dashed emerald) & Comp (solid neon green) */}
            <path d={thrRefPath} fill="none" stroke="#10B981" strokeWidth="1.2" strokeDasharray="3,3" strokeOpacity="0.75" />
            <path d={thrCompPath} fill="none" stroke="#00FF7F" strokeWidth="2.2" />

            {/* Brake traces: Ref (dashed cyan) & Comp (solid red) */}
            <path d={brkRefPath} fill="none" stroke="#00D2BE" strokeWidth="1.5" strokeDasharray="3,3" strokeOpacity="0.8" />
            <path d={brkCompPath} fill="none" stroke="#FF1801" strokeWidth="2.4" />
          </g>

          {/* ================= CHANNEL 4: GEAR ================= */}
          <g transform={`translate(0, ${hSpeed + hDelta + hPedals})`}>
            <rect x={padLeft} y={0} width={chartWidth} height={hGear} fill="rgba(0,0,0,0.3)" />
            <text x={padLeft + 8} y={14} fill="#A0AEC0" fontSize="10px" fontWeight="bold" fontFamily="'JetBrains Mono', monospace">
              MARCHA (1 - 6)
            </text>

            <path d={gearRefPath} fill="none" stroke="#00D2BE" strokeWidth="1" strokeDasharray="2,2" strokeOpacity="0.6" />
            <path d={gearCompPath} fill="none" stroke="#E2E8F0" strokeWidth="2" />
          </g>

          {/* Vertical Crosshair Line */}
          {hoverData && (
            <line
              x1={hoverData.x}
              y1={0}
              x2={hoverData.x}
              y2={hSpeed + hDelta + hPedals + hGear}
              stroke="#00D2BE"
              strokeWidth="1.5"
              strokeDasharray="4,2"
              className="pointer-events-none"
            />
          )}
        </svg>
      </div>
    </div>
  );
};
