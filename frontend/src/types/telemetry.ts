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
  chat_timeout?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export type TrailBrakingCode =
  | 'early_release'
  | 'both_fault_early_release'
  | 'over_braking'
  | 'inconsistent'
  | 'effective'
  | 'fast_corner'
  | 'neutral'
  | 'no_braking';

export type BalanceCode = 'neutral' | 'understeer' | 'traction' | 'early_braking' | 'momentum_loss' | 'stable' | 'both_laps_fault';

export type RacingLineCode = 'optimal' | 'early_apex' | 'late_apex' | 'missed_apex' | 'pinched_exit' | 'suboptimal' | 'both_laps_fault';

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
  ref_brake_point?: number | null;
  comp_brake_point?: number | null;
  ref_throttle_point?: number | null;
  comp_throttle_point?: number | null;
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
  excess_steer_deg?: number | null;
  steer_to_g?: number | null;
  kerb_strike_detected?: boolean;
  damping_advice?: string | null;
  v_min_ideal?: number | null;
  v_exit_ideal?: number | null;
  ideal_brake_point?: number | null;
  ideal_throttle_point?: number | null;
  ideal_trail_pct?: number | null;
  ref_trail_pct?: number | null;
  comp_trail_pct?: number | null;
  ideal_time_gain?: number | null;
  both_laps_fault?: boolean;
  both_laps_fault_reason?: string | null;
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
  ref_session_id?: string | null;
  comp_session_id?: string | null;
  ref_car_name?: string | null;
  comp_car_name?: string | null;
  ref_date?: string | null;
  comp_date?: string | null;
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
  ref_x?: number[];
  ref_y?: number[];
  comp_x?: number[];
  comp_y?: number[];
  ref_sectors: Record<string, number>;
  comp_sectors: Record<string, number>;
  corners: CornerDTO[];
  telemetry_source: 'recorded' | 'synthetic' | 'none';
  has_telemetry?: boolean;
  is_demo?: boolean;
  optimal_lap_time?: number | null;
  ideal_lap_time?: number | null;
  ideal_potential_gain?: number | null;
  ideal_speed?: number[];
  ideal_brake?: number[];
  ideal_throttle?: number[];
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
  has_telemetry?: boolean;
  is_outlap?: boolean;
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
  has_telemetry?: boolean;
  is_demo?: boolean;
}

export interface SessionGroupLap {
  lap_number: number;
  lap_time: number;
  sector_times?: number[];
  is_valid: boolean;
  has_telemetry?: boolean;
  is_outlap?: boolean;
}

export interface SessionGroupSession {
  session_id: string;
  car: string;
  track: string;
  date: string;
  best_lap_time: number;
  lap_count: number;
  simulator?: string | null;
  source_file?: string | null;
  has_telemetry?: boolean;
  is_demo?: boolean;
  laps: SessionGroupLap[];
}

export interface SessionGroup {
  simulator: string;
  track: string;
  cars?: string[];
  sessions: SessionGroupSession[];
  total_laps: number;
  best_lap_time: number;
  last_session_date?: string | null;
}

export interface AutoDiscoverFile {
  filename: string;
  path: string;
}

export interface SimDiscovery {
  path: string;
  found: number;
  files: AutoDiscoverFile[];
}

export interface AutoDiscoverData {
  acc_path: string;
  acc_found: number;
  acc_files: AutoDiscoverFile[];
  lmu_path: string;
  lmu_found: number;
  lmu_files: AutoDiscoverFile[];
  acevo_path: string;
  acevo_found: number;
  acevo_files: AutoDiscoverFile[];
  ac1_path: string;
  ac1_found: number;
  ac1_files: AutoDiscoverFile[];
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

export interface SetupAdviceItem {
  title: string;
  suggestion: string;
  impact: string;
}

export interface TyreThermalCorner {
  corner: string;
  hot_psi: number;
  cold_psi: number;
  temps_imo: number[];
  delta_camber: number;
  delta_crown: number;
  camber_status: string;
  camber_advice: string;
  pressure_status: string;
  pressure_advice: string;
  health: 'ok' | 'warning';
}

export interface StintAnalysisData {
  session_id: string;
  track_name: string;
  car_name: string;
  valid_laps: number;
  best_lap_s: number;
  avg_lap_s: number;
  std_dev_s: number;
  pace_trend_s_per_lap: number;
  consistency_rating: string;
  fuel_burned_litres: number;
  degradation_type: string;
  degradation_diagnosis: string;
  pit_wall_strategy: string;
  lap_numbers: number[];
  lap_times: number[];
}

export interface SingleLapSetup {
  has_garage_setup?: boolean;
  setup_source?: string;
  setup_file_name?: string | null;
  tyres: {
    compound: string;
    pressures_hot: { FL: number; FR: number; RL: number; RR: number };
    pressures_cold: { FL: number | null; FR: number | null; RL: number | null; RR: number | null };
    optimal_window: string;
    temps_c: { FL: number[]; FR: number[]; RL: number[]; RR: number[] };
    thermal_diagnostics?: Record<string, TyreThermalCorner>;
  };
  electronics: {
    tc1?: number | null;
    tc2?: number | null;
    abs?: number | null;
    brake_bias?: number | null;
    ecu_map?: number | null;
  };
  aero: {
    front_splitter?: number | null;
    rear_wing?: number | null;
    ride_height_front_mm?: number | null;
    ride_height_rear_mm?: number | null;
    rake_mm?: number | null;
  };
  chassis: {
    arb_front?: number | null;
    arb_rear?: number | null;
    camber_front_deg?: number | null;
    camber_rear_deg?: number | null;
    toe_front_deg?: number | null;
    toe_rear_deg?: number | null;
    preload_diff_nm?: number | null;
  };
}

export interface CarSetupData extends SingleLapSetup {
  session_id: string;
  car_name: string;
  track_name: string;
  game_name?: string | null;
  has_telemetry?: boolean;
  setup_advice: SetupAdviceItem[];
  ref_lap_id?: string | null;
  comp_lap_id?: string | null;
  ref_lap_label?: string | null;
  comp_lap_label?: string | null;
  ref_lap_number?: number | null;
  comp_lap_number?: number | null;
  ref_lap_time?: number | null;
  comp_lap_time?: number | null;
  ref_date?: string | null;
  comp_date?: string | null;
  ref_session_id?: string | null;
  comp_session_id?: string | null;
  same_session?: boolean;
  same_garage_setup?: boolean;
  garage_diff_count?: number;
  garage_diff_summary?: string[];
  thermal_diff_summary?: string[];
  p1_setup?: SingleLapSetup | null;
  p2_setup?: SingleLapSetup | null;
}

export interface SetupRecommendation {
  category: string;
  parameter: string;
  suggested_change: string;
  reason: string;
  evidence: string[];
  affected_corners: string[];
  priority: 'high' | 'medium' | 'low';
  confidence: 'high' | 'medium' | 'low';
}

export interface SetupAdviceReport {
  summary: string;
  recommendations: SetupRecommendation[];
  overall_balance: 'understeer' | 'oversteer' | 'neutral' | 'mixed';
  primary_issue: string;
  confidence: 'high' | 'medium' | 'low';
  created_at?: string;
}

export interface SetupAdviceReview {
  report: SetupAdviceReport;
  pep_review: string;
  review_source: 'llm' | 'rules';
  review_model: string | null;
  reviewed_at?: string;
}

export interface SpotterConfigDTO {
  enabled: boolean;
  language: 'es' | 'en';
  volume: number;
  toggle_key?: string;
  toggle_vk_code?: number;
}



