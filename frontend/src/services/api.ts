import type {
  AutoDiscoverData,
  CarSetupData,
  ChatMessage,
  ChatReply,
  CoachReport,
  ComparisonResponse,
  CornerDTO,
  ImportResult,
  LapHistoryData,
  SaveSettingsResult,
  SessionDetail,
  SessionGroup,
  SessionSummary,
  SettingsDTO,
  SetupAdviceReport,
  SetupAdviceReview,
  StintAnalysisData,
  SystemStatus,
} from '../types/telemetry';

const API_BASE = '/api';

async function failure(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => null);
  throw new Error(typeof body?.detail === 'string' ? body.detail : fallback);
}

export async function fetchHealth(): Promise<SystemStatus> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) await failure(res, 'Failed to fetch system status');
  return res.json();
}

export async function fetchSettings(): Promise<SettingsDTO> {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) await failure(res, 'Failed to fetch settings');
  return res.json();
}

export async function saveSettings(settings: SettingsDTO): Promise<SaveSettingsResult> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) await failure(res, 'Failed to save settings');
  return res.json();
}

export async function fetchSessions(): Promise<SessionSummary[]> {
  const res = await fetch(`${API_BASE}/sessions`);
  if (!res.ok) await failure(res, 'Failed to fetch sessions');
  return res.json();
}

export async function fetchSessionGroups(): Promise<SessionGroup[]> {
  const res = await fetch(`${API_BASE}/session-groups`);
  if (!res.ok) await failure(res, 'Failed to fetch session groups');
  return res.json();
}

export async function fetchSession(sessionId: string): Promise<SessionDetail> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`);
  if (!res.ok) await failure(res, 'Failed to fetch session details');
  return res.json();
}

export async function fetchComparison(
  refLapId?: string,
  compLapId?: string,
  sessionId?: string,
  signal?: AbortSignal,
  refSessionId?: string,
  compSessionId?: string
): Promise<ComparisonResponse> {
  const params = new URLSearchParams();
  if (refLapId) params.append('ref_lap_id', refLapId);
  if (compLapId) params.append('comp_lap_id', compLapId);
  if (sessionId) params.append('session_id', sessionId);
  if (refSessionId) params.append('ref_session_id', refSessionId);
  if (compSessionId) params.append('comp_session_id', compSessionId);

  const res = await fetch(`${API_BASE}/comparison?${params.toString()}`, { signal });
  if (!res.ok) await failure(res, 'Failed to fetch comparison');
  return res.json();
}

export async function generateDemoSession(): Promise<{ session_id: string }> {
  const res = await fetch(`${API_BASE}/sessions/demo`, { method: 'POST' });
  if (!res.ok) await failure(res, 'Failed to create demo session');
  return res.json();
}

export async function fetchCoachReport(
  refLapId: string,
  compLapId: string,
  forceRefresh = false,
  sessionId?: string
): Promise<CoachReport> {
  const res = await fetch(`${API_BASE}/coach/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ref_lap_id: refLapId,
      comp_lap_id: compLapId,
      session_id: sessionId,
      force_refresh: forceRefresh,
    }),
  });
  if (!res.ok) await failure(res, 'Failed to generate coach debrief');
  return res.json();
}

export async function sendChatMessage(
  messages: ChatMessage[],
  refLapId?: string,
  compLapId?: string,
  trackName?: string,
  carName?: string,
  selectedCorner?: Partial<CornerDTO>,
  lang?: string
): Promise<ChatReply> {
  const res = await fetch(`${API_BASE}/coach/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      ref_lap_id: refLapId,
      comp_lap_id: compLapId,
      track_name: trackName,
      car_name: carName,
      selected_corner: selectedCorner,
      lang: lang || 'es',
    }),
  });
  if (!res.ok) await failure(res, 'Failed to communicate with Race Engineer');
  return res.json();
}

export async function autodiscoverSims(): Promise<AutoDiscoverData> {
  const res = await fetch(`${API_BASE}/autodiscover`);
  if (!res.ok) await failure(res, 'Failed to autodiscover sim files');
  return res.json();
}

export async function rescanSimulators(): Promise<{ status: string; imported: number }> {
  const res = await fetch(`${API_BASE}/autodiscover/rescan`, { method: 'POST' });
  if (!res.ok) await failure(res, 'Failed to rescan simulator folders');
  return res.json();
}

export async function importLocalFile(filepath: string): Promise<ImportResult> {
  const res = await fetch(`${API_BASE}/import/local-file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filepath }),
  });
  if (!res.ok) await failure(res, 'Failed to import local file');
  return res.json();
}

export async function uploadTelemetryFile(file: File): Promise<ImportResult> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/import/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) await failure(res, 'Failed to upload file');
  return res.json();
}

export async function fetchLapHistory(sessionId?: string, compLapNumber?: number): Promise<LapHistoryData> {
  const params = new URLSearchParams();
  if (sessionId) params.append('session_id', sessionId);
  if (compLapNumber !== undefined) params.append('comp_lap_number', String(compLapNumber));
  const res = await fetch(`${API_BASE}/lap-history?${params.toString()}`);
  if (!res.ok) await failure(res, 'Failed to fetch lap history');
  return res.json();
}

export async function fetchCarSetup(sessionId?: string): Promise<CarSetupData> {
  const params = new URLSearchParams();
  if (sessionId) params.append('session_id', sessionId);
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/car-setup${query}`);
  if (!res.ok) await failure(res, 'Failed to fetch car setup');
  return res.json();
}

export async function fetchStintAnalysis(sessionId?: string): Promise<StintAnalysisData> {
  const params = new URLSearchParams();
  if (sessionId) params.append('session_id', sessionId);
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/stint-analysis${query}`);
  if (!res.ok) await failure(res, 'Failed to fetch stint analysis');
  return res.json();
}

export async function fetchSetupAdvice(
  refLapId: string,
  compLapId: string,
  sessionId?: string
): Promise<SetupAdviceReport> {
  const res = await fetch(`${API_BASE}/setup-advice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ref_lap_id: refLapId,
      comp_lap_id: compLapId,
      session_id: sessionId,
    }),
  });
  if (!res.ok) await failure(res, 'Failed to fetch setup advice');
  return res.json();
}

export async function fetchSetupAdviceReview(
  refLapId: string,
  compLapId: string,
  sessionId: string | undefined,
  lang: string
): Promise<SetupAdviceReview> {
  const res = await fetch(`${API_BASE}/setup-advice/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ref_lap_id: refLapId,
      comp_lap_id: compLapId,
      session_id: sessionId,
      lang,
    }),
  });
  if (!res.ok) await failure(res, 'Failed to fetch setup advice review');
  return res.json();
}


