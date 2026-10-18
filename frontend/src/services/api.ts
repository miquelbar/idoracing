import type {
  AutoDiscoverData,
  ChatMessage,
  CoachReport,
  ComparisonResponse,
  SessionSummary,
  SettingsDTO,
  SystemStatus,
} from '../types/telemetry';

const API_BASE = '/api';

export async function fetchHealth(): Promise<SystemStatus> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Failed to fetch system status');
  return res.json();
}

export async function fetchSettings(): Promise<SettingsDTO> {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) throw new Error('Failed to fetch settings');
  return res.json();
}

export async function saveSettings(settings: SettingsDTO): Promise<any> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Failed to save settings');
  return res.json();
}

export async function fetchSessions(): Promise<SessionSummary[]> {
  const res = await fetch(`${API_BASE}/sessions`);
  if (!res.ok) throw new Error('Failed to fetch sessions');
  return res.json();
}

export async function fetchSession(sessionId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`);
  if (!res.ok) throw new Error('Failed to fetch session details');
  return res.json();
}

export async function fetchComparison(
  refLapId?: string,
  compLapId?: string,
  sessionId?: string
): Promise<ComparisonResponse> {
  const params = new URLSearchParams();
  if (refLapId) params.append('ref_lap_id', refLapId);
  if (compLapId) params.append('comp_lap_id', compLapId);
  if (sessionId) params.append('session_id', sessionId);

  const res = await fetch(`${API_BASE}/comparison?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch comparison');
  return res.json();
}

export async function generateDemoSession(): Promise<{ session_id: string }> {
  const res = await fetch(`${API_BASE}/sessions/demo`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to create demo session');
  return res.json();
}

export async function fetchCoachReport(
  refLapId: string,
  compLapId: string,
  forceRefresh = false
): Promise<CoachReport> {
  const res = await fetch(`${API_BASE}/coach/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ref_lap_id: refLapId,
      comp_lap_id: compLapId,
      force_refresh: forceRefresh,
    }),
  });
  if (!res.ok) throw new Error('Failed to generate coach debrief');
  return res.json();
}

export async function sendChatMessage(
  messages: ChatMessage[],
  refLapId?: string,
  compLapId?: string
): Promise<{ role: string; content: string; model: string }> {
  const res = await fetch(`${API_BASE}/coach/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      ref_lap_id: refLapId,
      comp_lap_id: compLapId,
    }),
  });
  if (!res.ok) throw new Error('Failed to communicate with Race Engineer');
  return res.json();
}

export async function autodiscoverSims(): Promise<AutoDiscoverData> {
  const res = await fetch(`${API_BASE}/autodiscover`);
  if (!res.ok) throw new Error('Failed to autodiscover sim files');
  return res.json();
}

export async function importLocalFile(filepath: string): Promise<any> {
  const res = await fetch(`${API_BASE}/import/local-file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filepath }),
  });
  if (!res.ok) throw new Error('Failed to import local file');
  return res.json();
}

export async function uploadTelemetryFile(file: File): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/import/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to upload file');
  return res.json();
}
