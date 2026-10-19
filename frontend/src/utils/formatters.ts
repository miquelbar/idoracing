/**
 * Formatting helpers shared by the views, and the simulator guess used for session badges.
 */

export function formatLapTime(seconds?: number | null): string {
  if (seconds === undefined || seconds === null || seconds <= 0 || isNaN(seconds)) {
    return '--:--.---';
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(3).padStart(6, '0')}`;
}

export function formatDeltaTime(delta?: number | null, showSign = true): string {
  if (delta === undefined || delta === null || isNaN(delta)) {
    return '--.---s';
  }
  const sign = showSign && delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(3)}s`;
}

export function formatSpeed(kmh?: number | null): string {
  if (kmh === undefined || kmh === null || isNaN(kmh)) {
    return '-- km/h';
  }
  return `${Math.round(kmh)} km/h`;
}

export function formatDate(dateVal?: string | Date | null): string {
  if (!dateVal) return 'Reciente';
  try {
    const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal;
    if (isNaN(d.getTime())) return 'Reciente';
    return d.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return 'Reciente';
  }
}

export function detectSimGame(
  session?: { session_id?: string; simulator?: string | null } | null,
  comparison?: { game_name?: string | null } | null
): string | null {
  if (session?.simulator) return session.simulator;
  if (comparison?.game_name) return comparison.game_name;
  if ((session?.session_id || '').toLowerCase().includes('iracing')) return 'iRacing';
  return null;
}

const SIM_BADGES: { match: string; label: string; className: string }[] = [
  { match: 'Le Mans Ultimate', label: 'LMU', className: 'bg-blue-950/70 border-blue-500/40 text-blue-300' },
  { match: 'iRacing', label: 'iRacing', className: 'bg-red-950/70 border-red-500/40 text-red-300' },
  { match: 'Assetto Corsa Competizione', label: 'ACC', className: 'bg-red-950/60 border-accent/40 text-loss-light' },
  { match: 'Assetto Corsa', label: 'AC', className: 'bg-amber-950/60 border-amber-500/40 text-amber-300' },
];

export function simBadge(simulator: string | null): { label: string; className: string } {
  return (
    SIM_BADGES.find((b) => b.match === simulator) ?? {
      label: 'SIM',
      className: 'bg-white/5 border-white/15 text-gray-400',
    }
  );
}

const METRIC_LABELS: Record<string, { es: string; en: string }> = {
  diferencia_vuelta: { es: 'Diferencia Total', en: 'Total Delta' },
  diferencia_sectores: { es: 'Diferencia por Sectores', en: 'Sector Deltas' },
  curvas_analizadas: { es: 'Curvas Evaluadas', en: 'Corners Evaluated' },
  eficiencia_trail_braking: { es: 'Eficiencia Trail Braking', en: 'Trail Braking Efficiency' },
  primary_loss_corner: { es: 'Punto Crítico', en: 'Critical Point' },
};

export function formatMetricKey(key: string, lang: 'es' | 'en' = 'es'): string {
  return METRIC_LABELS[key]?.[lang] ?? key.replace(/_/g, ' ').toUpperCase();
}

export function formatMetricValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (Array.isArray(val)) return val.join(', ');
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if (typeof obj.name === 'string' && typeof obj.time_delta === 'number') {
      return `${obj.name} (${formatDeltaTime(obj.time_delta)})`;
    }
    return Object.entries(obj)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(' | ');
  }
  return String(val);
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
