import type { ComparisonResponse } from '../../types/telemetry';
import { COLORS } from '../../theme';

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
    if (avgDelta > 8) color = COLORS.gain;
    else if (avgDelta > 2) color = COLORS.brand;
    else if (avgDelta < -8) color = COLORS.loss;
    else if (avgDelta < -2) color = COLORS.lossSoft;

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

  // Precompute interactive corner arcs along the track
  const cornerArcs = corners.map((c) => {
    const pts = svgPts.filter((p) => {
      if (c.start_distance <= c.end_distance) {
        return p.dist >= c.start_distance && p.dist <= c.end_distance;
      } else {
        return p.dist >= c.start_distance || p.dist <= c.end_distance;
      }
    });
    let pathD = '';
    if (pts.length > 0) {
      pathD =
        `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} ` +
        pts.slice(1).map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    }
    return {
      ...c,
      pathD,
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
    cornerArcs,
    fullOutline,
  };
}

export type TrackGeometry = NonNullable<ReturnType<typeof buildTrackGeometry>>;

export type CornerViewMode = 'phase' | 'track2d';
