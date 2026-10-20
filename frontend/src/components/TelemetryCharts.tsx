import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, RotateCcw } from 'lucide-react';
import type { ComparisonResponse, CornerDTO } from '../types/telemetry';
import { useLanguage } from '../i18n';
import { COLORS } from '../theme';

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
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 850, height: 500 });

  useEffect(() => {
    const el = chartWrapperRef.current;
    if (!el) return;

    const updateSize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 50 && h > 50) {
        setDimensions((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
      }
    };

    updateSize();

    const ro = new ResizeObserver(() => {
      updateSize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  // SVG Chart Geometry with Proportional Channel Heights:
  // 35% Speed, 15% Delta, 35% Pedals, 15% Gear
  const width = dimensions.width;
  const totalHeight = dimensions.height;
  const hSpeed = Math.round(totalHeight * 0.35);
  const hDelta = Math.round(totalHeight * 0.15);
  const hPedals = Math.round(totalHeight * 0.35);
  const hGear = totalHeight - hSpeed - hDelta - hPedals;
  const padLeft = 48;
  const padRight = 20;
  const laneHeaderH = 26;
  const lanePadBottom = 8;

  const chartWidth = Math.max(10, width - padLeft - padRight);

  const toX = useCallback(
    (dist: number) => {
      const span = domainMax - domainMin || 1;
      return padLeft + ((dist - domainMin) / span) * chartWidth;
    },
    [domainMin, domainMax, chartWidth]
  );

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
    minSpeed,
    maxSpeed,
    maxDelta,
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
        minSpeed: 50,
        maxSpeed: 250,
        maxDelta: 0.5,
      };
    }

    // 1. Dynamic Speed Range: [Vmin - 10 km/h, Vmax + 10 km/h] (avoids empty black space)
    const speedsInView: number[] = [];
    for (let i = 0; i < filteredIndices.length; i++) {
      const idx = filteredIndices[i];
      const s1 = refSp[idx];
      const s2 = compSp[idx];
      if (typeof s1 === 'number' && s1 > 5) speedsInView.push(s1);
      if (typeof s2 === 'number' && s2 > 5) speedsInView.push(s2);
    }

    const rawMinSpeed = speedsInView.length > 0 ? Math.min(...speedsInView) : 50;
    const rawMaxSpeed = speedsInView.length > 0 ? Math.max(...speedsInView) : 250;

    const minSpeedVal = Math.max(0, Math.floor((rawMinSpeed - 10) / 10) * 10);
    const maxSpeedVal = Math.ceil((rawMaxSpeed + 10) / 10) * 10;
    const speedSpan = Math.max(20, maxSpeedVal - minSpeedVal);

    const toYSpeed = (s: number) => {
      const clamped = Math.max(minSpeedVal, Math.min(maxSpeedVal, s));
      const usableH = Math.max(10, hSpeed - laneHeaderH - lanePadBottom);
      return hSpeed - lanePadBottom - ((clamped - minSpeedVal) / speedSpan) * usableH;
    };

    // 2. Dynamic Delta Range
    const deltasInView = filteredIndices.map((i) => deltaT[i] || 0);
    const maxDeltaObserved = Math.max(0.2, ...deltasInView.map(Math.abs));
    const maxDeltaVal = Math.ceil(maxDeltaObserved * 10) / 10;
    const toYDelta = (dt: number) => {
      const clamped = Math.max(-maxDeltaVal, Math.min(maxDeltaVal, dt));
      const usableHalfH = Math.max(5, (hDelta - laneHeaderH - lanePadBottom) / 2);
      const centerY = laneHeaderH + usableHalfH;
      return centerY - (clamped / maxDeltaVal) * usableHalfH;
    };

    // 3. Pedals (0 to 100%)
    const toPct = (val: number) => (val <= 1.05 ? val * 100 : val);
    const toYPedal = (val: number) => {
      const pct = Math.max(0, Math.min(100, toPct(val)));
      const usableH = Math.max(10, hPedals - laneHeaderH - lanePadBottom);
      return hPedals - lanePadBottom - (pct / 100) * usableH;
    };

    // 4. Gear (1 to 7)
    const toYGear = (g: number) => {
      const clamped = Math.max(1, Math.min(7, g));
      const usableH = Math.max(10, hGear - laneHeaderH - lanePadBottom);
      return hGear - lanePadBottom - ((clamped - 1) / 6) * usableH;
    };

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
      minSpeed: minSpeedVal,
      maxSpeed: maxSpeedVal,
      maxDelta: maxDeltaVal,
    };
  }, [comparison, filteredIndices, toX, hoverDistance, hSpeed, hDelta, hPedals, hGear]);

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
    <div className="glass-panel rounded-xl p-3 flex flex-col h-full relative overflow-hidden" ref={containerRef}>
      {/* Header with Title, Inline Live Telemetry Values, and Legend */}
      <div className="flex items-center justify-between gap-3 mb-2 shrink-0 pb-2 border-b border-white/5">
        {/* Left: Title + Inline Live Values */}
        <div className="flex items-center gap-2.5 flex-wrap min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <Activity className="w-4 h-4 text-brand" />
            <h3 className="font-bold text-xs sm:text-sm text-white tracking-wide uppercase font-sans">
              {t('telemetry_header')}
            </h3>
          </div>

          {selectedCorner && (
            <span className="px-2 py-0.5 rounded bg-comp/20 text-[#D8B4FE] border border-comp/40 text-[10px] font-telemetry shrink-0">
              T{selectedCorner.corner_number}: {selectedCorner.name}
            </span>
          )}

          {/* Inline Live Values (Replaces separate 45px box) */}
          <div className="flex items-center gap-2.5 text-[11px] font-telemetry text-gray-300 border-l border-white/10 pl-2.5">
            {hoverData ? (
              <>
                <span className="text-gray-400">
                  {t('dist')}: <strong className="text-white">{Math.round(hoverData.distance)}m</strong>
                </span>
                <span>
                  {t('vel')}: <strong className="text-brand">{Math.round(hoverData.refSpeed)}</strong> /{' '}
                  <strong className="text-comp">{Math.round(hoverData.compSpeed)}</strong>{' '}
                  <span className={`text-[10px] font-bold ${hoverData.deltaSpeed >= 0 ? 'text-gain' : 'text-loss'}`}>
                    ({hoverData.deltaSpeed >= 0 ? '+' : ''}{Math.round(hoverData.deltaSpeed)})
                  </span>
                </span>
                <span>
                  Δt:{' '}
                  <strong className={hoverData.deltaTime > 0 ? 'text-loss' : 'text-gain'}>
                    {hoverData.deltaTime > 0 ? '+' : ''}{hoverData.deltaTime.toFixed(3)}s
                  </strong>
                </span>
                <span className="hidden sm:inline">
                  {t('throttle')}: <strong className="text-gain">{Math.round(hoverData.compThr)}%</strong>
                </span>
                <span className="hidden sm:inline">
                  {t('brake')}: <strong className="text-loss">{Math.round(hoverData.compBrk)}%</strong>
                </span>
                <span className="hidden sm:inline">
                  {t('gear_label')}: <strong className="text-white">{hoverData.compGear}</strong>
                </span>
              </>
            ) : (
              <span className="text-gray-500 text-[10px] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                {t('hover_hint')}
              </span>
            )}
          </div>
        </div>

        {/* Right: Legend and Reset Zoom */}
        <div className="flex items-center gap-3 text-[10px] font-telemetry shrink-0">
          {selectedCorner && (
            <button
              onClick={onResetZoom}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#18202F] hover:bg-[#222E42] border border-[#2D3A52] text-[10px] text-gray-300 transition cursor-pointer"
              title={t('reset_lap_title')}
            >
              <RotateCcw className="w-3 h-3 text-brand" />
              <span>{t('reset_lap')}</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="w-2 h-1 bg-brand rounded" />
              <span className="text-brand font-bold">P1</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-1 bg-comp rounded" />
              <span className="text-comp font-bold">P2</span>
            </div>
            <div className="flex items-center gap-1 pl-1.5 border-l border-white/10">
              <span className="w-1.5 h-1.5 rounded-full bg-loss" />
              <span className="text-loss">{t('brake')}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-gain" />
              <span className="text-gain">{t('throttle')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* SVG Stack Chart Canvas */}
      <div className="relative flex-1 bg-night-2/60 rounded-lg border border-white/5 overflow-hidden" ref={chartWrapperRef}>
        {/* Floating Channel Header Bars */}
        <div
          className="absolute z-10 pointer-events-none flex items-center justify-between px-2 select-none"
          style={{ top: 2, left: padLeft, width: chartWidth, height: laneHeaderH - 4 }}
        >
          <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase text-gray-200 bg-[#161D2C] border border-white/10 shadow-sm">
            {t('speed_ch')}
          </span>
          {hoverData && (
            <span className="text-[10px] font-telemetry text-gray-300 bg-black/60 px-2 py-0.5 rounded border border-white/5">
              P1: <strong className="text-brand">{Math.round(hoverData.refSpeed)}</strong> / P2: <strong className="text-comp">{Math.round(hoverData.compSpeed)}</strong>{' '}
              <span className={hoverData.deltaSpeed >= 0 ? 'text-gain' : 'text-loss'}>
                ({hoverData.deltaSpeed >= 0 ? '+' : ''}{Math.round(hoverData.deltaSpeed)} km/h)
              </span>
            </span>
          )}
        </div>

        <div
          className="absolute z-10 pointer-events-none flex items-center justify-between px-2 select-none"
          style={{ top: hSpeed + 2, left: padLeft, width: chartWidth, height: laneHeaderH - 4 }}
        >
          <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase text-gray-200 bg-[#161D2C] border border-white/10 shadow-sm">
            {t('delta_ch')}
          </span>
          {hoverData && (
            <span className="text-[10px] font-telemetry text-gray-300 bg-black/60 px-2 py-0.5 rounded border border-white/5">
              Δt:{' '}
              <strong className={hoverData.deltaTime > 0 ? 'text-loss' : 'text-gain'}>
                {hoverData.deltaTime > 0 ? '+' : ''}{hoverData.deltaTime.toFixed(3)}s
              </strong>
            </span>
          )}
        </div>

        <div
          className="absolute z-10 pointer-events-none flex items-center justify-between px-2 select-none"
          style={{ top: hSpeed + hDelta + 2, left: padLeft, width: chartWidth, height: laneHeaderH - 4 }}
        >
          <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase text-gray-200 bg-[#161D2C] border border-white/10 shadow-sm">
            {t('pedals_ch')}
          </span>
          {hoverData && (
            <span className="text-[10px] font-telemetry text-gray-300 bg-black/60 px-2 py-0.5 rounded border border-white/5">
              Gas: <strong className="text-gain">{Math.round(hoverData.compThr)}%</strong>{' '}
              <span className="text-gray-500">(Ref: {Math.round(hoverData.refThr)}%)</span> • Freno:{' '}
              <strong className="text-loss">{Math.round(hoverData.compBrk)}%</strong>{' '}
              <span className="text-gray-500">(Ref: {Math.round(hoverData.refBrk)}%)</span>
            </span>
          )}
        </div>

        <div
          className="absolute z-10 pointer-events-none flex items-center justify-between px-2 select-none"
          style={{ top: hSpeed + hDelta + hPedals + 2, left: padLeft, width: chartWidth, height: laneHeaderH - 4 }}
        >
          <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase text-gray-200 bg-[#161D2C] border border-white/10 shadow-sm">
            {t('gear_ch')}
          </span>
          {hoverData && (
            <span className="text-[10px] font-telemetry text-gray-300 bg-black/60 px-2 py-0.5 rounded border border-white/5">
              Marcha: <strong className="text-white">{hoverData.compGear}ª</strong>{' '}
              <span className="text-gray-500">(Ref: {hoverData.refGear}ª)</span>
            </span>
          )}
        </div>

        <svg
          viewBox={`0 0 ${width} ${totalHeight}`}
          className="w-full h-full cursor-crosshair select-none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id="delta-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.loss} stopOpacity="0.4" />
              <stop offset="50%" stopColor={COLORS.brand} stopOpacity="0.1" />
              <stop offset="100%" stopColor={COLORS.gain} stopOpacity="0.4" />
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
                  y2={totalHeight}
                  stroke="rgba(255, 255, 255, 0.05)"
                  strokeDasharray="4,4"
                />
                <text
                  x={x}
                  y={totalHeight - 3}
                  fill={COLORS.muted}
                  fontSize="9px"
                  fontFamily="'JetBrains Mono', monospace"
                  textAnchor="middle"
                >
                  {distLabel}m
                </text>
              </g>
            );
          })}

          {/* Speed */}
          <g transform="translate(0, 0)">
            <rect x={padLeft} y={0} width={chartWidth} height={laneHeaderH} fill="rgba(14,19,30,0.85)" />
            <line x1={padLeft} y1={laneHeaderH} x2={width - padRight} y2={laneHeaderH} stroke="rgba(255,255,255,0.08)" />
            <rect x={padLeft} y={laneHeaderH} width={chartWidth} height={hSpeed - laneHeaderH} fill="rgba(0,0,0,0.2)" />
            <line x1={padLeft} y1={hSpeed} x2={width - padRight} y2={hSpeed} stroke="rgba(255,255,255,0.1)" />

            {/* Y-Axis Labels for Speed */}
            <text x={padLeft - 6} y={laneHeaderH + 8} fill={COLORS.muted} fontSize="8px" fontFamily="'JetBrains Mono', monospace" textAnchor="end">{maxSpeed}</text>
            <text x={padLeft - 6} y={(laneHeaderH + hSpeed - lanePadBottom) / 2 + 3} fill={COLORS.muted} fontSize="8px" fontFamily="'JetBrains Mono', monospace" textAnchor="end">{Math.round((maxSpeed + minSpeed) / 2)}</text>
            <text x={padLeft - 6} y={hSpeed - lanePadBottom} fill={COLORS.muted} fontSize="8px" fontFamily="'JetBrains Mono', monospace" textAnchor="end">{minSpeed}</text>

            <path d={speedRefPath} fill="none" stroke={COLORS.brand} strokeWidth="2" strokeOpacity="0.85" />
            <path d={speedCompPath} fill="none" stroke={COLORS.comp} strokeWidth="2.5" />
          </g>

          {/* Cumulative time delta */}
          <g transform={`translate(0, ${hSpeed})`}>
            <rect x={padLeft} y={0} width={chartWidth} height={laneHeaderH} fill="rgba(14,19,30,0.85)" />
            <line x1={padLeft} y1={laneHeaderH} x2={width - padRight} y2={laneHeaderH} stroke="rgba(255,255,255,0.08)" />
            <rect x={padLeft} y={laneHeaderH} width={chartWidth} height={hDelta - laneHeaderH} fill="rgba(0,0,0,0.3)" />
            <line x1={padLeft} y1={(laneHeaderH + hDelta - lanePadBottom) / 2} x2={width - padRight} y2={(laneHeaderH + hDelta - lanePadBottom) / 2} stroke="rgba(255,255,255,0.2)" strokeDasharray="2,2" />
            <line x1={padLeft} y1={hDelta} x2={width - padRight} y2={hDelta} stroke="rgba(255,255,255,0.1)" />

            {/* Y-Axis Labels for Delta */}
            <text x={padLeft - 6} y={laneHeaderH + 8} fill={COLORS.muted} fontSize="8px" fontFamily="'JetBrains Mono', monospace" textAnchor="end">+{maxDelta.toFixed(1)}s</text>
            <text x={padLeft - 6} y={(laneHeaderH + hDelta - lanePadBottom) / 2 + 3} fill={COLORS.muted} fontSize="8px" fontFamily="'JetBrains Mono', monospace" textAnchor="end">0.0s</text>
            <text x={padLeft - 6} y={hDelta - lanePadBottom} fill={COLORS.muted} fontSize="8px" fontFamily="'JetBrains Mono', monospace" textAnchor="end">-{maxDelta.toFixed(1)}s</text>

            {/* Delta Area Fill */}
            <path d={deltaFillPath} fill="url(#delta-gradient)" />
            {/* Delta Line */}
            <path d={deltaPath} fill="none" stroke={COLORS.best} strokeWidth="1.8" />
          </g>

          {/* Throttle and brake, with the trail-braking overlap */}
          <g transform={`translate(0, ${hSpeed + hDelta})`}>
            <rect x={padLeft} y={0} width={chartWidth} height={laneHeaderH} fill="rgba(14,19,30,0.85)" />
            <line x1={padLeft} y1={laneHeaderH} x2={width - padRight} y2={laneHeaderH} stroke="rgba(255,255,255,0.08)" />
            <rect x={padLeft} y={laneHeaderH} width={chartWidth} height={hPedals - laneHeaderH} fill="rgba(0,0,0,0.2)" />
            <line x1={padLeft} y1={hPedals} x2={width - padRight} y2={hPedals} stroke="rgba(255,255,255,0.1)" />
            <line x1={padLeft} y1={(laneHeaderH + hPedals - lanePadBottom) / 2} x2={width - padRight} y2={(laneHeaderH + hPedals - lanePadBottom) / 2} stroke="rgba(255,255,255,0.06)" strokeDasharray="2,2" />

            {/* Y-Axis Labels */}
            <text x={padLeft - 6} y={laneHeaderH + 8} fill={COLORS.muted} fontSize="8px" fontFamily="'JetBrains Mono', monospace" textAnchor="end">100%</text>
            <text x={padLeft - 6} y={(laneHeaderH + hPedals - lanePadBottom) / 2 + 3} fill={COLORS.muted} fontSize="8px" fontFamily="'JetBrains Mono', monospace" textAnchor="end">50%</text>
            <text x={padLeft - 6} y={hPedals - lanePadBottom} fill={COLORS.muted} fontSize="8px" fontFamily="'JetBrains Mono', monospace" textAnchor="end">0%</text>

            {/* Brake translucent fill under comp braking curve */}
            <path d={brkCompFillPath} fill="rgba(255, 24, 1, 0.18)" />

            {/* Throttle traces: Ref (dashed emerald) & Comp (solid neon green) */}
            <path d={thrRefPath} fill="none" stroke="#10B981" strokeWidth="1.2" strokeDasharray="3,3" strokeOpacity="0.75" />
            <path d={thrCompPath} fill="none" stroke={COLORS.gain} strokeWidth="2.2" />

            {/* Brake traces: Ref (dashed cyan) & Comp (solid red) */}
            <path d={brkRefPath} fill="none" stroke={COLORS.brand} strokeWidth="1.5" strokeDasharray="3,3" strokeOpacity="0.8" />
            <path d={brkCompPath} fill="none" stroke={COLORS.loss} strokeWidth="2.4" />
          </g>

          {/* Gear */}
          <g transform={`translate(0, ${hSpeed + hDelta + hPedals})`}>
            <rect x={padLeft} y={0} width={chartWidth} height={laneHeaderH} fill="rgba(14,19,30,0.85)" />
            <line x1={padLeft} y1={laneHeaderH} x2={width - padRight} y2={laneHeaderH} stroke="rgba(255,255,255,0.08)" />
            <rect x={padLeft} y={laneHeaderH} width={chartWidth} height={hGear - laneHeaderH} fill="rgba(0,0,0,0.3)" />

            {/* Y-Axis Labels for Gear */}
            <text x={padLeft - 6} y={laneHeaderH + 8} fill={COLORS.muted} fontSize="8px" fontFamily="'JetBrains Mono', monospace" textAnchor="end">7</text>
            <text x={padLeft - 6} y={(laneHeaderH + hGear - lanePadBottom) / 2 + 3} fill={COLORS.muted} fontSize="8px" fontFamily="'JetBrains Mono', monospace" textAnchor="end">4</text>
            <text x={padLeft - 6} y={hGear - lanePadBottom} fill={COLORS.muted} fontSize="8px" fontFamily="'JetBrains Mono', monospace" textAnchor="end">1</text>

            <path d={gearRefPath} fill="none" stroke={COLORS.brand} strokeWidth="1" strokeDasharray="2,2" strokeOpacity="0.6" />
            <path d={gearCompPath} fill="none" stroke="#E2E8F0" strokeWidth="2" />
          </g>

          {/* Vertical Crosshair Line */}
          {hoverData && (
            <line
              x1={hoverData.x}
              y1={0}
              x2={hoverData.x}
              y2={totalHeight}
              stroke={COLORS.brand}
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
