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
    )


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
