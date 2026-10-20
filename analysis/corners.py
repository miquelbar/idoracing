"""
Corner-by-corner driving analysis and technical diagnosis.
Extracts apex speeds, braking points, throttle pickup points, and time loss per corner.
"""

from dataclasses import dataclass
from typing import Any, NamedTuple

import numpy as np

from analysis.line_offset import corner_line_offsets, has_recorded_position
from analysis.tracks import known_track_corners
from domain.session import CornerAnalysis

# A speed dip counts as a corner when it is at least this much below the speed before and after it.
CORNER_MIN_DROP_KMH = 12.0
CORNER_MAX_HALF_SPAN_M = 250.0
SLOW_CORNER_KMH = 110.0
FAST_CORNER_KMH = 160.0
# Line offsets below this are within position noise and are not called out in the diagnosis.
LINE_OFFSET_NOTE_M = 0.5
# Offsets from this size up override the racing-line evaluation inferred from speed and timing.
LINE_OFFSET_EVAL_M = 1.0


class Evaluation(NamedTuple):
    label: str
    code: str
    advice: str


@dataclass(frozen=True)
class CornerSignals:
    """Numbers measured on one corner of an aligned lap pair, which every evaluation reads from."""

    sub_dist: np.ndarray
    ref_entry_speed: float
    comp_entry_speed: float
    ref_min_speed: float
    comp_min_speed: float
    ref_exit_speed: float
    comp_exit_speed: float
    time_delta: float
    ref_apex_idx: int
    comp_apex_idx: int
    ref_brake_point: float | None
    comp_brake_point: float | None
    ref_throttle_point: float | None
    comp_throttle_point: float | None
    comp_max_brake: float
    comp_pre_apex_brake: float
    understeer: bool
    line_offsets: tuple[float, float, float] | None
    excess_steer_deg: float | None = None
    steer_to_g: float | None = None
    kerb_strike_detected: bool = False
    damping_advice: str | None = None

    @property
    def delta_entry(self) -> float:
        return float(self.comp_entry_speed - self.ref_entry_speed)

    @property
    def delta_vmin(self) -> float:
        return float(self.comp_min_speed - self.ref_min_speed)

    @property
    def delta_exit(self) -> float:
        return float(self.comp_exit_speed - self.ref_exit_speed)

    @property
    def brake_delta(self) -> float | None:
        if self.ref_brake_point is None or self.comp_brake_point is None:
            return None
        return float(self.comp_brake_point - self.ref_brake_point)

    @property
    def throttle_delta(self) -> float | None:
        if self.ref_throttle_point is None or self.comp_throttle_point is None:
            return None
        return float(self.comp_throttle_point - self.ref_throttle_point)

    @property
    def apex_dist_delta(self) -> float:
        if len(self.sub_dist) <= max(self.comp_apex_idx, self.ref_apex_idx):
            return 0.0
        return float(self.sub_dist[self.comp_apex_idx] - self.sub_dist[self.ref_apex_idx])

    @property
    def significant_loss(self) -> bool:
        """Any of these forbids praise labels."""
        return self.time_delta > 0.08 or self.delta_vmin <= -3.0 or self.delta_exit <= -3.0

    @property
    def clean(self) -> bool:
        return self.time_delta <= 0.05 and abs(self.delta_vmin) <= 2.0


def _channel(aligned: dict[str, np.ndarray], key: str, mask: np.ndarray) -> np.ndarray:
    return aligned[key][mask] if key in aligned else np.array([])


def _first_point(values: np.ndarray, threshold: float, sub_dist: np.ndarray, offset: int = 0) -> float | None:
    hits = np.where(values > threshold)[0]
    return float(sub_dist[offset + hits[0]]) if len(hits) > 0 else None


def _brake_point(brake: np.ndarray, apex_idx: int, sub_dist: np.ndarray) -> float | None:
    """First point above 8 % brake before the apex."""
    return _first_point(brake[:apex_idx], 0.08, sub_dist) if apex_idx > 0 else None


def _throttle_point(throttle: np.ndarray, apex_idx: int, sub_dist: np.ndarray) -> float | None:
    """First point above 10 % throttle from the apex on."""
    return _first_point(throttle[apex_idx:], 0.10, sub_dist, offset=apex_idx)


def _detect_understeer(
    aligned: dict[str, np.ndarray], mask: np.ndarray, brake_delta: float | None, delta_vmin: float
) -> bool:
    """More steering for no more lateral grip, or braking late into a big apex-speed loss."""
    ref_st, comp_st = _channel(aligned, "ref_steer_angle", mask), _channel(aligned, "comp_steer_angle", mask)
    ref_lat, comp_lat = _channel(aligned, "ref_lat_accel", mask), _channel(aligned, "comp_lat_accel", mask)
    if len(comp_st) > 0 and len(ref_st) > 0:
        max_c_lat = float(np.max(np.abs(comp_lat))) if len(comp_lat) > 0 else 1.0
        max_r_lat = float(np.max(np.abs(ref_lat))) if len(ref_lat) > 0 else 1.0
        if float(np.max(np.abs(comp_st))) > float(np.max(np.abs(ref_st))) * 1.12 and max_c_lat <= max_r_lat * 1.05:
            return True
    return bool(brake_delta and brake_delta > 15.0 and delta_vmin < -5.0)


def _measure(corner_def: dict, aligned: dict[str, np.ndarray], mask: np.ndarray) -> CornerSignals:
    sub_dist = aligned["distance"][mask]
    ref_sp, comp_sp = aligned["ref_speed"][mask], aligned["comp_speed"][mask]
    ref_br, comp_br = aligned["ref_brake"][mask], aligned["comp_brake"][mask]
    t_delta = aligned["time_delta"][mask]
    ref_apex_idx = int(np.argmin(ref_sp)) if len(ref_sp) > 0 else 0
    comp_apex_idx = int(np.argmin(comp_sp)) if len(comp_sp) > 0 else 0

    ref_brake_point = _brake_point(ref_br, ref_apex_idx, sub_dist)
    comp_brake_point = _brake_point(comp_br, comp_apex_idx, sub_dist)
    brake_delta = (
        float(comp_brake_point - ref_brake_point)
        if ref_brake_point is not None and comp_brake_point is not None
        else None
    )
    delta_vmin = float(np.min(comp_sp)) - float(np.min(ref_sp)) if len(ref_sp) > 0 else 0.0
    pre_apex = comp_br[max(0, comp_apex_idx - 10) : comp_apex_idx]

    # Ackermann Steer-to-G ratio & excess steering angle (MoTeC analysis)
    ref_st, comp_st = _channel(aligned, "ref_steer_angle", mask), _channel(aligned, "comp_steer_angle", mask)
    ref_lat, comp_lat = _channel(aligned, "ref_lat_accel", mask), _channel(aligned, "comp_lat_accel", mask)

    excess_steer_deg: float | None = None
    steer_to_g: float | None = None
    if len(comp_st) > 0 and len(ref_st) > 0:
        max_c_st = float(np.max(np.abs(comp_st)))
        max_r_st = float(np.max(np.abs(ref_st)))
        max_c_lat = float(np.max(np.abs(comp_lat))) if len(comp_lat) > 0 else 1.0
        if max_c_lat > 0.1:
            steer_to_g = round(max_c_st / max_c_lat, 1)
        if max_c_st > max_r_st * 1.06:
            excess_steer_deg = round(max_c_st - max_r_st, 1)

    # Detect kerb strike & high-frequency shock impact
    kerb_strike = False
    damping_advice = None
    if len(comp_lat) > 4:
        jerk = np.diff(comp_lat, n=2)
        if np.any(np.abs(jerk) > 0.85):
            kerb_strike = True
            damping_advice = "Impacto brusco sobre piano: si la zaga rebota, ablanda 1 clic Fast Bump para absorber el bordillo sin perder tracción."

    return CornerSignals(
        sub_dist=sub_dist,
        ref_entry_speed=float(ref_sp[0]) if len(ref_sp) > 0 else 0.0,
        comp_entry_speed=float(comp_sp[0]) if len(comp_sp) > 0 else 0.0,
        ref_min_speed=float(np.min(ref_sp)) if len(ref_sp) > 0 else 0.0,
        comp_min_speed=float(np.min(comp_sp)) if len(comp_sp) > 0 else 0.0,
        ref_exit_speed=float(ref_sp[-1]) if len(ref_sp) > 0 else 0.0,
        comp_exit_speed=float(comp_sp[-1]) if len(comp_sp) > 0 else 0.0,
        time_delta=float(t_delta[-1] - t_delta[0]) if len(t_delta) > 0 else 0.0,
        ref_apex_idx=ref_apex_idx,
        comp_apex_idx=comp_apex_idx,
        ref_brake_point=ref_brake_point,
        comp_brake_point=comp_brake_point,
        ref_throttle_point=_throttle_point(aligned["ref_throttle"][mask], ref_apex_idx, sub_dist),
        comp_throttle_point=_throttle_point(aligned["comp_throttle"][mask], comp_apex_idx, sub_dist),
        comp_max_brake=float(np.max(comp_br)) if len(comp_br) > 0 else 0.0,
        comp_pre_apex_brake=float(np.mean(pre_apex)) if len(pre_apex) > 0 else 0.0,
        understeer=_detect_understeer(aligned, mask, brake_delta, delta_vmin),
        line_offsets=(
            corner_line_offsets(
                aligned["ref_x"][mask],
                aligned["ref_y"][mask],
                aligned["comp_x"][mask],
                aligned["comp_y"][mask],
                apex_idx=ref_apex_idx,
            )
            if has_recorded_position(aligned)
            else None
        ),
        excess_steer_deg=excess_steer_deg,
        steer_to_g=steer_to_g,
        kerb_strike_detected=kerb_strike,
        damping_advice=damping_advice,
    )


def _evaluate_trail_braking(s: CornerSignals) -> Evaluation:
    brake_delta = s.brake_delta
    if s.significant_loss:
        if s.comp_pre_apex_brake < 0.04 and brake_delta and brake_delta < -8.0:
            return Evaluation(
                "Soltado Prematuro",
                "early_release",
                "Sueltas el pedal antes del vértice sin trail braking; el morro se aligera y pierdes rotación en entrada.",
            )
        if s.comp_pre_apex_brake > 0.35 or s.understeer or s.delta_vmin <= -4.0:
            return Evaluation(
                "Exceso de Freno en Giro",
                "over_braking",
                "Mantienes demasiado freno mientras giras volante en el ápice, sobrecargando los neumáticos y matando la velocidad mínima.",
            )
        return Evaluation(
            "Frenada Inconsistente",
            "inconsistent",
            "La modulación del freno no acompaña la rotación del chasis, provocando pérdida de tiempo en el tramo.",
        )
    if s.comp_max_brake <= 0.20:
        return Evaluation(
            "Paso en Apoyo", "no_braking", "Curva rápida sin frenada mayor; paso a fondo o levantada de pie."
        )
    if s.ref_min_speed < SLOW_CORNER_KMH:
        return Evaluation(
            "Trail Braking Efectivo",
            "effective",
            "Desvanecimiento regresivo adecuado: mantienes 15-20% de freno cargando el morro hasta el ápice.",
        )
    if s.ref_min_speed > FAST_CORNER_KMH:
        return Evaluation(
            "Paso Estable en Apoyo",
            "fast_corner",
            "Frenada breve y desahogo rápido adecuado a curva de alta velocidad.",
        )
    return Evaluation("Frenada Neutra", "neutral", "Presión de frenada equilibrada en aproximación.")


def _evaluate_balance(s: CornerSignals) -> Evaluation:
    brake_delta, throttle_delta = s.brake_delta, s.throttle_delta
    if s.clean:
        return Evaluation(
            "Equilibrio Neutro (Grip Óptimo)",
            "neutral",
            "Transferencia de pesos equilibrada y rotación limpia hacia el vértice sin deslizamiento parásito.",
        )
    if (s.delta_entry > -4.0 and s.delta_vmin <= -5.0) or s.understeer or s.delta_vmin <= -3.0:
        return Evaluation(
            "Pérdida de paso por curva / Subviraje en vértice",
            "understeer",
            "El morro no muerde el vértice o se entra con exceso de frenada/subviraje. Modula el freno en regresión (trail braking) y retrasa el viraje para recuperar agarre lateral en el ápice.",
        )
    if s.delta_vmin > -3.0 and (s.delta_exit <= -4.0 or (throttle_delta and throttle_delta > 12.0)):
        return Evaluation(
            "Déficit de Tracción / Salida Comprometida",
            "traction",
            "Problema en la fase de salida y tracción: apertura de gas demorada, exceso de volante girado o marcha no idónea que penaliza la aceleración.",
        )
    if s.delta_entry <= -5.0 or (brake_delta and brake_delta < -15.0):
        return Evaluation(
            "Exceso de Frenada / Entrada Anticipada",
            "early_braking",
            "Frenada demasiado temprana o exceso de presión inicial que mata la inercia del vehículo antes de iniciar el viraje.",
        )
    if s.time_delta > 0.08:
        return Evaluation(
            "Pérdida de Inercia en Curva",
            "momentum_loss",
            "Pérdida de velocidad y tiempo acumulado en el tramo; ajusta la modulación entre frenada y aceleración.",
        )
    return Evaluation("Equilibrio Estable", "stable", "Paso consistente con margen menor de optimización en vértice.")


def _evaluate_line(s: CornerSignals) -> Evaluation:
    # A measured line beats one inferred from speed and timing.
    if s.line_offsets is not None and abs(s.line_offsets[1]) >= LINE_OFFSET_EVAL_M:
        apex = s.line_offsets[1]
        if apex > 0:
            return Evaluation(
                "Vértice Pasado / Abierto",
                "late_apex",
                f"Pasas por el vértice {apex:.1f}m más abierto que en tu vuelta de referencia; "
                "retrasa un poco el giro y busca el piano interior.",
            )
        return Evaluation(
            "Trazada Cerrada / Pérdida de Vértice",
            "missed_apex",
            f"Pasas por el vértice {abs(apex):.1f}m más cerrado que en tu vuelta de referencia; "
            "comprueba que no estés girando antes de tiempo y estrangulando la salida.",
        )
    brake_delta = s.brake_delta
    if s.clean:
        return Evaluation(
            "Trazada Geométrica Óptima",
            "optimal",
            "Excelente aproximación abierta, ataque certero al punto de cuerda y salida amplia aprovechando el piano exterior.",
        )
    if s.apex_dist_delta < -8.0:
        return Evaluation(
            "Vértice Prematuro (Early Apex)",
            "early_apex",
            "Te tiras al piano interior demasiado pronto. Esto te 'estrangula' la trayectoria en la salida, obligándote a esperar para dar gas.",
        )
    if s.apex_dist_delta > 10.0 or (brake_delta and brake_delta > 15.0):
        return Evaluation(
            "Vértice Pasado / Abierto",
            "late_apex",
            "Llegas pasado a la frenada y el coche se abre demasiado, perdiendo el contacto con el piano del vértice.",
        )
    if s.delta_vmin <= -4.0:
        return Evaluation(
            "Trazada Cerrada / Pérdida de Vértice",
            "missed_apex",
            "No aprovechas todo el ancho de pista en aproximación; ábrete más hacia el exterior antes de iniciar el viraje para no estrangular el vértice.",
        )
    if s.delta_exit <= -4.0:
        return Evaluation(
            "Salida Estrangulada / Falta de Ancho",
            "pinched_exit",
            "Salida cerrada que compromete la tracción hacia la recta posterior; aprovecha hasta el piano exterior.",
        )
    return Evaluation(
        "Trazada Subóptima en Curva",
        "suboptimal",
        "La trayectoria en curva no optimiza el paso por el vértice; abre la aproximación y asegura el piano interior.",
    )


def _diagnosis(s: CornerSignals) -> str:
    """Diagnosis text built only from the measured deltas."""
    parts = []
    brake_delta, throttle_delta = s.brake_delta, s.throttle_delta
    if brake_delta is not None:
        if brake_delta < -12.0:
            parts.append(f"Frenada anticipada {abs(brake_delta):.1f}m antes que la referencia.")
        elif brake_delta > 12.0:
            parts.append(f"Frenada tardía {brake_delta:.1f}m pasada de referencia.")
    if s.delta_vmin <= -3.0:
        parts.append(f"Pérdida de velocidad en vértice ({s.delta_vmin:.1f} km/h).")
    elif s.delta_vmin >= 3.0:
        parts.append(f"Mayor velocidad de paso en vértice (+{s.delta_vmin:.1f} km/h).")
    if s.delta_exit <= -4.0:
        parts.append(f"Velocidad de salida penalizada ({s.delta_exit:.1f} km/h).")
    if throttle_delta is not None and throttle_delta > 12.0:
        parts.append(f"Aceleración retrasada {throttle_delta:.1f}m en la salida comprometiendo la recta posterior.")
    if s.line_offsets is not None and abs(s.line_offsets[1]) >= LINE_OFFSET_NOTE_M:
        side = "más abierto" if s.line_offsets[1] > 0 else "más cerrado"
        parts.append(f"Ápice {abs(s.line_offsets[1]):.1f}m {side} que la referencia.")
    if s.excess_steer_deg is not None and s.excess_steer_deg > 3.0:
        parts.append(f"Subviraje por sobreconducción: {s.excess_steer_deg:.0f}° de volante en exceso.")
    if s.kerb_strike_detected:
        parts.append("Rebote pronunciado sobre piano.")

    if abs(s.time_delta) < 0.04:
        timing = f"Paso consistente (delta {s.time_delta:+.3f}s)."
    elif s.time_delta < 0:
        timing = f"Ganancia de {abs(s.time_delta):.3f}s."
    else:
        timing = f"Pérdida de +{s.time_delta:.3f}s."
    delta_v = f"ΔV: {s.delta_vmin:+.1f} km/h"
    if parts:
        return f"{timing} ({delta_v}) " + " ".join(parts)
    return f"{timing} ({delta_v}) Velocidad en vértice {s.comp_min_speed:.0f} km/h (Ref: {s.ref_min_speed:.0f} km/h)."


def _evaluate_gear(
    corner_def: dict, aligned: dict[str, np.ndarray], mask: np.ndarray, s: CornerSignals
) -> tuple[int, int, Evaluation]:
    ref_gears, comp_gears = _channel(aligned, "ref_gear", mask), _channel(aligned, "comp_gear", mask)
    if len(ref_gears) > s.ref_apex_idx and ref_gears[s.ref_apex_idx] > 0:
        ref_gear = int(round(ref_gears[s.ref_apex_idx]))
    else:
        ref_gear = int(corner_def.get("gear", 3))
    if len(comp_gears) > s.comp_apex_idx and comp_gears[s.comp_apex_idx] > 0:
        comp_gear = int(round(comp_gears[s.comp_apex_idx]))
    else:
        comp_gear = ref_gear

    if comp_gear == ref_gear:
        evaluation = Evaluation(
            "Marcha Óptima",
            "match",
            f"Marcha {comp_gear}ª idónea: maximiza el par motor a la salida sin sobrerrevolucionar el motor.",
        )
    elif comp_gear < ref_gear:
        evaluation = Evaluation(
            "Marcha Demasiado Corta",
            "too_low",
            f"Vas en {comp_gear}ª marcha (la óptima es {ref_gear}ª). Produce sobrerrégimen de RPM y patinaje del eje motriz al dar gas.",
        )
    else:
        evaluation = Evaluation(
            "Marcha Demasiado Larga",
            "too_high",
            f"Vas en {comp_gear}ª marcha (la óptima es {ref_gear}ª). El motor cae por debajo de la curva de potencia y penaliza la aceleración.",
        )
    return ref_gear, comp_gear, evaluation


def _rounded(value: float | None, digits: int = 1) -> float | None:
    return round(value, digits) if value else None


def analyze_corner(corner_def: dict, aligned_data: dict[str, np.ndarray]) -> CornerAnalysis:
    """Technical breakdown of driving performance across one corner."""
    dist = aligned_data["distance"]
    start_d, end_d = corner_def["start"], corner_def["end"]
    name, number = corner_def["name"], corner_def["number"]

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

    s = _measure(corner_def, aligned_data, mask)
    trail = _evaluate_trail_braking(s)
    balance = _evaluate_balance(s)
    line = _evaluate_line(s)
    ref_gear, comp_gear, gear = _evaluate_gear(corner_def, aligned_data, mask, s)
    ref_lat = _channel(aligned_data, "ref_lat_accel", mask)
    turn_dir = corner_def.get("turn_dir") or ("left" if len(ref_lat) and float(np.mean(ref_lat)) > 0 else "right")

    measured_apex = (
        float(s.sub_dist[s.ref_apex_idx])
        if len(s.sub_dist) > s.ref_apex_idx
        else float(corner_def.get("apex", (start_d + end_d) / 2.0))
    )

    return CornerAnalysis(
        corner_number=number,
        corner_name=name,
        start_dist=float(start_d),
        end_dist=float(end_d),
        apex_dist=round(measured_apex, 1),
        ref_entry_speed=round(s.ref_entry_speed, 1),
        comp_entry_speed=round(s.comp_entry_speed, 1),
        delta_v_entry=round(s.delta_entry, 1),
        ref_min_speed=round(s.ref_min_speed, 1),
        comp_min_speed=round(s.comp_min_speed, 1),
        delta_v_min=round(s.delta_vmin, 1),
        speed_delta_min=round(s.delta_vmin, 1),
        ref_exit_speed=round(s.ref_exit_speed, 1),
        comp_exit_speed=round(s.comp_exit_speed, 1),
        delta_v_exit=round(s.delta_exit, 1),
        time_delta_corner=round(s.time_delta, 3),
        ref_brake_point=_rounded(s.ref_brake_point),
        comp_brake_point=_rounded(s.comp_brake_point),
        brake_delta_dist=_rounded(s.brake_delta),
        ref_throttle_point=_rounded(s.ref_throttle_point),
        comp_throttle_point=_rounded(s.comp_throttle_point),
        throttle_delta_dist=_rounded(s.throttle_delta),
        diagnosis=_diagnosis(s),
        trail_eval=trail.label,
        trail_code=trail.code,
        trail_advice=trail.advice,
        ref_gear=ref_gear,
        comp_gear=comp_gear,
        gear_eval=gear.label,
        gear_code=gear.code,
        gear_advice=gear.advice,
        balance_eval=balance.label,
        balance_code=balance.code,
        balance_advice=balance.advice,
        racing_line_eval=line.label,
        racing_line_code=line.code,
        racing_line_advice=line.advice,
        racing_line_svg=generate_racing_line_svg(
            corner_number=number,
            turn_dir=turn_dir,
            has_understeer=s.understeer,
            apex_dist_delta=s.apex_dist_delta,
            speed_delta=abs(s.delta_vmin),
            ref_min_speed=s.ref_min_speed,
            comp_min_speed=s.comp_min_speed,
        ),
        line_offset_entry_m=s.line_offsets[0] if s.line_offsets else None,
        line_offset_apex_m=s.line_offsets[1] if s.line_offsets else None,
        line_offset_exit_m=s.line_offsets[2] if s.line_offsets else None,
        excess_steer_deg=s.excess_steer_deg,
        steer_to_g=s.steer_to_g,
        kerb_strike_detected=s.kerb_strike_detected,
        damping_advice=s.damping_advice,
    )


def generate_racing_line_svg(
    corner_number: int,
    turn_dir: str,
    has_understeer: bool,
    apex_dist_delta: float,
    speed_delta: float,
    ref_min_speed: float,
    comp_min_speed: float,
) -> dict[str, Any]:
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

        if has_understeer:
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

        if has_understeer:
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
        "has_understeer": has_understeer,
    }


def detect_corners(distance: np.ndarray, speed: np.ndarray) -> list[dict[str, Any]]:
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

    corners: list[dict[str, Any]] = []
    for apex in range(1, len(smooth) - 1):
        if not (smooth[apex] <= smooth[apex - 1] and smooth[apex] < smooth[apex + 1]):
            continue
        lower_left = np.where(smooth[:apex] < smooth[apex])[0]
        lower_right = np.where(smooth[apex + 1 :] < smooth[apex])[0]
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

    return [{**c, "number": i + 1, "name": f"T{i + 1}", "turn_dir": None} for i, c in enumerate(corners)]


def extract_corners_analysis(
    aligned_data: dict[str, np.ndarray],
    corners_list: list[dict] | None = None,
    track_name: str | None = None,
) -> list[CornerAnalysis]:
    """Analyze every corner: from the track's corner table if it is mapped, otherwise detected from the speed trace."""
    if corners_list is None:
        corners_list = known_track_corners(track_name)
    if corners_list is None:
        corners_list = detect_corners(aligned_data["distance"], aligned_data["ref_speed"])

    return [analyze_corner(c_def, aligned_data) for c_def in corners_list]
