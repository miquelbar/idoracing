"""
IdoRacing Analytics — Local Driving Coach & Telemetry Suite for Sim Racing (ACC, LMU, iRacing).
Streamlit Application Entrypoint.
"""

from datetime import datetime
import glob
import os
import tempfile
import pandas as pd
import streamlit as st

from analysis.alignment import align_laps_by_distance
from analysis.corners import extract_corners_analysis
from analysis.lap_comparison import compare_laps
from coach.advisor import CoachAdvisor
from coach.ollama_client import OllamaClient
from domain.session import Session
from importers.csv_importer import CSVImporter
from importers.lmu_importer import LMUImporter
from importers.moteclib.importer import MoTeCImporter
from importers.synthetic import create_synthetic_session
from storage.database import Storage
from ui.components import (
    build_evolution_figure,
    build_f1_telemetry_stack,
    build_f1_track_map,
    format_delta,
    format_lap_time,
)

st.set_page_config(
    page_title="IdoRacing Analytics — Telemetry Suite",
    page_icon="🏎️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Custom Motorsport-Grade Dark CSS
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Titillium+Web:wght@300;400;600;700;900&family=JetBrains+Mono:wght@400;700&display=swap');

    html, body, [class*="css"] {
        font-family: 'Titillium Web', sans-serif;
    }

    .racing-card {
        background: linear-gradient(135deg, #161B22 0%, #0D1117 100%);
        border: 1px solid #30363D;
        border-radius: 8px;
        padding: 16px 20px;
        margin-bottom: 14px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }

    .racing-badge-purple {
        background-color: #8A2BE2;
        color: white;
        padding: 3px 8px;
        border-radius: 4px;
        font-weight: 700;
        font-family: 'JetBrains Mono', monospace;
    }

    .racing-badge-green {
        background-color: #00D2BE;
        color: #000;
        padding: 3px 8px;
        border-radius: 4px;
        font-weight: 700;
        font-family: 'JetBrains Mono', monospace;
    }

    .racing-badge-yellow {
        background-color: #FFD700;
        color: #000;
        padding: 3px 8px;
        border-radius: 4px;
        font-weight: 700;
        font-family: 'JetBrains Mono', monospace;
    }

    .racing-badge-red {
        background-color: #FF1801;
        color: white;
        padding: 3px 8px;
        border-radius: 4px;
        font-weight: 700;
        font-family: 'JetBrains Mono', monospace;
    }

    .racing-metric-val {
        font-family: 'JetBrains Mono', monospace;
        font-size: 24px;
        font-weight: 700;
    }
</style>
""", unsafe_allow_html=True)

# Detected Linux Steam telemetry paths for ACC and Le Mans Ultimate (LMU)
DEFAULT_ACC_MOTEC_DIR = os.path.expanduser(
    "~/.local/share/Steam/steamapps/compatdata/805550/pfx/drive_c/users/steamuser/Documents/Assetto Corsa Competizione/MoTeC"
)
DEFAULT_LMU_RESULTS_DIR = os.path.expanduser(
    "~/.local/share/Steam/steamapps/common/Le Mans Ultimate/UserData/Log/Results"
)
DEFAULT_LMU_TELEMETRY_DIR = os.path.expanduser(
    "~/.local/share/Steam/steamapps/common/Le Mans Ultimate/UserData/Telemetry"
)

# Initialize Storage & Session State
storage = Storage()

if "ollama_url" not in st.session_state:
    st.session_state["ollama_url"] = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
if "ollama_model" not in st.session_state:
    st.session_state["ollama_model"] = os.environ.get("OLLAMA_MODEL", "qwen3:14b")
if "ai_enabled" not in st.session_state:
    st.session_state["ai_enabled"] = os.environ.get("AI_ENABLED", "true").lower() in ("true", "1", "yes")
if "ollama_timeout" not in st.session_state:
    st.session_state["ollama_timeout"] = float(os.environ.get("OLLAMA_TIMEOUT", "45.0"))

ollama_client = OllamaClient(
    base_url=st.session_state["ollama_url"],
    model=st.session_state["ollama_model"],
    timeout=st.session_state["ollama_timeout"],
    enabled=st.session_state["ai_enabled"],
)
advisor = CoachAdvisor(ollama_client)


def main():
    st.sidebar.markdown("## 🏎️ IDORACING ANALYTICS")
    st.sidebar.caption("Universal SimRacing Telemetry Suite  \n*(ACC • Le Mans Ultimate • iRacing)*")

    page = st.sidebar.radio(
        "Navegación",
        [
            "📊 Dashboard & Evolución",
            "📈 Comparador (Mapa & Tiempos)",
            "🧠 Ingeniero de Pista (IA)",
            "📥 Importar Telemetría",
            "⏱️ Historial de Vueltas",
            "⚙️ Configuración",
        ],
    )

    st.sidebar.divider()
    ollama_ok = ollama_client.is_available()
    if ollama_ok:
        st.sidebar.markdown(f"🟢 **Ollama Activo**  \n`{st.session_state['ollama_model']}`")
    else:
        st.sidebar.markdown("🟡 **Modo Analítico Local**  \n*(Reglas numéricas activas)*")

    # -------------------------------------------------------------
    # PAGE 1: DASHBOARD & EVOLUCIÓN
    # -------------------------------------------------------------
    if page == "📊 Dashboard & Evolución":
        st.title("📊 Panel de Control y Evolución del Piloto")

        sessions = storage.list_sessions()

        c1, c2, c3, c4 = st.columns(4)
        total_sessions = len(sessions)
        total_laps = sum(s.lap_count for s in sessions)
        all_bests = [s.best_lap_time for s in sessions if s.best_lap_time > 0]
        overall_best = min(all_bests) if all_bests else None
        tracks = len(set(s.track for s in sessions))

        c1.metric("Sesiones Grabadas", total_sessions)
        c2.metric("Total de Vueltas", total_laps)
        c3.metric("Récord Personal", format_lap_time(overall_best))
        c4.metric("Circuitos", tracks)

        st.divider()

        if not sessions:
            st.info("No hay sesiones importadas. Carga una sesión sintética de demostración con telemetría de competición:")
            if st.button("🚀 Cargar Telemetría Demo (Porsche 992 GT3 R en Valencia)"):
                with st.spinner("Generando telemetría multicanal de alta precisión..."):
                    demo_sess = create_synthetic_session()
                    storage.save_session(demo_sess)
                    st.success("¡Sesión cargada! Explora ahora el Comparador de Telemetría.")
                    st.rerun()
        else:
            # Progression chart
            evo_fig = build_evolution_figure(sessions)
            if evo_fig:
                st.plotly_chart(evo_fig, use_container_width=True)

            st.subheader("Historial de Tandas y Sesiones")
            col_f1, col_f2 = st.columns(2)
            cars_list = sorted(list(set(s.car for s in sessions)))
            tracks_list = sorted(list(set(s.track for s in sessions)))

            selected_car = col_f1.selectbox("Filtrar por Coche", ["Todos"] + cars_list)
            selected_track = col_f2.selectbox("Filtrar por Circuito", ["Todos"] + tracks_list)

            filtered = sessions
            if selected_car != "Todos":
                filtered = [s for s in filtered if s.car == selected_car]
            if selected_track != "Todos":
                filtered = [s for s in filtered if s.track == selected_track]

            table_data = []
            for s in filtered:
                table_data.append({
                    "Sesión": s.session_id,
                    "Coche": s.car,
                    "Circuito": s.track,
                    "Fecha": s.date.strftime("%d/%m/%Y %H:%M"),
                    "Vueltas": s.lap_count,
                    "Mejor Vuelta": format_lap_time(s.best_lap_time),
                    "Vel. Promedio": f"{s.average_speed:.1f} km/h" if s.average_speed > 0 else "--",
                })
            st.dataframe(pd.DataFrame(table_data), use_container_width=True)

            if st.button("➕ Añadir otra tanda sintética para ver evolución"):
                demo_sess = create_synthetic_session()
                demo_sess.session_id = f"synth_{datetime.now().strftime('%H%M%S')}"
                storage.save_session(demo_sess)
                st.rerun()

    # -------------------------------------------------------------
    # PAGE 2: COMPARADOR (MAPA Y TIEMPOS SUPERPUESTOS)
    # -------------------------------------------------------------
    elif page == "📈 Comparador (Mapa & Tiempos)":
        st.title("📈 Telemetría de Competición — Overlay Suite")

        sessions = storage.list_sessions()
        if not sessions:
            st.warning("No hay sesiones disponibles. Carga datos en el Dashboard para comenzar.")
            return

        session_opts = {f"{s.session_id} ({s.track})": s.id for s in sessions}
        selected_sess_id = session_opts[st.selectbox("Selecciona Sesión", list(session_opts.keys()))]
        session = storage.get_session(selected_sess_id)

        if not session or len(session.laps) < 2:
            st.warning("Se requieren al menos 2 vueltas con telemetría en la sesión.")
            return

        laps_dict = {f"Vuelta {l.lap_number} ({format_lap_time(l.lap_time)})": l for l in session.laps}
        keys = list(laps_dict.keys())

        # Lap Selector Banner
        c_lap1, c_lap2 = st.columns(2)
        ref_key = c_lap1.selectbox("Vuelta de Referencia (Objetivo)", keys, index=1 if len(keys) > 1 else 0)
        comp_key = c_lap2.selectbox("Vuelta del Piloto (A Comparar)", keys, index=min(2, len(keys) - 1))

        ref_lap = laps_dict[ref_key]
        comp_lap = laps_dict[comp_key]

        if ref_lap.lap_number == comp_lap.lap_number:
            st.warning("Selecciona dos vueltas distintas para comparar.")
            return

        with st.spinner("Procesando física, alineando por distancia e integrando delta..."):
            comparison = compare_laps(ref_lap, comp_lap)
            aligned_data = align_laps_by_distance(ref_lap.telemetry, comp_lap.telemetry)

        # ---------------------------------------------------------
        # TIMING TOWER HEADER (MICRO-SECTORES & DELTA GLOBAL)
        # ---------------------------------------------------------
        delta_str, delta_color = format_delta(comparison.time_difference)
        s_diffs = comparison.sector_differences

        st.markdown(f"""
        <div class="racing-card">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
                <div>
                    <span style="color: #718096; font-size: 13px; font-weight: 700; text-transform: uppercase;">Comparativa de Vuelta</span><br>
                    <span style="font-size: 20px; font-weight: 900;">V{comp_lap.lap_number} vs V{ref_lap.lap_number} (Ref)</span>
                    <span style="margin-left: 10px; color: #00E5FF; font-weight: 700;">{session.car}</span>
                    <span style="color: #718096;">@ {session.track}</span>
                </div>
                <div style="display: flex; gap: 20px; align-items: center;">
                    <div style="text-align: center;">
                        <span style="color: #718096; font-size: 11px;">SECTOR 1</span><br>
                        <span class="{ 'racing-badge-green' if s_diffs.get('sector1', 0) <= 0 else 'racing-badge-red' }">{s_diffs.get('sector1', 0.0):+.3f}s</span>
                    </div>
                    <div style="text-align: center;">
                        <span style="color: #718096; font-size: 11px;">SECTOR 2</span><br>
                        <span class="{ 'racing-badge-green' if s_diffs.get('sector2', 0) <= 0 else 'racing-badge-red' }">{s_diffs.get('sector2', 0.0):+.3f}s</span>
                    </div>
                    <div style="text-align: center;">
                        <span style="color: #718096; font-size: 11px;">SECTOR 3</span><br>
                        <span class="{ 'racing-badge-green' if s_diffs.get('sector3', 0) <= 0 else 'racing-badge-red' }">{s_diffs.get('sector3', 0.0):+.3f}s</span>
                    </div>
                    <div style="border-left: 1px solid #30363D; padding-left: 20px; text-align: right;">
                        <span style="color: #718096; font-size: 11px;">GAP TOTAL</span><br>
                        <span class="racing-metric-val" style="color: {delta_color};">{delta_str}</span>
                    </div>
                </div>
            </div>
        </div>
        """, unsafe_allow_html=True)

        # ---------------------------------------------------------
        # SEGMENT SELECTOR (VUELTA COMPLETA VS CADA CURVA)
        # ---------------------------------------------------------
        corner_options = ["🏁 Vuelta Completa (4.005 m)"] + [
            f"T{c.corner_number} — {c.corner_name} ({c.time_delta_corner:+.3f}s)" for c in comparison.corners
        ]
        selected_seg_label = st.selectbox("📍 Selector de Segmento / Viraje en Pista", corner_options, index=0)

        selected_corner_num = None
        zoom_range = None
        active_corner = None

        if selected_seg_label != "🏁 Vuelta Completa (4.005 m)":
            selected_corner_num = int(selected_seg_label.split(" — ")[0].replace("T", ""))
            active_corner = next((c for c in comparison.corners if c.corner_number == selected_corner_num), None)
            if active_corner:
                # Add 120m margin before and after for proper braking and exit straight context
                zoom_range = (
                    max(0.0, active_corner.start_dist - 120.0),
                    min(float(aligned_data["distance"][-1]), active_corner.end_dist + 160.0),
                )

        # ---------------------------------------------------------
        # SIDE-BY-SIDE: MAPA 2D & HUD TÉCNICO DE CURVA
        # ---------------------------------------------------------
        col_map, col_hud = st.columns([1.1, 0.9])

        with col_map:
            st.markdown("##### 🗺️ Trazada y Mapa de Calor de Velocidad")
            map_fig = build_f1_track_map(aligned_data, comparison.corners, selected_corner_num)
            st.plotly_chart(map_fig, use_container_width=True)

        with col_hud:
            st.markdown("##### 🏎️ HUD de Telemetría del Segmento")
            if active_corner:
                st.markdown(f"""
                <div class="racing-card" style="border-left: 4px solid #00E5FF;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:18px; font-weight:900;">T{active_corner.corner_number} — {active_corner.corner_name}</span>
                        <span class="{ 'racing-badge-green' if active_corner.time_delta_corner <= 0 else 'racing-badge-red' }" style="font-size:14px;">
                            {active_corner.time_delta_corner:+.3f}s
                        </span>
                    </div>
                    <hr style="border-color:#30363D; margin:10px 0;">
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                        <div>
                            <span style="color:#718096; font-size:11px;">🛑 FRENADA</span><br>
                            <span style="font-weight:700; font-size:15px; color:#FF9100;">
                                { f'{active_corner.brake_delta_dist:+.1f} m' if active_corner.brake_delta_dist is not None else 'N/D' }
                            </span><br>
                            <span style="font-size:11px; color:#A0AEC0;">
                                { 'Frenada anticipada' if (active_corner.brake_delta_dist and active_corner.brake_delta_dist < -5) else ('Frenada tardía' if (active_corner.brake_delta_dist and active_corner.brake_delta_dist > 5) else 'Punto similar') }
                            </span>
                        </div>
                        <div>
                            <span style="color:#718096; font-size:11px;">⚡ VEL. VÉRTICE (ÁPICE)</span><br>
                            <span style="font-weight:700; font-size:15px; color:#00E5FF;">
                                {active_corner.comp_min_speed:.1f} km/h
                            </span>
                            <span style="font-size:12px; color:{ '#FF3B30' if active_corner.speed_delta_min > 2 else '#34C759' };">
                                ({active_corner.speed_delta_min:+.1f} km/h)
                            </span><br>
                            <span style="font-size:11px; color:#A0AEC0;">Ref: {active_corner.ref_min_speed:.1f} km/h</span>
                        </div>
                        <div>
                            <span style="color:#718096; font-size:11px;">🚀 APLICACIÓN DE GAS</span><br>
                            <span style="font-weight:700; font-size:15px; color:#76FF03;">
                                { f'{active_corner.throttle_delta_dist:+.1f} m' if active_corner.throttle_delta_dist is not None else 'N/D' }
                            </span><br>
                            <span style="font-size:11px; color:#A0AEC0;">
                                { 'Retraso al acelerar' if (active_corner.throttle_delta_dist and active_corner.throttle_delta_dist > 8) else 'Tracción inmediata' }
                            </span>
                        </div>
                        <div>
                            <span style="color:#718096; font-size:11px;">🏁 TRAMO CURVA</span><br>
                            <span style="font-weight:700; font-size:15px; color:#E2E8F0;">
                                {active_corner.start_dist:.0f}m ➔ {active_corner.end_dist:.0f}m
                            </span><br>
                            <span style="font-size:11px; color:#A0AEC0;">Longitud: {active_corner.end_dist - active_corner.start_dist:.0f} m</span>
                        </div>
                    </div>
                    <hr style="border-color:#30363D; margin:10px 0;">
                    <div>
                        <span style="color:#00E5FF; font-size:11px; font-weight:700;">DICTAMEN TÉCNICO:</span><br>
                        <span style="font-size:13px; color:#E2E8F0;">{active_corner.diagnosis}</span>
                    </div>
                </div>
                """, unsafe_allow_html=True)
            else:
                # Full lap top losses
                st.markdown("""
                <div class="racing-card">
                    <span style="color:#718096; font-size:12px; font-weight:700; text-transform:uppercase;">Zonas con Mayor Pérdida de Tiempo</span>
                </div>
                """, unsafe_allow_html=True)
                top_losses = sorted(comparison.corners, key=lambda c: c.time_delta_corner, reverse=True)[:4]
                for c in top_losses:
                    delta_c_str, delta_c_col = format_delta(c.time_delta_corner)
                    st.markdown(f"""
                    <div style="background:#161B22; border:1px solid #30363D; border-radius:6px; padding:10px 14px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <span style="font-weight:700; color:#E2E8F0;">T{c.corner_number} — {c.corner_name}</span><br>
                            <span style="font-size:11px; color:#A0AEC0;">Vmin: {c.comp_min_speed:.1f} km/h (Ref: {c.ref_min_speed:.1f})</span>
                        </div>
                        <div style="text-align:right;">
                            <span style="font-family:'JetBrains Mono'; font-weight:700; color:{delta_c_col}; font-size:16px;">{delta_c_str}</span>
                        </div>
                    </div>
                    """, unsafe_allow_html=True)

        # ---------------------------------------------------------
        # SYNCHRONIZED TELEMETRY STACK
        # ---------------------------------------------------------
        st.markdown("##### 📉 Telemetría Multicanal Sincronizada")
        stack_fig = build_f1_telemetry_stack(
            aligned_data,
            ref_lap.lap_number,
            comp_lap.lap_number,
            comparison.corners,
            dist_range=zoom_range,
        )
        st.plotly_chart(stack_fig, use_container_width=True)

        # ---------------------------------------------------------
        # FULL CORNER MATRIX TABLE
        # ---------------------------------------------------------
        st.subheader("Matriz Detallada de Curvas (Ordenada por Pérdida de Tiempo)")
        sorted_corners = sorted(comparison.corners, key=lambda c: c.time_delta_corner, reverse=True)
        matrix_data = []
        for c in sorted_corners:
            matrix_data.append({
                "Curva": f"T{c.corner_number} — {c.corner_name}",
                "Pérdida/Ganancia": f"{c.time_delta_corner:+.3f} s",
                "Vmin Piloto (km/h)": f"{c.comp_min_speed:.1f}",
                "Vmin Ref (km/h)": f"{c.ref_min_speed:.1f}",
                "Δ Vértice": f"{c.speed_delta_min:+.1f} km/h",
                "Punto de Frenada": f"{c.brake_delta_dist:+.1f} m" if c.brake_delta_dist is not None else "--",
                "Tracción Gas": f"{c.throttle_delta_dist:+.1f} m" if c.throttle_delta_dist is not None else "--",
                "Diagnóstico": c.diagnosis,
            })
        st.dataframe(pd.DataFrame(matrix_data), use_container_width=True)

    # -------------------------------------------------------------
    # PAGE 3: INGENIERO DE PISTA (IA COACH)
    # -------------------------------------------------------------
    elif page == "🧠 Ingeniero de Pista (IA)":
        st.title("🧠 Ingeniero de Pista — Informe de Conducción")
        st.write("Debriefing técnico basado en los datos de telemetría calculados.")

        sessions = storage.list_sessions()
        if not sessions:
            st.warning("No hay sesiones disponibles. Carga datos en el Dashboard para comenzar.")
            return

        session_opts = {f"{s.session_id} ({s.track})": s.id for s in sessions}
        selected_sess_id = session_opts[st.selectbox("Selecciona Sesión a Analizar", list(session_opts.keys()))]
        session = storage.get_session(selected_sess_id)

        if not session or len(session.laps) < 2:
            st.warning("Se requieren al menos 2 vueltas con telemetría en la sesión.")
            return

        laps_dict = {f"Vuelta {l.lap_number} ({format_lap_time(l.lap_time)})": l for l in session.laps}
        keys = list(laps_dict.keys())

        c1, c2 = st.columns(2)
        ref_key = c1.selectbox("Vuelta de Referencia (Objetivo)", keys, index=1 if len(keys) > 1 else 0)
        comp_key = c2.selectbox("Vuelta del Piloto (A Mejorar)", keys, index=min(2, len(keys) - 1))

        ref_lap = laps_dict[ref_key]
        comp_lap = laps_dict[comp_key]

        if st.button("🚀 Generar Debriefing Técnico del Ingeniero", type="primary"):
            with st.spinner("Analizando telemetría y redactando recomendaciones técnicas con IA local..."):
                comparison = compare_laps(ref_lap, comp_lap)
                report = advisor.generate_report(comparison, car=session.car, track=session.track)

                storage.save_coach_report(session.id, ref_lap.lap_number, comp_lap.lap_number, report)

                st.markdown(report.raw_report)

                st.download_button(
                    label="💾 Descargar Informe en Markdown",
                    data=report.raw_report,
                    file_name=f"informe_ingeniero_v{comp_lap.lap_number}_vs_v{ref_lap.lap_number}.md",
                    mime="text/markdown",
                )

    # -------------------------------------------------------------
    # PAGE 4: IMPORTAR TELEMETRÍA
    # -------------------------------------------------------------
    elif page == "📥 Importar Telemetría":
        st.title("📥 Importar Telemetría Multisimulador")
        st.write("Importa sesiones y telemetría de **Assetto Corsa Competizione**, **Le Mans Ultimate**, **iRacing** u otros simuladores.")

        tab_acc, tab_lmu, tab_manual = st.tabs([
            "🏎️ Assetto Corsa Competizione (ACC)",
            "🏁 Le Mans Ultimate (LMU)",
            "📁 Carga Manual (MoTeC / CSV / iRacing)",
        ])

        with tab_acc:
            st.markdown("##### Detección de Telemetría MoTeC de ACC")
            acc_dir_exists = os.path.exists(DEFAULT_ACC_MOTEC_DIR)
            if acc_dir_exists:
                st.success(f"Carpeta de telemetría de ACC detectada:\n`{DEFAULT_ACC_MOTEC_DIR}`")
                ld_candidates = glob.glob(os.path.join(DEFAULT_ACC_MOTEC_DIR, "**", "*.ld"), recursive=True)
                if ld_candidates:
                    st.write(f"Se encontraron **{len(ld_candidates)}** archivos de telemetría:")
                    selected_ld = st.selectbox("Selecciona archivo de ACC a importar", ld_candidates, key="acc_ld_sel")
                    if st.button("Importar Telemetría Seleccionada de ACC", key="btn_acc_import"):
                        with st.spinner("Importando archivo de ACC..."):
                            importer = MoTeCImporter(selected_ld)
                            parsed = importer.parse()
                            storage.save_session(parsed)
                            st.success(f"¡Sesión '{parsed.session_id}' importada exitosamente desde ACC!")
                else:
                    st.info("No hay archivos `.ld` en la carpeta de MoTeC de ACC todavía. "
                            "Recuerda activar la opción en el setup de tu coche: **Electronics > Laps of telemetry > 99**.")
            else:
                st.warning("No se detectó la ruta por defecto de Steam Proton para ACC en este equipo.")

        with tab_lmu:
            st.markdown("##### Detección de Sesiones de Le Mans Ultimate")
            lmu_dir_exists = os.path.exists(DEFAULT_LMU_RESULTS_DIR)
            if lmu_dir_exists:
                st.success(f"Carpeta de resultados de LMU detectada:\n`{DEFAULT_LMU_RESULTS_DIR}`")
                lmu_xml_files = sorted(glob.glob(os.path.join(DEFAULT_LMU_RESULTS_DIR, "*.xml")), reverse=True)
                if lmu_xml_files:
                    st.write(f"Se encontraron **{len(lmu_xml_files)}** sesiones de Le Mans Ultimate:")
                    selected_lmu = st.selectbox("Selecciona sesión de LMU a importar", lmu_xml_files, key="lmu_sel")
                    if st.button("Importar Sesión de LMU", key="btn_lmu_import"):
                        with st.spinner("Importando sesión de Le Mans Ultimate..."):
                            importer = LMUImporter(selected_lmu)
                            parsed = importer.parse()
                            storage.save_session(parsed)
                            st.success(f"¡Sesión '{parsed.session_id}' de LMU importada con {len(parsed.laps)} vueltas!")
                else:
                    st.info("No hay archivos de resultados XML en la carpeta de LMU.")
            else:
                st.info("Ruta de Le Mans Ultimate no encontrada automáticamente.")

        with tab_manual:
            st.markdown("##### Subida de Archivos (.ld, .ldx, .csv)")
            uploaded_files = st.file_uploader(
                "Selecciona archivo(s) de telemetría",
                type=["ld", "ldx", "csv", "xml"],
                accept_multiple_files=True,
                key="manual_files",
            )

            col_c1, col_c2 = st.columns(2)
            car_input = col_c1.text_input("Vehículo (opcional)", value="Porsche 911 GT3 R (992)")
            track_input = col_c2.text_input("Circuito (opcional)", value="Ricardo Tormo de Valencia")

            if uploaded_files:
                max_size_bytes = 50 * 1024 * 1024
                for f in uploaded_files:
                    if f.size > max_size_bytes:
                        st.error(f"El archivo {f.name} excede el límite máximo permitido de 50 MB.")
                        return

                if st.button("Procesar e Importar Archivos", key="btn_manual_import"):
                    with st.spinner("Validando telemetría..."):
                        with tempfile.TemporaryDirectory() as tmp_dir:
                            saved_paths = []
                            for uf in uploaded_files:
                                safe_name = os.path.basename(uf.name)
                                target_p = os.path.join(tmp_dir, safe_name)
                                with open(target_p, "wb") as out:
                                    out.write(uf.getbuffer())
                                saved_paths.append(target_p)

                            ld_file = next((p for p in saved_paths if p.lower().endswith(".ld")), None)
                            csv_file = next((p for p in saved_paths if p.lower().endswith(".csv")), None)
                            xml_file = next((p for p in saved_paths if p.lower().endswith(".xml")), None)

                            parsed_session = None
                            if ld_file:
                                importer = MoTeCImporter(ld_file)
                                parsed_session = importer.parse()
                            elif xml_file:
                                importer = LMUImporter(xml_file)
                                parsed_session = importer.parse()
                            elif csv_file:
                                importer = CSVImporter(csv_file, car=car_input, track=track_input)
                                parsed_session = importer.parse()
                            else:
                                st.error("No se encontró ningún archivo .ld, .csv o .xml compatible.")
                                return

                            if parsed_session:
                                if car_input:
                                    parsed_session.car = car_input
                                if track_input:
                                    parsed_session.track = track_input

                                storage.save_session(parsed_session)
                                st.success(f"¡Sesión '{parsed_session.session_id}' guardada correctamente!")
                                st.write(f"- Vueltas registradas: {len(parsed_session.laps)}")
                                if parsed_session.telemetry:
                                    st.write(f"- Canales: {', '.join(parsed_session.telemetry.keys())}")

    # -------------------------------------------------------------
    # PAGE 5: HISTORIAL DE VUELTAS
    # -------------------------------------------------------------
    elif page == "⏱️ Historial de Vueltas":
        st.title("⏱️ Registro y Metadatos de Vueltas")

        sessions = storage.list_sessions()
        if not sessions:
            st.warning("No hay sesiones disponibles.")
            return

        session_opts = {f"{s.session_id} ({s.track})": s.id for s in sessions}
        selected_sess_id = session_opts[st.selectbox("Selecciona Sesión", list(session_opts.keys()))]
        session = storage.get_session(selected_sess_id)

        if not session or not session.laps:
            st.info("Esta sesión no contiene vueltas registradas.")
            return

        valid_times = [l.lap_time for l in session.laps if l.is_valid and l.lap_time > 0]
        best_time = min(valid_times) if valid_times else 0.0

        table_rows = []
        for lap in session.laps:
            is_best = lap.lap_time == best_time and best_time > 0
            sectors = lap.sector_times
            table_rows.append({
                "Vuelta": f"V{lap.lap_number}",
                "Tiempo Vuelta": format_lap_time(lap.lap_time),
                "Sector 1 (s)": f"{sectors[0]:.3f}" if len(sectors) > 0 else "--",
                "Sector 2 (s)": f"{sectors[1]:.3f}" if len(sectors) > 1 else "--",
                "Sector 3 (s)": f"{sectors[2]:.3f}" if len(sectors) > 2 else "--",
                "Válida": "✅ Sí" if lap.is_valid else "❌ No",
                "Destacado": "⭐ MEJOR VUELTA" if is_best else "",
            })
        st.dataframe(pd.DataFrame(table_rows), use_container_width=True)

    # -------------------------------------------------------------
    # PAGE 6: CONFIGURACIÓN
    # -------------------------------------------------------------
    elif page == "⚙️ Configuración":
        st.title("⚙️ Configuración del Sistema")

        st.subheader("Configuración de Ollama (IA Local)")
        new_url = st.text_input("URL Base de Ollama", value=st.session_state["ollama_url"])
        new_ai_enabled = st.checkbox("Habilitar Asistencia por IA", value=st.session_state["ai_enabled"])
        new_timeout = st.slider("Timeout de Respuesta (segundos)", min_value=10, max_value=120, value=int(st.session_state["ollama_timeout"]))

        temp_client = OllamaClient(base_url=new_url, timeout=5.0, enabled=new_ai_enabled)
        available_models = temp_client.list_models()

        if available_models:
            st.success(f"Conectado a Ollama ({len(available_models)} modelos disponibles):")
            current_model_idx = available_models.index(st.session_state["ollama_model"]) if st.session_state["ollama_model"] in available_models else 0
            selected_model = st.selectbox("Modelo de Ollama", available_models, index=current_model_idx)
        else:
            st.warning("No se pudo conectar a Ollama o no hay modelos instalados:")
            selected_model = st.text_input("Nombre del Modelo", value=st.session_state["ollama_model"])

        if st.button("Guardar Preferencias"):
            st.session_state["ollama_url"] = new_url
            st.session_state["ollama_model"] = selected_model
            st.session_state["ai_enabled"] = new_ai_enabled
            st.session_state["ollama_timeout"] = float(new_timeout)
            st.success("Configuración guardada correctamente.")
            st.rerun()

        st.divider()
        st.subheader("Entorno Local")
        st.write(f"- **Base de datos:** `{storage.db_path}`")
        st.write(f"- **Ruta MoTeC de ACC (Steam Proton):** `{DEFAULT_ACC_MOTEC_DIR}`")
        st.write(f"- **Ruta Resultados LMU:** `{DEFAULT_LMU_RESULTS_DIR}`")
        st.write(f"- **Ruta Telemetría LMU:** `{DEFAULT_LMU_TELEMETRY_DIR}`")

        if st.button("🗑️ Purgar base de datos"):
            if os.path.exists(storage.db_path):
                os.remove(storage.db_path)
                storage.init_db()
                st.success("Base de datos reiniciada.")
                st.rerun()


if __name__ == "__main__":
    main()
