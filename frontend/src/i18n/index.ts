import { useState, useEffect } from 'react';

export type Language = 'es' | 'en';

export const translations = {
  es: {
    // Navigation & Topbar
    app_title: 'IDORACING ANALYTICS',
    app_slogan: 'Every lap tells a story',
    sessions_tab: 'Sesiones & Garaje',
    telemetry_tab: 'Telemetría & Trazada',
    setup_tab: 'Historial & Setup',
    engineer_tab: 'Ingeniero de Pista (IA)',
    settings_tab: 'Ajustes IA',
    model: 'Modelo',
    rules_engine: 'Reglas Numéricas',
    
    // Telemetry Header Bar
    laps_label: 'vueltas',
    sessions_btn: 'Sesiones >',
    change_track: 'Cambiar Pista / Juego',
    gap: 'GAP',
    debrief_radio: 'DEBRIEF & RADIO',
    best_lap: 'Mejor Vuelta',
    session_active: 'Sesión Activa en Workspace',
    
    // Telemetry Channels
    telemetry_header: 'TELEMETRÍA',
    hover_hint: 'Mueve el cursor para inspeccionar valores en punto',
    speed_ch: 'VELOCIDAD (KM/H)',
    delta_ch: 'TIEMPO DELTA Δt (S)',
    pedals_ch: 'PEDALES • TRAIL BRAKING (GAS VERDE / FRENO ROJO)',
    gear_ch: 'MARCHA',
    reset_lap: 'Vuelta',
    dist: 'Dist',
    vel: 'Vel',
    throttle: 'Gas',
    brake: 'Freno',
    gear_label: 'G',
    
    // Track Inspector
    overview_btn: 'Vista General',
    track_title: 'Trazada 2D & Heatmap',
    fast: '+V (Rápido)',
    slow: '-V (Lento)',
    active_corner: 'Curva Activa',
    click_hint: '💡 Haz clic en cualquier curva para zoom de trazada y pianos',
    view_full_circuit: 'Ver Circuito Completo',
    circuit_label: 'CIRCUITO',
    view_all: 'VER TODO ↗',
    apex_speed: 'V. Vértice',
    delta_v_min: 'ΔV min',
    diff_corner: 'Diferencia Curva',
    total_delta: 'Delta Vuelta',
    turn_left: 'Viraje Izq',
    turn_right: 'Viraje Der',
    understeer: 'Subviraje',
    oversteer: 'Sobreviraje',
    early_apex: 'Vértice Anticipado',
    optimal_line: 'Trazada Óptima',
    your_line: 'Tu Trazada',
    turn_in: 'Giro',
    apex: 'Ápice',
    exit: 'Salida',
    
    // Diagnosis Cards (Row 4)
    racing_line_apex: 'Trazada & Ápice',
    gear_at_apex: 'Marcha en Vértice',
    overall_balance: 'Balance General de Vuelta',
    critical_point: 'Punto Crítico de Mejora',
    sync_telemetry: 'Telemetría Sincronizada',
    optimal_badge: 'Óptima',
    competitive_pace: 'Ritmo Competitivo',
    progressive_improvement: 'Mejora Progresiva',
    
    // Debrief & Radio Drawer
    engineer_panel_title: 'INGENIERO DE COMPETICIÓN & RADIO',
    debrief_tab: 'Debrief Técnico',
    radio_tab: 'Radio de Equipo',
    copy: 'Copiar',
    copied: 'Copiado',
    analyze: 'Analizar',
    analyzing: 'Analizando...',
    update: 'Actualizar',
    close_hint: 'Cerrar panel (Esc)',
    structured_view: 'Resumen Estructurado',
    full_report: 'Informe Completo',
    facts_title: '1. Hechos Observados en Datos',
    diagnosis_title: '2. Diagnóstico Técnico de Conducción',
    critical_corners_title: 'Puntos Críticos Curva a Curva',
    vehicle_dynamics_title: '3. Dinámica del Vehículo & Transferencia de Pesos',
    setup_advice_title: '4. Recomendaciones de Setup de Competición',
    exercises_title: '5. Plan de Ejercicios para la Siguiente Tanda',
    kpi_title: '6. Indicador Objetivo y KPIs de Validación',
    confidence_level: 'Nivel de confianza',
    suggested_queries: 'CONSULTAS SUGERIDAS',
    ask_placeholder: 'Pregunta sobre curva, frenada o setup...',
    transmit: 'Transmitir',
    radio_open_intro: 'Canal de radio abierto. He procesado la telemetría del coche. Pregúntame sobre la técnica de frenada, trail braking o setup.',
    radio_error: 'Error de comunicación en radio. Reintentando con el motor de ingeniería...',
  },
  en: {
    // Navigation & Topbar
    app_title: 'IDORACING ANALYTICS',
    app_slogan: 'Every lap tells a story',
    sessions_tab: 'Sessions & Garage',
    telemetry_tab: 'Telemetry & Track',
    setup_tab: 'History & Setup',
    engineer_tab: 'Race Engineer (AI)',
    settings_tab: 'AI Settings',
    model: 'Model',
    rules_engine: 'Numerical Rules',
    
    // Telemetry Header Bar
    laps_label: 'laps',
    sessions_btn: 'Sessions >',
    change_track: 'Change Track / Sim',
    gap: 'GAP',
    debrief_radio: 'DEBRIEF & RADIO',
    best_lap: 'Best Lap',
    session_active: 'Active Session in Workspace',
    
    // Telemetry Channels
    telemetry_header: 'TELEMETRY',
    hover_hint: 'Move cursor to inspect point values',
    speed_ch: 'SPEED (KM/H)',
    delta_ch: 'TIME DELTA Δt (S)',
    pedals_ch: 'PEDALS • TRAIL BRAKING (THROTTLE GREEN / BRAKE RED)',
    gear_ch: 'GEAR',
    reset_lap: 'Lap',
    dist: 'Dist',
    vel: 'Speed',
    throttle: 'Thr',
    brake: 'Brk',
    gear_label: 'G',
    
    // Track Inspector
    overview_btn: 'Overview',
    track_title: '2D Racing Line & Heatmap',
    fast: '+V (Fast)',
    slow: '-V (Slow)',
    active_corner: 'Active Corner',
    click_hint: '💡 Click any corner for detailed racing line & kerb zoom',
    view_full_circuit: 'View Full Circuit',
    circuit_label: 'CIRCUIT',
    view_all: 'VIEW ALL ↗',
    apex_speed: 'Apex Speed',
    delta_v_min: 'ΔV min',
    diff_corner: 'Corner Delta',
    total_delta: 'Lap Delta',
    turn_left: 'Left Turn',
    turn_right: 'Right Turn',
    understeer: 'Understeer',
    oversteer: 'Oversteer',
    early_apex: 'Early Apex',
    optimal_line: 'Optimal Line',
    your_line: 'Your Line',
    turn_in: 'Turn-In',
    apex: 'Apex',
    exit: 'Exit',
    
    // Diagnosis Cards (Row 4)
    racing_line_apex: 'Racing Line & Apex',
    gear_at_apex: 'Gear at Apex',
    overall_balance: 'Overall Lap Balance',
    critical_point: 'Critical Improvement Area',
    sync_telemetry: 'Synchronized Telemetry',
    optimal_badge: 'Optimal',
    competitive_pace: 'Competitive Pace',
    progressive_improvement: 'Progressive Improvement',
    
    // Debrief & Radio Drawer
    engineer_panel_title: 'RACE ENGINEER & RADIO',
    debrief_tab: 'Technical Debrief',
    radio_tab: 'Team Radio',
    copy: 'Copy',
    copied: 'Copied',
    analyze: 'Analyze',
    analyzing: 'Analyzing...',
    update: 'Update',
    close_hint: 'Close panel (Esc)',
    structured_view: 'Structured Summary',
    full_report: 'Full Report',
    facts_title: '1. Observed Telemetry Facts',
    diagnosis_title: '2. Technical Driving Diagnosis',
    critical_corners_title: 'Critical Corners Breakdown',
    vehicle_dynamics_title: '3. Vehicle Dynamics & Weight Transfer',
    setup_advice_title: '4. Competition Setup Recommendations',
    exercises_title: '5. Actionable Exercises for Next Stint',
    kpi_title: '6. Validation Target & KPIs',
    confidence_level: 'Confidence Level',
    suggested_queries: 'SUGGESTED QUERIES',
    ask_placeholder: 'Ask about corner, braking, or setup...',
    transmit: 'Transmit',
    radio_open_intro: 'Radio channel open. Telemetry processed. Ask me about braking technique, trail braking, or vehicle setup.',
    radio_error: 'Radio communication error. Reconnecting with engineering engine...',
  },
};

let currentLanguage: Language =
  (typeof window !== 'undefined' && (localStorage.getItem('idoracing_language') as Language)) || 'es';

const listeners = new Set<(lang: Language) => void>();

export function getLanguage(): Language {
  return currentLanguage;
}

export function setLanguage(lang: Language) {
  currentLanguage = lang;
  if (typeof window !== 'undefined') {
    localStorage.setItem('idoracing_language', lang);
  }
  listeners.forEach((fn) => fn(lang));
}

export function useLanguage() {
  const [lang, setLangState] = useState<Language>(getLanguage());

  useEffect(() => {
    const handler = (newLang: Language) => setLangState(newLang);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const t = (key: keyof typeof translations['es']): string => {
    return translations[lang][key] || translations['es'][key] || String(key);
  };

  const changeLanguage = (newLang: Language) => {
    setLanguage(newLang);
  };

  return { lang, setLanguage: changeLanguage, t };
}
