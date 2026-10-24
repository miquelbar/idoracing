"""
Rule-based radio replies, used when no LLM answers: a canned explanation picked by keyword, with the
selected corner's numbers appended. Templates take {ack}, {car}, {track} and {c_info}.
"""

from typing import Any

TOPIC_KEYWORDS = {
    "trail": ("trail", "freno", "frenar", "frenada", "brake", "braking"),
    "gear": ("marcha", "gear", "velocidad", "rpm"),
    "setup": ("setup", "reparto", "bias", "presion", "arb", "suspension", "caida", "camber"),
    "balance": ("subviraje", "sobreviraje", "understeer", "oversteer", "rotacion", "morro", "zaga"),
}

REPLIES: dict[str, dict[str, str]] = {
    "trail": {
        "en": (
            "{ack}Optimizing **Trail Braking** in the **{car}** at **{track}**:\n"
            "\n"
            "1. **Peak Braking (Straight Line):** Hit 100% initial pressure firmly with the steering centered. In the {car}, ABS handles the threshold, but avoid stomping excessively to keep the platform flat.\n"
            "2. **Decompression Phase (The Trail):** As you turn towards the apex, bleed pressure smoothly from 100% down to **15-20%**. Never release the brake abruptly; that unloads the front axle and creates instant entry understeer.\n"
            "3. **Rotational Hold (Apex Clipping):** Maintain that **15% residual brake pressure** until you clip the inner kerb. This dynamic pitch keeps the front tyres biting and allows the rear to rotate cleanly.\n"
            "4. **Throttle Transition:** Do not overlap throttle while steering with trail brake. Once at the apex, come off the brake completely and feed throttle as you unwind the steering.{c_info}"
        ),
        "es": (
            "{ack}Para optimizar el **Trail Braking** con el **{car}** en **{track}**:\n"
            "\n"
            "1. **Fase Inicial (Pico de Frenada):** Aplica el 100% de presión con el coche recto antes de iniciar el viraje. Mantén la plataforma equilibrada antes de iniciar el giro.\n"
            "2. **Desvanecimiento Progresivo (El Trail):** A medida que metes volante hacia el vértice, reduce la presión suavemente del 100% al **15-20%**. El error más común es soltar a 0% de golpe: al hacerlo, el morro se levanta, las ruedas delanteras pierden agarre y aparece un subviraje irrecuperable.\n"
            "3. **Carga en el Morro (Rotación en Ápice):** Mantén ese **15% residual de freno** hasta alcanzar la cuerda del piano interior. Esa presión constante hace pivotar el coche sobre el eje delantero sin desestabilizar la zaga.\n"
            "4. **Transición al Acelerador:** Suelta el freno al 0% exactamente en el ápice y empieza a pisar el gas (30-50%) únicamente cuando empieces a desgirar volante.{c_info}"
        ),
    },
    "gear": {
        "en": (
            "{ack}Copy on gearing. In the **{car}** at **{track}**:\n"
            "\n"
            "- **Apex Engine Speed:** You want to maintain the engine in the peak torque band (between 6,200 and 8,500 RPM in GT3).\n"
            "- **Gear Selection:** Dropping to too low a gear causes severe engine braking instability on corner entry and wheelspin on exit. In medium-speed corners, carrying one gear higher maintains chassis momentum and delivers smoother traction off the kerbs.{c_info}"
        ),
        "es": (
            "{ack}Copiado sobre marchas. En el **{car}** compitiendo en **{track}**:\n"
            "\n"
            "- **Rango Óptimo:** El motor debe mantenerse en la meseta de par máximo (6.500 a 8.500 RPM en GT3).\n"
            "- **Selección en Vértice:** Bajar una marcha de más frena bruscamente el eje trasero por retención motor y provoca pérdidas de tracción al abrir gas. En curvas de velocidad media, mantener una marcha más larga estabiliza la plataforma y permite transferir mayor velocidad de paso.{c_info}"
        ),
    },
    "setup": {
        "en": (
            "{ack}I can't see your setup: the telemetry files don't carry it, so I won't give you numbers for the **{car}**. What the data can point to:\n"
            "\n"
            "- **Entry push under braking:** move brake bias rearward a click at a time and check whether apex speed improves.\n"
            "- **Mid-corner understeer:** soften the front anti-roll bar or stiffen the rear one, one click per run.\n"
            "- **Tyre pressures:** compare hot pressures against the window your sim publishes for this car after a few push laps.{c_info}"
        ),
        "es": (
            "{ack}No veo tu setup: los ficheros de telemetría no lo incluyen, así que no te voy a dar cifras para el **{car}**. Lo que los datos sí pueden orientar:\n"
            "\n"
            "- **Subviraje de entrada frenando:** retrasa el reparto de frenada clic a clic y comprueba si mejora la velocidad en vértice.\n"
            "- **Subviraje en apoyo:** ablanda la barra delantera o endurece la trasera, un clic por tanda.\n"
            "- **Presiones:** compara las presiones en caliente con la ventana que publique tu simulador para este coche tras unas vueltas de ritmo.{c_info}"
        ),
    },
    "balance": {
        "en": (
            "{ack}Chassis balance analysis for **{car}** at **{track}**:\n"
            "\n"
            "- **Entry Understeer:** Caused by releasing the brake too quickly or turning the wheel with excessive initial speed. Keep 15% brake pressure onto the nose until the apex.\n"
            "- **Mid-Corner Push:** Do not tighten steering angle if the car is sliding wide; straighten slightly to recover tyre grip and touch the apex kerb.\n"
            "- **Exit Snap:** In rear-engine machinery, wait until the front wheels are unwound past 50% before applying full throttle.{c_info}"
        ),
        "es": (
            "{ack}Diagnóstico de balance dinámico para el **{car}** en **{track}**:\n"
            "\n"
            "- **Subviraje en Entrada:** Ocurre casi siempre por soltar el pedal de freno antes de tiempo o por exceso de velocidad inicial. Mantén un 15% de freno residual para clavar el morro.\n"
            "- **Falta de Giro en Vértice:** Si el coche se abre hacia el exterior, no fuerces más ángulo de volante: levantar 2-3% de dirección recupera adherencia lateral inmediata.\n"
            "- **Sobreviraje en Salida:** Espera a abrir dirección al menos un 50% antes de hundir el acelerador al 100% para no descolocar el eje trasero.{c_info}"
        ),
    },
    "general": {
        "en": (
            "{ack}Radio check loud and clear from the engineering stand at **{track}** for the **{car}**.\n"
            "\n"
            "Looking at your overall telemetry stint:\n"
            "- Focus on carrying rolling speed through the mid-corner apex rather than braking excessively deep.\n"
            "- Smooth progressive trail braking will yield the highest lap time delta improvement across all sectors.\n"
            "- Unwind the steering early to maximize exit speed onto the subsequent straights.{c_info}"
        ),
        "es": (
            "{ack}Copiado alto y claro por radio desde el puesto de ingeniería en **{track}** para el **{car}**.\n"
            "\n"
            "Revisando los datos globales de tu tanda:\n"
            "- El mayor margen de mejora está en no sobre-frenar en entrada: retrasa 5-10m la frenada y transfiere velocidad al vértice.\n"
            "- Modula la frenada regresiva manteniendo un 15% de presión para rotar el coche hacia el piano interior.\n"
            "- Abre dirección con decisión al tocar el vértice para aplicar el acelerador al 100% con el coche recto.{c_info}"
        ),
    },
}


def _corner_brief(corner: dict[str, Any], is_en: bool) -> str:
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
            f"- **Performance Alert:** Losing `{sign}{d_time:.3f}s` at T{c_num} in P2 vs P1 with `{abs(delta_vmin):.1f} km/h` deficit at apex.\n"
            if is_loss
            else ""
        )
        return (
            f"\n\n**Telemetry Focus — T{c_num} ({c_name}) [P2 vs P1 & 👻 Bubota]:**\n"
            f"{loss_alert}"
            f"- **Time Delta (P2 vs P1):** `{sign}{d_time:.3f}s`\n"
            f"- **Apex Speed:** `P2: {vmin_c:.0f} km/h` vs `P1: {vmin_r:.0f} km/h` (ΔV: `{delta_vmin_str}`)\n"
            f"- **Gear:** `Gear {gear}` ({gear_ev})\n"
            f"- **Balance & Trail:** `{bal}` • `{trail}`\n"
            f"- **Line Advice:** {r_advice}\n\n"
            f"— **Pep · Ingeniero de Pista**"
        )
    loss_alert = (
        f"- **Alerta de Rendimiento:** Pierdes `{sign}{d_time:.3f}s` en T{c_num} en P2 frente a P1 con un déficit de `{abs(delta_vmin):.1f} km/h` en el vértice.\n"
        if is_loss
        else ""
    )
    return (
        f"\n\n**Datos de Telemetría en T{c_num} ({c_name}) [P2 vs P1 y 👻 Bubota]:**\n"
        f"{loss_alert}"
        f"- **Diferencia de tiempo (P2 vs P1):** `{sign}{d_time:.3f}s`\n"
        f"- **Velocidad en vértice:** `P2: {vmin_c:.0f} km/h` vs `P1: {vmin_r:.0f} km/h` (ΔV: `{delta_vmin_str}`)\n"
        f"- **Marcha en vértice:** `{gear}ª Marcha` ({gear_ev})\n"
        f"- **Balance & Trail Braking:** `{bal}` • `{trail}`\n"
        f"- **Recomendación de trazada:** {r_advice}\n\n"
        f"— **Pep · Ingeniero de Pista**"
    )


def _acknowledgement(corner: dict[str, Any] | None, is_en: bool) -> str:
    c_num = str(corner.get("corner_number", "")) if corner else ""
    if is_en:
        return f"Pit wall radio check on T{c_num}. " if c_num else "Pit wall radio check. "
    return f"Idò, mirando los datos de T{c_num}: " if c_num else "Copiado en el muro por radio. "


def generate_race_engineer_response(
    query: str,
    car: str,
    track: str,
    corner: dict[str, Any] | None = None,
    lang: str = "es",
) -> str:
    """Rule-based radio reply: the first topic whose keywords appear in the query, else general guidance."""
    is_en = lang == "en"
    q_lower = query.lower()
    topic = next((t for t, words in TOPIC_KEYWORDS.items() if any(w in q_lower for w in words)), "general")
    return REPLIES[topic]["en" if is_en else "es"].format(
        ack=_acknowledgement(corner, is_en),
        car=car,
        track=track,
        c_info=_corner_brief(corner, is_en) if corner else "",
    )
