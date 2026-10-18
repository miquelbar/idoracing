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

export interface CornerDTO {
  corner_number: number;
  name: string;
  start_distance: number;
  end_distance: number;
  apex_distance: number;
  v_min_ref: number;
  v_min_comp: number;
  delta_v_min: number;
  delta_time: number;
  braking_point_delta: number;
  throttle_pickup_delta: number;
  diagnosis: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  trail_braking_eval?: string;
  trail_braking_advice?: string;
  ref_gear?: number;
  comp_gear?: number;
  gear_eval?: string;
  gear_advice?: string;
  balance_eval?: string;
  balance_advice?: string;
  racing_line_eval?: string;
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
    has_subviraje: boolean;
  };
}

export interface ComparisonResponse {
  ref_lap_id: string;
  comp_lap_id: string;
  ref_lap_time: number;
  comp_lap_time: number;
  delta_time_total: number;
  track_name: string;
  car_name: string;
  game_name?: string;
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

export interface CarSetupData {
  car_name: string;
  track_name: string;
  setup_name: string;
  tyres: {
    compound: string;
    pressures_hot_psi: Record<string, number>;
    camber_deg: Record<string, number>;
    toe_deg: Record<string, number>;
  };
  electronics: {
    tc1: number;
    tc2: number;
    abs: number;
    ecu_map: number;
  };
  brakes: {
    bias_pct: number;
    pad_type: string;
    ducts: { front: number; rear: number };
  };
  aerodynamics: {
    rear_wing: number;
    front_splitter: string;
    ride_height_mm: { front: number; rear: number };
    rake_mm: number;
  };
  suspension: {
    front_arb: number;
    rear_arb: number;
    diff_preload_nm: number;
  };
  drivetrain: {
    diff_preload_nm: number;
  };
  notes: string[];
}

export interface LapRecordItem {
  lap_number: number;
  lap_time: number;
  lap_time_str: string;
  sector_times: number[];
  gap_to_pb: number;
  is_pb: boolean;
  v_max: number;
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

