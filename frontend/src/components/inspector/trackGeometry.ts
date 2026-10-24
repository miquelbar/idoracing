import type { ComparisonResponse } from '../../types/telemetry';
import { COLORS } from '../../theme';

const MAX_TELEPORT_STEP_M = 25.0;
const MAX_CLOSURE_GAP_M = 30.0;

function buildSafeSvgPath(
  pts: Array<{ x: number; y: number; wx: number; wy: number }>,
  closeLoop: boolean = false
): string {
  if (pts.length === 0) return '';
  const cmds: string[] = [`M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`];
  let hasTeleport = false;
  for (let i = 1; i < pts.length; i++) {
    const stepM = Math.hypot(pts[i].wx - pts[i - 1].wx, pts[i].wy - pts[i - 1].wy);
    if (stepM > MAX_TELEPORT_STEP_M) {
      hasTeleport = true;
      cmds.push(`M ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`);
    } else {
      cmds.push(`L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`);
    }
  }
  if (closeLoop && !hasTeleport && pts.length > 2) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    const closureDistM = Math.hypot(last.wx - first.wx, last.wy - first.wy);
    if (closureDistM <= MAX_CLOSURE_GAP_M) {
      cmds.push('Z');
    }
  }
  return cmds.join(' ');
}

/** Track outline scaled into a tight SVG box, with the speed-delta heatmap, corner badges and corner arcs. */
export function buildTrackGeometry(comparison: ComparisonResponse) {
  const corners = comparison.corners;
  const xs = comparison.track_x || [];
  const ys = comparison.track_y || [];
  const dists = comparison.distance || [];
  const deltas = comparison.delta_speed || [];

  if (xs.length === 0 || ys.length === 0) {
    return null;
  }

  // Truncate at first teleport jump > 25m so garage resets never distort the bounding box
  let validLen = Math.min(xs.length, ys.length);
  for (let i = 1; i < validLen; i++) {
    if (Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]) > MAX_TELEPORT_STEP_M) {
      validLen = i;
      break;
    }
  }
  const cleanXs = xs.slice(0, validLen);
  const cleanYs = ys.slice(0, validLen);

  const minX = Math.min(...cleanXs);
  const maxX = Math.max(...cleanXs);
  const minY = Math.min(...cleanYs);
  const maxY = Math.max(...cleanYs);

  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  // Match physical aspect ratio tightly (pure scaling + Y inversion, no X reflection)
  const normWidth = 600;
  const pad = 24; // minimal padding for corner labels
  const scale = (normWidth - pad * 2) / spanX;
  const normHeight = Math.max(220, Math.round(spanY * scale + pad * 2));

  const toSvg = (x: number, y: number) => ({
    x: pad + (x - minX) * scale,
    y: normHeight - (pad + (y - minY) * scale), // invert Cartesian Y for screen (+Y down)
  });

  const svgPts: Array<{ x: number; y: number; wx: number; wy: number; dist: number }> = [];
  const lastRecordedDist = dists.length > 0 ? dists[dists.length - 1] : 0;
  for (let i = 0; i < validLen; i++) {
    const pt = toSvg(cleanXs[i], cleanYs[i]);
    const ptDist =
      i < dists.length
        ? dists[i]
        : lastRecordedDist + (i - Math.max(0, dists.length - 1)) * 2.0;
    svgPts.push({ x: pt.x, y: pt.y, wx: cleanXs[i], wy: cleanYs[i], dist: ptDist });
  }

  // Heatmap segments (skip any segment crossing a > 25m physical jump)
  const segments: Array<{ d: string; color: string; speedDelta: number }> = [];
  const step = 3;
  const pickColor = (avgDelta: number) => {
    if (avgDelta > 8) return COLORS.gain;
    if (avgDelta > 2) return COLORS.brand;
    if (avgDelta < -8) return COLORS.loss;
    if (avgDelta < -2) return COLORS.lossSoft;
    return '#798299';
  };

  let lastI = 0;
  for (let i = 0; i < svgPts.length - step; i += step) {
    let hasJump = false;
    for (let k = i; k < i + step; k++) {
      if (Math.hypot(svgPts[k + 1].wx - svgPts[k].wx, svgPts[k + 1].wy - svgPts[k].wy) > MAX_TELEPORT_STEP_M) {
        hasJump = true;
        break;
      }
    }
    if (hasJump) continue;

    const p1 = svgPts[i];
    const p2 = svgPts[i + step];
    const avgDelta = deltas[i] || 0;
    lastI = i + step;

    segments.push({
      d: `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} L ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`,
      color: pickColor(avgDelta),
      speedDelta: avgDelta,
    });
  }

  // Close the final tail segment up to the finish line and back to svgPts[0] when loop is complete
  if (svgPts.length > 2) {
    const lastPt = svgPts[svgPts.length - 1];
    const firstPt = svgPts[0];
    if (lastI < svgPts.length - 1) {
      const prevPt = svgPts[lastI];
      if (Math.hypot(lastPt.wx - prevPt.wx, lastPt.wy - prevPt.wy) <= MAX_TELEPORT_STEP_M) {
        const avgDelta = deltas[lastI] || 0;
        segments.push({
          d: `M ${prevPt.x.toFixed(1)} ${prevPt.y.toFixed(1)} L ${lastPt.x.toFixed(1)} ${lastPt.y.toFixed(1)}`,
          color: pickColor(avgDelta),
          speedDelta: avgDelta,
        });
      }
    }
    const closureDistM = Math.hypot(lastPt.wx - firstPt.wx, lastPt.wy - firstPt.wy);
    if (closureDistM <= MAX_CLOSURE_GAP_M) {
      const avgDelta = deltas[svgPts.length - 1] || 0;
      segments.push({
        d: `M ${lastPt.x.toFixed(1)} ${lastPt.y.toFixed(1)} L ${firstPt.x.toFixed(1)} ${firstPt.y.toFixed(1)}`,
        color: pickColor(avgDelta),
        speedDelta: avgDelta,
      });
    }
  }

  // Corner positions
  const cornerPoints = corners.map((c) => {
    let closestIdx = 0;
    let minDiff = 999999;
    for (let i = 0; i < svgPts.length; i++) {
      const diff = Math.abs(svgPts[i].dist - c.apex_distance);
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

  // Precompute interactive corner arcs along the track
  const cornerArcs = corners.map((c) => {
    const pts = svgPts.filter((p) => {
      if (c.start_distance <= c.end_distance) {
        return p.dist >= c.start_distance && p.dist <= c.end_distance;
      } else {
        return p.dist >= c.start_distance || p.dist <= c.end_distance;
      }
    });
    return {
      ...c,
      pathD: buildSafeSvgPath(pts, false),
    };
  });

  // Full continuous outline for mini-map (only closed if start-to-end distance <= 30m)
  const fullOutline = buildSafeSvgPath(svgPts, true);

  // Start/finish line & direction-of-travel arrow
  const sf0 = svgPts[0];
  const sfLookahead = svgPts[Math.min(svgPts.length - 1, 10)] || sf0;
  const sfDx = sfLookahead.x - sf0.x;
  const sfDy = sfLookahead.y - sf0.y;
  const sfAngleDeg = (Math.atan2(sfDy, sfDx) * 180) / Math.PI;
  const startFinish = {
    x: sf0.x,
    y: sf0.y,
    angleDeg: sfAngleDeg,
  };

  return {
    width: normWidth,
    height: normHeight,
    viewBox: `0 0 ${normWidth} ${normHeight}`,
    svgPts,
    segments,
    cornerPoints,
    cornerArcs,
    fullOutline,
    startFinish,
  };
}

export type TrackGeometry = NonNullable<ReturnType<typeof buildTrackGeometry>>;

export type CornerViewMode = 'phase' | 'track2d';
