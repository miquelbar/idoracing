"""
Structured setup advice generator.
Analyzes a LapComparison and produces structured, telemetry-grounded setup recommendations.
Each recommendation carries the parameter, the change, the reason, and the numerical evidence.
"""

from datetime import datetime

from domain.session import LapComparison, SetupAdviceReport, SetupRecommendation

# Thresholds for pattern detection across corners
MIN_CORNERS_FOR_PATTERN = 2
UNDERSTEER_ENTRY_THRESHOLD_KMH = -4.0
UNDERSTEER_APEX_THRESHOLD_KMH = -3.0
TRACTION_EXIT_THRESHOLD_KMH = -4.0
THROTTLE_DELAY_THRESHOLD_M = 10.0
EXCESS_STEER_THRESHOLD_DEG = 5.0
EARLY_BRAKE_THRESHOLD_M = -10.0


def generate_setup_advice(
    comparison: LapComparison,
    car: str,
    track: str,
    synthetic: bool = False,
) -> SetupAdviceReport:
    """
    Generate a structured setup advice report from a lap comparison.
    Analyzes corner-by-corner patterns and maps them to specific setup changes.
    """
    corners = comparison.corners
    recommendations: list[SetupRecommendation] = []

    if not corners:
        return SetupAdviceReport(
            summary="No hay suficientes datos de curvas para generar recomendaciones de setup.",
            recommendations=[],
            overall_balance="neutral",
            primary_issue="",
            confidence="low",
            created_at=datetime.now(),
        )

    # --- Pattern detection across corners ---

    # Early braking set — computed first so these corners are excluded from
    # understeer detection: a corner where the driver brakes early is a technique
    # issue, not a setup issue, and must not trigger a contradictory brake bias change.
    early_brake_corner_numbers = {
        c.corner_number
        for c in corners
        if c.brake_delta_dist is not None
        and c.brake_delta_dist <= EARLY_BRAKE_THRESHOLD_M
        and c.time_delta_corner > 0.05
    }

    # 1. Understeer on entry/apex (slow corners)
    understeer_corners = [c for c in corners if c.balance_code == "understeer" and c.time_delta_corner > 0.05]
    understeer_entry = [
        c
        for c in understeer_corners
        if c.delta_v_entry is not None
        and c.delta_v_entry <= UNDERSTEER_ENTRY_THRESHOLD_KMH
        and c.corner_number not in early_brake_corner_numbers
    ]
    understeer_apex = [c for c in understeer_corners if c.speed_delta_min <= UNDERSTEER_APEX_THRESHOLD_KMH]

    # 2. Traction / exit problems
    traction_corners = [c for c in corners if c.balance_code == "traction" and c.time_delta_corner > 0.05]
    late_throttle = [
        c
        for c in corners
        if c.throttle_delta_dist is not None
        and c.throttle_delta_dist > THROTTLE_DELAY_THRESHOLD_M
        and c.time_delta_corner > 0.05
    ]

    # 3. Early braking pattern
    early_brake_corners = [c for c in corners if c.corner_number in early_brake_corner_numbers]

    # 4. Excess steering (overdriving / understeer symptom)
    excess_steer_corners = [
        c for c in corners if c.excess_steer_deg is not None and c.excess_steer_deg > EXCESS_STEER_THRESHOLD_DEG
    ]

    # 5. Trail braking issues
    early_release_corners = [c for c in corners if c.trail_code == "early_release" and c.time_delta_corner > 0.05]

    # 6. Kerb strike / damping issues
    kerb_corners = [c for c in corners if c.kerb_strike_detected]

    # 7. Racing line issues (missed apex / pinched exit)
    missed_apex_corners = [
        c for c in corners if c.racing_line_code in ("missed_apex", "pinched_exit") and c.time_delta_corner > 0.05
    ]

    # --- Generate recommendations based on patterns ---

    # Brake bias: understeer on entry across multiple corners
    if len(understeer_entry) >= MIN_CORNERS_FOR_PATTERN:
        corner_names = [c.corner_name for c in understeer_entry[:3]]
        evidence = [
            f"{c.corner_name}: velocidad de entrada {c.delta_v_entry:+.1f} km/h vs referencia, "
            f"pérdida de {c.time_delta_corner:.3f}s"
            for c in understeer_entry[:3]
        ]
        recommendations.append(
            SetupRecommendation(
                category="brake_bias",
                parameter="Brake Bias (Reparto de frenada)",
                suggested_change="-0.5% a -1.0% (hacia atrás)",
                reason=(
                    f"Subviraje consistente en entrada en {len(understeer_entry)} curvas. "
                    "Al frenar, el morro se descarga menos y no rota hacia el vértice. "
                    "Desplazar el reparto hacia atrás descarga más el eje delantero en frenada, "
                    "mejorando la inserción en curva."
                ),
                evidence=evidence,
                affected_corners=corner_names,
                priority="high" if len(understeer_entry) >= 3 else "medium",
                confidence="high" if len(understeer_entry) >= 3 else "medium",
            )
        )

    # Front ARB: understeer on apex + excess steering
    if len(understeer_apex) >= MIN_CORNERS_FOR_PATTERN or len(excess_steer_corners) >= MIN_CORNERS_FOR_PATTERN:
        source = understeer_apex if len(understeer_apex) >= MIN_CORNERS_FOR_PATTERN else excess_steer_corners
        corner_names = [c.corner_name for c in source[:3]]
        evidence = []
        for c in source[:3]:
            line = f"{c.corner_name}: pérdida de {c.time_delta_corner:.3f}s"
            if c.speed_delta_min:
                line += f", ΔV vértice {c.speed_delta_min:+.1f} km/h"
            if c.excess_steer_deg:
                line += f", exceso de volante {c.excess_steer_deg:.1f}°"
            evidence.append(line)
        recommendations.append(
            SetupRecommendation(
                category="arb_front",
                parameter="Front ARB (Barra estabilizadora delantera)",
                suggested_change="-1 click (más blanda)",
                reason=(
                    f"Subviraje en vértice en {len(source)} curvas"
                    + (
                        f" con exceso de volante medido ({len(excess_steer_corners)} curvas con >{EXCESS_STEER_THRESHOLD_DEG:.0f}° de exceso)"
                        if excess_steer_corners
                        else ""
                    )
                    + ". Ablandar la barra delantera permite que el neumático delantero apoye más en el vértice, "
                    "aumentando el agarre lateral y reduciendo el ángulo de volante necesario."
                ),
                evidence=evidence,
                affected_corners=corner_names,
                priority="high" if len(source) >= 3 else "medium",
                confidence="high" if len(source) >= 3 else "medium",
            )
        )

    # TC / Rear ARB: traction problems on exit
    if len(traction_corners) >= MIN_CORNERS_FOR_PATTERN or len(late_throttle) >= MIN_CORNERS_FOR_PATTERN:
        source = traction_corners if len(traction_corners) >= MIN_CORNERS_FOR_PATTERN else late_throttle
        corner_names = [c.corner_name for c in source[:3]]
        evidence = []
        for c in source[:3]:
            line = f"{c.corner_name}: pérdida de {c.time_delta_corner:.3f}s"
            if c.delta_v_exit:
                line += f", ΔV salida {c.delta_v_exit:+.1f} km/h"
            if c.throttle_delta_dist:
                line += f", acelerador +{c.throttle_delta_dist:.0f}m tarde"
            evidence.append(line)
        recommendations.append(
            SetupRecommendation(
                category="tc",
                parameter="TC1 (Control de tracción)",
                suggested_change="+1 click",
                reason=(
                    f"Problemas de tracción en salida en {len(source)} curvas. "
                    "La apertura de gas es tardía o la velocidad de salida está comprometida, "
                    "lo que sugiere que el eje trasero pierde agarre al acelerar. "
                    "Subir TC1 un punto ayuda a modular la entrega de potencia en la salida."
                ),
                evidence=evidence,
                affected_corners=corner_names,
                priority="high" if len(source) >= 3 else "medium",
                confidence="medium",
            )
        )
        recommendations.append(
            SetupRecommendation(
                category="arb_rear",
                parameter="Rear ARB (Barra estabilizadora trasera)",
                suggested_change="-1 click (más blanda)",
                reason=(
                    f"Mismo patrón de tracción en {len(source)} curvas de salida. "
                    "Ablandar la barra trasera aumenta el recorrido de la suspensión trasera, "
                    "mejorando el contacto del neumático trasero con el asfalto en aceleración."
                ),
                evidence=evidence,
                affected_corners=corner_names,
                priority="medium",
                confidence="medium",
            )
        )

    # Rear wing: consistent late throttle across multiple corners
    if len(late_throttle) >= MIN_CORNERS_FOR_PATTERN and not traction_corners:
        corner_names = [c.corner_name for c in late_throttle[:3]]
        evidence = [
            f"{c.corner_name}: acelerador {c.throttle_delta_dist:+.0f}m tarde, "
            f"ΔV salida {c.delta_v_exit:+.1f} km/h, pérdida {c.time_delta_corner:.3f}s"
            for c in late_throttle[:3]
        ]
        recommendations.append(
            SetupRecommendation(
                category="wing",
                parameter="Rear Wing (Alerón trasero)",
                suggested_change="+1 punto",
                reason=(
                    f"Apertura de gas retrasada en {len(late_throttle)} curvas. "
                    "Puede indicar falta de confianza en la zaga o falta de apoyo aerodinámico trasero. "
                    "Subir el alerón trasero aumenta la carga en el eje trasero, mejorando la tracción en salida."
                ),
                evidence=evidence,
                affected_corners=corner_names,
                priority="medium",
                confidence="low",
            )
        )

    # Brake bias: early braking pattern (fear of locking / insufficient confidence)
    if len(early_brake_corners) >= MIN_CORNERS_FOR_PATTERN:
        corner_names = [c.corner_name for c in early_brake_corners[:3]]
        evidence = [
            f"{c.corner_name}: frenada {abs(c.brake_delta_dist):.0f}m antes, "
            f"ΔV vértice {c.speed_delta_min:+.1f} km/h, pérdida {c.time_delta_corner:.3f}s"
            for c in early_brake_corners[:3]
        ]
        recommendations.append(
            SetupRecommendation(
                category="brake_bias",
                parameter="Brake Bias (Reparto de frenada)",
                suggested_change="+0.5% (hacia delante)",
                reason=(
                    f"Frenada anticipada en {len(early_brake_corners)} curvas. "
                    "Puede deberse a falta de confianza en la frenada (técnica de pilotaje) "
                    "o a un reparto demasiado trasero que bloquea la zaga. "
                    "Si el piloto confirma que frena antes por desconfianza, corrige primero la técnica. "
                    "Si frena en el punto correcto pero el coche se bloquea, adelanta el reparto 0.5%."
                ),
                evidence=evidence,
                affected_corners=corner_names,
                priority="medium",
                confidence="low",
            )
        )

    # ABS: early release of brake (trail braking issues)
    if len(early_release_corners) >= MIN_CORNERS_FOR_PATTERN:
        corner_names = [c.corner_name for c in early_release_corners[:3]]
        evidence = [
            f"{c.corner_name}: suelta el freno antes de tiempo, "
            f"pérdida {c.time_delta_corner:.3f}s, ΔV vértice {c.speed_delta_min:+.1f} km/h"
            for c in early_release_corners[:3]
        ]
        recommendations.append(
            SetupRecommendation(
                category="abs",
                parameter="ABS",
                suggested_change="-1 click (si el piloto es experimentado)",
                reason=(
                    f"Soltado prematuro del freno en {len(early_release_corners)} curvas. "
                    "El ABS puede estar interviniendo demasiado pronto, impidiendo el trail braking efectivo. "
                    "Bajar ABS un punto permite modular mejor la presión de freno en el vértice. "
                    "Solo recomendable si el piloto tiene buen control del pedal."
                ),
                evidence=evidence,
                affected_corners=corner_names,
                priority="low",
                confidence="low",
            )
        )

    # Dampers: kerb strike issues
    if kerb_corners:
        corner_names = [c.corner_name for c in kerb_corners[:3]]
        evidence = [
            f"{c.corner_name}: rebote detectado sobre piano" + (f" — {c.damping_advice}" if c.damping_advice else "")
            for c in kerb_corners[:3]
        ]
        recommendations.append(
            SetupRecommendation(
                category="dampers",
                parameter="Fast Bump (Compresión rápida)",
                suggested_change="-1 click (más blando) en eje trasero",
                reason=(
                    f"Rebote sobre pianos detectado en {len(kerb_corners)} curvas. "
                    "La suspensión trasera no absorbe bien los impactos del piano, desestabilizando el coche. "
                    "Ablandar el fast bump trasero mejora la absorción de impactos sin comprometer el apoyo en curva."
                ),
                evidence=evidence,
                affected_corners=corner_names,
                priority="medium",
                confidence="medium",
            )
        )

    # Camber: missed apex / pinched exit (line issues that could be setup-related)
    if len(missed_apex_corners) >= MIN_CORNERS_FOR_PATTERN:
        corner_names = [c.corner_name for c in missed_apex_corners[:3]]
        evidence = [
            f"{c.corner_name}: trazada {c.racing_line_eval}, pérdida {c.time_delta_corner:.3f}s"
            for c in missed_apex_corners[:3]
        ]
        recommendations.append(
            SetupRecommendation(
                category="camber",
                parameter="Camber delantero",
                suggested_change="-0.2° (menos negativo)",
                reason=(
                    f"Trazada cerrada o salida estrangulada en {len(missed_apex_corners)} curvas. "
                    "Si el camber delantero es muy negativo, el neumático no apoya bien en el vértice, "
                    "empujando al piloto a cerrar la trazada. Reducir 0.2° de caída negativa mejora el apoyo en vértice."
                ),
                evidence=evidence,
                affected_corners=corner_names,
                priority="low",
                confidence="low",
            )
        )

    # --- Deduplicate: never emit two recommendations for the same parameter ---
    # If two patterns map to the same category (e.g. two different brake bias directions),
    # keep only the stronger one (higher priority, then more affected corners).
    _priority_rank = {"high": 0, "medium": 1, "low": 2}
    _seen: dict[str, SetupRecommendation] = {}
    for rec in recommendations:
        existing = _seen.get(rec.category)
        if existing is None:
            _seen[rec.category] = rec
        else:
            existing_score = (_priority_rank.get(existing.priority, 3), -len(existing.affected_corners))
            new_score = (_priority_rank.get(rec.priority, 3), -len(rec.affected_corners))
            if new_score < existing_score:
                _seen[rec.category] = rec
    recommendations = list(_seen.values())

    # --- Determine overall balance and primary issue ---

    balance_counts: dict[str, int] = {}
    for c in corners:
        if c.time_delta_corner > 0.05:
            balance_counts[c.balance_code] = balance_counts.get(c.balance_code, 0) + 1

    if balance_counts:
        dominant = max(balance_counts, key=balance_counts.get)
        if dominant == "understeer":
            overall_balance = "understeer"
        elif dominant == "traction":
            overall_balance = "oversteer"
        elif dominant in ("early_braking", "momentum_loss"):
            overall_balance = "mixed"
        else:
            overall_balance = "neutral"
    else:
        overall_balance = "neutral"

    # Primary issue = the recommendation with highest priority, or the corner with most time lost
    if recommendations:
        recommendations.sort(key=lambda r: _priority_rank.get(r.priority, 3))
        primary_issue = recommendations[0].reason.split(".")[0] + "."
    else:
        worst = max(corners, key=lambda c: c.time_delta_corner) if corners else None
        if worst and worst.time_delta_corner > 0.05:
            primary_issue = f"Pérdida de {worst.time_delta_corner:.3f}s en {worst.corner_name}: {worst.diagnosis}"
        else:
            primary_issue = "No se detectan problemas de setup significativos; el rendimiento es consistente."

    # Summary
    total_loss = sum(c.time_delta_corner for c in corners if c.time_delta_corner > 0)
    n_problem_corners = sum(1 for c in corners if c.time_delta_corner > 0.05)
    if recommendations:
        summary = (
            f"Se detectaron {len(recommendations)} recomendaciones de setup basadas en patrones "
            f"en {n_problem_corners} curvas con pérdida de tiempo (total: +{total_loss:.3f}s). "
            f"El balance general del coche es predominantly {overall_balance}. "
            f"Prioriza los cambios marcados como alta prioridad y prueba uno a la vez, "
            f"5 vueltas por cambio, para aislar el efecto."
        )
    else:
        summary = (
            f"No se detectaron patrones de setup consistentes en las {len(corners)} curvas analizadas "
            f"(pérdida total: +{total_loss:.3f}s en {n_problem_corners} curvas). "
            f"Las diferencias parecen deberse principalmente a técnica de pilotaje. "
            f"Concéntrate en los ejercicios del informe de Pep antes de tocar el setup."
        )

    # Confidence
    if synthetic:
        confidence = "low"
    elif len(recommendations) >= 3:
        confidence = "high"
    elif recommendations:
        confidence = "medium"
    else:
        confidence = "low"

    return SetupAdviceReport(
        summary=summary,
        recommendations=recommendations,
        overall_balance=overall_balance,
        primary_issue=primary_issue,
        confidence=confidence,
        created_at=datetime.now(),
    )
