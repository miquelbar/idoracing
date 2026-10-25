"""
Dynamic Tyre Thermal (I/M/O) and Pressure Diagnostics.
Based on Paul Haney ("The Racing & High-Performance Tire") and ACC Pirelli DHE physics.
"""

from typing import Any


def analyze_corner_tire(corner: str, hot_psi: float, cold_psi: float, imo: list[float]) -> dict[str, Any]:
    """
    Analyze Inner, Middle, and Outer temperatures along with hot pressure for a single tyre corner.
    imo: [Inner, Middle, Outer] in Celsius.
    """
    if len(imo) < 3:
        return {
            "corner": corner,
            "camber_status": "normal",
            "camber_advice": "Gradiente térmico no disponible.",
            "pressure_status": "normal",
            "pressure_advice": "Presión dentro del rango esperado.",
            "health": "ok",
        }

    t_in, t_mid, t_out = imo[0], imo[1], imo[2]

    # Camber Delta: Inner minus Outer (positive in healthy negative camber setup)
    delta_camber = round(t_in - t_out, 1)

    # Crown Delta: Middle minus average of Inner & Outer (positive = over-inflated crowning)
    avg_shoulders = (t_in + t_out) / 2.0
    delta_crown = round(t_mid - avg_shoulders, 1)

    # 1. Camber Evaluation
    # For GT3 with negative camber, loaded tyres should have Inner ~5°C to 12°C hotter than Outer.
    if delta_camber > 13.0:
        camber_status = "excess_camber"
        camber_advice = f"Exceso de caída negativa (ΔT={delta_camber}°C). La banda interior sobrecalienta; reduce caída -0.2° a -0.4° para maximizar la superficie de frenada."
    elif delta_camber < 3.0:
        camber_status = "insufficient_camber"
        camber_advice = f"Falta de caída negativa (ΔT={delta_camber}°C). El hombro exterior sobrecalienta en apoyo lateral; aumenta caída negativa (-0.2° a -0.3°)."
    else:
        camber_status = "optimal"
        camber_advice = f"Gradiente de caída óptimo (ΔT={delta_camber}°C, Inner > Outer saludable)."

    # 2. Pressure / Crown Evaluation
    if hot_psi > 27.05 or delta_crown > 2.0:
        pressure_status = "overpressure"
        pressure_advice = f"Sobrepresión ({hot_psi:.1f} psi). La corona central se abomba (M > I/O por {delta_crown}°C); reduce -0.3 a -0.5 psi para recuperar parche de contacto."
    elif hot_psi < 26.45 or delta_crown < -2.0:
        pressure_status = "underpressure"
        pressure_advice = f"Subpresión ({hot_psi:.1f} psi). La carcasa flexiona en exceso y los hombros cargan de más; sube +0.3 a +0.5 psi."
    else:
        pressure_status = "optimal"
        pressure_advice = f"Presión en ventana óptima ACC ({hot_psi:.1f} psi, huella plana)."

    health = "ok" if (camber_status == "optimal" and pressure_status == "optimal") else "warning"

    return {
        "corner": corner,
        "hot_psi": hot_psi,
        "cold_psi": cold_psi,
        "temps_imo": [t_in, t_mid, t_out],
        "delta_camber": delta_camber,
        "delta_crown": delta_crown,
        "camber_status": camber_status,
        "camber_advice": camber_advice,
        "pressure_status": pressure_status,
        "pressure_advice": pressure_advice,
        "health": health,
    }


def analyze_all_tyres(tyres_payload: dict[str, Any]) -> dict[str, Any]:
    """Run full thermal & pressure diagnostics across FL, FR, RL, RR."""
    pressures_hot = tyres_payload.get("pressures_hot", {})
    pressures_cold = tyres_payload.get("pressures_cold", {})
    temps_c = tyres_payload.get("temps_c", {})

    diagnostics = {}
    for corner in ("FL", "FR", "RL", "RR"):
        val_hot = pressures_hot.get(corner)
        hot = float(val_hot) if val_hot is not None else 26.8
        val_cold = pressures_cold.get(corner)
        cold = float(val_cold) if val_cold is not None else 24.5
        imo = temps_c.get(corner, [80.0, 80.0, 80.0])
        diagnostics[corner] = analyze_corner_tire(corner, hot, cold, imo)

    return diagnostics
