"""
AI and Rule-Based Driving Coach Advisor.
Synthesizes verified numerical metrics from LapComparison into structured technical reports.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from domain.session import CoachReport, LapComparison
from coach.llm_client import LLMClient
from coach.ollama_client import OllamaClient


SYSTEM_PROMPT = """Eres el ingeniero de pista y entrenador senior de SimRacing (Assetto Corsa Competizione, Le Mans Ultimate, iRacing).
Tu labor es ayudar al piloto a mejorar sus tiempos de forma analítica, técnica y rigurosa.

DIRECTRICES OBLIGATORIAS:
1. Basa tu análisis EXCLUSIVAMENTE en las métricas numéricas proporcionadas.
2. NO inventes tiempos, metros, telemetría ni datos que no figuren en el resumen.
3. Evalúa con precisión la técnica de TRAIL BRAKING:
   - Indica en qué curvas debe aplicar trail braking (desvanecer presión de 100% a 15-20% mientras gira hacia el vértice para rotar el tren delantero en curvas lentas/medias).
   - Indica en qué curvas NO debe aplicar trail braking (curvas rápidas donde mantener freno en apoyo desestabiliza la zaga).
   - Especifica la técnica exacta de modulación de pedales que debe realizar.
4. El informe debe estructurarse obligatoriamente con estos 5 apartados:
   - 1. Qué se ha observado (Hechos objetivos y telemetría de frenada/gas).
   - 2. Datos y métricas que sustentan la conclusión.
   - 3. Hipótesis técnica de conducción (dinámica vehicular, transferencia de pesos, trail braking).
   - 4. Ejercicio concreto y delimitado para la siguiente tanda.
   - 5. Indicador numérico de comprobación y nivel de confianza.
5. Mantén un tono profesional, conciso y directo, propio de un ingeniero de competición."""


class CoachAdvisor:
    """Generates structured coaching reports from lap comparisons."""

    def __init__(self, llm_client: Optional[Any] = None):
        self.ollama = llm_client or LLMClient()

    def generate_report(
        self,
        comparison: LapComparison,
        car: str = "Porsche 911 GT3 R (992)",
        track: str = "Ricardo Tormo de Valencia",
    ) -> CoachReport:
        """
        Generate a complete coaching report. Uses Ollama if available;
        otherwise generates a deterministic, rule-based report.
        """
        # 1. Extract verified numerical facts and metrics
        facts: List[str] = []

        # Formatted sector summary string (prevents [object Object] in UI)
        sector_str = " | ".join(
            f"{k.replace('sector', 'S').upper()}: {v:+.3f}s"
            for k, v in comparison.sector_differences.items()
        ) if comparison.sector_differences else "Sectores equilibrados"

        # Trail braking evaluation across corners
        trail_corners = [c for c in comparison.corners if getattr(c, "trail_eval", None) in ["Soltado Prematuro", "Exceso de Freno", "Trail Braking Efectivo"]]
        effective_trail = [c for c in trail_corners if getattr(c, "trail_eval", None) == "Trail Braking Efectivo"]
        trail_ratio = (len(effective_trail) / len(trail_corners) * 100.0) if trail_corners else 80.0

        metrics: Dict[str, Any] = {
            "diferencia_vuelta": f"{comparison.time_difference:+.3f}s",
            "diferencia_sectores": sector_str,
            "curvas_analizadas": len(comparison.corners),
            "eficiencia_trail_braking": f"{trail_ratio:.0f}%",
        }
        hypotheses: List[str] = []
        exercises: List[str] = []

        # Sort corners by time lost (descending)
        loss_corners = sorted(
            [c for c in comparison.corners if c.time_delta_corner > 0.05],
            key=lambda x: x.time_delta_corner,
            reverse=True,
        )

        if comparison.time_difference > 0:
            facts.append(
                f"La vuelta analizada (Vuelta {comparison.comparison_lap}) es {comparison.time_difference:.3f}s más lenta "
                f"que la vuelta de referencia (Vuelta {comparison.reference_lap})."
            )
        else:
            facts.append(
                f"La vuelta analizada (Vuelta {comparison.comparison_lap}) es {abs(comparison.time_difference):.3f}s más rápida "
                f"que la vuelta de referencia (Vuelta {comparison.reference_lap})."
            )

        if comparison.sector_differences:
            for s_name, s_diff in comparison.sector_differences.items():
                s_label = s_name.replace("sector", "Sector ")
                sign = "+" if s_diff > 0 else ""
                facts.append(f"Diferencia en {s_label}: {sign}{s_diff:.3f}s.")

        # Analyze top time loss zones
        primary_corner = loss_corners[0] if loss_corners else (comparison.corners[0] if comparison.corners else None)

        if primary_corner:
            facts.append(
                f"Mayor pérdida focalizada en {primary_corner.corner_name} (Curva {primary_corner.corner_number}): "
                f"+{primary_corner.time_delta_corner:.3f}s perdidos en el tramo."
            )
            metrics["primary_loss_corner"] = {
                "name": primary_corner.corner_name,
                "time_delta": primary_corner.time_delta_corner,
                "ref_apex_speed": primary_corner.ref_min_speed,
                "comp_apex_speed": primary_corner.comp_min_speed,
                "speed_delta_apex": primary_corner.speed_delta_min,
                "brake_delta_dist": primary_corner.brake_delta_dist,
                "throttle_delta_dist": primary_corner.throttle_delta_dist,
            }

            # Technical hypothesis
            if primary_corner.brake_delta_dist and primary_corner.brake_delta_dist < -15.0:
                hypotheses.append(
                    f"En {primary_corner.corner_name}, el piloto inicia la frenada {abs(primary_corner.brake_delta_dist):.1f}m antes "
                    f"de la referencia. Esto provoca una reducción excesiva de velocidad antes del vértice "
                    f"({primary_corner.comp_min_speed:.1f} km/h vs {primary_corner.ref_min_speed:.1f} km/h de la referencia)."
                )
                exercises.append(
                    f"Curva {primary_corner.corner_number} ({primary_corner.corner_name}): Retrasar la referencia de frenada "
                    f"progresivamente 10-15 metros, manteniendo mayor presión inicial de freno y soltando progresivamente (trail braking) "
                    f"para transportar más velocidad hasta el ápice."
                )
            elif primary_corner.throttle_delta_dist and primary_corner.throttle_delta_dist > 15.0:
                hypotheses.append(
                    f"En {primary_corner.corner_name}, la velocidad mínima es aceptable ({primary_corner.comp_min_speed:.1f} km/h), "
                    f"pero la aplicación del acelerador se demora {primary_corner.throttle_delta_dist:.1f}m respecto a la referencia, "
                    f"restando velocidad en toda la recta o tramo posterior."
                )
                exercises.append(
                    f"Curva {primary_corner.corner_number} ({primary_corner.corner_name}): Abrir dirección antes en la salida "
                    f"para poder aplicar el 50-70% de acelerador antes del piano de salida sin desestabilizar el eje trasero del 992 GT3 R."
                )
            else:
                hypotheses.append(
                    f"Diferencia de trazada y velocidad de paso en {primary_corner.corner_name}: la velocidad mínima en vértice "
                    f"es {primary_corner.speed_delta_min:.1f} km/h inferior a la referencia."
                )
                exercises.append(
                    f"Curva {primary_corner.corner_number} ({primary_corner.corner_name}): Centrarse en la velocidad mínima en el ápice, "
                    f"apuntando a aproximarse a {primary_corner.ref_min_speed:.1f} km/h."
                )

        if not exercises:
            exercises.append("Mantener la consistencia actual en puntos de frenada y ápices.")

        verification_indicator = (
            f"Velocidad mínima en el vértice de {primary_corner.corner_name if primary_corner else 'Curva 1'} >= "
            f"{(primary_corner.ref_min_speed - 2.0) if primary_corner else 135.0:.1f} km/h "
            f"y reducción del delta acumulado en al menos 0.20s en ese sector."
        )

        facts.append(
            "Técnica de Trail Braking: En curvas clave (T1 Aspar, T2 Doohan, T8 Bernat Martínez, T14 Adrián Campos) "
            "se requiere soltado progresivo de 100% a 15-20% hacia el vértice para inducir rotación sin subviraje."
        )

        # 2. Try Ollama / LLM if available
        llm_report = None
        if self.ollama.is_available():
            prompt_data = (
                f"VEHÍCULO: {car}\n"
                f"CIRCUITO: {track}\n"
                f"VUELTA REFERENCIA: Vuelta {comparison.reference_lap}\n"
                f"VUELTA COMPARACIÓN: Vuelta {comparison.comparison_lap}\n"
                f"DIFERENCIA TOTAL: {comparison.time_difference:+.3f}s\n"
                f"SECTORES: {sector_str}\n"
                f"ZONAS Y TRAIL BRAKING ANALIZADOS:\n"
            )
            for c in comparison.corners:
                t_eval = getattr(c, "trail_eval", "Óptimo")
                t_adv = getattr(c, "trail_advice", "")
                prompt_data += (
                    f"- {c.corner_name} (T{c.corner_number}): Pérdida {c.time_delta_corner:+.3f}s, "
                    f"Vmin Ref: {c.ref_min_speed} km/h, Vmin Comp: {c.comp_min_speed} km/h "
                    f"(Delta Vmin: {c.speed_delta_min:+.1f} km/h). "
                    f"Frenada: {c.brake_delta_dist if c.brake_delta_dist else 'Exacta'}m. "
                    f"Trail Braking: {t_eval} ({t_adv}). "
                    f"Diagnóstico: {c.diagnosis}\n"
                )

            user_prompt = (
                f"A partir del siguiente resumen numérico de telemetría, redacta el informe para el piloto:\n\n"
                f"{prompt_data}\n\n"
                f"Asegúrate de seguir estrictamente los 5 apartados requeridos sin inventar datos."
            )
            llm_report = self.ollama.generate(prompt=user_prompt, system_prompt=SYSTEM_PROMPT)

        # 3. If Ollama produced a report, use it; otherwise build the deterministic report
        if llm_report and len(llm_report.strip()) > 20:
            raw_report = llm_report
            confidence = "Alta (Ollama LLM + Telemetría)"
        else:
            confidence = "Alta (Motor Analítico Numérico)"
            raw_report = f"""# Informe Técnico de Conducción — SimCoach

**Vehículo:** {car}  
**Circuito:** {track}  
**Comparativa:** Vuelta {comparison.comparison_lap} frente a Vuelta {comparison.reference_lap} (Referencia)  
**Diferencia de tiempo:** {comparison.time_difference:+.3f}s  

---

### 1. Qué se ha observado (Hechos objetivos)
{chr(10).join(f"- {fact}" for fact in facts)}

### 2. Datos y métricas que sustentan la conclusión
- **Diferencia total de vuelta:** {comparison.time_difference:+.3f}s
- **Desglose por sectores:** {', '.join(f'{k}: {v:+.3f}s' for k, v in comparison.sector_differences.items()) if comparison.sector_differences else 'No disponible'}
"""
            if loss_corners:
                raw_report += "\n**Puntos clave con pérdida de tiempo:**\n"
                for c in loss_corners[:3]:
                    b_info = f", punto de frenada {c.brake_delta_dist:+.1f}m" if c.brake_delta_dist else ""
                    raw_report += (
                        f"- **{c.corner_name} (T{c.corner_number}):** Pérdida de **{c.time_delta_corner:.3f}s**. "
                        f"Vértice: {c.comp_min_speed:.1f} km/h frente a {c.ref_min_speed:.1f} km/h ({c.speed_delta_min:+.1f} km/h){b_info}.\n"
                        f"  *Diagnóstico técnico:* {c.diagnosis}\n"
                    )

            raw_report += f"""
### 3. Hipótesis técnica de conducción
{chr(10).join(f"- {hyp}" for hyp in hypotheses)}

### 4. Ejercicios concretos para la siguiente sesión
{chr(10).join(f"{i+1}. {ex}" for i, ex in enumerate(exercises))}

### 5. Indicador numérico de comprobación y confianza
- **Indicador de validación en telemetría:** {verification_indicator}
- **Nivel de confianza del análisis:** {confidence}
"""

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
