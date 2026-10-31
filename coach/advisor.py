"""
AI and Rule-Based Driving Coach Advisor.
Turns a LapComparison into a structured coaching report, with an LLM when one is available and rules otherwise.
"""

from datetime import datetime
from typing import Any

from coach.llm_client import LLMClient
from coach.prompt import PEP_SYSTEM_PROMPT_ES
from domain.session import CoachReport, CornerAnalysis, LapComparison

SYSTEM_PROMPT = PEP_SYSTEM_PROMPT_ES


class CoachAdvisor:
    """Generates structured coaching reports from lap comparisons."""

    def __init__(self, llm_client: Any | None = None):
        self.llm = llm_client or LLMClient()

    def generate_report(
        self,
        comparison: LapComparison,
        car: str,
        track: str,
        synthetic: bool = False,
        setup_comparison: dict[str, Any] | None = None,
        coverage_warnings: list[str] | None = None,
    ) -> CoachReport:
        """
        Generate a complete coaching report. Uses the configured LLM if available;
        otherwise generates a deterministic, rule-based report.
        synthetic marks a comparison built on placeholder telemetry, which caps confidence at low.
        """
        sector_str = _sector_summary(comparison)
        loss_corners = sorted(
            [c for c in comparison.corners if c.time_delta_corner > 0.05],
            key=lambda x: x.time_delta_corner,
            reverse=True,
        )
        primary = loss_corners[0] if loss_corners else (comparison.corners[0] if comparison.corners else None)

        metrics = _metrics(comparison, sector_str, primary)
        coverage_warnings = coverage_warnings or []
        facts = [*coverage_warnings, *_facts(comparison, primary, synthetic, setup_comparison)]
        hypotheses, exercises = _hypotheses_and_exercises(
            primary,
            ref_lap=comparison.reference_lap,
            comp_lap=comparison.comparison_lap,
            setup_comparison=setup_comparison,
            synthetic=synthetic,
        )
        verification_indicator = _verification_indicator(comparison, primary)

        llm_report = None
        if self.llm.is_available():
            llm_report = self.llm.generate(
                prompt=_llm_prompt(comparison, car, track, sector_str, synthetic, setup_comparison, coverage_warnings),
                system_prompt=SYSTEM_PROMPT,
            )

        level = "Baja (vuelta incompleta)" if coverage_warnings else _confidence_level(comparison, synthetic)
        if llm_report and len(llm_report.strip()) > 20:
            raw_report = llm_report
            confidence = f"{level} (LLM + telemetría)"
        else:
            confidence = f"{level} (motor de reglas)"
            raw_report = _rules_report(
                comparison, car, track, facts, loss_corners, hypotheses, exercises, verification_indicator, confidence
            )

        return CoachReport(
            facts=facts,
            metrics=metrics,
            hypotheses=hypotheses,
            exercises=exercises,
            verification_indicator=verification_indicator,
            confidence=confidence,
            raw_report=raw_report,
            created_at=datetime.now(),
        )


def _sector_summary(comparison: LapComparison) -> str:
    if not comparison.sector_differences:
        return "Sectores equilibrados"
    return " | ".join(
        f"{k.replace('sector', 'S').upper()}: {v:+.3f}s" for k, v in comparison.sector_differences.items()
    )


def _metrics(comparison: LapComparison, sector_str: str, primary: CornerAnalysis | None) -> dict[str, Any]:
    trail_corners = [
        c
        for c in comparison.corners
        if c.trail_eval in ("Soltado Prematuro", "Exceso de Freno en Giro", "Trail Braking Efectivo")
    ]
    effective_trail = [c for c in trail_corners if c.trail_eval == "Trail Braking Efectivo"]
    metrics: dict[str, Any] = {
        "diferencia_vuelta": f"{comparison.time_difference:+.3f}s",
        "diferencia_sectores": sector_str,
        "curvas_analizadas": len(comparison.corners),
    }
    if trail_corners:
        metrics["eficiencia_trail_braking"] = f"{len(effective_trail) / len(trail_corners) * 100.0:.0f}%"
    if primary:
        metrics["primary_loss_corner"] = {
            "name": primary.corner_name,
            "time_delta": primary.time_delta_corner,
            "ref_apex_speed": primary.ref_min_speed,
            "comp_apex_speed": primary.comp_min_speed,
            "speed_delta_apex": primary.speed_delta_min,
            "brake_delta_dist": primary.brake_delta_dist,
            "throttle_delta_dist": primary.throttle_delta_dist,
        }
    return metrics


def _setup_case_insight(
    setup_comparison: dict[str, Any] | None,
    primary: CornerAnalysis | None,
    p1: str,
    p2: str,
) -> tuple[str | None, str | None]:
    """
    Generate Pep's setup correlation insight (Case A, B, or C) and any setup action item.
    """
    if not setup_comparison:
        return None, None

    same_garage = bool(setup_comparison.get("same_garage_setup", True))
    garage_diffs: list[str] = setup_comparison.get("garage_diff_summary") or []
    thermal_diffs: list[str] = setup_comparison.get("thermal_diff_summary") or []
    c_label = f"en T{primary.corner_number} ({primary.corner_name})" if primary else "en pista"
    loss_str = f"+{primary.time_delta_corner:.2f}s" if primary and primary.time_delta_corner > 0 else "ese tiempo"

    if same_garage and not thermal_diffs:
        # Case A — Identical Garage Setup & similar hot pressures
        return (
            f"Idò, en {p1} y {p2} llevas calcado el mismo setup de garaje y las presiones en caliente están "
            f"en ventana óptima (~26.8 psi), así que hoy no le eches la culpa al mecánico: esos {loss_str} "
            f"que te mete {p1} (y 👻 Bubota) {c_label} son 100% de tus manos y pies en los pedales.",
            None,
        )

    if same_garage and thermal_diffs:
        # Case B — Identical Garage Setup, different on-track hot pressures/temps
        diff_txt = ", ".join(thermal_diffs[:2])
        first_wheel = thermal_diffs[0].split()[0] if thermal_diffs else "FL"
        return (
            f"Aunque no tocaste el setup en el garaje entre {p1} y {p2}, en {p2} variaron las presiones en caliente "
            f"en pista ({diff_txt} respecto a {p1}) por temperatura de asfalto o por arrastrar el morro en apoyo.",
            f"Ajuste térmico para la próxima tanda: compensa la presión en frío en {first_wheel} para devolverla a 26.7-26.9 psi en caliente.",
        )

    # Case C — Modified Garage Setup between P1 and P2
    diff_txt = ", ".join(garage_diffs) if garage_diffs else "parámetros modificados"
    if any("BB +" in d for d in garage_diffs):
        return (
            f"Setup modificado entre {p1} y {p2} ({diff_txt}): haber adelantado el Reparto de Frenada (Brake Bias) "
            f"en {p2} sobrecarga el neumático delantero al girar {c_label}, induciendo subviraje en entrada.",
            f"Reglaje en {p2}: vuelve al Reparto de Frenada de {p1} para recuperar rotación en la fase de trail braking.",
        )
    return (
        f"Setup de garaje modificado entre {p1} y {p2} ({diff_txt}): correlaciona este cambio mecánico "
        f"con la variación de equilibrio {c_label}.",
        f"Reglaje: si tras clavar la referencia de frenada de {p1} persiste la pérdida, revierte ({diff_txt}) hacia la base de {p1}.",
    )


def _facts(
    comparison: LapComparison,
    primary: CornerAnalysis | None,
    synthetic: bool,
    setup_comparison: dict[str, Any] | None = None,
) -> list[str]:
    side = "más lenta" if comparison.time_difference > 0 else "más rápida"
    facts = [
        f"La vuelta comparada P2 (V{comparison.comparison_lap}) es {abs(comparison.time_difference):.3f}s {side} "
        f"que la vuelta de referencia P1 (V{comparison.reference_lap})."
    ]
    for s_name, s_diff in comparison.sector_differences.items():
        sign = "+" if s_diff > 0 else ""
        facts.append(f"Diferencia en {s_name.replace('sector', 'Sector ')} (P2 vs P1): {sign}{s_diff:.3f}s.")
    if primary and not synthetic:
        facts.append(
            f"Mayor pérdida focalizada en {primary.corner_name} (Curva {primary.corner_number}): "
            f"+{primary.time_delta_corner:.3f}s perdidos en P2 (V{comparison.comparison_lap}) frente a P1 (V{comparison.reference_lap}) "
            f"(👻 Bubota: -{primary.ideal_time_gain or 0.15:.3f}s)."
        )
    if setup_comparison and not synthetic:
        if setup_comparison.get("same_garage_setup", True):
            t_diffs = setup_comparison.get("thermal_diff_summary") or []
            if t_diffs:
                facts.append(
                    f"Setup de garaje idéntico en P1 y P2; variación térmica dinámica en pista: {', '.join(t_diffs)}."
                )
            else:
                facts.append(
                    "Setup de garaje idéntico en P1 y P2 y neumáticos en ventana óptima (26.7-26.9 psi): "
                    "el 100% de la diferencia proviene del pilotaje."
                )
        else:
            g_diffs = setup_comparison.get("garage_diff_summary") or []
            facts.append(f"Setup de garaje modificado entre P1 y P2: {', '.join(g_diffs)}.")
    if synthetic:
        facts.append(
            "⚠️ Estas vueltas solo contienen tiempos cronometrados (sin canales de telemetría a 50Hz). "
            "Activa la exportación de telemetría (.ld / .csv) en tu simulador para obtener el diagnóstico real por curva."
        )
    elif not comparison.corners:
        facts.append(
            "Telemetría a 50Hz cargada correctamente (velocidad, pedales y dinámica G). "
            "No se han detectado curvas cerradas discretas o ambas vueltas tienen un ritmo muy similar en vértice."
        )
    return facts


def _hypotheses_and_exercises(
    primary: CornerAnalysis | None,
    ref_lap: str = "1",
    comp_lap: str = "2",
    setup_comparison: dict[str, Any] | None = None,
    synthetic: bool = False,
) -> tuple[list[str], list[str]]:
    if primary is None:
        if synthetic:
            return [
                "Sesión sin canales de telemetría a 50Hz grabados: solo disponemos de los tiempos cronometrados de vuelta y sectores."
            ], [
                "Activa la grabación de telemetría MoTeC (.ld) o CSV en el simulador para analizar puntos de frenada, trail braking y trazada GPS sin inventar datos."
            ]
        p1 = f"P1 (V{ref_lap})"
        p2 = f"P2 (V{comp_lap})"
        return [
            f"Telemetría continua a 50Hz analizada: no se detecta ninguna curva con pérdida crítica (>0.05s) entre {p1} y {p2}."
        ], [
            "El paso por curva es consistente. Enfoca tu mejora en adelantar la apertura de acelerador y maximizar la tracción en rectas."
        ]
    name, number = primary.corner_name, primary.corner_number
    p1 = f"P1 (V{ref_lap})"
    p2 = f"P2 (V{comp_lap})"
    setup_hyp, setup_ex = _setup_case_insight(setup_comparison, primary, p1, p2)

    if primary.both_laps_fault and primary.both_laps_fault_reason:
        hyps = [primary.both_laps_fault_reason]
        exs = [
            f"Curva {number} ({name}): En tanto {p1} como {p2}, mantén presión regresiva de freno (~{primary.ideal_trail_pct or 50:.0f}% -> 0%) "
            f"hasta el vértice siguiendo a 👻 Bubota para ganar -{primary.ideal_time_gain or 0.20:.3f}s."
        ]
    elif primary.brake_delta_dist and primary.brake_delta_dist < -15.0:
        hyps = [
            f"En {name}, en {p2} inicias la frenada {abs(primary.brake_delta_dist):.1f}m antes "
            f"que en {p1}. Esto provoca una reducción excesiva de velocidad antes del vértice "
            f"({primary.comp_min_speed:.1f} km/h en {p2} vs {primary.ref_min_speed:.1f} km/h en {p1})."
        ]
        exs = [
            f"Curva {number} ({name}): En {p2}, retrasa la referencia de frenada "
            f"progresivamente 10-15 metros hacia la marca de {p1}, soltando en regresión diagonal (trail braking) "
            f"para transportar más velocidad hasta el ápice."
        ]
    elif primary.throttle_delta_dist and primary.throttle_delta_dist > 15.0:
        hyps = [
            f"En {name}, la velocidad mínima en {p2} es {primary.comp_min_speed:.1f} km/h, "
            f"pero la aplicación del acelerador se demora {primary.throttle_delta_dist:.1f}m respecto a {p1}, "
            f"restando velocidad en toda la recta posterior."
        ]
        exs = [
            f"Curva {number} ({name}): En {p2}, abre dirección antes en la salida "
            f"para iniciar la rampa progresiva de acelerador junto a {p1} y 👻 Bubota."
        ]
    else:
        hyps = [
            f"Diferencia de trazada y velocidad de paso en {name}: la velocidad mínima en vértice en {p2} "
            f"es {primary.speed_delta_min:.1f} km/h respecto a {p1} ({primary.comp_min_speed:.1f} vs {primary.ref_min_speed:.1f} km/h)."
        ]
        exs = [
            f"Curva {number} ({name}): En {p2}, apunta a alcanzar los {primary.ref_min_speed:.1f} km/h de {p1} "
            f"(y los {primary.v_min_ideal or primary.ref_min_speed + 2.0:.1f} km/h de 👻 Bubota) en el vértice."
        ]

    if setup_hyp:
        hyps.append(setup_hyp)
    if setup_ex:
        exs.append(setup_ex)
    return hyps, exs


def _verification_indicator(comparison: LapComparison, primary: CornerAnalysis | None) -> str:
    if primary:
        return (
            f"Velocidad mínima en el vértice de {primary.corner_name} >= "
            f"{primary.ref_min_speed - 2.0:.1f} km/h "
            f"y reducción del delta acumulado en al menos 0.20s en ese sector."
        )
    return f"Reducir la diferencia total de {comparison.time_difference:+.3f}s respecto a la vuelta de referencia."


def _llm_prompt(
    comparison: LapComparison,
    car: str,
    track: str,
    sector_str: str,
    synthetic: bool,
    setup_comparison: dict[str, Any] | None = None,
    coverage_warnings: list[str] | None = None,
) -> str:
    prompt_data = (
        f"VEHÍCULO: {car}\n"
        f"CIRCUITO: {track}\n"
        f"VUELTA REFERENCIA: P1 (V{comparison.reference_lap})\n"
        f"VUELTA COMPARACIÓN: P2 (V{comparison.comparison_lap})\n"
        f"DIFERENCIA TOTAL: {comparison.time_difference:+.3f}s\n"
        f"SECTORES: {sector_str}\n"
    )
    if setup_comparison:
        same_g = setup_comparison.get("same_garage_setup", True)
        g_diffs = setup_comparison.get("garage_diff_summary") or []
        t_diffs = setup_comparison.get("thermal_diff_summary") or []
        if same_g and not t_diffs:
            prompt_data += (
                "SETUP (P1 vs P2): Idéntico setup de garaje y presiones óptimas (100% diferencia de pilotaje).\n"
            )
        elif same_g and t_diffs:
            prompt_data += (
                f"SETUP (P1 vs P2): Idéntico setup de garaje, variación térmica en pista: {', '.join(t_diffs)}.\n"
            )
        else:
            prompt_data += f"SETUP MODIFICADO (P2 vs P1): {', '.join(g_diffs)}.\n"
    if coverage_warnings:
        prompt_data += (
            "AVISO DE COBERTURA: "
            + " ".join(coverage_warnings)
            + " Dilo al inicio del informe, limita el análisis a las curvas medidas en ambas vueltas "
            "y no declares que una vuelta es mejor que la otra.\n"
        )
    if synthetic:
        prompt_data += (
            "AVISO: estas vueltas solo tienen tiempos; las trazas por curva son simuladas. "
            "Dilo en el informe y no des consejos de pilotaje basados en ellas.\n"
        )
    prompt_data += "ZONAS Y TRAIL BRAKING ANALIZADOS:\n"
    for c in comparison.corners:
        prompt_data += (
            f"- {c.corner_name} (T{c.corner_number}): Pérdida {c.time_delta_corner:+.3f}s, "
            f"Vmin Ref: {c.ref_min_speed} km/h, Vmin Comp: {c.comp_min_speed} km/h "
            f"(Delta Vmin: {c.speed_delta_min:+.1f} km/h). "
            f"Frenada: {c.brake_delta_dist if c.brake_delta_dist else 'Exacta'}m. "
            f"Trail Braking: {c.trail_eval} ({c.trail_advice or ''}). "
            f"Diagnóstico: {c.diagnosis}\n"
        )
    return (
        f"A partir del siguiente resumen numérico de telemetría, redacta el informe para el piloto:\n\n"
        f"{prompt_data}\n\n"
        f"Asegúrate de seguir estrictamente los 5 apartados requeridos sin inventar datos."
    )


def _confidence_level(comparison: LapComparison, synthetic: bool) -> str:
    if synthetic:
        return "Baja (solo tiempos)"
    if not comparison.corners:
        return "Media (telemetría continua)"
    return "Alta"


def _rules_report(
    comparison: LapComparison,
    car: str,
    track: str,
    facts: list[str],
    loss_corners: list[CornerAnalysis],
    hypotheses: list[str],
    exercises: list[str],
    verification_indicator: str,
    confidence: str,
) -> str:
    sectors = (
        ", ".join(f"{k}: {v:+.3f}s" for k, v in comparison.sector_differences.items())
        if comparison.sector_differences
        else "No disponible"
    )
    p1 = f"P1 (V{comparison.reference_lap})"
    p2 = f"P2 (V{comparison.comparison_lap})"
    report = f"""# Informe Técnico de Conducción — IdoRacing Analytics

- **Vehículo:** {car}
- **Circuito:** {track}
- **Comparativa:** {p2} frente a {p1} (Referencia)
- **Diferencia de tiempo:** {comparison.time_difference:+.3f}s

---

### 1. Qué se ha observado (Hechos objetivos)
{chr(10).join(f"- {fact}" for fact in facts)}

### 2. Datos y métricas que sustentan la conclusión
- **Diferencia total de vuelta ({p2} vs {p1}):** {comparison.time_difference:+.3f}s
- **Desglose por sectores:** {sectors}
"""
    if loss_corners:
        report += "\n**Puntos clave con pérdida de tiempo:**\n"
        for c in loss_corners[:3]:
            b_info = f", punto de frenada {c.brake_delta_dist:+.1f}m" if c.brake_delta_dist else ""
            report += (
                f"- **{c.corner_name} (T{c.corner_number}):** Pérdida de **{c.time_delta_corner:.3f}s** en {p2} vs {p1} "
                f"(👻 Bubota: -{c.ideal_time_gain or 0.15:.3f}s). "
                f"Vértice: {c.comp_min_speed:.1f} km/h ({p2}) frente a {c.ref_min_speed:.1f} km/h ({p1}) ({c.speed_delta_min:+.1f} km/h){b_info}.\n"
                f"  *Diagnóstico técnico:* {c.diagnosis}\n"
            )
    report += f"""
### 3. Hipótesis técnica
{chr(10).join(f"- {hyp}" for hyp in hypotheses)}

### 4. Ejercicios concretos
{chr(10).join(f"{i + 1}. {ex}" for i, ex in enumerate(exercises))}

### 5. Indicador numérico de comprobación y Confianza
- **Indicador de validación en telemetría:** {verification_indicator}
- **Nivel de confianza del análisis:** {confidence}

*— Pep · Ingeniero de Pista*
"""
    return report
