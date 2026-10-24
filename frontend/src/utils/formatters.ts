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

export function formatDate(dateVal: string | Date, lang: string): string {
  try {
    const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal;
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function detectSimGame(
  session?: { session_id?: string; simulator?: string | null } | null,
  comparison?: { game_name?: string | null } | null
): string | null {
  if (session?.simulator) return session.simulator;
  if (comparison?.game_name) return comparison.game_name;
  const sLower = (session?.session_id || '').toLowerCase();
  if (sLower.includes('iracing')) return 'iRacing';
  if (sLower.includes('dr2') || sLower.includes('dirt')) return 'DiRT Rally 2.0';
  if (sLower.includes('wrc')) return 'EA SPORTS WRC';
  if (sLower.includes('acrally')) return 'Assetto Corsa Rally';
  return null;
}

const SIM_BADGES: { match: string; label: string; className: string }[] = [
  { match: 'Le Mans Ultimate', label: 'LMU', className: 'bg-blue-950/70 border-blue-500/40 text-blue-300' },
  { match: 'iRacing', label: 'iRacing', className: 'bg-red-950/70 border-red-500/40 text-red-300' },
  { match: 'Assetto Corsa Competizione', label: 'ACC', className: 'bg-red-950/60 border-accent/40 text-loss-light' },
  { match: 'Assetto Corsa EVO', label: 'AC EVO', className: 'bg-purple-950/70 border-purple-500/40 text-purple-300' },
  { match: 'Assetto Corsa', label: 'AC', className: 'bg-amber-950/60 border-amber-500/40 text-amber-300' },
  { match: 'Assetto Corsa Rally', label: 'AC RALLY', className: 'bg-orange-950/70 border-orange-500/40 text-orange-300' },
  { match: 'DiRT Rally 2.0', label: 'DR2', className: 'bg-amber-950/70 border-amber-500/40 text-amber-300' },
  { match: 'EA SPORTS WRC', label: 'WRC', className: 'bg-yellow-950/70 border-yellow-500/40 text-yellow-300' },
];

export function simBadge(simulator: string | null): { label: string; className: string } {
  if (!simulator) {
    return {
      label: 'SIM',
      className: 'bg-white/5 border-white/15 text-gray-400',
    };
  }
  const exact = SIM_BADGES.find((b) => b.match === simulator || b.label === simulator);
  if (exact) return exact;

  const simLower = simulator.toLowerCase();
  if (simLower.includes('mans') || simLower === 'lmu') {
    return SIM_BADGES[0]; // LMU
  }
  if (simLower.includes('iracing')) {
    return SIM_BADGES[1]; // iRacing
  }
  if (simLower.includes('competizione') || simLower === 'acc') {
    return SIM_BADGES[2]; // ACC
  }
  if (simLower.includes('evo')) {
    return SIM_BADGES[3]; // AC EVO
  }
  if (simLower.includes('rally') && simLower.includes('assetto')) {
    return SIM_BADGES[5]; // AC RALLY
  }
  if (simLower.includes('assetto') || simLower === 'ac' || simLower === 'ac1') {
    return SIM_BADGES[4]; // AC
  }
  if (simLower.includes('dirt') || simLower === 'dr2') {
    return SIM_BADGES[6]; // DR2
  }
  if (simLower.includes('wrc')) {
    return SIM_BADGES[7]; // WRC
  }

  return {
    label: simulator.slice(0, 8).toUpperCase(),
    className: 'bg-white/5 border-white/15 text-gray-400',
  };
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
