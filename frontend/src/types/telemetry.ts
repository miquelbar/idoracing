export interface SystemStatus {
  status: string;
  version: string;
  provider: string;
  ai_available: boolean;
  active_model: string;
  ollama_models: string[];
  session_count: number;
}

export interface SettingsDTO {
  provider: string;
  ollama_model: string;
  ollama_base_url: string;
  openai_api_key?: string;
  openai_base_url?: string;
  openai_model?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export type TrailBrakingCode =
  | 'early_release'
  | 'over_braking'
  | 'inconsistent'
  | 'effective'
  | 'fast_corner'
  | 'neutral'
  | 'no_braking';

export type BalanceCode = 'neutral' | 'understeer' | 'traction' | 'early_braking' | 'momentum_loss' | 'stable';

export type RacingLineCode = 'optimal' | 'early_apex' | 'late_apex' | 'missed_apex' | 'pinched_exit' | 'suboptimal';

export interface CornerDTO {
  corner_number: number;
  name: string;
  start_distance: number;
  end_distance: number;
  apex_distance: number;
  v_min_ref: number;
  v_min_comp: number;
  delta_v_min: number;
  v_entry_ref?: number;
  v_entry_comp?: number;
  delta_v_entry?: number;
  v_exit_ref?: number;
  v_exit_comp?: number;
  delta_v_exit?: number;
  delta_time: number;
  braking_point_delta: number;
  throttle_pickup_delta: number;
  diagnosis: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  trail_braking_eval?: string;
  trail_braking_code: TrailBrakingCode;
  trail_braking_advice?: string;
  ref_gear?: number;
  comp_gear?: number;
  gear_eval?: string;
  gear_code: 'match' | 'too_low' | 'too_high';
  gear_advice?: string;
  balance_eval?: string;
  balance_code: BalanceCode;
  balance_advice?: string;
  racing_line_eval?: string;
  racing_line_code: RacingLineCode;
  line_offset_entry_m?: number | null;
  line_offset_apex_m?: number | null;
  line_offset_exit_m?: number | null;
  racing_line_advice?: string;
  racing_line_svg?: {
    corner_number: number;
    turn_dir: string;
    outer_curb: string;
    inner_curb: string;
    asphalt_fill: string;
    optimal_line: string;
    actual_line: string;
    turn_in: { x: number; y: number; label: string };
    apex_ref: { x: number; y: number; label: string };
    apex_comp: { x: number; y: number; label: string };
    exit_pt: { x: number; y: number; label: string };
    has_understeer: boolean;
  };
}

export interface ComparisonResponse {
  session_id: string;
  ref_lap_id: string;
  comp_lap_id: string;
  ref_lap_time: number;
  comp_lap_time: number;
  delta_time_total: number;
  track_name: string;
  car_name: string;
  game_name?: string | null;
  distance: number[];
  ref_speed: number[];
  comp_speed: number[];
  delta_speed: number[];
  delta_time: number[];
  ref_throttle: number[];
  comp_throttle: number[];
  ref_brake: number[];
  comp_brake: number[];
  ref_gear: number[];
  comp_gear: number[];
  track_x: number[];
  track_y: number[];
  ref_sectors: Record<string, number>;
  comp_sectors: Record<string, number>;
  corners: CornerDTO[];
  telemetry_source: 'recorded' | 'synthetic';
}

export interface CoachReport {
  facts: string[];
  metrics: Record<string, any>;
  hypotheses: string[];
  exercises: string[];
  verification_indicator: string;
  confidence?: string;
  model_used?: string;
  raw_report?: string;
  created_at?: string;
}

export interface LapSummary {
  lap_number: number;
  lap_time: number;
  sector_times?: number[];
  is_valid: boolean;
  synthetic?: boolean;
}

export interface SessionDetail {
  id: string;
  session_id: string;
  car: string;
  track: string;
  date: string;
  laps: LapSummary[];
  source_file?: string | null;
  simulator?: string | null;
}

export interface ImportResult {
  status: string;
  session_id: string;
  laps: number;
  track?: string;
  car?: string;
}

export interface SaveSettingsResult {
  status: string;
  provider: string;
  active_model: string;
}

export interface ChatReply {
  role: 'assistant';
  content: string;
  source: 'llm' | 'rules';
  model: string | null;
}

export interface SessionSummary {
  id?: string;
  session_id: string;
  track: string;
  car: string;
  game?: string;
  date?: string;
  duration?: number;
  best_lap_time?: number;
  average_speed?: number;
  lap_count: number;
  laps?: LapSummary[];
  simulator?: string | null;
}

export interface AutoDiscoverFile {
  filename: string;
  path: string;
}

export interface AutoDiscoverData {
  acc_path: string;
  acc_found: number;
  acc_files: AutoDiscoverFile[];
  lmu_path: string;
  lmu_found: number;
  lmu_files: AutoDiscoverFile[];
}

export interface LapRecordItem {
  lap_number: number;
  lap_time: number;
  lap_time_str: string;
  sector_times: number[];
  gap_to_pb: number;
  is_pb: boolean;
  v_max: number | null;
  date: string;
  session_id: string;
}

export interface LapHistoryData {
  pb_lap: LapRecordItem;
  comparison_lap?: LapRecordItem;
  laps: LapRecordItem[];
  track_name: string;
  car_name: string;
  delta_s1: number;
  delta_s2: number;
  delta_s3: number;
  delta_total: number;
}

