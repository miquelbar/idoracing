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
  const { lang, t } = useLanguage();
  const isEn = lang === 'en';
  const refNum = comparison?.ref_lap_id.replace('Lap ', '') || '1';
  const compNum = comparison?.comp_lap_id.replace('Lap ', '') || '2';
  const p1Label = `P1 (${isEn ? 'L' : 'V'}${refNum})`;
  const p2Label = `P2 (${isEn ? 'L' : 'V'}${compNum})`;
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

    const startDist = Math.max(0, selectedCorner.start_distance - 25);
    const endDist = selectedCorner.end_distance + 25;

    const indices: number[] = [];
    for (let i = 0; i < dists.length; i++) {
      if (dists[i] >= startDist && dists[i] <= endDist) {
        if (
          indices.length > 0 &&
          Math.hypot(xs[i] - xs[indices[indices.length - 1]], ys[i] - ys[indices[indices.length - 1]]) > 25.0
        ) {
          break; // truncate on teleport jump > 25m
        }
        indices.push(i);
      }
    }
    if (indices.length < 5) return null;

    const n = indices.length;

    // Find key indices (Turn-in, Apex, Exit) along the slice first
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

    // 1. Convert Cartesian world (wx, wy) to unrotated screen coordinates (+X right, +Y down: sy0 = -wy)
    // and apply a pure rigid 2D rotation (det(R) = +1, no reflection) so the car enters from the bottom
    // heading upward (-108 deg for left turns, -72 deg for right turns), preserving chirality 100%.
    const sx0 = indices.map((i) => xs[i]);
    const sy0 = indices.map((i) => -ys[i]);

    const vInX = sx0[apexIdx] - sx0[turnInIdx] || sx0[Math.min(n - 1, turnInIdx + 3)] - sx0[0] || 1;
    const vInY = sy0[apexIdx] - sy0[turnInIdx] || sy0[Math.min(n - 1, turnInIdx + 3)] - sy0[0] || 0;
    const entryAngle = Math.atan2(vInY, vInX);
    const targetAngle = isLeft ? -Math.PI * 0.60 : -Math.PI * 0.40;
    const theta = targetAngle - entryAngle;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const rotX = new Array<number>(n);
    const rotY = new Array<number>(n);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (let k = 0; k < n; k++) {
      const dx = sx0[k] - sx0[0];
      const dy = sy0[k] - sy0[0];
      const rx = dx * cosT - dy * sinT;
      const ry = dx * sinT + dy * cosT;
      rotX[k] = rx;
      rotY[k] = ry;
      minX = Math.min(minX, rx - 8);
      maxX = Math.max(maxX, rx + 8);
      minY = Math.min(minY, ry - 8);
      maxY = Math.max(maxY, ry + 8);
    }

    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;

    // SVG coordinate system 440 x 230 with padding (uniform positive scale -> det = scale^2 > 0)
    const pad = 34;
    const scale = Math.min((440 - pad * 2) / spanX, (230 - pad * 2) / spanY);
    const offsetX = (440 - spanX * scale) / 2;
    const offsetY = (230 - spanY * scale) / 2;

    const trackPts = indices.map((idx, k) => ({
      x: offsetX + (rotX[k] - minX) * scale,
      y: offsetY + (rotY[k] - minY) * scale,
      wx: xs[idx],
      wy: ys[idx],
    }));

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
    const innerEdge = trackPts.map((p, i) => ({ x: p.x + inX[i] * W, y: p.y + inY[i] * W, wx: p.wx, wy: p.wy }));
    const outerEdge = trackPts.map((p, i) => ({ x: p.x - inX[i] * W, y: p.y - inY[i] * W, wx: p.wx, wy: p.wy }));

    const buildSafeSubPath = (pts: Array<{ x: number; y: number; wx: number; wy: number }>) => {
      if (pts.length === 0) return '';
      const cmds = [`M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`];
      for (let i = 1; i < pts.length; i++) {
        const jumpM = Math.hypot(pts[i].wx - pts[i - 1].wx, pts[i].wy - pts[i - 1].wy);
        cmds.push(`${jumpM > 25.0 ? 'M' : 'L'} ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`);
      }
      return cmds.join(' ');
    };

    const asphaltPolygon =
      `M ${innerEdge[0].x.toFixed(1)} ${innerEdge[0].y.toFixed(1)} ` +
      innerEdge.slice(1).map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
      outerEdge.slice().reverse().map((p) => ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('') +
      ' Z';

    const innerBorder = buildSafeSubPath(innerEdge);
    const outerBorder = buildSafeSubPath(outerEdge);
    const centerLine = buildSafeSubPath(trackPts);

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

    // Synthesize or project the comparison line relative to the reference racing line on the ribbon
    // using measured lateral offsets (entry_offset_m, apex_offset_m, exit_offset_m) when available.
    const measuredApexOffsetM =
      selectedCorner.line_offset_apex_m !== undefined &&
      selectedCorner.line_offset_apex_m !== null &&
      Math.abs(selectedCorner.line_offset_apex_m) <= 10.0
        ? selectedCorner.line_offset_apex_m
        : null;

    const compLinePts = trackPts.map((p, i) => {
      const t = i / (n - 1 || 1);
      const apexT = isEarlyApex ? Math.max(0.15, (apexIdx / (n - 1)) - 0.14) : apexIdx / (n - 1 || 1);
      const ratio = t < apexT ? t / (apexT || 0.01) : (1 - t) / (1 - apexT || 0.01);
      const factor = (1 - Math.cos(ratio * Math.PI)) / 2;

      let apexOffset = 0.82 * W;
      let exitOffset = -0.72 * W;

      if (measuredApexOffsetM !== null) {
        // Positive apex_offset_m = wider (towards outside = smaller inX multiplier)
        const shiftPx = Math.max(-1.1 * W, Math.min(0.6 * W, -(measuredApexOffsetM / 6.0) * W));
        apexOffset = Math.max(-0.5 * W, Math.min(0.92 * W, 0.82 * W + shiftPx));
        exitOffset = Math.max(-0.95 * W, Math.min(0.2 * W, -0.72 * W + shiftPx * 0.5));
      } else if (hasUndersteer) {
        apexOffset = 0.25 * W;
        exitOffset = -0.92 * W;
      } else if (isEarlyApex) {
        apexOffset = 0.70 * W;
        exitOffset = -0.90 * W;
      } else if (selectedCorner.delta_v_min < -3.0) {
        apexOffset = 0.45 * W;
      } else {
        apexOffset = 0.65 * W;
      }

      const offset = -0.72 * W + factor * (apexOffset - (-0.72 * W));
      const finalOffset = t > apexT ? offset + (t - apexT) * (exitOffset - (-0.72 * W)) : offset;
      return {
        x: p.x + inX[i] * finalOffset,
        y: p.y + inY[i] * finalOffset,
      };
    });

    const ptsToPath = (pts: Array<{ x: number; y: number }>) =>
      pts.length
        ? `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} ` +
          pts.slice(1).map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
        : '';

    const apexRefPt = refLinePts[apexIdx];
    const apexCompPt = compLinePts[apexIdx];
    const turnInPt = refLinePts[turnInIdx];
    const exitPt = refLinePts[exitIdx];

    // Entry direction arrow on the approach segment (before turn-in)
    const arrowIdx = Math.max(0, Math.min(n - 2, Math.floor(turnInIdx * 0.4)));
    const arrowNextIdx = Math.min(n - 1, arrowIdx + 3);
    const entryArrowPt = trackPts[arrowIdx];
    const entryArrowAngleDeg =
      (Math.atan2(trackPts[arrowNextIdx].y - entryArrowPt.y, trackPts[arrowNextIdx].x - entryArrowPt.x) * 180) /
      Math.PI;

    // Screen-space 2D cross product between entry vector (turnIn -> apex) and exit vector (apex -> exit):
    // crossScreen < 0 => LEFT turn, crossScreen > 0 => RIGHT turn
    const vInScreenX = trackPts[apexIdx].x - trackPts[turnInIdx].x;
    const vInScreenY = trackPts[apexIdx].y - trackPts[turnInIdx].y;
    const vOutScreenX = trackPts[exitIdx].x - trackPts[apexIdx].x;
    const vOutScreenY = trackPts[exitIdx].y - trackPts[apexIdx].y;
    const crossScreen = vInScreenX * vOutScreenY - vInScreenY * vOutScreenX;

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
      entryArrowPt,
      entryArrowAngleDeg,
      crossScreen,
      apexDeltaPx: Math.hypot(apexCompPt.x - apexRefPt.x, apexCompPt.y - apexRefPt.y),
    };
  }, [comparison, selectedCorner, isEarlyApex, hasUndersteer, isLeft]);

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
      <div className="absolute top-2 right-2 z-10 flex items-center gap-2.5 px-2.5 py-1 rounded bg-black/80 backdrop-blur-md border border-white/10 text-[9.5px] font-telemetry shadow-md select-none">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 bg-gain border-b border-dashed border-gain" />
          <span className="text-[#00D2BE] font-bold">REF · {p1Label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 bg-comp" />
          <span className="text-[#D8B4FE] font-bold">COMP · {p2Label}</span>
        </div>
      </div>

      {/* SVG Curva Detallada con Pianos */}
      <svg
        viewBox="0 0 440 230"
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full select-none"
        data-turn-dir={isLeft ? 'left' : 'right'}
        data-cross-screen={realCorner ? realCorner.crossScreen.toFixed(1) : isLeft ? '-1000.0' : '1000.0'}
      >
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

            {/* Entry Direction Arrow */}
            <g
              data-testid="corner-entry-arrow"
              transform={`translate(${realCorner.entryArrowPt.x.toFixed(1)}, ${realCorner.entryArrowPt.y.toFixed(1)}) rotate(${realCorner.entryArrowAngleDeg.toFixed(1)})`}
            >
              <polygon
                points="14,0 2,-6 5,0 2,6"
                fill={COLORS.brand}
                stroke={COLORS.night1}
                strokeWidth="1.2"
              />
            </g>

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
                x="-14"
                y="-15"
                textAnchor="end"
                fill={COLORS.gain}
                fontSize="9.5px"
                fontFamily="monospace"
                fontWeight="bold"
                paintOrder="stroke"
                stroke={COLORS.night1}
                strokeWidth="3.5px"
                strokeLinejoin="round"
              >
                {p1Label}: {selectedCorner.v_min_ref.toFixed(0)} km/h
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
                x="14"
                y="21"
                textAnchor="start"
                fill={hasUndersteer ? COLORS.lossSoft : '#E9D5FF'}
                fontSize="9.5px"
                fontFamily="monospace"
                fontWeight="bold"
                paintOrder="stroke"
                stroke={COLORS.night1}
                strokeWidth="3.5px"
                strokeLinejoin="round"
              >
                {p2Label}: {selectedCorner.v_min_comp.toFixed(0)} km/h
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

            {/* Entry Direction Arrow */}
            <g
              data-testid="corner-entry-arrow"
              transform={`translate(${cornerSvgData.turn_in.x}, ${cornerSvgData.turn_in.y + 28}) rotate(${isLeft ? -105 : -75})`}
            >
              <polygon
                points="14,0 2,-6 5,0 2,6"
                fill={COLORS.brand}
                stroke={COLORS.night1}
                strokeWidth="1.2"
              />
            </g>

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
