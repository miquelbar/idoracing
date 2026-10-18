"""
Premium Motorsport Telemetry Visualizations for IdoRacing Analytics.
Provides interactive 2D track maps with speed delta heatmaps, synchronized telemetry stacks,
timing towers with micro-sectors, and corner-by-corner technical breakdowns.
"""

from typing import Dict, List, Optional, Tuple
import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from domain.session import CornerAnalysis, Lap, LapComparison


def format_lap_time(seconds: Optional[float]) -> str:
    """Format seconds into standard motorsport string m:ss.fff (e.g. 1:31.450)."""
    if seconds is None or seconds <= 0:
        return "--:--.---"
    mins = int(seconds // 60)
    secs = seconds % 60
    return f"{mins}:{secs:06.3f}"


def format_delta(delta: float) -> Tuple[str, str]:
    """Return formatted delta string and color class."""
    if abs(delta) < 0.001:
        return "±0.000s", "#A0AEC0"
    elif delta > 0:
        return f"+{delta:.3f}s", "#FF3B30"  # Red / slower
    else:
        return f"{delta:.3f}s", "#34C759"   # Green / faster


def build_telemetry_track_map(
    aligned_data: Dict[str, np.ndarray],
    corners: List[CornerAnalysis],
    selected_corner_num: Optional[int] = None,
) -> go.Figure:
    """
    Generate an interactive circuit track map ribbon colored by Speed Delta.
    Green = Comparison is faster; Red = Comparison is losing time / overslowing.
    Highlights selected corner with halo, apex marker, and braking zone.
    """
    dist = aligned_data["distance"]
    ref_sp = aligned_data["ref_speed"]
    comp_sp = aligned_data["comp_speed"]
    delta_sp = aligned_data["speed_delta"]

    # Integrate lateral acceleration & speed to get smooth 2D track coordinates
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

    # 1. Base track ribbon (outer curb & asphalt outline)
    fig.add_trace(
        go.Scatter(
            x=x,
            y=y,
            mode="lines",
            name="Asfalto",
            line=dict(color="#1A202C", width=14),
            hoverinfo="skip",
            showlegend=False,
        )
    )

    # 2. Speed Delta Heatmap on Racing Line
    # Delta: Positive means reference is faster (comp is slower -> Red)
    # Negative means comparison is faster -> Green
    hover_texts = [
        f"<b>Distancia:</b> {d:.0f}m<br>"
        f"<b>V. Referencia:</b> {rsp:.1f} km/h<br>"
        f"<b>V. Piloto:</b> {csp:.1f} km/h<br>"
        f"<b>Δ Velocidad:</b> {dsp:+.1f} km/h<br>"
        f"<b>Δ Tiempo acumulado:</b> {td:+.3f}s"
        for d, rsp, csp, dsp, td in zip(dist, ref_sp, comp_sp, delta_sp, aligned_data["time_delta"])
    ]

    fig.add_trace(
        go.Scatter(
            x=x,
            y=y,
            mode="lines+markers",
            name="Δ Velocidad",
            line=dict(color="#2D3748", width=4),
            marker=dict(
                size=6,
                color=delta_sp,
                colorscale=[
                    [0.0, "#00E676"],   # Bright Green (comp much faster)
                    [0.45, "#76FF03"],  # Lime
                    [0.5, "#E2E8F0"],   # Neutral white/grey (equal speed)
                    [0.55, "#FF9100"],  # Orange (comp slower)
                    [1.0, "#FF1744"],   # Red (comp significantly slower)
                ],
                cmin=-20.0,
                cmax=20.0,
                colorbar=dict(
                    title="Δ Vel (km/h)<br><span style='font-size:10px; color:#A0AEC0'>Verde=Rápido | Rojo=Lento</span>",
                    len=0.75,
                    thickness=14,
                    tickfont=dict(color="#E2E8F0"),
                ),
            ),
            text=hover_texts,
            hovertemplate="%{text}<extra></extra>",
            showlegend=False,
        )
    )

    # 3. Corner Pins & Badges
    for c in corners:
        mid_d = (c.start_dist + c.end_dist) / 2.0
        idx = int(np.argmin(np.abs(dist - mid_d)))
        is_selected = selected_corner_num == c.corner_number

        marker_size = 14 if is_selected else 8
        marker_color = "#00E5FF" if is_selected else "#FFA15A"

        corner_hover = (
            f"<b>T{c.corner_number} — {c.corner_name}</b><br>"
            f"<b>Pérdida en Curva:</b> {c.time_delta_corner:+.3f}s<br>"
            f"<b>V. Mínima Ref:</b> {c.ref_min_speed:.1f} km/h<br>"
            f"<b>V. Mínima Piloto:</b> {c.comp_min_speed:.1f} km/h<br>"
            f"<b>Δ Vértice:</b> {c.speed_delta_min:+.1f} km/h<br>"
            f"<i>{c.diagnosis}</i>"
        )

        fig.add_trace(
            go.Scatter(
                x=[x[idx]],
                y=[y[idx]],
                mode="markers+text",
                name=f"T{c.corner_number}",
                marker=dict(
                    size=marker_size,
                    color=marker_color,
                    line=dict(color="#FFFFFF", width=1.5 if is_selected else 0),
                ),
                text=[f"T{c.corner_number}"],
                textposition="top center",
                textfont=dict(
                    color="#00E5FF" if is_selected else "#E2E8F0",
                    size=12 if is_selected else 10,
                ),
                texttemplate="<b>T%{text}</b>" if is_selected else "T%{text}",
                hovertemplate=corner_hover + "<extra></extra>",
                showlegend=False,
            )
        )

    # 4. Highlight Selected Corner Halo & Entry/Apex/Exit flags
    if selected_corner_num:
        sel_c = next((c for c in corners if c.corner_number == selected_corner_num), None)
        if sel_c:
            c_mask = (dist >= sel_c.start_dist) & (dist <= sel_c.end_dist)
            if np.any(c_mask):
                fig.add_trace(
                    go.Scatter(
                        x=x[c_mask],
                        y=y[c_mask],
                        mode="lines",
                        name=f"Sector T{sel_c.corner_number}",
                        line=dict(color="#00E5FF", width=10),
                        opacity=0.45,
                        hoverinfo="skip",
                        showlegend=False,
                    )
                )

                # Apex Point Marker
                apex_idx = np.where(c_mask)[0][int(np.argmin(comp_sp[c_mask]))]
                fig.add_trace(
                    go.Scatter(
                        x=[x[apex_idx]],
                        y=[y[apex_idx]],
                        mode="markers+text",
                        name="Ápice",
                        marker=dict(symbol="cross", size=14, color="#FFEA00", line=dict(color="#000", width=1)),
                        text=["🎯 ÁPICE"],
                        textposition="bottom center",
                        textfont=dict(color="#FFEA00", size=11),
                        hovertemplate=f"<b>Ápice T{sel_c.corner_number}</b><br>Vmin: {comp_sp[apex_idx]:.1f} km/h<extra></extra>",
                        showlegend=False,
                    )
                )

    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor="rgba(14, 17, 23, 0.9)",
        plot_bgcolor="rgba(14, 17, 23, 0.9)",
        height=520,
        margin=dict(l=20, r=20, t=30, b=20),
        xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
        yaxis=dict(showgrid=False, zeroline=False, showticklabels=False, scaleanchor="x", scaleratio=1),
    )
    return fig


def build_telemetry_stack(
    aligned_data: Dict[str, np.ndarray],
    ref_lap_num: int,
    comp_lap_num: int,
    corners: List[CornerAnalysis],
    dist_range: Optional[Tuple[float, float]] = None,
) -> go.Figure:
    """
    Build synchronized multi-channel telemetry dashboard.
    Channels:
      1. Speed (km/h) with Apex Markers
      2. Time Delta (seconds) with Red/Green Filled Dynamic Area
      3. Pedals: Throttle & Brake (%) with Shaded Overlap
      4. Gear & RPM
    """
    dist = aligned_data["distance"]

    # Filter by distance range if zoomed into a segment
    if dist_range:
        mask = (dist >= dist_range[0]) & (dist <= dist_range[1])
        if np.any(mask):
            filtered_dist = dist[mask]
        else:
            mask = np.ones(len(dist), dtype=bool)
            filtered_dist = dist
    else:
        mask = np.ones(len(dist), dtype=bool)
        filtered_dist = dist

    fig = make_subplots(
        rows=4,
        cols=1,
        shared_xaxes=True,
        vertical_spacing=0.035,
        subplot_titles=(
            f"<b>VELOCIDAD</b> (km/h) — <span style='color:#00E5FF;'>Vuelta {ref_lap_num} (Ref)</span> vs <span style='color:#FF8A00;'>Vuelta {comp_lap_num} (Piloto)</span>",
            "<b>DELTA DE TIEMPO ACUMULADO Δt</b> (s) — <span style='color:#FF3B30;'>Rojo = Tiempo perdido</span> | <span style='color:#34C759;'>Verde = Ganado</span>",
            "<b>PEDALES: ACELERADOR & FRENO</b> (%) — <span style='color:#00E676;'>Gas</span> | <span style='color:#FF1744;'>Freno</span>",
            "<b>MARCHA ENGRANADA</b>",
        ),
        row_heights=[0.38, 0.24, 0.24, 0.14],
    )

    # -------------------------------------------------------------
    # ROW 1: SPEED
    # -------------------------------------------------------------
    fig.add_trace(
        go.Scatter(
            x=filtered_dist,
            y=aligned_data["ref_speed"][mask],
            mode="lines",
            name=f"V{ref_lap_num} Ref",
            line=dict(color="#00E5FF", width=2.5),
            hovertemplate="V_ref: %{y:.1f} km/h<extra></extra>",
        ),
        row=1,
        col=1,
    )
    fig.add_trace(
        go.Scatter(
            x=filtered_dist,
            y=aligned_data["comp_speed"][mask],
            mode="lines",
            name=f"V{comp_lap_num} Piloto",
            line=dict(color="#FF8A00", width=2.5),
            hovertemplate="V_comp: %{y:.1f} km/h<extra></extra>",
        ),
        row=1,
        col=1,
    )

    # -------------------------------------------------------------
    # ROW 2: TIME DELTA (Filled Area)
    # -------------------------------------------------------------
    t_delta = aligned_data["time_delta"][mask]
    fig.add_trace(
        go.Scatter(
            x=filtered_dist,
            y=t_delta,
            mode="lines",
            name="Δ Tiempo",
            line=dict(color="#FF1744" if (len(t_delta) and t_delta[-1] > 0) else "#00E676", width=2),
            fill="tozeroy",
            fillcolor="rgba(255, 23, 68, 0.15)" if (len(t_delta) and t_delta[-1] > 0) else "rgba(0, 230, 118, 0.15)",
            hovertemplate="Δt: %{y:+.3f}s<extra></extra>",
        ),
        row=2,
        col=1,
    )
    fig.add_hline(y=0.0, line_dash="dash", line_color="#718096", line_width=1, row=2, col=1)

    # -------------------------------------------------------------
    # ROW 3: THROTTLE & BRAKE
    # -------------------------------------------------------------
    # Throttle
    fig.add_trace(
        go.Scatter(
            x=filtered_dist,
            y=aligned_data["ref_throttle"][mask] * 100.0,
            mode="lines",
            name=f"Gas V{ref_lap_num}",
            line=dict(color="#00E676", width=2),
            fill="tozeroy",
            fillcolor="rgba(0, 230, 118, 0.12)",
            hovertemplate="Gas Ref: %{y:.0f}%<extra></extra>",
        ),
        row=3,
        col=1,
    )
    fig.add_trace(
        go.Scatter(
            x=filtered_dist,
            y=aligned_data["comp_throttle"][mask] * 100.0,
            mode="lines",
            name=f"Gas V{comp_lap_num}",
            line=dict(color="#76FF03", width=2, dash="dot"),
            hovertemplate="Gas Piloto: %{y:.0f}%<extra></extra>",
        ),
        row=3,
        col=1,
    )
    # Brake
    fig.add_trace(
        go.Scatter(
            x=filtered_dist,
            y=aligned_data["ref_brake"][mask] * 100.0,
            mode="lines",
            name=f"Freno V{ref_lap_num}",
            line=dict(color="#FF1744", width=2),
            fill="tozeroy",
            fillcolor="rgba(255, 23, 68, 0.20)",
            hovertemplate="Freno Ref: %{y:.0f}%<extra></extra>",
        ),
        row=3,
        col=1,
    )
    fig.add_trace(
        go.Scatter(
            x=filtered_dist,
            y=aligned_data["comp_brake"][mask] * 100.0,
            mode="lines",
            name=f"Freno V{comp_lap_num}",
            line=dict(color="#FF9100", width=2, dash="dot"),
            hovertemplate="Freno Piloto: %{y:.0f}%<extra></extra>",
        ),
        row=3,
        col=1,
    )

    # -------------------------------------------------------------
    # ROW 4: GEAR
    # -------------------------------------------------------------
    fig.add_trace(
        go.Scatter(
            x=filtered_dist,
            y=aligned_data["ref_gear"][mask],
            mode="lines",
            name=f"Marcha V{ref_lap_num}",
            line=dict(color="#00E5FF", width=2),
            hovertemplate="Marcha Ref: %{y:.0f}<extra></extra>",
        ),
        row=4,
        col=1,
    )
    fig.add_trace(
        go.Scatter(
            x=filtered_dist,
            y=aligned_data["comp_gear"][mask],
            mode="lines",
            name=f"Marcha V{comp_lap_num}",
            line=dict(color="#FF8A00", width=2, dash="dot"),
            hovertemplate="Marcha Piloto: %{y:.0f}<extra></extra>",
        ),
        row=4,
        col=1,
    )

    # Add corner boundary vertical bands
    for c in corners:
        # Check if corner is within the active view
        if dist_range:
            if c.end_dist < dist_range[0] or c.start_dist > dist_range[1]:
                continue
        fig.add_vrect(
            x0=c.start_dist,
            x1=c.end_dist,
            fillcolor="rgba(255, 255, 255, 0.03)",
            line_width=0,
            row="all",
            col=1,
        )
        mid_d = (c.start_dist + c.end_dist) / 2.0
        fig.add_annotation(
            x=mid_d,
            y=1.0,
            yref="y domain",
            text=f"<b>T{c.corner_number}</b>",
            showarrow=False,
            font=dict(size=11, color="#718096"),
            row=1,
            col=1,
        )

    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor="rgba(14, 17, 23, 0.9)",
        plot_bgcolor="rgba(14, 17, 23, 0.9)",
        height=820,
        margin=dict(l=60, r=30, t=50, b=40),
        hovermode="x unified",
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1,
            font=dict(size=11),
        ),
    )

    fig.update_xaxes(title_text="Distancia en Pista (metros)", row=4, col=1, gridcolor="#2D3748")
    fig.update_xaxes(gridcolor="#2D3748", row=1, col=1)
    fig.update_xaxes(gridcolor="#2D3748", row=2, col=1)
    fig.update_xaxes(gridcolor="#2D3748", row=3, col=1)

    fig.update_yaxes(title_text="km/h", row=1, col=1, gridcolor="#2D3748")
    fig.update_yaxes(title_text="Δt (s)", row=2, col=1, gridcolor="#2D3748")
    fig.update_yaxes(title_text="Pedal (%)", range=[-5, 105], row=3, col=1, gridcolor="#2D3748")
    fig.update_yaxes(title_text="Marcha", dtick=1, range=[0.5, 6.5], row=4, col=1, gridcolor="#2D3748")

    return fig


def build_evolution_figure(sessions: List) -> Optional[go.Figure]:
    """Build line chart tracking driver best lap times and progression over sessions."""
    valid_sessions = [s for s in sessions if s.best_lap_time > 0]
    if not valid_sessions:
        return None
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
            line=dict(color="#00E5FF", width=3),
            marker=dict(size=9, color="#00E5FF", line=dict(color="#FFFFFF", width=1.5)),
            text=labels,
            hovertemplate="<b>%{x}</b><br>%{text}<extra></extra>",
        )
    )
    fig.update_layout(
        title="<b>Evolución de Tiempos por Sesión (Progresión del Piloto)</b>",
        xaxis_title="Sesión / Fecha",
        yaxis_title="Tiempo de Vuelta (s)",
        template="plotly_dark",
        paper_bgcolor="rgba(14, 17, 23, 0.9)",
        plot_bgcolor="rgba(14, 17, 23, 0.9)",
        height=320,
        margin=dict(l=50, r=30, t=50, b=40),
        xaxis=dict(gridcolor="#2D3748"),
        yaxis=dict(gridcolor="#2D3748"),
    )
    return fig


# Backward compatibility aliases
build_detailed_telemetry_figure = build_telemetry_stack
build_track_map_figure = build_telemetry_track_map
build_f1_telemetry_stack = build_telemetry_stack
build_f1_track_map = build_telemetry_track_map
