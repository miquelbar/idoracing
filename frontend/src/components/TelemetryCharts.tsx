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
  showIdealGhost?: boolean;
  onToggleIdealGhost?: () => void;
}

export const TelemetryCharts: React.FC<TelemetryChartsProps> = ({
  comparison,
  hoverDistance,
  onHoverDistance,
  selectedCorner,
  onResetZoom,
  showIdealGhost = false,
  onToggleIdealGhost,
}) => {
  const { lang, t } = useLanguage();
  const isEn = lang === 'en';
  const refNum = comparison.ref_lap_id.replace('Lap ', '');
  const compNum = comparison.comp_lap_id.replace('Lap ', '');
  const containerRef = useRef<HTMLDivElement>(null);
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 850, height: 500 });

  // Interactive visibility toggles: P2 & P1 active by default, 👻 Bubota off by default
  const [showP2, setShowP2] = useState(true);
  const [showP1, setShowP1] = useState(true);
  const [localBubota, setLocalBubota] = useState(false);
  const [p1PedalsExplicitWithBubota, setP1PedalsExplicitWithBubota] = useState(false);

  const isBubotaActive = onToggleIdealGhost ? showIdealGhost : localBubota;

  // When 👻 Bubota is toggled on, automatically hide P1 pedals in the Pedals lane unless user clicks P1 explicitly
  useEffect(() => {
    if (isBubotaActive) {
      setP1PedalsExplicitWithBubota(false);
    }
  }, [isBubotaActive]);

  const showP1InPedals = showP1 && (!isBubotaActive || p1PedalsExplicitWithBubota);

  const handleToggleBubota = () => {
    if (onToggleIdealGhost) {
      onToggleIdealGhost();
    } else {
      setLocalBubota((v) => !v);
    }
  };

  const handleToggleP1 = () => {
    if (isBubotaActive && showP1 && !p1PedalsExplicitWithBubota) {
      // User explicitly clicked P1 while Bubota is active -> re-enable P1 pedals
      setP1PedalsExplicitWithBubota(true);
      return;
    }
    if (showP1) {
      setShowP1(false);
      setP1PedalsExplicitWithBubota(false);
    } else {
      setShowP1(true);
      setP1PedalsExplicitWithBubota(isBubotaActive);
    }
  };

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
    speedIdealPath,
    deltaPath,
    deltaFillPath,
    thrRefPath,
    thrCompPath,
    thrIdealPath,
    brkRefPath,
    brkCompPath,
    brkIdealPath,
    brkCompTrailFillPath,
    bubotaLabels,
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
    const idealSp = comparison.ideal_speed || [];
    const deltaT = comparison.delta_time;
    const refThr = comparison.ref_throttle;
    const compThr = comparison.comp_throttle;
    const idealThr = comparison.ideal_throttle || [];
    const refBrk = comparison.ref_brake;
    const compBrk = comparison.comp_brake;
    const idealBrk = comparison.ideal_brake || [];
    const refGr = comparison.ref_gear;
    const compGr = comparison.comp_gear;

    if (filteredIndices.length === 0) {
      return {
        speedRefPath: '',
        speedCompPath: '',
        speedIdealPath: '',
        deltaPath: '',
        deltaFillPath: '',
        thrRefPath: '',
        thrCompPath: '',
        thrIdealPath: '',
        brkRefPath: '',
        brkCompPath: '',
        brkIdealPath: '',
        brkCompTrailFillPath: '',
        bubotaLabels: [] as Array<{ key: string; kind: 'brake' | 'gas'; x: number; y: number }>,
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
      const s3 = idealSp[idx];
      if (typeof s1 === 'number' && s1 > 5) speedsInView.push(s1);
      if (typeof s2 === 'number' && s2 > 5) speedsInView.push(s2);
      if (typeof s3 === 'number' && s3 > 5) speedsInView.push(s3);
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
    let spI = '';
    let dLine = '';
    let dFill = '';
    let tR = '';
    let tC = '';
    let tI = '';
    let bR = '';
    let bC = '';
    let bI = '';
    let bC_TrailFill = '';
    let gR = '';
    let gC = '';
    const labels: Array<{ key: string; kind: 'brake' | 'gas'; x: number; y: number }> = [];

    const yDeltaZero = toYDelta(0);
    const yPedalZero = toYPedal(0);

    const activeCorners = selectedCorner ? [selectedCorner] : comparison.corners || [];

    const evalIdealPedals = (d: number, idx: number): { brk: number; thr: number } => {
      if (activeCorners.length === 0) {
        return {
          brk: idealBrk[idx] ?? refBrk[idx] ?? 0,
          thr: idealThr[idx] ?? refThr[idx] ?? 0,
        };
      }
      for (const c of activeCorners) {
        const apexD = c.apex_distance ?? (c.start_distance + c.end_distance) / 2;
        const bpD =
          c.ideal_brake_point ??
          (c.ref_brake_point != null || c.comp_brake_point != null
            ? Math.max(c.ref_brake_point ?? c.start_distance, c.comp_brake_point ?? c.start_distance) + 6
            : null);

        // 1. Optimal Trail Braking wedge: [bpD - 6, apexD]
        if (bpD != null && bpD < apexD && d >= bpD - 6 && d <= apexD) {
          const span = Math.max(12, apexD - bpD);
          const peakEnd = bpD + 0.28 * span;
          let brk = 0;
          if (d < bpD) {
            brk = Math.max(0, Math.min(1, (d - (bpD - 6)) / 6));
          } else if (d <= peakEnd) {
            brk = 1.0;
          } else {
            brk = Math.max(0, Math.min(1, 1.0 - (d - peakEnd) / Math.max(4, apexD - peakEnd)));
          }
          return { brk, thr: 0 };
        }

        // 2. Optimal Exit Traction ramp: [apexD, holdEnd]
        const rampEnd = Math.min(c.end_distance, apexD + Math.max(28, 0.58 * (c.end_distance - apexD)));
        const holdEnd = Math.min(c.end_distance + 12, rampEnd + 22);
        if (d >= apexD && d <= holdEnd) {
          const thr =
            d <= rampEnd
              ? 0.15 + 0.85 * Math.max(0, Math.min(1, (d - apexD) / Math.max(6, rampEnd - apexD)))
              : 1.0;
          return { brk: 0, thr };
        }
      }
      return { brk: 0, thr: 0 };
    };

    const appendPedalStroke = (
      path: string,
      x: string,
      y: string,
      val: number,
      prevVal: number,
      nextVal: number,
      isFirst: boolean,
    ): string => {
      const active = val > 0.005 || prevVal > 0.005 || nextVal > 0.005;
      if (!active) return path;
      const continuing = !isFirst && (prevVal > 0.005 || val > 0.005);
      if (path === '' || !continuing) {
        return `${path}${path ? ' ' : ''}M ${x} ${y}`;
      }
      return `${path} L ${x} ${y}`;
    };

    filteredIndices.forEach((idx, i) => {
      const d = dists[idx];
      const x = toX(d).toFixed(1);

      const ySpR = toYSpeed(refSp[idx]).toFixed(1);
      const ySpC = toYSpeed(compSp[idx]).toFixed(1);
      const ySpI = toYSpeed(idealSp[idx] ?? Math.max(refSp[idx], compSp[idx])).toFixed(1);
      const yDt = toYDelta(deltaT[idx]).toFixed(1);

      const valTr = refThr[idx] ?? 0;
      const valTc = compThr[idx] ?? 0;
      const valBr = refBrk[idx] ?? 0;
      const valBc = compBrk[idx] ?? 0;

      const prevIdx = i > 0 ? filteredIndices[i - 1] : idx;
      const nextIdx = i < filteredIndices.length - 1 ? filteredIndices[i + 1] : idx;

      const yTr = toYPedal(valTr).toFixed(1);
      const yTc = toYPedal(valTc).toFixed(1);
      const yBr = toYPedal(valBr).toFixed(1);
      const yBc = toYPedal(valBc).toFixed(1);
      const yGr = toYGear(refGr[idx]).toFixed(1);
      const yGc = toYGear(compGr[idx]).toFixed(1);

      tR = appendPedalStroke(tR, x, yTr, valTr, refThr[prevIdx] ?? 0, refThr[nextIdx] ?? 0, i === 0);
      tC = appendPedalStroke(tC, x, yTc, valTc, compThr[prevIdx] ?? 0, compThr[nextIdx] ?? 0, i === 0);
      bR = appendPedalStroke(bR, x, yBr, valBr, refBrk[prevIdx] ?? 0, refBrk[nextIdx] ?? 0, i === 0);
      bC = appendPedalStroke(bC, x, yBc, valBc, compBrk[prevIdx] ?? 0, compBrk[nextIdx] ?? 0, i === 0);

      if (i === 0) {
        spR += `M ${x} ${ySpR}`;
        spC += `M ${x} ${ySpC}`;
        spI += `M ${x} ${ySpI}`;
        dLine += `M ${x} ${yDt}`;
        dFill += `M ${x} ${yDeltaZero} L ${x} ${yDt}`;
        gR += `M ${x} ${yGr}`;
        gC += `M ${x} ${yGc}`;
      } else {
        spR += ` L ${x} ${ySpR}`;
        spC += ` L ${x} ${ySpC}`;
        spI += ` L ${x} ${ySpI}`;
        dLine += ` L ${x} ${yDt}`;
        dFill += ` L ${x} ${yDt}`;
        gR += ` L ${x} ${yGr}`;
        gC += ` L ${x} ${yGc}`;
      }
    });

    // Build per-corner P2 Trail Braking soft fill, and 👻 Bubota Brake & Gas dashed paths + labels
    for (const c of activeCorners) {
      const apexD = c.apex_distance ?? (c.start_distance + c.end_distance) / 2;
      const compBp = c.comp_brake_point ?? c.ref_brake_point ?? c.start_distance;
      const trailStart = compBp + 0.22 * Math.max(10, apexD - compBp);
      const p2TrailIdxs = filteredIndices.filter(
        (idx) => dists[idx] >= trailStart && dists[idx] <= apexD && (compBrk[idx] ?? 0) > 0.01,
      );
      if (p2TrailIdxs.length >= 2) {
        const xFirst = toX(dists[p2TrailIdxs[0]]).toFixed(1);
        const xLast = toX(dists[p2TrailIdxs[p2TrailIdxs.length - 1]]).toFixed(1);
        bC_TrailFill += `${bC_TrailFill ? ' ' : ''}M ${xFirst} ${yPedalZero.toFixed(1)}`;
        for (const idx of p2TrailIdxs) {
          bC_TrailFill += ` L ${toX(dists[idx]).toFixed(1)} ${toYPedal(compBrk[idx]).toFixed(1)}`;
        }
        bC_TrailFill += ` L ${xLast} ${yPedalZero.toFixed(1)} Z`;
      }

      const bpD =
        c.ideal_brake_point ??
        (c.ref_brake_point != null || c.comp_brake_point != null
          ? Math.max(c.ref_brake_point ?? c.start_distance, c.comp_brake_point ?? c.start_distance) + 6
          : null);

      if (bpD != null && bpD < apexD) {
        const brkIdxs = filteredIndices.filter((idx) => dists[idx] >= bpD - 6 && dists[idx] <= apexD);
        if (brkIdxs.length >= 2) {
          const xFirst = toX(dists[brkIdxs[0]]).toFixed(1);
          const xLast = toX(dists[brkIdxs[brkIdxs.length - 1]]).toFixed(1);
          bI += `${bI ? ' ' : ''}M ${xFirst} ${yPedalZero.toFixed(1)}`;
          for (const idx of brkIdxs) {
            const x = toX(dists[idx]).toFixed(1);
            const y = toYPedal(evalIdealPedals(dists[idx], idx).brk).toFixed(1);
            bI += ` L ${x} ${y}`;
          }
          bI += ` L ${xLast} ${yPedalZero.toFixed(1)}`;

          const pxW = toX(apexD) - toX(bpD);
          if (selectedCorner || pxW >= 26) {
            labels.push({
              key: `brk-${c.corner_number}`,
              kind: 'brake',
              x: toX(bpD + 0.45 * (apexD - bpD)),
              y: toYPedal(0.72),
            });
          }
        }
      }

      const rampEnd = Math.min(c.end_distance, apexD + Math.max(28, 0.58 * (c.end_distance - apexD)));
      const holdEnd = Math.min(c.end_distance + 12, rampEnd + 22);
      const thrIdxs = filteredIndices.filter((idx) => dists[idx] >= apexD && dists[idx] <= holdEnd);
      if (thrIdxs.length >= 2) {
        const xFirst = toX(dists[thrIdxs[0]]).toFixed(1);
        tI += `${tI ? ' ' : ''}M ${xFirst} ${yPedalZero.toFixed(1)}`;
        for (const idx of thrIdxs) {
          const x = toX(dists[idx]).toFixed(1);
          const y = toYPedal(evalIdealPedals(dists[idx], idx).thr).toFixed(1);
          tI += ` L ${x} ${y}`;
        }

        const pxW = toX(holdEnd) - toX(apexD);
        if (selectedCorner || pxW >= 26) {
          labels.push({
            key: `gas-${c.corner_number}`,
            kind: 'gas',
            x: toX(apexD + 0.48 * (rampEnd - apexD)),
            y: toYPedal(0.55),
          });
        }
      }
    }

    // Close delta area fill
    if (filteredIndices.length > 0) {
      const lastX = toX(dists[filteredIndices[filteredIndices.length - 1]]).toFixed(1);
      dFill += ` L ${lastX} ${yDeltaZero} Z`;
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
      const idealAtHover = evalIdealPedals(dists[closestIdx], closestIdx);
      hData = {
        distance: dists[closestIdx],
        refSpeed: refSp[closestIdx],
        compSpeed: compSp[closestIdx],
        idealSpeed: idealSp[closestIdx] ?? Math.max(refSp[closestIdx], compSp[closestIdx]),
        deltaSpeed: compSp[closestIdx] - refSp[closestIdx],
        deltaTime: deltaT[closestIdx],
        refThr: toPct(refThr[closestIdx]),
        compThr: toPct(compThr[closestIdx]),
        idealThr: toPct(idealAtHover.thr),
        refBrk: toPct(refBrk[closestIdx]),
        compBrk: toPct(compBrk[closestIdx]),
        idealBrk: toPct(idealAtHover.brk),
        refGear: refGr[closestIdx],
        compGear: compGr[closestIdx],
        x: toX(dists[closestIdx]),
      };
    }

    return {
      speedRefPath: spR,
      speedCompPath: spC,
      speedIdealPath: spI,
      deltaPath: dLine,
      deltaFillPath: dFill,
      thrRefPath: tR,
      thrCompPath: tC,
      thrIdealPath: tI,
      brkRefPath: bR,
      brkCompPath: bC,
      brkIdealPath: bI,
      brkCompTrailFillPath: bC_TrailFill,
      bubotaLabels: labels,
      gearRefPath: gR,
      gearCompPath: gC,
      hoverData: hData,
      minSpeed: minSpeedVal,
      maxSpeed: maxSpeedVal,
      maxDelta: maxDeltaVal,
    };
  }, [comparison, selectedCorner, filteredIndices, toX, hoverDistance, hSpeed, hDelta, hPedals, hGear]);

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
      {/* Header with Title, Inline Live Telemetry Values, and Interactive Layer Toggles */}
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

          {/* Inline Live Values */}
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
                  {t('throttle')}: <strong className="text-[#10b981]">{Math.round(hoverData.compThr)}%</strong>
                </span>
                <span className="hidden sm:inline">
                  {t('brake')}: <strong className="text-[#ef4444]">{Math.round(hoverData.compBrk)}%</strong>
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

        {/* Right: Interactive Layer Toggles (P2, P1, 👻 Bubota) and Reset Zoom */}
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

          <div className="flex items-center gap-1.5">
            {/* P2 Toggle Button: Solid Line */}
            <button
              type="button"
              onClick={() => setShowP2((v) => !v)}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded border transition cursor-pointer ${
                showP2
                  ? 'bg-[#A855F7]/20 border-[#A855F7]/60 text-[#D8B4FE] shadow-sm'
                  : 'bg-white/5 border-white/10 text-gray-500 opacity-60 hover:opacity-100'
              }`}
              title="Mostrar/ocultar Vuelta Comparada (P2) - Línea Continua"
            >
              <svg width="14" height="4" className="shrink-0">
                <line x1="0" y1="2" x2="14" y2="2" stroke={showP2 ? '#D8B4FE' : '#64748B'} strokeWidth="2" />
              </svg>
              <span className="font-bold">P2 ({isEn ? 'L' : 'V'}{compNum})</span>
            </button>

            {/* P1 Toggle Button: Dotted Line */}
            <button
              type="button"
              onClick={handleToggleP1}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded border transition cursor-pointer ${
                showP1 && showP1InPedals
                  ? 'bg-[#00D2BE]/18 border-[#00D2BE]/55 text-[#00D2BE] shadow-sm'
                  : showP1
                  ? 'bg-[#00D2BE]/10 border-[#00D2BE]/30 text-[#00D2BE]/80'
                  : 'bg-white/5 border-white/10 text-gray-500 opacity-60 hover:opacity-100'
              }`}
              title={
                isBubotaActive && showP1 && !p1PedalsExplicitWithBubota
                  ? 'P1 oculta en Pedales mientras 👻 Bubota está activa — haz clic para superponer también P1 en Pedales'
                  : 'Mostrar/ocultar Vuelta Referencia (P1) - Línea Punteada'
              }
            >
              <svg width="14" height="4" className="shrink-0">
                <line
                  x1="0"
                  y1="2"
                  x2="14"
                  y2="2"
                  stroke={showP1 ? '#00E5FF' : '#64748B'}
                  strokeWidth="1.5"
                  strokeDasharray="3,3"
                />
              </svg>
              <span className="font-bold">P1 ({isEn ? 'L' : 'V'}{refNum})</span>
            </button>

            {/* 👻 Bubota Toggle Button */}
            <button
              type="button"
              onClick={handleToggleBubota}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded border transition cursor-pointer ${
                isBubotaActive
                  ? 'bg-[#facc15]/20 border-[#facc15]/70 text-[#facc15] shadow-sm'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
              }`}
              title={
                isEn
                  ? '👻 Bubota: Toggle Optimal Trail Braking (#f97316), Gas (#a3e635) & Target Speed (#facc15)'
                  : '👻 Bubota: Activar/desactivar guía ideal de Freno (#f97316), Gas (#a3e635) y Velocidad (#facc15)'
              }
            >
              <svg width="14" height="4" className="shrink-0">
                <line
                  x1="0"
                  y1="2"
                  x2="14"
                  y2="2"
                  stroke={isBubotaActive ? '#facc15' : '#94A3B8'}
                  strokeWidth="2"
                  strokeDasharray="7,4"
                />
              </svg>
              <span className="font-bold">👻 Bubota</span>
            </button>

            {/* Channel Colors: Brake & Throttle */}
            <div className="hidden xl:flex items-center gap-2 pl-2 border-l border-white/10">
              <div className="flex items-center gap-1" title="Curva de Freno (Gama Roja/Naranja)">
                <span className="w-2 h-2 rounded-full bg-[#ef4444]" />
                <span className="text-[#ef4444] font-bold">{t('brake')}</span>
              </div>
              <div className="flex items-center gap-1" title="Curva de Gas / Acelerador (Gama Verde/Lima)">
                <span className="w-2 h-2 rounded-full bg-[#10b981]" />
                <span className="text-[#10b981] font-bold">{t('throttle')}</span>
              </div>
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
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase text-gray-200 bg-[#161D2C] border border-white/10 shadow-sm">
              {t('pedals_ch')}
            </span>
            {!hoverData && (
              <span className="hidden lg:flex items-center gap-2.5 text-[9.5px] text-gray-300 font-telemetry bg-black/55 px-2.5 py-0.5 rounded border border-white/10">
                {showP2 && (
                  <span className="flex items-center gap-1">
                    <svg width="12" height="4"><line x1="0" y1="2" x2="12" y2="2" stroke="#ef4444" strokeWidth="2" /></svg>
                    <span className="text-[#ef4444] font-bold">Freno P2</span>
                  </span>
                )}
                {showP1InPedals && (
                  <span className="flex items-center gap-1">
                    <svg width="12" height="4"><line x1="0" y1="2" x2="12" y2="2" stroke="#fca5a5" strokeWidth="1.5" strokeDasharray="3,3" /></svg>
                    <span className="text-[#fca5a5] font-bold">Freno P1</span>
                  </span>
                )}
                {isBubotaActive && (
                  <span className="flex items-center gap-1">
                    <svg width="12" height="4"><line x1="0" y1="2" x2="12" y2="2" stroke="#f97316" strokeWidth="2" strokeDasharray="7,4" /></svg>
                    <span className="text-[#f97316] font-bold">👻 Freno</span>
                  </span>
                )}
                <span className="text-gray-600">|</span>
                {showP2 && (
                  <span className="flex items-center gap-1">
                    <svg width="12" height="4"><line x1="0" y1="2" x2="12" y2="2" stroke="#10b981" strokeWidth="2" /></svg>
                    <span className="text-[#10b981] font-bold">Gas P2</span>
                  </span>
                )}
                {showP1InPedals && (
                  <span className="flex items-center gap-1">
                    <svg width="12" height="4"><line x1="0" y1="2" x2="12" y2="2" stroke="#6ee7b7" strokeWidth="1.5" strokeDasharray="3,3" /></svg>
                    <span className="text-[#6ee7b7] font-bold">Gas P1</span>
                  </span>
                )}
                {isBubotaActive && (
                  <span className="flex items-center gap-1">
                    <svg width="12" height="4"><line x1="0" y1="2" x2="12" y2="2" stroke="#a3e635" strokeWidth="2" strokeDasharray="7,4" /></svg>
                    <span className="text-[#a3e635] font-bold">👻 Gas</span>
                  </span>
                )}
              </span>
            )}
          </div>
          {hoverData && (
            <span className="text-[10px] font-telemetry text-gray-300 bg-black/75 px-2.5 py-0.5 rounded border border-white/10">
              Gas: <strong className="text-[#10b981]">P2 {Math.round(hoverData.compThr)}%</strong>{' '}
              {showP1InPedals && <span className="text-[#6ee7b7]">(P1 {Math.round(hoverData.refThr)}%)</span>}
              {isBubotaActive && <span className="text-[#a3e635] font-bold"> (👻 Gas {Math.round(hoverData.idealThr)}%)</span>}
              {' • '}Freno:{' '}
              <strong className="text-[#ef4444]">P2 {Math.round(hoverData.compBrk)}%</strong>{' '}
              {showP1InPedals && <span className="text-[#fca5a5]">(P1 {Math.round(hoverData.refBrk)}%)</span>}
              {isBubotaActive && <span className="text-[#f97316] font-bold"> (👻 Freno {Math.round(hoverData.idealBrk)}%)</span>}
            </span>
          )}
        </div>

        <div
          className="absolute z-10 pointer-events-none flex items-center justify-between px-2 select-none"
          style={{ top: hSpeed + hDelta + hPedals + 2, left: padLeft, width: chartWidth, height: laneHeaderH - 4 }}
        >
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase text-gray-200 bg-[#161D2C] border border-white/10 shadow-sm">
              {t('gear_ch')}
            </span>
            {!hoverData && (
              <span className="hidden lg:flex items-center gap-2 text-[9px] text-gray-400 font-telemetry bg-black/40 px-2 py-0.5 rounded border border-white/5">
                {showP2 && (
                  <span className="flex items-center gap-1">
                    <svg width="12" height="3"><line x1="0" y1="1.5" x2="12" y2="1.5" stroke="#E2E8F0" strokeWidth="2" /></svg>
                    <span className="text-gray-300">P2 (Sólida)</span>
                  </span>
                )}
                {showP1 && (
                  <span className="flex items-center gap-1">
                    <svg width="12" height="3"><line x1="0" y1="1.5" x2="12" y2="1.5" stroke="#00E5FF" strokeWidth="1.5" strokeDasharray="3,3" /></svg>
                    <span className="text-cyan-400">P1 (Puntos)</span>
                  </span>
                )}
              </span>
            )}
          </div>
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
            <linearGradient id="brake-trail-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.02" />
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

            {showP1 && (
              <path d={speedRefPath} fill="none" stroke="#00E5FF" strokeWidth="1.5" strokeDasharray="3,3" strokeOpacity="0.92" />
            )}
            {showP2 && (
              <path d={speedCompPath} fill="none" stroke={COLORS.comp} strokeWidth="2" />
            )}
            {isBubotaActive && speedIdealPath && (
              <path
                d={speedIdealPath}
                fill="none"
                stroke="#facc15"
                strokeWidth="2"
                strokeDasharray="7,4"
                strokeOpacity="0.98"
              />
            )}
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

            {/* Soft fill ONLY for P2 Brake in the trail braking zone (no yellow ghost fill, no P1 fill) */}
            {showP2 && brkCompTrailFillPath && (
              <path d={brkCompTrailFillPath} fill="url(#brake-trail-gradient)" />
            )}

            {/* Throttle traces: P1 (#6ee7b7 dotted 1.5px), P2 (#10b981 solid 2px), 👻 Bubota Gas (#a3e635 dashed 2px) */}
            {showP1InPedals && (
              <path d={thrRefPath} fill="none" stroke="#6ee7b7" strokeWidth="1.5" strokeDasharray="3,3" strokeOpacity="0.95" />
            )}
            {showP2 && (
              <path d={thrCompPath} fill="none" stroke="#10b981" strokeWidth="2" />
            )}
            {isBubotaActive && thrIdealPath && (
              <path
                d={thrIdealPath}
                fill="none"
                stroke="#a3e635"
                strokeWidth="2"
                strokeDasharray="7,4"
                strokeOpacity="0.98"
              />
            )}

            {/* Brake traces: P1 (#fca5a5 dotted 1.5px), P2 (#ef4444 solid 2px), 👻 Bubota Brake (#f97316 dashed 2px) */}
            {showP1InPedals && (
              <path d={brkRefPath} fill="none" stroke="#fca5a5" strokeWidth="1.5" strokeDasharray="3,3" strokeOpacity="0.95" />
            )}
            {showP2 && (
              <path d={brkCompPath} fill="none" stroke="#ef4444" strokeWidth="2" />
            )}
            {isBubotaActive && brkIdealPath && (
              <path
                d={brkIdealPath}
                fill="none"
                stroke="#f97316"
                strokeWidth="2"
                strokeDasharray="7,4"
                strokeOpacity="1"
              />
            )}

            {/* Inline labels for 👻 Bubota Freno (#f97316) and 👻 Bubota Gas (#a3e635) */}
            {isBubotaActive &&
              bubotaLabels.map((lbl) => (
                <g key={lbl.key} transform={`translate(${lbl.x.toFixed(1)}, ${lbl.y.toFixed(1)})`}>
                  <rect
                    x={-26}
                    y={-8}
                    width={52}
                    height={14}
                    rx={3}
                    fill="rgba(8, 9, 12, 0.85)"
                    stroke={lbl.kind === 'brake' ? '#f97316' : '#a3e635'}
                    strokeWidth="0.8"
                  />
                  <text
                    x={0}
                    y={2}
                    fill={lbl.kind === 'brake' ? '#f97316' : '#a3e635'}
                    fontSize="8.5px"
                    fontWeight="bold"
                    fontFamily="'JetBrains Mono', monospace"
                    textAnchor="middle"
                  >
                    {lbl.kind === 'brake' ? '👻 Freno' : '👻 Gas'}
                  </text>
                </g>
              ))}
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

            {showP1 && (
              <path d={gearRefPath} fill="none" stroke={COLORS.brand} strokeWidth="1" strokeDasharray="3,3" strokeOpacity="0.6" />
            )}
            {showP2 && (
              <path d={gearCompPath} fill="none" stroke="#E2E8F0" strokeWidth="2" />
            )}
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
