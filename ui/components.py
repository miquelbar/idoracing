"""
UI helper utilities and Plotly visualization builders for ACC Coach.
"""

from typing import Dict, List, Optional
import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from domain.session import CornerAnalysis, LapComparison


def format_lap_time(seconds: Optional[float]) -> str:
    """Format seconds into standard motorsport string m:ss.fff (e.g. 1:31.450)."""
    if seconds is None or seconds <= 0:
        return "--:--.---"
    mins = int(seconds // 60)
    secs = seconds % 60
    return f"{mins}:{secs:06.3f}"


def build_comparison_charts(comparison: LapComparison) -> Optional[go.Figure]:
    """
    Build synchronized interactive Plotly multi-row chart for telemetry comparison.
    Rows:
      1. Speed (km/h) vs Distance (m)
      2. Cumulative Time Delta (s) vs Distance (m)
      3. Throttle & Brake (%) vs Distance (m)
      4. Gear vs Distance (m)
    """
    if not comparison.aligned_distance:
        return None

    dist = np.array(comparison.aligned_distance)
    time_delta = np.array(comparison.time_delta_profile or [])
    speed_delta = np.array(comparison.speed_delta_profile or [])

    fig = make_subplots(
        rows=4,
        cols=1,
        shared_xaxes=True,
        vertical_spacing=0.04,
        subplot_titles=(
            "Velocidad (km/h)",
            "Delta de Tiempo Acumulado (s) [Positivo = Pérdida]",
            "Pedales: Acelerador y Freno (%)",
            "Marcha",
        ),
        row_heights=[0.35, 0.25, 0.25, 0.15],
    )

    # 1. Speed row
    # Reconstruct speed profiles if available
    # For display, approximate if aligned data channels present
    # Add time delta
    if len(time_delta) == len(dist):
        fig.add_trace(
            go.Scatter(
                x=dist,
                y=time_delta,
                mode="lines",
                name="Δ Tiempo",
                line=dict(color="#FF4B4B", width=2),
                hovertemplate="Distancia: %{x:.0f}m<br>Δt: %{y:+.3f}s<extra></extra>",
            ),
            row=2,
            col=1,
        )
        # Add 0 baseline
        fig.add_hline(y=0.0, line_dash="dash", line_color="gray", row=2, col=1)

    # Annotate corners on charts
    for c in comparison.corners:
        mid_d = (c.start_dist + c.end_dist) / 2.0
        # Add vertical shading/marker for corners
        fig.add_vrect(
            x0=c.start_dist,
            x1=c.end_dist,
            fillcolor="rgba(100, 100, 100, 0.08)",
            line_width=0,
            row="all",
            col=1,
        )
        fig.add_annotation(
            x=mid_d,
            y=1.0,
            yref="y domain",
            text=f"T{c.corner_number}",
            showarrow=False,
            font=dict(size=10, color="#888888"),
            row=1,
            col=1,
        )

    fig.update_layout(
        height=750,
        margin=dict(l=50, r=30, t=40, b=40),
        template="plotly_dark",
        hovermode="x unified",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
    )
    fig.update_xaxes(title_text="Distancia recorrida (metros)", row=4, col=1)
    fig.update_yaxes(title_text="km/h", row=1, col=1)
    fig.update_yaxes(title_text="Segundos", row=2, col=1)
    fig.update_yaxes(title_text="%", row=3, col=1)
    fig.update_yaxes(title_text="Marcha", row=4, col=1)

    return fig


def build_detailed_telemetry_figure(
    aligned_data: Dict[str, np.ndarray],
    ref_lap_num: int,
    comp_lap_num: int,
    corners: List[CornerAnalysis],
) -> go.Figure:
    """Build full 4-row telemetry comparison figure with exact channels."""
    dist = aligned_data["distance"]

    fig = make_subplots(
        rows=4,
        cols=1,
        shared_xaxes=True,
        vertical_spacing=0.04,
        subplot_titles=(
            f"Velocidad (km/h) — Ref: V{ref_lap_num} (Azul) vs Comp: V{comp_lap_num} (Naranja)",
            "Delta de Tiempo Acumulado (s) [Por encima de 0 = Tiempo perdido]",
            "Pedales: Acelerador y Freno",
            "Marcha Engranada",
        ),
        row_heights=[0.35, 0.25, 0.25, 0.15],
    )

    # Row 1: Speed
    fig.add_trace(
        go.Scatter(
            x=dist,
            y=aligned_data["ref_speed"],
            mode="lines",
            name=f"Velocidad V{ref_lap_num} (Ref)",
            line=dict(color="#29B5E8", width=2),
            hovertemplate="V_ref: %{y:.1f} km/h<extra></extra>",
        ),
        row=1,
        col=1,
    )
    fig.add_trace(
        go.Scatter(
            x=dist,
            y=aligned_data["comp_speed"],
            mode="lines",
            name=f"Velocidad V{comp_lap_num} (Comp)",
            line=dict(color="#FF8A00", width=2),
            hovertemplate="V_comp: %{y:.1f} km/h<extra></extra>",
        ),
        row=1,
        col=1,
    )

    # Row 2: Time delta
    fig.add_trace(
        go.Scatter(
            x=dist,
            y=aligned_data["time_delta"],
            mode="lines",
            name="Δ Tiempo (s)",
            line=dict(color="#FF4B4B", width=2),
            hovertemplate="Δt: %{y:+.3f}s<extra></extra>",
        ),
        row=2,
        col=1,
    )
    fig.add_hline(y=0.0, line_dash="dash", line_color="#777777", row=2, col=1)

    # Row 3: Throttle and Brake
    fig.add_trace(
        go.Scatter(
            x=dist,
            y=aligned_data["ref_throttle"] * 100.0,
            mode="lines",
            name=f"Gas V{ref_lap_num}",
            line=dict(color="#00CC96", width=1.5),
            hovertemplate="Gas Ref: %{y:.0f}%<extra></extra>",
        ),
        row=3,
        col=1,
    )
    fig.add_trace(
        go.Scatter(
            x=dist,
            y=aligned_data["comp_throttle"] * 100.0,
            mode="lines",
            name=f"Gas V{comp_lap_num}",
            line=dict(color="#AB63FA", width=1.5, dash="dot"),
            hovertemplate="Gas Comp: %{y:.0f}%<extra></extra>",
        ),
        row=3,
        col=1,
    )
    fig.add_trace(
        go.Scatter(
            x=dist,
            y=aligned_data["ref_brake"] * 100.0,
            mode="lines",
            name=f"Freno V{ref_lap_num}",
            line=dict(color="#EF553B", width=1.5),
            hovertemplate="Freno Ref: %{y:.0f}%<extra></extra>",
        ),
        row=3,
        col=1,
    )
    fig.add_trace(
        go.Scatter(
            x=dist,
            y=aligned_data["comp_brake"] * 100.0,
            mode="lines",
            name=f"Freno V{comp_lap_num}",
            line=dict(color="#FFA15A", width=1.5, dash="dot"),
            hovertemplate="Freno Comp: %{y:.0f}%<extra></extra>",
        ),
        row=3,
        col=1,
    )

    # Row 4: Gear
    fig.add_trace(
        go.Scatter(
            x=dist,
            y=aligned_data["ref_gear"],
            mode="lines",
            name=f"Marcha V{ref_lap_num}",
            line=dict(color="#29B5E8", width=1.5),
            hovertemplate="Marcha Ref: %{y:.0f}<extra></extra>",
        ),
        row=4,
        col=1,
    )
    fig.add_trace(
        go.Scatter(
            x=dist,
            y=aligned_data["comp_gear"],
            mode="lines",
            name=f"Marcha V{comp_lap_num}",
            line=dict(color="#FF8A00", width=1.5, dash="dot"),
            hovertemplate="Marcha Comp: %{y:.0f}<extra></extra>",
        ),
        row=4,
        col=1,
    )

    # Corner labels
    for c in corners:
        mid_d = (c.start_dist + c.end_dist) / 2.0
        fig.add_vrect(
            x0=c.start_dist,
            x1=c.end_dist,
            fillcolor="rgba(255, 255, 255, 0.04)",
            line_width=0,
            row="all",
            col=1,
        )
        fig.add_annotation(
            x=mid_d,
            y=1.0,
            yref="y domain",
            text=f"T{c.corner_number}",
            showarrow=False,
            font=dict(size=11, color="#A0A0A0"),
            row=1,
            col=1,
        )

    fig.update_layout(
        height=800,
        margin=dict(l=60, r=40, t=50, b=40),
        template="plotly_dark",
        hovermode="x unified",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
    )
    fig.update_xaxes(title_text="Distancia en pista (metros)", row=4, col=1)
    fig.update_yaxes(title_text="km/h", row=1, col=1)
    fig.update_yaxes(title_text="Segundos", row=2, col=1)
    fig.update_yaxes(title_text="%", range=[-5, 105], row=3, col=1)
    fig.update_yaxes(title_text="Marcha", dtick=1, row=4, col=1)

    return fig


def build_evolution_figure(sessions: List) -> Optional[go.Figure]:
    """Build line chart tracking driver best lap times and progression over sessions."""
    valid_sessions = [s for s in sessions if s.best_lap_time > 0]
    if not valid_sessions:
        return None
    # Sort chronologically
    sorted_sess = sorted(valid_sessions, key=lambda s: s.date)
    dates = [s.date.strftime("%d/%m %H:%M") for s in sorted_sess]
    best_laps = [s.best_lap_time for s in sorted_sess]
    labels = [f"{s.track} ({s.car})<br>Mejor: {format_lap_time(s.best_lap_time)}" for s in sorted_sess]

    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=dates,
            y=best_laps,
            mode="lines+markers",
            name="Mejor Vuelta",
            line=dict(color="#00CC96", width=2.5),
            marker=dict(size=8, color="#00CC96"),
            text=labels,
            hovertemplate="<b>%{x}</b><br>%{text}<extra></extra>",
        )
    )
    fig.update_layout(
        title="Evolución de Tiempos por Sesión",
        xaxis_title="Fecha / Sesión",
        yaxis_title="Tiempo (segundos)",
        template="plotly_dark",
        height=320,
        margin=dict(l=50, r=30, t=50, b=40),
    )
    return fig


def build_track_map_figure(aligned_data: Dict[str, np.ndarray], corners: List[CornerAnalysis]) -> go.Figure:
    """Generate 2D track map with corner annotations and speed delta heatmap."""
    dist = aligned_data["distance"]
    ref_sp = aligned_data["ref_speed"]
    delta_sp = aligned_data["speed_delta"]

    # Calculate track layout from lateral acceleration or steering angle
    v = np.maximum(ref_sp / 3.6, 2.0)
    lat_acc = aligned_data.get("ref_lat_accel", np.zeros_like(v)) * 9.81

    ds = np.diff(dist, prepend=dist[0])
    dt = ds / v
    yaw_rate = lat_acc / v
    heading = np.cumsum(yaw_rate * dt)

    dx = v * np.cos(heading) * dt
    dy = v * np.sin(heading) * dt
    x = np.cumsum(dx)
    y = np.cumsum(dy)

    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=x,
            y=y,
            mode="lines+markers",
            name="Trazada",
            line=dict(color="#444444", width=3),
            marker=dict(
                color=delta_sp,
                colorscale="RdYlGn",
                size=5,
                colorbar=dict(title="Δ Vel (km/h)", len=0.8),
            ),
            text=[f"Dist: {d:.0f}m<br>V_ref: {sp:.1f} km/h<br>ΔV: {dsp:+.1f} km/h" for d, sp, dsp in zip(dist, ref_sp, delta_sp)],
            hovertemplate="%{text}<extra></extra>",
        )
    )

    for c in corners:
        mid_d = (c.start_dist + c.end_dist) / 2.0
        idx = int(np.argmin(np.abs(dist - mid_d)))
        fig.add_trace(
            go.Scatter(
                x=[x[idx]],
                y=[y[idx]],
                mode="markers+text",
                name=f"T{c.corner_number}",
                marker=dict(size=9, color="#FF8A00"),
                text=[f"T{c.corner_number}"],
                textposition="top center",
                hovertemplate=f"<b>T{c.corner_number} — {c.corner_name}</b><br>Vmin Ref: {c.ref_min_speed} km/h<br>Vmin Comp: {c.comp_min_speed} km/h<br>Δt: {c.time_delta_corner:+.3f}s<extra></extra>",
                showlegend=False,
            )
        )

    fig.update_layout(
        title="Mapa de Pista 2D — Trazada y Diferencia de Velocidad",
        template="plotly_dark",
        height=450,
        margin=dict(l=30, r=30, t=50, b=30),
        xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
        yaxis=dict(showgrid=False, zeroline=False, showticklabels=False, scaleanchor="x", scaleratio=1),
    )
    return fig

