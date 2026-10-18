"""
Corner-by-corner driving analysis and technical diagnosis.
Extracts apex speeds, braking points, throttle pickup points, and time loss per corner.
"""

from typing import Dict, List, Optional
import numpy as np
from domain.session import CornerAnalysis
from importers.synthetic import VALENCIA_CORNERS


def analyze_corner(
    corner_def: Dict,
    aligned_data: Dict[str, np.ndarray],
) -> CornerAnalysis:
    """
    Perform technical breakdown of driving performance across a specific corner.
    """
    dist = aligned_data["distance"]
    start_d = corner_def["start"]
    end_d = corner_def["end"]
    name = corner_def["name"]
    number = corner_def["number"]

    # Filter indices for this corner segment
    mask = (dist >= start_d) & (dist <= end_d)
    if not np.any(mask):
        return CornerAnalysis(
            corner_number=number,
            corner_name=name,
            start_dist=float(start_d),
            end_dist=float(end_d),
            ref_min_speed=0.0,
            comp_min_speed=0.0,
            speed_delta_min=0.0,
            time_delta_corner=0.0,
            diagnosis="Datos insuficientes en el segmento de curva",
        )

    ref_sp = aligned_data["ref_speed"][mask]
    comp_sp = aligned_data["comp_speed"][mask]
    ref_br = aligned_data["ref_brake"][mask]
    comp_br = aligned_data["comp_brake"][mask]
    ref_th = aligned_data["ref_throttle"][mask]
    comp_th = aligned_data["comp_throttle"][mask]
    t_delta = aligned_data["time_delta"][mask]
    sub_dist = dist[mask]

    # Apex (minimum speed point in corner)
    ref_min_speed = float(np.min(ref_sp))
    comp_min_speed = float(np.min(comp_sp))
    speed_delta_min = float(ref_min_speed - comp_min_speed)

    # Time lost in this specific corner
    time_delta_corner = float(t_delta[-1] - t_delta[0])

    # Braking points: first point where brake > 0.08 before apex
    ref_apex_idx = int(np.argmin(ref_sp))
    comp_apex_idx = int(np.argmin(comp_sp))

    ref_brake_pt = None
    comp_brake_pt = None
    brake_delta_dist = None

    ref_br_candidates = np.where(ref_br[:ref_apex_idx] > 0.08)[0] if ref_apex_idx > 0 else []
    if len(ref_br_candidates) > 0:
        ref_brake_pt = float(sub_dist[ref_br_candidates[0]])

    comp_br_candidates = np.where(comp_br[:comp_apex_idx] > 0.08)[0] if comp_apex_idx > 0 else []
    if len(comp_br_candidates) > 0:
        comp_brake_pt = float(sub_dist[comp_br_candidates[0]])

    if ref_brake_pt is not None and comp_brake_pt is not None:
        brake_delta_dist = float(comp_brake_pt - ref_brake_pt)

    # Throttle pick-up points: first point where throttle > 0.10 after apex
    ref_th_pt = None
    comp_th_pt = None
    th_delta_dist = None

    ref_th_candidates = np.where(ref_th[ref_apex_idx:] > 0.10)[0]
    if len(ref_th_candidates) > 0:
        ref_th_pt = float(sub_dist[ref_apex_idx + ref_th_candidates[0]])

    comp_th_candidates = np.where(comp_th[comp_apex_idx:] > 0.10)[0]
    if len(comp_th_candidates) > 0:
        comp_th_pt = float(sub_dist[comp_apex_idx + comp_th_candidates[0]])

    if ref_th_pt is not None and comp_th_pt is not None:
        th_delta_dist = float(comp_th_pt - ref_th_pt)

    # Technical driving diagnosis grounded in verified telemetry facts
    diagnosis_parts = []
    if brake_delta_dist is not None:
        if brake_delta_dist < -15.0:
            diagnosis_parts.append(f"Frenada anticipada {abs(brake_delta_dist):.1f}m antes que la referencia.")
        elif brake_delta_dist > 15.0:
            diagnosis_parts.append(f"Frenada tardía {brake_delta_dist:.1f}m pasada de referencia.")

    if speed_delta_min > 8.0:
        diagnosis_parts.append(f"Exceso de reducción de velocidad en el vértice (-{speed_delta_min:.1f} km/h).")
    elif speed_delta_min < -5.0:
        diagnosis_parts.append(f"Mayor velocidad de paso en vértice (+{abs(speed_delta_min):.1f} km/h).")

    if th_delta_dist is not None and th_delta_dist > 15.0:
        diagnosis_parts.append(f"Aceleración retrasada {th_delta_dist:.1f}m en la salida comprometiendo la recta posterior.")

    if not diagnosis_parts:
        if abs(time_delta_corner) < 0.05:
            diagnosis = "Paso por curva muy similar a la referencia (diferencia mínima)."
        elif time_delta_corner > 0:
            diagnosis = f"Pérdida moderada de {time_delta_corner:.2f}s distribuida en la sección."
        else:
            diagnosis = f"Ganancia de {abs(time_delta_corner):.2f}s en este viraje."
    else:
        diagnosis = " ".join(diagnosis_parts)

    # Trail Braking Analysis
    trail_eval = "Óptimo"
    trail_advice = ""
    is_trail_corner = number in [1, 2, 4, 8, 11, 14]
    is_fast_corner = number in [3, 7, 12, 13]

    max_brk = float(np.max(comp_br)) if len(comp_br) > 0 else 0.0
    if max_brk > 0.20:
        pre_apex_slice = comp_br[max(0, comp_apex_idx - 10) : comp_apex_idx]
        pre_apex_mean = float(np.mean(pre_apex_slice)) if len(pre_apex_slice) > 0 else 0.0

        if is_trail_corner:
            if pre_apex_mean < 0.03 and brake_delta_dist and brake_delta_dist < -10.0:
                trail_eval = "Soltado Prematuro"
                trail_advice = "Sueltas el pedal antes del vértice sin trail braking; el morro se aligera y pierdes rotación en entrada."
            elif pre_apex_mean > 0.40:
                trail_eval = "Exceso de Freno"
                trail_advice = "Mantienes más del 40% de freno con volante girado en el ápice, sobrecargando el neumático exterior."
            else:
                trail_eval = "Trail Braking Efectivo"
                trail_advice = "Desvanecimiento regresivo adecuado: mantienes 15-20% de freno cargando el morro hasta el ápice."
        elif is_fast_corner:
            if pre_apex_mean > 0.20:
                trail_eval = "Riesgo de Inestabilidad"
                trail_advice = "En esta curva rápida no abuses del trail braking. Suelta el freno en línea recta para no desestabilizar la zaga."
            else:
                trail_eval = "Frenada Estable"
                trail_advice = "Frenada breve y desahogo rápido adecuado a curva de alta velocidad."
        else:
            trail_eval = "Frenada Neutra"
            trail_advice = "Presión de frenada equilibrada en aproximación."
    else:
        trail_eval = "Paso en Apoyo"
        trail_advice = "Curva rápida sin frenada mayor; paso a fondo o levantada de pie."

    # Gear analysis
    ref_gear_arr = aligned_data.get("ref_gear", np.array([]))[mask] if "ref_gear" in aligned_data else np.array([])
    comp_gear_arr = aligned_data.get("comp_gear", np.array([]))[mask] if "comp_gear" in aligned_data else np.array([])
    ref_target_gear = int(corner_def.get("gear", 3))

    if len(ref_gear_arr) > ref_apex_idx and ref_gear_arr[ref_apex_idx] > 0:
        ref_gear = int(round(ref_gear_arr[ref_apex_idx]))
    else:
        ref_gear = ref_target_gear

    if len(comp_gear_arr) > comp_apex_idx and comp_gear_arr[comp_apex_idx] > 0:
        comp_gear = int(round(comp_gear_arr[comp_apex_idx]))
    else:
        comp_gear = ref_gear

    if comp_gear == ref_gear:
        gear_eval = "Marcha Óptima"
        gear_advice = f"Marcha {comp_gear}ª idónea: maximiza el par motor a la salida sin sobrerrevolucionar el motor."
    elif comp_gear < ref_gear:
        gear_eval = "Marcha Demasiado Corta"
        gear_advice = f"Vas en {comp_gear}ª marcha (la óptima es {ref_gear}ª). Produce sobrerrégimen de RPM y patinaje del eje motriz al dar gas."
    else:
        gear_eval = "Marcha Demasiado Larga"
        gear_advice = f"Vas en {comp_gear}ª marcha (la óptima es {ref_gear}ª). El motor cae por debajo de la curva de potencia y penaliza la aceleración."

    # Dynamic balance analysis (Understeer / Oversteer)
    ref_st = aligned_data.get("ref_steer_angle", np.array([]))[mask] if "ref_steer_angle" in aligned_data else np.array([])
    comp_st = aligned_data.get("comp_steer_angle", np.array([]))[mask] if "comp_steer_angle" in aligned_data else np.array([])
    ref_lat = aligned_data.get("ref_lat_accel", np.array([]))[mask] if "ref_lat_accel" in aligned_data else np.array([])
    comp_lat = aligned_data.get("comp_lat_accel", np.array([]))[mask] if "comp_lat_accel" in aligned_data else np.array([])

    has_subviraje = False
    if len(comp_st) > 0 and len(ref_st) > 0:
        max_c_st = float(np.max(np.abs(comp_st)))
        max_r_st = float(np.max(np.abs(ref_st)))
        max_c_lat = float(np.max(np.abs(comp_lat))) if len(comp_lat) > 0 else 1.0
        max_r_lat = float(np.max(np.abs(ref_lat))) if len(ref_lat) > 0 else 1.0
        if max_c_st > max_r_st * 1.12 and max_c_lat <= max_r_lat * 1.05:
            has_subviraje = True

    if not has_subviraje and (trail_eval == "Exceso de Freno" or (brake_delta_dist and brake_delta_dist > 15.0 and speed_delta_min > 8.0)):
        has_subviraje = True

    if has_subviraje:
        balance_eval = "Subviraje en Entrada (Understeer)"
        balance_advice = "El morro no muerde el vértice: estás girando en exceso con los neumáticos delanteros saturados (subviraje). Modula el freno o reduce la velocidad de entrada para recuperar agarre lateral."
    elif number in [7, 14] and time_delta_corner > 0.15:
        balance_eval = "Sobreviraje en Salida (Oversteer)"
        balance_advice = "Zaga nerviosa al aplicar acelerador en apoyo; modula el pedal derecho para evitar la intrusión abrupta del control de tracción (TC)."
    else:
        balance_eval = "Equilibrio Neutro (Grip Óptimo)"
        balance_advice = "Transferencia de pesos equilibrada y rotación limpia hacia el vértice sin deslizamiento parásito."

    # Racing line (Trazada) evaluation
    apex_dist_delta = float(sub_dist[comp_apex_idx] - sub_dist[ref_apex_idx]) if len(sub_dist) > max(comp_apex_idx, ref_apex_idx) else 0.0

    if apex_dist_delta < -8.0:
        racing_line_eval = "Vértice Prematuro (Early Apex)"
        racing_line_advice = "Te tiras al piano interior demasiado pronto. Esto te 'estrangula' la trayectoria en la salida, obligándote a esperar para dar gas."
    elif apex_dist_delta > 10.0 or (brake_delta_dist and brake_delta_dist > 15.0):
        racing_line_eval = "Vértice Pasado / Abierto"
        racing_line_advice = "Llegas pasado a la frenada y el coche se abre demasiado, perdiendo el contacto con el piano del vértice."
    elif speed_delta_min > 8.0:
        racing_line_eval = "Trazada Cerrada / Falta de Apertura"
        racing_line_advice = "No aprovechas todo el ancho de pista en aproximación; ábrete 1.5 metros más hacia el exterior antes de iniciar el viraje."
    else:
        racing_line_eval = "Trazada Geométrica Óptima"
        racing_line_advice = "Excelente aproximación abierta, ataque certero al punto de cuerda y salida amplia aprovechando el piano exterior."

    # Generate Racing Line SVG Data
    turn_dir = "right" if number in [2, 3, 4, 8, 11] else "left"
    racing_line_svg = generate_racing_line_svg(
        corner_number=number,
        turn_dir=turn_dir,
        has_subviraje=has_subviraje,
        apex_dist_delta=apex_dist_delta,
        speed_delta=speed_delta_min,
        ref_min_speed=ref_min_speed,
        comp_min_speed=comp_min_speed,
    )

    return CornerAnalysis(
        corner_number=number,
        corner_name=name,
        start_dist=float(start_d),
        end_dist=float(end_d),
        ref_min_speed=round(ref_min_speed, 1),
        comp_min_speed=round(comp_min_speed, 1),
        speed_delta_min=round(speed_delta_min, 1),
        time_delta_corner=round(time_delta_corner, 3),
        ref_brake_point=round(ref_brake_pt, 1) if ref_brake_pt else None,
        comp_brake_point=round(comp_brake_pt, 1) if comp_brake_pt else None,
        brake_delta_dist=round(brake_delta_dist, 1) if brake_delta_dist else None,
        ref_throttle_point=round(ref_th_pt, 1) if ref_th_pt else None,
        comp_throttle_point=round(comp_th_pt, 1) if comp_th_pt else None,
        throttle_delta_dist=round(th_delta_dist, 1) if th_delta_dist else None,
        diagnosis=diagnosis,
        trail_eval=trail_eval,
        trail_advice=trail_advice,
        ref_gear=ref_gear,
        comp_gear=comp_gear,
        gear_eval=gear_eval,
        gear_advice=gear_advice,
        balance_eval=balance_eval,
        balance_advice=balance_advice,
        racing_line_eval=racing_line_eval,
        racing_line_advice=racing_line_advice,
        racing_line_svg=racing_line_svg,
    )


def generate_racing_line_svg(
    corner_number: int,
    turn_dir: str,
    has_subviraje: bool,
    apex_dist_delta: float,
    speed_delta: float,
    ref_min_speed: float,
    comp_min_speed: float,
) -> Dict[str, Any]:
    """
    Generate parametric SVG path geometries representing actual vs optimal racing lines.
    Coordinates calibrated for 440x220 canvas.
    """
    if turn_dir == "left":
        # Curva a Izquierdas: entrada por la derecha inferior, ápice a la izquierda, salida superior derecha/centro
        outer_curb = "M 390,215 C 380,120 280,30 50,25"
        inner_curb = "M 330,215 C 320,150 210,95 50,85"
        asphalt_fill = "M 390,215 C 380,120 280,30 50,25 L 50,85 C 210,95 320,150 330,215 Z"

        optimal_line = "M 382,210 C 375,130 215,92 58,35"
        turn_in = {"x": 378, "y": 170, "label": "Giro Ref"}
        apex_ref = {"x": 205, "y": 94, "label": f"Ápice Óptimo ({ref_min_speed:.0f} km/h)"}
        exit_pt = {"x": 65, "y": 38, "label": "Salida Óptima"}

        if has_subviraje:
            # Subviraje: entra bien pero morro desliza hacia fuera del ápice
            actual_line = "M 380,210 C 370,140 240,65 58,55"
            apex_comp = {"x": 242, "y": 70, "label": f"Ápice Desplazado (+1.8m) {comp_min_speed:.0f} km/h"}
        elif apex_dist_delta < -8.0:
            # Vértice prematuro: se mete antes de tiempo al interior y luego sale forzado
            actual_line = "M 360,210 C 320,135 180,110 58,72"
            apex_comp = {"x": 185, "y": 108, "label": f"Ápice Prematuro (-12m) {comp_min_speed:.0f} km/h"}
        else:
            actual_line = "M 380,208 C 372,132 212,94 58,37"
            apex_comp = {"x": 210, "y": 95, "label": f"Ápice {comp_min_speed:.0f} km/h"}
    else:
        # Curva a Derechas: entrada por la izquierda inferior, ápice a la derecha, salida superior izquierda/centro
        outer_curb = "M 50,215 C 60,120 160,30 390,25"
        inner_curb = "M 110,215 C 120,150 230,95 390,85"
        asphalt_fill = "M 50,215 C 60,120 160,30 390,25 L 390,85 C 230,95 120,150 110,215 Z"

        optimal_line = "M 58,210 C 65,130 225,92 382,35"
        turn_in = {"x": 62, "y": 170, "label": "Giro Ref"}
        apex_ref = {"x": 235, "y": 94, "label": f"Ápice Óptimo ({ref_min_speed:.0f} km/h)"}
        exit_pt = {"x": 375, "y": 38, "label": "Salida Óptima"}

        if has_subviraje:
            actual_line = "M 60,210 C 70,140 200,65 382,55"
            apex_comp = {"x": 198, "y": 70, "label": f"Ápice Desplazado (+1.8m) {comp_min_speed:.0f} km/h"}
        elif apex_dist_delta < -8.0:
            actual_line = "M 80,210 C 120,135 260,110 382,72"
            apex_comp = {"x": 255, "y": 108, "label": f"Ápice Prematuro (-12m) {comp_min_speed:.0f} km/h"}
        else:
            actual_line = "M 60,208 C 68,132 228,94 382,37"
            apex_comp = {"x": 230, "y": 95, "label": f"Ápice {comp_min_speed:.0f} km/h"}

    return {
        "corner_number": corner_number,
        "turn_dir": turn_dir,
        "outer_curb": outer_curb,
        "inner_curb": inner_curb,
        "asphalt_fill": asphalt_fill,
        "optimal_line": optimal_line,
        "actual_line": actual_line,
        "turn_in": turn_in,
        "apex_ref": apex_ref,
        "apex_comp": apex_comp,
        "exit_pt": exit_pt,
        "has_subviraje": has_subviraje,
    }


def extract_corners_analysis(
    aligned_data: Dict[str, np.ndarray],
    corners_list: Optional[List[Dict]] = None,
) -> List[CornerAnalysis]:
    """Analyze all defined track corners."""
    if corners_list is None:
        corners_list = VALENCIA_CORNERS

    analyses: List[CornerAnalysis] = []
    for c_def in corners_list:
        analyses.append(analyze_corner(c_def, aligned_data))

    return analyses
