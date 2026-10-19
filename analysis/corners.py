"""
Corner-by-corner driving analysis and technical diagnosis.
Extracts apex speeds, braking points, throttle pickup points, and time loss per corner.
"""

from typing import Any, Dict, List, Optional
import numpy as np
from domain.session import CornerAnalysis
from analysis.tracks import known_track_corners

# A speed dip counts as a corner when it is at least this much below the speed before and after it.
CORNER_MIN_DROP_KMH = 12.0
CORNER_MAX_HALF_SPAN_M = 250.0
SLOW_CORNER_KMH = 110.0
FAST_CORNER_KMH = 160.0


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

    # Entry speed (at start of corner)
    ref_entry_speed = float(ref_sp[0]) if len(ref_sp) > 0 else 0.0
    comp_entry_speed = float(comp_sp[0]) if len(comp_sp) > 0 else 0.0
    delta_entry_kmh = float(comp_entry_speed - ref_entry_speed)

    # Apex (minimum speed point in corner)
    ref_min_speed = float(np.min(ref_sp)) if len(ref_sp) > 0 else 0.0
    comp_min_speed = float(np.min(comp_sp)) if len(comp_sp) > 0 else 0.0
    delta_vmin_kmh = float(comp_min_speed - ref_min_speed)
    speed_delta_min = delta_vmin_kmh

    # Exit speed (at end of corner)
    ref_exit_speed = float(ref_sp[-1]) if len(ref_sp) > 0 else 0.0
    comp_exit_speed = float(comp_sp[-1]) if len(comp_sp) > 0 else 0.0
    delta_exit_kmh = float(comp_exit_speed - ref_exit_speed)

    # Time lost in this specific corner
    time_delta_corner = float(t_delta[-1] - t_delta[0]) if len(t_delta) > 0 else 0.0

    # Strict loss threshold: any significant loss forbids praise labels
    is_significant_loss = (time_delta_corner > 0.08) or (delta_vmin_kmh <= -3.0) or (delta_exit_kmh <= -3.0)

    # Braking points: first point where brake > 0.08 before apex
    ref_apex_idx = int(np.argmin(ref_sp)) if len(ref_sp) > 0 else 0
    comp_apex_idx = int(np.argmin(comp_sp)) if len(comp_sp) > 0 else 0

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

    # Steering & dynamic lateral acceleration analysis
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

    if not has_subviraje and (brake_delta_dist and brake_delta_dist > 15.0 and delta_vmin_kmh < -5.0):
        has_subviraje = True

    # Trail Braking Analysis
    trail_eval = "Óptimo"
    trail_code = "neutral"
    trail_advice = ""
    is_trail_corner = ref_min_speed < SLOW_CORNER_KMH
    is_fast_corner = ref_min_speed > FAST_CORNER_KMH

    max_brk = float(np.max(comp_br)) if len(comp_br) > 0 else 0.0
    pre_apex_slice = comp_br[max(0, comp_apex_idx - 10) : comp_apex_idx]
    pre_apex_mean = float(np.mean(pre_apex_slice)) if len(pre_apex_slice) > 0 else 0.0

    if is_significant_loss:
        if pre_apex_mean < 0.04 and brake_delta_dist and brake_delta_dist < -8.0:
            trail_eval = "Soltado Prematuro"
            trail_code = "early_release"
            trail_advice = "Sueltas el pedal antes del vértice sin trail braking; el morro se aligera y pierdes rotación en entrada."
        elif pre_apex_mean > 0.35 or has_subviraje or delta_vmin_kmh <= -4.0:
            trail_eval = "Exceso de Freno en Giro"
            trail_code = "over_braking"
            trail_advice = "Mantienes demasiado freno mientras giras volante en el ápice, sobrecargando los neumáticos y matando la velocidad mínima."
        else:
            trail_eval = "Frenada Inconsistente"
            trail_code = "inconsistent"
            trail_advice = "La modulación del freno no acompaña la rotación del chasis, provocando pérdida de tiempo en el tramo."
    else:
        if max_brk > 0.20:
            if is_trail_corner:
                trail_eval = "Trail Braking Efectivo"
                trail_code = "effective"
                trail_advice = "Desvanecimiento regresivo adecuado: mantienes 15-20% de freno cargando el morro hasta el ápice."
            elif is_fast_corner:
                trail_eval = "Paso Estable en Apoyo"
                trail_code = "fast_corner"
                trail_advice = "Frenada breve y desahogo rápido adecuado a curva de alta velocidad."
            else:
                trail_eval = "Frenada Neutra"
                trail_code = "neutral"
                trail_advice = "Presión de frenada equilibrada en aproximación."
        else:
            trail_eval = "Paso en Apoyo"
            trail_code = "no_braking"
            trail_advice = "Curva rápida sin frenada mayor; paso a fondo o levantada de pie."

    # Dynamic balance analysis (Understeer / Oversteer / Traction)
    if time_delta_corner <= 0.05 and abs(delta_vmin_kmh) <= 2.0:
        balance_eval = "Equilibrio Neutro (Grip Óptimo)"
        balance_code = "neutral"
        balance_advice = "Transferencia de pesos equilibrada y rotación limpia hacia el vértice sin deslizamiento parásito."
    elif (delta_entry_kmh > -4.0 and delta_vmin_kmh <= -5.0) or has_subviraje or delta_vmin_kmh <= -3.0:
        # Caso A: Entrada normal pero caída fuerte en Vmin -> problema de giro/vértice
        balance_eval = "Pérdida de paso por curva / Subviraje en vértice"
        balance_code = "understeer"
        balance_advice = "El morro no muerde el vértice o se entra con exceso de frenada/subviraje. Modula el freno en regresión (trail braking) y retrasa el viraje para recuperar agarre lateral en el ápice."
    elif delta_vmin_kmh > -3.0 and (delta_exit_kmh <= -4.0 or (th_delta_dist and th_delta_dist > 12.0)):
        # Caso B: Vmin aceptable pero salida comprometida -> problema de tracción/apertura
        balance_eval = "Déficit de Tracción / Salida Comprometida"
        balance_code = "traction"
        balance_advice = "Problema en la fase de salida y tracción: apertura de gas demorada, exceso de volante girado o marcha no idónea que penaliza la aceleración."
    elif delta_entry_kmh <= -5.0 or (brake_delta_dist and brake_delta_dist < -15.0):
        # Caso C: Entrada muy lenta -> frenada temprana
        balance_eval = "Exceso de Frenada / Entrada Anticipada"
        balance_code = "early_braking"
        balance_advice = "Frenada demasiado temprana o exceso de presión inicial que mata la inercia del vehículo antes de iniciar el viraje."
    elif time_delta_corner > 0.08:
        balance_eval = "Pérdida de Inercia en Curva"
        balance_code = "momentum_loss"
        balance_advice = "Pérdida de velocidad y tiempo acumulado en el tramo; ajusta la modulación entre frenada y aceleración."
    else:
        balance_eval = "Equilibrio Estable"
        balance_code = "stable"
        balance_advice = "Paso consistente con margen menor de optimización en vértice."

    # Racing line (Trazada) evaluation
    apex_dist_delta = float(sub_dist[comp_apex_idx] - sub_dist[ref_apex_idx]) if len(sub_dist) > max(comp_apex_idx, ref_apex_idx) else 0.0

    if time_delta_corner <= 0.05 and abs(delta_vmin_kmh) <= 2.0:
        racing_line_eval = "Trazada Geométrica Óptima"
        racing_line_code = "optimal"
        racing_line_advice = "Excelente aproximación abierta, ataque certero al punto de cuerda y salida amplia aprovechando el piano exterior."
    elif apex_dist_delta < -8.0:
        racing_line_eval = "Vértice Prematuro (Early Apex)"
        racing_line_code = "early_apex"
        racing_line_advice = "Te tiras al piano interior demasiado pronto. Esto te 'estrangula' la trayectoria en la salida, obligándote a esperar para dar gas."
    elif apex_dist_delta > 10.0 or (brake_delta_dist and brake_delta_dist > 15.0):
        racing_line_eval = "Vértice Pasado / Abierto"
        racing_line_code = "late_apex"
        racing_line_advice = "Llegas pasado a la frenada y el coche se abre demasiado, perdiendo el contacto con el piano del vértice."
    elif delta_vmin_kmh <= -4.0:
        racing_line_eval = "Trazada Cerrada / Pérdida de Vértice"
        racing_line_code = "missed_apex"
        racing_line_advice = "No aprovechas todo el ancho de pista en aproximación; ábrete más hacia el exterior antes de iniciar el viraje para no estrangular el vértice."
    elif delta_exit_kmh <= -4.0:
        racing_line_eval = "Salida Estrangulada / Falta de Ancho"
        racing_line_code = "pinched_exit"
        racing_line_advice = "Salida cerrada que compromete la tracción hacia la recta posterior; aprovecha hasta el piano exterior."
    else:
        racing_line_eval = "Trazada Subóptima en Curva"
        racing_line_code = "suboptimal"
        racing_line_advice = "La trayectoria en curva no optimiza el paso por el vértice; abre la aproximación y asegura el piano interior."

    # Technical driving diagnosis grounded in verified telemetry facts
    diagnosis_parts = []
    if brake_delta_dist is not None:
        if brake_delta_dist < -12.0:
            diagnosis_parts.append(f"Frenada anticipada {abs(brake_delta_dist):.1f}m antes que la referencia.")
        elif brake_delta_dist > 12.0:
            diagnosis_parts.append(f"Frenada tardía {brake_delta_dist:.1f}m pasada de referencia.")

    if delta_vmin_kmh <= -3.0:
        diagnosis_parts.append(f"Pérdida de velocidad en vértice ({delta_vmin_kmh:.1f} km/h).")
    elif delta_vmin_kmh >= 3.0:
        diagnosis_parts.append(f"Mayor velocidad de paso en vértice (+{delta_vmin_kmh:.1f} km/h).")

    if delta_exit_kmh <= -4.0:
        diagnosis_parts.append(f"Velocidad de salida penalizada ({delta_exit_kmh:.1f} km/h).")

    if th_delta_dist is not None and th_delta_dist > 12.0:
        diagnosis_parts.append(f"Aceleración retrasada {th_delta_dist:.1f}m en la salida comprometiendo la recta posterior.")

    if abs(time_delta_corner) < 0.04:
        timing_summary = f"Paso consistente (delta {time_delta_corner:+.3f}s)."
    elif time_delta_corner < 0:
        timing_summary = f"Ganancia de {abs(time_delta_corner):.3f}s."
    else:
        timing_summary = f"Pérdida de +{time_delta_corner:.3f}s."

    delta_v_str = f"ΔV: {delta_vmin_kmh:+.1f} km/h"
    if diagnosis_parts:
        diagnosis = f"{timing_summary} ({delta_v_str}) " + " ".join(diagnosis_parts)
    else:
        diagnosis = f"{timing_summary} ({delta_v_str}) Velocidad en vértice {comp_min_speed:.0f} km/h (Ref: {ref_min_speed:.0f} km/h)."

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
        gear_code = "match"
        gear_advice = f"Marcha {comp_gear}ª idónea: maximiza el par motor a la salida sin sobrerrevolucionar el motor."
    elif comp_gear < ref_gear:
        gear_eval = "Marcha Demasiado Corta"
        gear_code = "too_low"
        gear_advice = f"Vas en {comp_gear}ª marcha (la óptima es {ref_gear}ª). Produce sobrerrégimen de RPM y patinaje del eje motriz al dar gas."
    else:
        gear_eval = "Marcha Demasiado Larga"
        gear_code = "too_high"
        gear_advice = f"Vas en {comp_gear}ª marcha (la óptima es {ref_gear}ª). El motor cae por debajo de la curva de potencia y penaliza la aceleración."

    # Generate Racing Line SVG Data
    turn_dir = corner_def.get("turn_dir") or ("left" if len(ref_lat) and float(np.mean(ref_lat)) > 0 else "right")
    racing_line_svg = generate_racing_line_svg(
        corner_number=number,
        turn_dir=turn_dir,
        has_subviraje=has_subviraje,
        apex_dist_delta=apex_dist_delta,
        speed_delta=abs(delta_vmin_kmh),
        ref_min_speed=ref_min_speed,
        comp_min_speed=comp_min_speed,
    )

    return CornerAnalysis(
        corner_number=number,
        corner_name=name,
        start_dist=float(start_d),
        end_dist=float(end_d),
        ref_entry_speed=round(ref_entry_speed, 1),
        comp_entry_speed=round(comp_entry_speed, 1),
        delta_v_entry=round(delta_entry_kmh, 1),
        ref_min_speed=round(ref_min_speed, 1),
        comp_min_speed=round(comp_min_speed, 1),
        delta_v_min=round(delta_vmin_kmh, 1),
        speed_delta_min=round(delta_vmin_kmh, 1),
        ref_exit_speed=round(ref_exit_speed, 1),
        comp_exit_speed=round(comp_exit_speed, 1),
        delta_v_exit=round(delta_exit_kmh, 1),
        time_delta_corner=round(time_delta_corner, 3),
        ref_brake_point=round(ref_brake_pt, 1) if ref_brake_pt else None,
        comp_brake_point=round(comp_brake_pt, 1) if comp_brake_pt else None,
        brake_delta_dist=round(brake_delta_dist, 1) if brake_delta_dist else None,
        ref_throttle_point=round(ref_th_pt, 1) if ref_th_pt else None,
        comp_throttle_point=round(comp_th_pt, 1) if comp_th_pt else None,
        throttle_delta_dist=round(th_delta_dist, 1) if th_delta_dist else None,
        diagnosis=diagnosis,
        trail_eval=trail_eval,
        trail_code=trail_code,
        trail_advice=trail_advice,
        ref_gear=ref_gear,
        comp_gear=comp_gear,
        gear_eval=gear_eval,
        gear_code=gear_code,
        gear_advice=gear_advice,
        balance_eval=balance_eval,
        balance_code=balance_code,
        balance_advice=balance_advice,
        racing_line_eval=racing_line_eval,
        racing_line_code=racing_line_code,
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
    Schematic SVG paths for a 440x220 canvas: a fixed reference line and one of three stock
    shapes for the driven line (understeer, early apex, on line). The shapes are illustrations
    picked by the diagnosis, not the measured trajectory.
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
            apex_comp = {"x": 242, "y": 70, "label": f"Ápice Desplazado {comp_min_speed:.0f} km/h"}
        elif apex_dist_delta < -8.0:
            # Vértice prematuro: se mete antes de tiempo al interior y luego sale forzado
            actual_line = "M 360,210 C 320,135 180,110 58,72"
            apex_comp = {"x": 185, "y": 108, "label": f"Ápice Prematuro {comp_min_speed:.0f} km/h"}
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
            apex_comp = {"x": 198, "y": 70, "label": f"Ápice Desplazado {comp_min_speed:.0f} km/h"}
        elif apex_dist_delta < -8.0:
            actual_line = "M 80,210 C 120,135 260,110 382,72"
            apex_comp = {"x": 255, "y": 108, "label": f"Ápice Prematuro {comp_min_speed:.0f} km/h"}
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


def detect_corners(distance: np.ndarray, speed: np.ndarray) -> List[Dict[str, Any]]:
    """
    Find corners as dips in the reference speed trace, for tracks without a corner table.
    A dip counts when its prominence (how far it sits below the lower of the two speed peaks
    that bound it) is at least CORNER_MIN_DROP_KMH. Each corner spans from the peak before
    the dip to the peak after it, capped at CORNER_MAX_HALF_SPAN_M either side of the apex.
    """
    if len(speed) < 5:
        return []
    window = max(1, int(round(20.0 / max(float(np.median(np.diff(distance))), 0.1)))) | 1
    smooth = np.convolve(np.pad(speed, window, mode="edge"), np.ones(window) / window, mode="same")[window:-window]

    corners: List[Dict[str, Any]] = []
    for apex in range(1, len(smooth) - 1):
        if not (smooth[apex] <= smooth[apex - 1] and smooth[apex] < smooth[apex + 1]):
            continue
        lower_left = np.where(smooth[:apex] < smooth[apex])[0]
        lower_right = np.where(smooth[apex + 1:] < smooth[apex])[0]
        left = int(lower_left[-1]) + 1 if len(lower_left) else 0
        right = apex + 1 + int(lower_right[0]) if len(lower_right) else len(smooth)
        before = left + int(np.argmax(smooth[left:apex]))
        after = apex + int(np.argmax(smooth[apex:right]))
        if min(smooth[before], smooth[after]) - smooth[apex] < CORNER_MIN_DROP_KMH:
            continue
        apex_d = float(distance[apex])
        start_d = max(float(distance[before]), apex_d - CORNER_MAX_HALF_SPAN_M)
        if corners:
            start_d = max(start_d, corners[-1]["end"])
        end_d = min(float(distance[after]), apex_d + CORNER_MAX_HALF_SPAN_M)
        corners.append({"start": start_d, "apex": apex_d, "end": end_d})

    return [
        {**c, "number": i + 1, "name": f"T{i + 1}", "turn_dir": None}
        for i, c in enumerate(corners)
    ]


def extract_corners_analysis(
    aligned_data: Dict[str, np.ndarray],
    corners_list: Optional[List[Dict]] = None,
    track_name: Optional[str] = None,
) -> List[CornerAnalysis]:
    """Analyze every corner: from the track's corner table if it is mapped, otherwise detected from the speed trace."""
    if corners_list is None:
        corners_list = known_track_corners(track_name)
    if corners_list is None:
        corners_list = detect_corners(aligned_data["distance"], aligned_data["ref_speed"])

    return [analyze_corner(c_def, aligned_data) for c_def in corners_list]
