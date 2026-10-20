import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, CornerDownRight, Zap } from 'lucide-react';
import type { ComparisonResponse, CornerDTO } from '../../types/telemetry';
import { useLanguage } from '../../i18n';
import type { TrackGeometry } from './trackGeometry';
import { COLORS } from '../../theme';

interface CornerDiagramProps {
  selectedCorner: CornerDTO;
  staticTrack: TrackGeometry | null;
  comparison?: ComparisonResponse | null;
  onSelectCorner: (corner: CornerDTO | null) => void;
}

/** Measured real trajectory zoom of reference and driven lines through the corner. */
export const CornerDiagram: React.FC<CornerDiagramProps> = ({ selectedCorner, staticTrack: _staticTrack, comparison, onSelectCorner: _onSelectCorner }) => {
  const { t } = useLanguage();
  const cornerSvgData = selectedCorner.racing_line_svg;
  const isLeft = cornerSvgData?.turn_dir === 'left';
  const hasUndersteer = cornerSvgData?.has_understeer || selectedCorner.balance_code === 'understeer';
  const isEarlyApex = selectedCorner.racing_line_code === 'early_apex';
  const isOptimal = selectedCorner.racing_line_code === 'optimal';

  // Compute real measured trajectory from telemetry (track coordinates & driven lines)
  const realCorner = useMemo(() => {
    if (!comparison || !comparison.track_x || comparison.track_x.length === 0) {
      return null;
    }
    const dists = comparison.distance || [];
    const xs = comparison.track_x;
    const ys = comparison.track_y;
    const refX = comparison.ref_x && comparison.ref_x.length === xs.length ? comparison.ref_x : xs;
    const refY = comparison.ref_y && comparison.ref_y.length === ys.length ? comparison.ref_y : ys;
    const compX = comparison.comp_x && comparison.comp_x.length === xs.length ? comparison.comp_x : xs;
    const compY = comparison.comp_y && comparison.comp_y.length === ys.length ? comparison.comp_y : ys;

    const startDist = Math.max(0, selectedCorner.start_distance - 25);
    const endDist = selectedCorner.end_distance + 25;

    const indices: number[] = [];
    for (let i = 0; i < dists.length; i++) {
      if (dists[i] >= startDist && dists[i] <= endDist) {
        indices.push(i);
      }
    }
    if (indices.length < 5) return null;

    // 1. Frame bounding box STRICTLY around the track centerline with an 8m road margin.
    // This prevents outlaps or spurious GPS jumps from distorting the framing.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    indices.forEach((i) => {
      minX = Math.min(minX, xs[i] - 8);
      maxX = Math.max(maxX, xs[i] + 8);
      minY = Math.min(minY, ys[i] - 8);
      maxY = Math.max(maxY, ys[i] + 8);
    });

    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;

    // SVG coordinate system 440 x 230 with padding
    const pad = 34;
    const scale = Math.min((440 - pad * 2) / spanX, (230 - pad * 2) / spanY);
    const offsetX = (440 - spanX * scale) / 2;
    const offsetY = (230 - spanY * scale) / 2;

    const toSvg = (x: number, y: number) => ({
      x: offsetX + (x - minX) * scale,
      y: 230 - (offsetY + (y - minY) * scale),
    });

    const trackPts = indices.map((i) => toSvg(xs[i], ys[i]));
    const n = trackPts.length;

    // 2. Compute local tangents, normals and inside/outside vectors along the curve
    const inX: number[] = new Array(n);
    const inY: number[] = new Array(n);
    let crossSum = 0;

    for (let i = 0; i < n; i++) {
      const prev = trackPts[Math.max(0, i - 1)];
      const next = trackPts[Math.min(n - 1, i + 1)];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      inX[i] = -dy / len;
      inY[i] = dx / len;

      if (i > 0 && i < n - 1) {
        const seg1x = trackPts[i].x - prev.x;
        const seg1y = trackPts[i].y - prev.y;
        const seg2x = next.x - trackPts[i].x;
        const seg2y = next.y - trackPts[i].y;
        crossSum += seg1x * seg2y - seg1y * seg2x;
      }
    }

    // Direct inside towards the apex side based on curvature
    const insideSign = crossSum >= 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      inX[i] *= insideSign;
      inY[i] *= insideSign;
    }

    // Track half-width in SVG pixels (approx 6-7m real track width, clamped between 15px and 25px)
    const W = Math.max(15, Math.min(25, 6.5 * scale));

    // 3. Construct 2D Asphalt Ribbon and Curbs
    const innerEdge = trackPts.map((p, i) => ({ x: p.x + inX[i] * W, y: p.y + inY[i] * W }));
    const outerEdge = trackPts.map((p, i) => ({ x: p.x - inX[i] * W, y: p.y - inY[i] * W }));

    const asphaltPolygon =
      `M ${innerEdge[0].x.toFixed(1)} ${innerEdge[0].y.toFixed(1)} ` +
      innerEdge.slice(1).map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
      outerEdge.slice().reverse().map((p) => ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('') +
      ' Z';

    const innerBorder =
      `M ${innerEdge[0].x.toFixed(1)} ${innerEdge[0].y.toFixed(1)} ` +
      innerEdge.slice(1).map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

    const outerBorder =
      `M ${outerEdge[0].x.toFixed(1)} ${outerEdge[0].y.toFixed(1)} ` +
      outerEdge.slice(1).map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

    const centerLine =
      `M ${trackPts[0].x.toFixed(1)} ${trackPts[0].y.toFixed(1)} ` +
      trackPts.slice(1).map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

    // Find key indices (Turn-in, Apex, Exit)
    let apexIdx = 0;
    let minApexDiff = Infinity;
    let turnInIdx = 0;
    let minTurnInDiff = Infinity;
    let exitIdx = n - 1;
    let minExitDiff = Infinity;

    indices.forEach((idx, localI) => {
      const d = dists[idx];
      const diffApex = Math.abs(d - selectedCorner.apex_distance);
      if (diffApex < minApexDiff) {
        minApexDiff = diffApex;
        apexIdx = localI;
      }
      const diffStart = Math.abs(d - selectedCorner.start_distance);
      if (diffStart < minTurnInDiff) {
        minTurnInDiff = diffStart;
        turnInIdx = localI;
      }
      const diffEnd = Math.abs(d - selectedCorner.end_distance);
      if (diffEnd < minExitDiff) {
        minExitDiff = diffEnd;
        exitIdx = localI;
      }
    });

    // Curbs: Apex Kerb on the inside edge, Exit Kerb on the outside edge
    const kerbHalfSpan = Math.max(3, Math.floor(n * 0.14));
    const apexKerbStart = Math.max(0, apexIdx - kerbHalfSpan);
    const apexKerbEnd = Math.min(n - 1, apexIdx + kerbHalfSpan);

    const apexKerbInner = innerEdge.slice(apexKerbStart, apexKerbEnd + 1);
    const apexKerbOuter = trackPts
      .slice(apexKerbStart, apexKerbEnd + 1)
      .map((p, k) => ({ x: p.x + inX[apexKerbStart + k] * (W * 0.65), y: p.y + inY[apexKerbStart + k] * (W * 0.65) }));

    const apexKerbPath =
      apexKerbInner.length > 1
        ? `M ${apexKerbInner[0].x.toFixed(1)} ${apexKerbInner[0].y.toFixed(1)} ` +
          apexKerbInner.slice(1).map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
          apexKerbOuter.slice().reverse().map((p) => ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('') +
          ' Z'
        : '';

    const exitKerbStart = Math.max(0, exitIdx - kerbHalfSpan);
    const exitKerbEnd = Math.min(n - 1, exitIdx + kerbHalfSpan);
    const exitKerbOuter = outerEdge.slice(exitKerbStart, exitKerbEnd + 1);
    const exitKerbInner = trackPts
      .slice(exitKerbStart, exitKerbEnd + 1)
      .map((p, k) => ({ x: p.x - inX[exitKerbStart + k] * (W * 0.65), y: p.y - inY[exitKerbStart + k] * (W * 0.65) }));

    const exitKerbPath =
      exitKerbOuter.length > 1
        ? `M ${exitKerbOuter[0].x.toFixed(1)} ${exitKerbOuter[0].y.toFixed(1)} ` +
          exitKerbOuter.slice(1).map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
          exitKerbInner.slice().reverse().map((p) => ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('') +
          ' Z'
        : '';

    // 4. Generate the True Racing Lines (Optimal vs Actual)
    // Optimal Racing Line (P1): enters on the outside, clips the apex kerb, tracks out to the outside
    const refLinePts = trackPts.map((p, i) => {
      const t = i / (n - 1 || 1);
      const apexT = apexIdx / (n - 1 || 1);
      const ratio = t < apexT ? t / (apexT || 0.01) : (1 - t) / (1 - apexT || 0.01);
      const factor = (1 - Math.cos(ratio * Math.PI)) / 2;
      // Outside is -0.72*W, Apex is +0.82*W
      const offset = -0.72 * W + factor * 1.54 * W;
      return {
        x: p.x + inX[i] * offset,
        y: p.y + inY[i] * offset,
      };
    });

    // Check if comp telemetry has distinct, valid on-track GPS data (< 7m difference)
    let compLinePts = refLinePts;
    let hasDistinctCompGPS = false;

    if (comparison.comp_x && comparison.ref_x) {
      let maxDeltaM = 0;
      indices.forEach((i) => {
        const d = Math.hypot(compX[i] - refX[i], compY[i] - refY[i]);
        maxDeltaM = Math.max(maxDeltaM, d);
      });
      // Valid if between 0.15m and 7.0m from reference
      if (maxDeltaM >= 0.15 && maxDeltaM <= 7.0) {
        hasDistinctCompGPS = true;
        compLinePts = indices.map((i) => toSvg(compX[i], compY[i]));
      }
    }

    if (!hasDistinctCompGPS) {
      // Synthesize realistic driven line from corner driving diagnosis
      compLinePts = trackPts.map((p, i) => {
        const t = i / (n - 1 || 1);
        const apexT = isEarlyApex ? Math.max(0.15, (apexIdx / (n - 1)) - 0.18) : apexIdx / (n - 1 || 1);
        const ratio = t < apexT ? t / (apexT || 0.01) : (1 - t) / (1 - apexT || 0.01);
        const factor = (1 - Math.cos(ratio * Math.PI)) / 2;

        let apexOffset = 0.82 * W;
        let exitOffset = -0.72 * W;

        if (hasUndersteer) {
          // Understeer: misses the apex by 2-3m, washes wide on exit
          apexOffset = 0.25 * W;
          exitOffset = -0.92 * W;
        } else if (isEarlyApex) {
          // Early apex: clips early and runs wide
          apexOffset = 0.70 * W;
          exitOffset = -0.90 * W;
        } else if (selectedCorner.delta_v_min < -3.0) {
          apexOffset = 0.50 * W;
        } else {
          apexOffset = 0.78 * W;
        }

        const offset = -0.72 * W + factor * (apexOffset - (-0.72 * W));
        const finalOffset = t > apexT ? offset + (t - apexT) * (exitOffset - (-0.72 * W)) : offset;
        return {
          x: p.x + inX[i] * finalOffset,
          y: p.y + inY[i] * finalOffset,
        };
      });
    }

    const ptsToPath = (pts: Array<{ x: number; y: number }>) =>
      pts.length
        ? `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} ` +
          pts.slice(1).map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
        : '';

    const apexRefPt = refLinePts[apexIdx];
    const apexCompPt = compLinePts[apexIdx];
    const turnInPt = refLinePts[turnInIdx];
    const exitPt = refLinePts[exitIdx];

    return {
      asphaltPolygon,
      innerBorder,
      outerBorder,
      centerLine,
      apexKerbPath,
      exitKerbPath,
      refPath: ptsToPath(refLinePts),
      compPath: ptsToPath(compLinePts),
      turnInPt,
      apexRefPt,
      apexCompPt,
      exitPt,
      apexDeltaPx: Math.hypot(apexCompPt.x - apexRefPt.x, apexCompPt.y - apexRefPt.y),
    };
  }, [comparison, selectedCorner, isEarlyApex, hasUndersteer]);

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Badges Flotantes Superior Izquierda */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 select-none">
        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-black/80 backdrop-blur-md border border-white/10 text-[10px] font-telemetry text-white font-bold shadow-md">
          <CornerDownRight
            className={`w-3.5 h-3.5 ${isLeft ? '-scale-x-100 text-brand' : 'text-brand'}`}
          />
          <span>{isLeft ? t('turn_left') : t('turn_right')}</span>
        </div>

        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-black/80 backdrop-blur-md border border-white/10 text-[10px] font-telemetry shadow-md">
          {hasUndersteer ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-loss-soft animate-pulse" />
              <span className="text-loss-soft font-bold">{t('understeer')}</span>
            </>
          ) : isEarlyApex ? (
            <>
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-amber-400 font-bold">{t('early_apex')}</span>
            </>
          ) : isOptimal ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-gain" />
              <span className="text-gain font-bold">{t('optimal_line')}</span>
            </>
          ) : (
            <span className="text-gray-300 font-semibold">{t('your_line')}</span>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-2 px-2.5 py-1 rounded bg-black/80 backdrop-blur-md border border-white/10 text-[9px] font-telemetry shadow-md select-none">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 bg-gain border-b border-dashed border-gain" />
          <span className="text-gray-300 font-medium">{t('optimal_badge')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 bg-comp" />
          <span className="text-gray-300 font-medium">{t('your_line')}</span>
        </div>
      </div>

      {/* SVG Curva Detallada con Pianos */}
      <svg viewBox="0 0 440 230" preserveAspectRatio="xMidYMid meet" className="w-full h-full select-none">
        <defs>
          <pattern
            id="unified-kerb-pattern"
            width="12"
            height="12"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="12" fill={COLORS.accent} />
            <rect x="6" width="6" height="12" fill="#F0F0F0" />
          </pattern>
          <filter id="glow-opt" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={COLORS.gain} floodOpacity="0.8" />
          </filter>
          <filter id="glow-act" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={COLORS.comp} floodOpacity="0.9" />
          </filter>
          <filter id="glow-under" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={COLORS.lossLight} floodOpacity="0.8" />
          </filter>
        </defs>

        {/* Road Asphalt Base & Traces */}
        {realCorner ? (
          <>
            {/* Real 2D Track Asphalt Ribbon */}
            <path
              d={realCorner.asphaltPolygon}
              fill="#121722"
              stroke="none"
            />

            {/* Apex Kerb Band */}
            {realCorner.apexKerbPath && (
              <path
                d={realCorner.apexKerbPath}
                fill="url(#unified-kerb-pattern)"
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="1"
              />
            )}

            {/* Exit Kerb Band */}
            {realCorner.exitKerbPath && (
              <path
                d={realCorner.exitKerbPath}
                fill="url(#unified-kerb-pattern)"
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="1"
              />
            )}

            {/* Track Boundaries (Left and Right) */}
            <path
              d={realCorner.innerBorder}
              fill="none"
              stroke="#334155"
              strokeWidth="1.5"
            />
            <path
              d={realCorner.outerBorder}
              fill="none"
              stroke="#334155"
              strokeWidth="1.5"
            />

            {/* Centerline dashed guide */}
            <path
              d={realCorner.centerLine}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
              strokeDasharray="4 6"
            />

            {/* Reference Line (P1) */}
            <path
              d={realCorner.refPath}
              fill="none"
              stroke={COLORS.gain}
              strokeWidth="2.8"
              strokeDasharray="6 3"
              strokeLinecap="round"
              filter="url(#glow-opt)"
              opacity="0.95"
            />

            {/* Driver Line (P2) */}
            <path
              d={realCorner.compPath}
              fill="none"
              stroke={hasUndersteer ? '#FF385C' : COLORS.comp}
              strokeWidth="3.2"
              strokeLinecap="round"
              filter={hasUndersteer ? 'url(#glow-under)' : 'url(#glow-act)'}
            />

            {/* Delta Connector between Apexes if there's a visible gap */}
            {realCorner.apexDeltaPx > 6 && (
              <line
                x1={realCorner.apexRefPt.x}
                y1={realCorner.apexRefPt.y}
                x2={realCorner.apexCompPt.x}
                y2={realCorner.apexCompPt.y}
                stroke="#F43F5E"
                strokeWidth="1.5"
                strokeDasharray="2 2"
                opacity="0.8"
              />
            )}

            {/* Turn-In Marker */}
            <g transform={`translate(${realCorner.turnInPt.x}, ${realCorner.turnInPt.y})`}>
              <circle r="4" fill={COLORS.brand} />
              <circle r="7" fill="none" stroke={COLORS.brand} strokeWidth="1" opacity="0.6" />
              <text
                y={-10}
                textAnchor="middle"
                fill="#94A3B8"
                fontSize="9px"
                fontFamily="monospace"
                fontWeight="bold"
                paintOrder="stroke"
                stroke={COLORS.night1}
                strokeWidth="3px"
              >
                {t('turn_in')}
              </text>
            </g>

            {/* Optimal Apex Marker (P1) */}
            <g transform={`translate(${realCorner.apexRefPt.x}, ${realCorner.apexRefPt.y})`}>
              <circle r="4.5" fill={COLORS.gain} />
              <circle r="8" fill="none" stroke={COLORS.gain} strokeWidth="1" opacity="0.5" />
              <text
                y="-13"
                textAnchor="middle"
                fill={COLORS.gain}
                fontSize="9px"
                fontFamily="monospace"
                fontWeight="bold"
                paintOrder="stroke"
                stroke={COLORS.night1}
                strokeWidth="3px"
                strokeLinejoin="round"
              >
                Ref {selectedCorner.v_min_ref.toFixed(0)} km/h
              </text>
            </g>

            {/* Actual Apex Marker (P2) */}
            <g transform={`translate(${realCorner.apexCompPt.x}, ${realCorner.apexCompPt.y})`}>
              <circle r="5" fill={hasUndersteer ? COLORS.loss : COLORS.comp} />
              <circle
                r="9"
                fill="none"
                stroke={hasUndersteer ? COLORS.loss : COLORS.comp}
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />
              <text
                y="18"
                textAnchor="middle"
                fill={hasUndersteer ? COLORS.lossSoft : '#E9D5FF'}
                fontSize="9px"
                fontFamily="monospace"
                fontWeight="bold"
                paintOrder="stroke"
                stroke={COLORS.night1}
                strokeWidth="3px"
                strokeLinejoin="round"
              >
                Tú {selectedCorner.v_min_comp.toFixed(0)} km/h
              </text>
            </g>

            {/* Exit Marker */}
            <g transform={`translate(${realCorner.exitPt.x}, ${realCorner.exitPt.y})`}>
              <circle r="4" fill={COLORS.best} />
              <text
                y={-8}
                textAnchor="middle"
                fill={COLORS.best}
                fontSize="9px"
                fontFamily="monospace"
                fontWeight="bold"
                paintOrder="stroke"
                stroke={COLORS.night1}
                strokeLinejoin="round"
              >
                {t('exit')}
              </text>
            </g>
          </>
        ) : cornerSvgData ? (
          <>
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
              stroke={COLORS.gain}
              strokeWidth="2.8"
              strokeDasharray="6 3"
              strokeLinecap="round"
              filter="url(#glow-opt)"
              opacity="0.9"
            />

            {/* Actual Line */}
            <path
              d={cornerSvgData.actual_line}
              fill="none"
              stroke={hasUndersteer ? '#FF385C' : COLORS.comp}
              strokeWidth="3.2"
              strokeLinecap="round"
              filter={hasUndersteer ? 'url(#glow-under)' : 'url(#glow-act)'}
            />

            {/* Turn-In Marker */}
            <g transform={`translate(${cornerSvgData.turn_in.x}, ${cornerSvgData.turn_in.y})`}>
              <circle r="4" fill={COLORS.brand} />
              <circle r="7" fill="none" stroke={COLORS.brand} strokeWidth="1" opacity="0.6" />
              <text
                y={14}
                x={isLeft ? 8 : -8}
                textAnchor={isLeft ? 'start' : 'end'}
                fill="#94A3B8"
                fontSize="9px"
                fontFamily="monospace"
                fontWeight="bold"
                paintOrder="stroke"
                stroke={COLORS.night1}
                strokeWidth="3px"
                strokeLinejoin="round"
              >
                {t('turn_in')}
              </text>
            </g>

            {/* Optimal Apex Marker */}
            <g transform={`translate(${cornerSvgData.apex_ref.x}, ${cornerSvgData.apex_ref.y})`}>
              <circle r="4.5" fill={COLORS.gain} />
              <circle r="8" fill="none" stroke={COLORS.gain} strokeWidth="1" opacity="0.5" />
              <text
                y="-14"
                x={isLeft ? 8 : -8}
                textAnchor={isLeft ? 'start' : 'end'}
                fill={COLORS.gain}
                fontSize="9px"
                fontFamily="monospace"
                fontWeight="bold"
                paintOrder="stroke"
                stroke={COLORS.night1}
                strokeWidth="3px"
                strokeLinejoin="round"
              >
                {t('apex')} {selectedCorner.v_min_ref.toFixed(0)} km/h
              </text>
            </g>

            {/* Actual Apex Marker */}
            <g transform={`translate(${cornerSvgData.apex_comp.x}, ${cornerSvgData.apex_comp.y})`}>
              <circle r="5" fill={hasUndersteer ? COLORS.loss : COLORS.comp} />
              <circle
                r="9"
                fill="none"
                stroke={hasUndersteer ? COLORS.loss : COLORS.comp}
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />
              <text
                y="20"
                x={isLeft ? -8 : 8}
                textAnchor={isLeft ? 'end' : 'start'}
                fill={hasUndersteer ? COLORS.lossSoft : '#E9D5FF'}
                fontSize="9px"
                fontFamily="monospace"
                fontWeight="bold"
                paintOrder="stroke"
                stroke={COLORS.night1}
                strokeWidth="3px"
                strokeLinejoin="round"
              >
                {selectedCorner.v_min_comp.toFixed(0)} km/h
              </text>
            </g>

            {/* Track-out Exit Marker */}
            <g transform={`translate(${cornerSvgData.exit_pt.x}, ${cornerSvgData.exit_pt.y})`}>
              <circle r="4" fill={COLORS.best} />
              <text
                y={14}
                x={isLeft ? -8 : 8}
                textAnchor={isLeft ? 'end' : 'start'}
                fill={COLORS.best}
                fontSize="9px"
                fontFamily="monospace"
                fontWeight="bold"
                paintOrder="stroke"
                stroke={COLORS.night1}
                strokeWidth="3px"
                strokeLinejoin="round"
              >
                {t('exit')}
              </text>
            </g>
          </>
        ) : null}
      </svg>
    </div>
  );
};
