/**
 * Pure, reusable utility functions for IdoRacing Analytics telemetry formatting and sim detection.
 * Adheres to DRY and clean code standards across all views and components.
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
  session?: { session_id?: string; car?: string; track?: string } | null,
  comparison?: { game_name?: string } | null
): string {
  if (comparison?.game_name) return comparison.game_name;
  if (!session) return 'Assetto Corsa Competizione';
  const id = (session.session_id || '').toLowerCase();
  const car = (session.car || '').toLowerCase();
  if (id.startsWith('lmu') || car.includes('lmgt3') || car.includes('hypercar') || car.includes('lmp2')) {
    return 'Le Mans Ultimate';
  }
  if (id.includes('iracing')) {
    return 'iRacing';
  }
  return 'Assetto Corsa Competizione';
}
