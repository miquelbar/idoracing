"""
Race Stint Evolution & Tyre/Fuel Degradation Analysis.
Evaluates multi-lap pace trends, sector-by-sector time loss progression,
fuel burn-off effects on mass distribution, and pit-wall tactical advice.
"""

from typing import Any

import numpy as np

from domain.session import Session


def analyze_session_stint(session: Session) -> dict[str, Any]:
    """
    Analyze race stint pace degradation, sector decay, fuel consumption, and strategy.
    Excludes outlaps, pit-entry laps, and severe outliers (< 45s or > 1.4x typical pace).
    """
    # 1. First attempt: valid flying laps > 40s
    candidate_laps = [l for l in session.laps if l.lap_time > 40.0 and l.is_valid]

    # 2. If fewer than 2 valid laps, check if laps lack is_valid flag (or only invalid)
    if len(candidate_laps) < 2:
        candidate_laps = [l for l in session.laps if l.lap_time > 40.0]

    # 3. Filter out extreme outliers (outlaps/in-laps like 250s when typical is 95s)
    if candidate_laps:
        min_time = min(l.lap_time for l in candidate_laps)
        # Any lap longer than 1.4x the fastest lap is an outlap or slow spin
        valid_laps = [l for l in candidate_laps if l.lap_time <= min_time * 1.4]
    else:
        valid_laps = []

    lap_numbers = [l.lap_number for l in valid_laps]
    lap_times = [l.lap_time for l in valid_laps]

    if len(valid_laps) < 2:
        return {
            "session_id": session.session_id,
            "track_name": session.track,
            "car_name": session.car,
            "valid_laps": len(valid_laps),
            "best_lap_s": valid_laps[0].lap_time if valid_laps else 0.0,
            "avg_lap_s": valid_laps[0].lap_time if valid_laps else 0.0,
            "std_dev_s": 0.0,
            "pace_trend_s_per_lap": 0.0,
            "consistency_rating": "Insuficientes vueltas",
            "fuel_burned_litres": round(len(session.laps) * 3.5, 1),
            "degradation_type": "none",
            "degradation_diagnosis": (
                f"Se ha completado {len(valid_laps)} vuelta válida en esta sesión. "
                "Para calcular la degradación de stint y el desgaste de neumáticos se necesitan al menos 2 vueltas cronometradas consecutivas."
            ),
            "pit_wall_strategy": "Completa una tanda continua de 3 a 5 vueltas a ritmo de carrera para proyectar el desgaste y la estrategia.",
            "lap_numbers": lap_numbers,
            "lap_times": [round(t, 3) for t in lap_times],
        }

    best_lap = float(np.min(lap_times))
    avg_lap = float(np.mean(lap_times))
    std_dev = float(np.std(lap_times))

    # Pace slope (linear regression of lap times over lap sequence)
    pace_trend = 0.0
    if len(lap_times) >= 2:
        x = np.arange(len(lap_times))
        slope, _ = np.polyfit(x, lap_times, 1)
        pace_trend = round(float(slope), 3)

    # Sector breakdown if available
    s1_times = [l.sector_times[0] for l in valid_laps if l.sector_times and len(l.sector_times) >= 1]
    s3_times = [l.sector_times[2] for l in valid_laps if l.sector_times and len(l.sector_times) >= 3]

    s1_slope = round(float(np.polyfit(np.arange(len(s1_times)), s1_times, 1)[0]), 3) if len(s1_times) >= 2 else 0.0
    s3_slope = round(float(np.polyfit(np.arange(len(s3_times)), s3_times, 1)[0]), 3) if len(s3_times) >= 2 else 0.0

    # Fuel burn-off estimation (GT3 average ~3.45 L/lap)
    est_fuel_per_lap = 3.5
    fuel_burned = round(len(valid_laps) * est_fuel_per_lap, 1)

    # Diagnosis of balance shift & tyre wear
    if pace_trend > 0.15:
        if s3_slope > s1_slope:
            deg_type = "rear_traction_decay"
            diagnosis = (
                f"Degradación acelerada en el tren trasero ({pace_trend:+.3f}s/vuelta). "
                f"La pérdida se concentra en zonas de tracción lenta (Sector 3). A medida que baja la gasolina (-{fuel_burned}L), "
                f"la zaga pierde carga estática y sobrecalienta el compuesto en salida."
            )
            strategy = "Sube TC1 en 1 clic (ej. TC1 de 3 a 4) y adelanta el reparto de frenada (+0.5%) para descargar el eje trasero."
        else:
            deg_type = "front_tire_wear"
            diagnosis = (
                f"Degradación del tren delantero ({pace_trend:+.3f}s/vuelta). "
                f"Subviraje progresivo en entrada y vértice. El neumático delantero pierde inserción por acumulación térmica."
            )
            strategy = "Anticipa la desaceleración con frenadas más rectas, modula con suavidad y evita meter más de 60° de volante."
    elif pace_trend < -0.05:
        deg_type = "improving_pace"
        diagnosis = (
            f"Ritmo en mejora progresiva ({pace_trend:+.3f}s/vuelta). "
            f"El calentamiento de gomas y el vaciado del depósito (-{fuel_burned}L) mejoran la agilidad del chasis."
        )
        strategy = "Mantén la consistencia actual; vigila presiones en caliente para no rebasar 27.0 psi."
    else:
        deg_type = "stable_pace"
        diagnosis = (
            f"Ritmo de carrera sumamente estable ({pace_trend:+.3f}s/vuelta, desviación típica ±{std_dev:.2f}s). "
            f"Excelente gestión de degradación y temperatura de neumáticos."
        )
        strategy = "Continúa con las referencias actuales de frenada y tracción."

    consistency_rating = (
        "Excelente (±0.2s)" if std_dev < 0.3 else ("Buena (±0.5s)" if std_dev < 0.6 else "Inconsistente (>0.8s)")
    )

    return {
        "session_id": session.session_id,
        "track_name": session.track,
        "car_name": session.car,
        "valid_laps": len(valid_laps),
        "best_lap_s": best_lap,
        "avg_lap_s": round(avg_lap, 3),
        "std_dev_s": round(std_dev, 3),
        "pace_trend_s_per_lap": pace_trend,
        "consistency_rating": consistency_rating,
        "fuel_burned_litres": fuel_burned,
        "degradation_type": deg_type,
        "degradation_diagnosis": diagnosis,
        "pit_wall_strategy": strategy,
        "lap_numbers": lap_numbers,
        "lap_times": [round(t, 3) for t in lap_times],
    }
