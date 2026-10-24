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
        facts = _facts(comparison, primary, synthetic)
        hypotheses, exercises = _hypotheses_and_exercises(
            primary, ref_lap=comparison.reference_lap, comp_lap=comparison.comparison_lap
        )
        verification_indicator = _verification_indicator(comparison, primary)

        llm_report = None
        if self.llm.is_available():
            llm_report = self.llm.generate(
                prompt=_llm_prompt(comparison, car, track, sector_str, synthetic), system_prompt=SYSTEM_PROMPT
            )

        level = _confidence_level(comparison, synthetic)
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


def _facts(comparison: LapComparison, primary: CornerAnalysis | None, synthetic: bool) -> list[str]:
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
            f"(👻 Potencial Ideal: -{primary.ideal_time_gain or 0.15:.3f}s)."
        )
    if synthetic or not comparison.corners:
        facts.append(
            "⚠️ Estas vueltas solo contienen tiempos cronometrados (sin canales de telemetría a 50Hz). "
            "Activa la exportación de telemetría (.ld / .csv) en tu simulador para obtener el diagnóstico real por curva."
        )
    return facts


def _hypotheses_and_exercises(
    primary: CornerAnalysis | None,
    ref_lap: str = "1",
    comp_lap: str = "2",
) -> tuple[list[str], list[str]]:
    if primary is None:
        return [
            "Sesión sin canales de telemetría a 50Hz grabados: solo disponemos de los tiempos cronometrados de vuelta y sectores."
        ], [
            "Activa la grabación de telemetría MoTeC (.ld) o CSV en el simulador para analizar puntos de frenada, trail braking y trazada GPS sin inventar datos."
        ]
    name, number = primary.corner_name, primary.corner_number
    p1 = f"P1 (V{ref_lap})"
    p2 = f"P2 (V{comp_lap})"
    if primary.both_laps_fault and primary.both_laps_fault_reason:
        return [primary.both_laps_fault_reason], [
            f"Curva {number} ({name}): En tanto {p1} como {p2}, mantén presión regresiva de freno (~{primary.ideal_trail_pct or 50:.0f}% -> 0%) "
            f"hasta el vértice siguiendo al 👻 Fantasma Ideal para ganar -{primary.ideal_time_gain or 0.20:.3f}s."
        ]
    if primary.brake_delta_dist and primary.brake_delta_dist < -15.0:
        return [
            f"En {name}, en {p2} inicias la frenada {abs(primary.brake_delta_dist):.1f}m antes "
            f"que en {p1}. Esto provoca una reducción excesiva de velocidad antes del vértice "
            f"({primary.comp_min_speed:.1f} km/h en {p2} vs {primary.ref_min_speed:.1f} km/h en {p1})."
        ], [
            f"Curva {number} ({name}): En {p2}, retrasa la referencia de frenada "
            f"progresivamente 10-15 metros hacia la marca de {p1}, soltando en regresión diagonal (trail braking) "
            f"para transportar más velocidad hasta el ápice."
        ]
    if primary.throttle_delta_dist and primary.throttle_delta_dist > 15.0:
        return [
            f"En {name}, la velocidad mínima en {p2} es {primary.comp_min_speed:.1f} km/h, "
            f"pero la aplicación del acelerador se demora {primary.throttle_delta_dist:.1f}m respecto a {p1}, "
            f"restando velocidad en toda la recta posterior."
        ], [
            f"Curva {number} ({name}): En {p2}, abre dirección antes en la salida "
            f"para iniciar la rampa progresiva de acelerador junto a {p1} y el 👻 Fantasma Ideal."
        ]
    return [
        f"Diferencia de trazada y velocidad de paso en {name}: la velocidad mínima en vértice en {p2} "
        f"es {primary.speed_delta_min:.1f} km/h respecto a {p1} ({primary.comp_min_speed:.1f} vs {primary.ref_min_speed:.1f} km/h)."
    ], [
        f"Curva {number} ({name}): En {p2}, apunta a alcanzar los {primary.ref_min_speed:.1f} km/h de {p1} "
        f"(y los {primary.v_min_ideal or primary.ref_min_speed + 2.0:.1f} km/h del 👻 Fantasma Ideal) en el vértice."
    ]


def _verification_indicator(comparison: LapComparison, primary: CornerAnalysis | None) -> str:
    if primary:
        return (
            f"Velocidad mínima en el vértice de {primary.corner_name} >= "
            f"{primary.ref_min_speed - 2.0:.1f} km/h "
            f"y reducción del delta acumulado en al menos 0.20s en ese sector."
        )
    return f"Reducir la diferencia total de {comparison.time_difference:+.3f}s respecto a la vuelta de referencia."


def _llm_prompt(comparison: LapComparison, car: str, track: str, sector_str: str, synthetic: bool) -> str:
    prompt_data = (
        f"VEHÍCULO: {car}\n"
        f"CIRCUITO: {track}\n"
        f"VUELTA REFERENCIA: Vuelta {comparison.reference_lap}\n"
        f"VUELTA COMPARACIÓN: Vuelta {comparison.comparison_lap}\n"
        f"DIFERENCIA TOTAL: {comparison.time_difference:+.3f}s\n"
        f"SECTORES: {sector_str}\n"
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
    if synthetic or not comparison.corners:
        return "Baja"
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
                f"(👻 Potencial Ideal: -{c.ideal_time_gain or 0.15:.3f}s). "
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
