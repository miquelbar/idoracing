"""
AI and Rule-Based Driving Coach Advisor.
Synthesizes verified numerical metrics from LapComparison into structured technical reports.
"""

from datetime import datetime
from typing import Any

from coach.llm_client import LLMClient
from coach.prompt import PEP_SYSTEM_PROMPT_ES
from domain.session import CoachReport, LapComparison

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
        # 1. Extract verified numerical facts and metrics
        facts: list[str] = []

        # Formatted sector summary string (prevents [object Object] in UI)
        sector_str = " | ".join(
            f"{k.replace('sector', 'S').upper()}: {v:+.3f}s"
            for k, v in comparison.sector_differences.items()
        ) if comparison.sector_differences else "Sectores equilibrados"

        # Trail braking evaluation across corners
        trail_corners = [c for c in comparison.corners if c.trail_eval in ("Soltado Prematuro", "Exceso de Freno en Giro", "Trail Braking Efectivo")]
        effective_trail = [c for c in trail_corners if c.trail_eval == "Trail Braking Efectivo"]

        metrics: dict[str, Any] = {
            "diferencia_vuelta": f"{comparison.time_difference:+.3f}s",
            "diferencia_sectores": sector_str,
            "curvas_analizadas": len(comparison.corners),
        }
        if trail_corners:
            metrics["eficiencia_trail_braking"] = f"{len(effective_trail) / len(trail_corners) * 100.0:.0f}%"
        hypotheses: list[str] = []
        exercises: list[str] = []

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
                    f"para poder aplicar el 50-70% de acelerador antes del piano de salida sin desestabilizar el eje trasero."
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

        if primary_corner:
            verification_indicator = (
                f"Velocidad mínima en el vértice de {primary_corner.corner_name} >= "
                f"{primary_corner.ref_min_speed - 2.0:.1f} km/h "
                f"y reducción del delta acumulado en al menos 0.20s en ese sector."
            )
        else:
            verification_indicator = (
                f"Reducir la diferencia total de {comparison.time_difference:+.3f}s respecto a la vuelta de referencia."
            )

        if synthetic:
            facts.append(
                "Estas vueltas solo incluyen tiempos: las trazas y el análisis por curva son una simulación, no datos medidos."
            )

        # 2. Try Ollama / LLM if available
        llm_report = None
        if self.llm.is_available():
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
            llm_report = self.llm.generate(prompt=user_prompt, system_prompt=SYSTEM_PROMPT)

        # 3. If Ollama produced a report, use it; otherwise build the deterministic report
        if synthetic:
            level = "Baja"
        elif comparison.corners:
            level = "Alta"
        else:
            level = "Media"

        if llm_report and len(llm_report.strip()) > 20:
            raw_report = llm_report
            confidence = f"{level} (LLM + telemetría)"
        else:
            confidence = f"{level} (motor de reglas)"
            raw_report = f"""# Informe Técnico de Conducción — IdoRacing Analytics

- **Vehículo:** {car}
- **Circuito:** {track}
- **Comparativa:** Vuelta {comparison.comparison_lap} frente a Vuelta {comparison.reference_lap} (Referencia)
- **Diferencia de tiempo:** {comparison.time_difference:+.3f}s

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
### 3. Hipótesis técnica
{chr(10).join(f"- {hyp}" for hyp in hypotheses)}

### 4. Ejercicios concretos
{chr(10).join(f"{i+1}. {ex}" for i, ex in enumerate(exercises))}

### 5. Indicador numérico de comprobación y Confianza
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


def generate_race_engineer_response(
    query: str,
    car: str,
    track: str,
    corner: dict[str, Any] | None = None,
    lang: str = "es",
) -> str:
    """
    Rule-based radio reply used when no LLM answers: picks a canned explanation by keyword
    and fills in the selected corner's numbers.
    """
    q_lower = query.lower()
    is_en = lang == "en"

    # 1. Corner context if available
    c_info = ""
    c_num = ""
    if corner:
        c_num = str(corner.get("corner_number", ""))
        c_name = corner.get("name", f"Curva {c_num}")
        d_time = float(corner.get("delta_time", 0.0))
        sign = "+" if d_time > 0 else ""
        vmin_c = float(corner.get("v_min_comp", 0.0))
        vmin_r = float(corner.get("v_min_ref", 0.0))
        delta_vmin = round(vmin_c - vmin_r, 1) if (vmin_c and vmin_r) else float(corner.get("delta_v_min", 0.0))
        delta_sign = "+" if delta_vmin > 0 else ""
        delta_vmin_str = f"{delta_sign}{delta_vmin:.1f} km/h"
        gear = corner.get("comp_gear", 3)
        gear_ev = corner.get("gear_eval", "Óptima")
        bal = corner.get("balance_eval", "Equilibrio Neutro")
        trail = corner.get("trail_braking_eval", "Óptimo")
        r_advice = corner.get("racing_line_advice", "")

        is_loss = d_time > 0.08 or delta_vmin <= -3.0

        if is_en:
            loss_alert = (
                f"- **Performance Alert:** Losing `{sign}{d_time:.3f}s` at T{c_num} with `{abs(delta_vmin):.1f} km/h` deficit at apex.\n"
                if is_loss
                else ""
            )
            c_info = (
                f"\n\n**Telemetry Focus — T{c_num} ({c_name}):**\n"
                f"{loss_alert}"
                f"- **Time Delta:** `{sign}{d_time:.3f}s`\n"
                f"- **Apex Speed:** `{vmin_c:.0f} km/h` (Ref: `{vmin_r:.0f} km/h`, ΔV: `{delta_vmin_str}`)\n"
                f"- **Gear:** `Gear {gear}` ({gear_ev})\n"
                f"- **Balance & Trail:** `{bal}` • `{trail}`\n"
                f"- **Line Advice:** {r_advice}"
            )
        else:
            loss_alert = (
                f"- **Alerta de Rendimiento:** Pierdes `{sign}{d_time:.3f}s` en T{c_num} con un déficit de `{abs(delta_vmin):.1f} km/h` en el vértice.\n"
                if is_loss
                else ""
            )
            c_info = (
                f"\n\n**Datos de Telemetría en T{c_num} ({c_name}):**\n"
                f"{loss_alert}"
                f"- **Diferencia de tiempo:** `{sign}{d_time:.3f}s`\n"
                f"- **Velocidad en vértice:** `{vmin_c:.0f} km/h` (Ref: `{vmin_r:.0f} km/h`, ΔV: `{delta_vmin_str}`)\n"
                f"- **Marcha en vértice:** `{gear}ª Marcha` ({gear_ev})\n"
                f"- **Balance & Trail Braking:** `{bal}` • `{trail}`\n"
                f"- **Recomendación de trazada:** {r_advice}"
            )

    # Pep radio greetings (natural and authentic)
    if is_en:
        ack = f"Pit wall radio check on T{c_num}. " if (corner and c_num) else "Pit wall radio check. "
    else:
        ack = f"Idò, mirando los datos de T{c_num}: " if (corner and c_num) else "Copiado en el muro por radio. "

    # 2. Topic Detection & Response Formulation
    is_trail = any(k in q_lower for k in ["trail", "freno", "frenar", "frenada", "brake", "braking"])
    is_gear = any(k in q_lower for k in ["marcha", "gear", "velocidad", "rpm"])
    is_setup = any(k in q_lower for k in ["setup", "reparto", "bias", "presion", "arb", "suspension", "caida", "camber"])
    is_balance = any(k in q_lower for k in ["subviraje", "sobreviraje", "understeer", "oversteer", "rotacion", "morro", "zaga"])

    if is_trail:
        if is_en:
            return (
                f"{ack}Optimizing **Trail Braking** in the **{car}** at **{track}**:\n\n"
                f"1. **Peak Braking (Straight Line):** Hit 100% initial pressure firmly with the steering centered. "
                f"In the {car}, ABS handles the threshold, but avoid stomping excessively to keep the platform flat.\n"
                f"2. **Decompression Phase (The Trail):** As you turn towards the apex, bleed pressure smoothly from 100% down to **15-20%**. "
                f"Never release the brake abruptly; that unloads the front axle and creates instant entry understeer.\n"
                f"3. **Rotational Hold (Apex Clipping):** Maintain that **15% residual brake pressure** until you clip the inner kerb. "
                f"This dynamic pitch keeps the front tyres biting and allows the rear to rotate cleanly.\n"
                f"4. **Throttle Transition:** Do not overlap throttle while steering with trail brake. Once at the apex, come off the brake completely and feed throttle as you unwind the steering.{c_info}"
            )
        else:
            return (
                f"{ack}Para optimizar el **Trail Braking** con el **{car}** en **{track}**:\n\n"
                f"1. **Fase Inicial (Pico de Frenada):** Aplica el 100% de presión con el coche recto antes de iniciar el viraje. "
                f"Mantén la plataforma equilibrada antes de iniciar el giro.\n"
                f"2. **Desvanecimiento Progresivo (El Trail):** A medida que metes volante hacia el vértice, reduce la presión suavemente del 100% al **15-20%**. "
                f"El error más común es soltar a 0% de golpe: al hacerlo, el morro se levanta, las ruedas delanteras pierden agarre y aparece un subviraje irrecuperable.\n"
                f"3. **Carga en el Morro (Rotación en Ápice):** Mantén ese **15% residual de freno** hasta alcanzar la cuerda del piano interior. "
                f"Esa presión constante hace pivotar el coche sobre el eje delantero sin desestabilizar la zaga.\n"
                f"4. **Transición al Acelerador:** Suelta el freno al 0% exactamente en el ápice y empieza a pisar el gas (30-50%) únicamente cuando empieces a desgirar volante.{c_info}"
            )

    elif is_gear:
        if is_en:
            return (
                f"{ack}Copy on gearing. In the **{car}** at **{track}**:\n\n"
                f"- **Apex Engine Speed:** You want to maintain the engine in the peak torque band (between 6,200 and 8,500 RPM in GT3).\n"
                f"- **Gear Selection:** Dropping to too low a gear causes severe engine braking instability on corner entry and wheelspin on exit. "
                f"In medium-speed corners, carrying one gear higher maintains chassis momentum and delivers smoother traction off the kerbs.{c_info}"
            )
        else:
            return (
                f"{ack}Copiado sobre marchas. En el **{car}** compitiendo en **{track}**:\n\n"
                f"- **Rango Óptimo:** El motor debe mantenerse en la meseta de par máximo (6.500 a 8.500 RPM en GT3).\n"
                f"- **Selección en Vértice:** Bajar una marcha de más frena bruscamente el eje trasero por retención motor y provoca pérdidas de tracción al abrir gas. "
                f"En curvas de velocidad media, mantener una marcha más larga estabiliza la plataforma y permite transferir mayor velocidad de paso.{c_info}"
            )

    elif is_setup:
        if is_en:
            return (
                f"{ack}I can't see your setup: the telemetry files don't carry it, so I won't give you numbers for the **{car}**. "
                f"What the data can point to:\n\n"
                f"- **Entry push under braking:** move brake bias rearward a click at a time and check whether apex speed improves.\n"
                f"- **Mid-corner understeer:** soften the front anti-roll bar or stiffen the rear one, one click per run.\n"
                f"- **Tyre pressures:** compare hot pressures against the window your sim publishes for this car after a few push laps.{c_info}"
            )
        else:
            return (
                f"{ack}No veo tu setup: los ficheros de telemetría no lo incluyen, así que no te voy a dar cifras para el **{car}**. "
                f"Lo que los datos sí pueden orientar:\n\n"
                f"- **Subviraje de entrada frenando:** retrasa el reparto de frenada clic a clic y comprueba si mejora la velocidad en vértice.\n"
                f"- **Subviraje en apoyo:** ablanda la barra delantera o endurece la trasera, un clic por tanda.\n"
                f"- **Presiones:** compara las presiones en caliente con la ventana que publique tu simulador para este coche tras unas vueltas de ritmo.{c_info}"
            )

    elif is_balance:
        if is_en:
            return (
                f"{ack}Chassis balance analysis for **{car}** at **{track}**:\n\n"
                f"- **Entry Understeer:** Caused by releasing the brake too quickly or turning the wheel with excessive initial speed. "
                f"Keep 15% brake pressure onto the nose until the apex.\n"
                f"- **Mid-Corner Push:** Do not tighten steering angle if the car is sliding wide; straighten slightly to recover tyre grip and touch the apex kerb.\n"
                f"- **Exit Snap:** In rear-engine machinery, wait until the front wheels are unwound past 50% before applying full throttle.{c_info}"
            )
        else:
            return (
                f"{ack}Diagnóstico de balance dinámico para el **{car}** en **{track}**:\n\n"
                f"- **Subviraje en Entrada:** Ocurre casi siempre por soltar el pedal de freno antes de tiempo o por exceso de velocidad inicial. Mantén un 15% de freno residual para clavar el morro.\n"
                f"- **Falta de Giro en Vértice:** Si el coche se abre hacia el exterior, no fuerces más ángulo de volante: levantar 2-3% de dirección recupera adherencia lateral inmediata.\n"
                f"- **Sobreviraje en Salida:** Espera a abrir dirección al menos un 50% antes de hundir el acelerador al 100% para no descolocar el eje trasero.{c_info}"
            )

    # General racing guidance
    if is_en:
        return (
            f"{ack}Radio check loud and clear from the engineering stand at **{track}** for the **{car}**.\n\n"
            f"Looking at your overall telemetry stint:\n"
            f"- Focus on carrying rolling speed through the mid-corner apex rather than braking excessively deep.\n"
            f"- Smooth progressive trail braking will yield the highest lap time delta improvement across all sectors.\n"
            f"- Unwind the steering early to maximize exit speed onto the subsequent straights.{c_info}"
        )
    else:
        return (
            f"{ack}Copiado alto y claro por radio desde el puesto de ingeniería en **{track}** para el **{car}**.\n\n"
            f"Revisando los datos globales de tu tanda:\n"
            f"- El mayor margen de mejora está en no sobre-frenar en entrada: retrasa 5-10m la frenada y transfiere velocidad al vértice.\n"
            f"- Modula la frenada regresiva manteniendo un 15% de presión para rotar el coche hacia el piano interior.\n"
            f"- Abre dirección con decisión al tocar el vértice para aplicar el acelerador al 100% con el coche recto.{c_info}"
        )

