"""
ACC Coach — Local driving coach and telemetry analysis for Assetto Corsa Competizione (ACC).
Streamlit Application Entrypoint.
"""

from datetime import datetime
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
from importers.moteclib.importer import MoTeCImporter
from importers.synthetic import create_synthetic_session
from storage.database import Storage
from ui.components import build_detailed_telemetry_figure, format_lap_time

st.set_page_config(
    page_title="ACC Coach",
    page_icon="🏎️",
    layout="wide",
    initial_sidebar_state="expanded",
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
    st.sidebar.title("🏎️ ACC Coach")
    st.sidebar.caption("Assetto Corsa Competizione — Entrenador Local")

    page = st.sidebar.radio(
        "Navegación",
        [
            "📊 Dashboard",
            "📥 Importar sesión",
            "⏱️ Vueltas",
            "📈 Comparador",
            "🧠 Entrenador",
            "⚙️ Configuración",
        ],
    )

    st.sidebar.divider()
    ollama_ok = ollama_client.is_available()
    if ollama_ok:
        st.sidebar.success(f"🟢 Ollama Conectado\nModelo: {st.session_state['ollama_model']}")
    else:
        st.sidebar.warning("🟡 Ollama no disponible\n(Usando motor analítico)")

    # -------------------------------------------------------------
    # PAGE 1: DASHBOARD
    # -------------------------------------------------------------
    if page == "📊 Dashboard":
        st.title("📊 Panel de Control y Evolución")
        st.write("Bienvenido a **ACC Coach**, tu entrenador personal para Assetto Corsa Competizione.")

        sessions = storage.list_sessions()

        c1, c2, c3, c4 = st.columns(4)
        total_sessions = len(sessions)
        total_laps = sum(s.lap_count for s in sessions)
        all_bests = [s.best_lap_time for s in sessions if s.best_lap_time > 0]
        overall_best = min(all_bests) if all_bests else None
        tracks = len(set(s.track for s in sessions))

        c1.metric("Sesiones Guardadas", total_sessions)
        c2.metric("Total de Vueltas", total_laps)
        c3.metric("Mejor Vuelta Global", format_lap_time(overall_best))
        c4.metric("Circuitos Registrados", tracks)

        st.divider()

        if not sessions:
            st.info("Aún no tienes sesiones importadas. Puedes cargar una sesión sintética de demostración para probar la aplicación de inmediato.")
            if st.button("🚀 Cargar Sesión de Demostración (Valencia + Porsche 992 GT3 R)"):
                with st.spinner("Generando datos sintéticos de alta fidelidad..."):
                    demo_sess = create_synthetic_session()
                    storage.save_session(demo_sess)
                    st.success("¡Sesión sintética cargada con éxito! Ya puedes explorar el Comparador y el Entrenador.")
                    st.rerun()
        else:
            st.subheader("Historial Reciente de Sesiones")

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
                    "ID Sesión": s.session_id,
                    "Coche": s.car,
                    "Circuito": s.track,
                    "Fecha": s.date.strftime("%d/%m/%Y %H:%M"),
                    "Vueltas": s.lap_count,
                    "Mejor Tiempo": format_lap_time(s.best_lap_time),
                    "Vel. Media": f"{s.average_speed:.1f} km/h" if s.average_speed > 0 else "--",
                })

            st.dataframe(pd.DataFrame(table_data), use_container_width=True)

            if st.button("➕ Añadir otra sesión sintética de demostración"):
                demo_sess = create_synthetic_session()
                demo_sess.session_id = f"synth_{datetime.now().strftime('%H%M%S')}"
                storage.save_session(demo_sess)
                st.success("Sesión demo agregada.")
                st.rerun()

    # -------------------------------------------------------------
    # PAGE 2: IMPORTAR SESIÓN
    # -------------------------------------------------------------
    elif page == "📥 Importar sesión":
        st.title("📥 Importar Telemetría de Sesión")
        st.write("Sube los archivos generados por ACC o MoTeC i2 (.ld, .ldx, .csv).")

        st.info("💡 En ACC, activa la telemetría en el setup del coche (pestaña Electrónica > Laps of telemetry > 99). "
                "Los archivos se guardan en tu carpeta de usuario de ACC / MoTeC.")

        uploaded_files = st.file_uploader(
            "Selecciona archivo(s) de telemetría",
            type=["ld", "ldx", "csv"],
            accept_multiple_files=True,
            help="Sube un archivo .ld con su .ldx opcional, o un archivo CSV con telemetría exportada.",
        )

        car_input = st.text_input("Coche (opcional si viene en el archivo)", value="Porsche 911 GT3 R (992)")
        track_input = st.text_input("Circuito (opcional si viene en el archivo)", value="Ricardo Tormo de Valencia")

        if uploaded_files:
            # Check maximum file size for security (< 50MB per file)
            max_size_bytes = 50 * 1024 * 1024
            for f in uploaded_files:
                if f.size > max_size_bytes:
                    st.error(f"El archivo {f.name} excede el límite máximo permitido de 50 MB.")
                    return

            if st.button("Procesar e Importar"):
                with st.spinner("Procesando y validando archivos..."):
                    # Save to secure temporary directory
                    with tempfile.TemporaryDirectory() as tmp_dir:
                        saved_paths = []
                        for uf in uploaded_files:
                            safe_name = os.path.basename(uf.name)
                            target_p = os.path.join(tmp_dir, safe_name)
                            with open(target_p, "wb") as out:
                                out.write(uf.getbuffer())
                            saved_paths.append(target_p)

                        # Locate .ld or .csv
                        ld_file = next((p for p in saved_paths if p.lower().endswith(".ld")), None)
                        csv_file = next((p for p in saved_paths if p.lower().endswith(".csv")), None)

                        parsed_session = None
                        if ld_file:
                            importer = MoTeCImporter(ld_file)
                            parsed_session = importer.parse()
                        elif csv_file:
                            importer = CSVImporter(csv_file, car=car_input, track=track_input)
                            parsed_session = importer.parse()
                        else:
                            st.error("No se encontró ningún archivo .ld o .csv principal.")
                            return

                        if parsed_session:
                            if car_input:
                                parsed_session.car = car_input
                            if track_input:
                                parsed_session.track = track_input

                            storage.save_session(parsed_session)
                            st.success(f"¡Sesión '{parsed_session.session_id}' importada y guardada correctamente!")
                            st.write(f"- **Vueltas detectadas:** {len(parsed_session.laps)}")
                            st.write(f"- **Canales cargados:** {', '.join(parsed_session.telemetry.keys())}")

    # -------------------------------------------------------------
    # PAGE 3: VUELTAS
    # -------------------------------------------------------------
    elif page == "⏱️ Vueltas":
        st.title("⏱️ Registro y Metadatos de Vueltas")

        sessions = storage.list_sessions()
        if not sessions:
            st.warning("No hay sesiones disponibles. Importa una sesión o carga datos sintéticos en el Dashboard.")
            return

        session_opts = {f"{s.session_id} ({s.track} — {s.date.strftime('%d/%m/%Y %H:%M')})": s.id for s in sessions}
        selected_label = st.selectbox("Selecciona Sesión", list(session_opts.keys()))
        selected_sess_id = session_opts[selected_label]

        session = storage.get_session(selected_sess_id)
        if not session or not session.laps:
            st.info("Esta sesión no contiene vueltas segmentadas registradas.")
            return

        st.subheader(f"Vueltas registradas — {session.car} en {session.track}")

        valid_times = [l.lap_time for l in session.laps if l.is_valid and l.lap_time > 0]
        best_time = min(valid_times) if valid_times else 0.0

        table_rows = []
        for lap in session.laps:
            is_best = lap.lap_time == best_time and best_time > 0
            sectors = lap.sector_times
            s1_str = f"{sectors[0]:.3f}" if len(sectors) > 0 else "--"
            s2_str = f"{sectors[1]:.3f}" if len(sectors) > 1 else "--"
            s3_str = f"{sectors[2]:.3f}" if len(sectors) > 2 else "--"

            table_rows.append({
                "Vuelta": f"V{lap.lap_number}",
                "Tiempo Vuelta": format_lap_time(lap.lap_time),
                "Sector 1 (s)": s1_str,
                "Sector 2 (s)": s2_str,
                "Sector 3 (s)": s3_str,
                "Válida": "✅ Sí" if lap.is_valid else "❌ No",
                "Destacado": "⭐ MEJOR VUELTA" if is_best else "",
            })

        st.dataframe(pd.DataFrame(table_rows), use_container_width=True)

    # -------------------------------------------------------------
    # PAGE 4: COMPARADOR
    # -------------------------------------------------------------
    elif page == "📈 Comparador":
        st.title("📈 Comparador de Telemetría Sincronizada")

        sessions = storage.list_sessions()
        if not sessions:
            st.warning("No hay sesiones disponibles. Carga datos en el Dashboard para comenzar.")
            return

        session_opts = {f"{s.session_id} ({s.track})": s.id for s in sessions}
        selected_sess_id = session_opts[st.selectbox("Selecciona Sesión", list(session_opts.keys()))]
        session = storage.get_session(selected_sess_id)

        if not session or len(session.laps) < 2:
            st.warning("Se requieren al menos 2 vueltas con telemetría en la sesión para realizar la comparación.")
            return

        laps_dict = {f"Vuelta {l.lap_number} ({format_lap_time(l.lap_time)})": l for l in session.laps}
        keys = list(laps_dict.keys())

        # Select laps
        c_lap1, c_lap2 = st.columns(2)
        ref_key = c_lap1.selectbox("Vuelta de Referencia (Base)", keys, index=1 if len(keys) > 1 else 0)
        comp_key = c_lap2.selectbox("Vuelta de Comparación (A Analizar)", keys, index=min(2, len(keys) - 1))

        ref_lap = laps_dict[ref_key]
        comp_lap = laps_dict[comp_key]

        if ref_lap.lap_number == comp_lap.lap_number:
            st.warning("Selecciona dos vueltas distintas para comparar.")
            return

        with st.spinner("Alineando telemetría por distancia y calculando deltas..."):
            comparison = compare_laps(ref_lap, comp_lap)

        # Delta Summary KPI
        k1, k2, k3, k4 = st.columns(4)
        delta_color = "inverse" if comparison.time_difference > 0 else "normal"
        k1.metric("Diferencia Total", f"{comparison.time_difference:+.3f} s", delta=f"{comparison.time_difference:+.3f}s", delta_color=delta_color)

        s_diffs = comparison.sector_differences
        k2.metric("Sector 1 Δ", f"{s_diffs.get('sector1', 0.0):+.3f} s")
        k3.metric("Sector 2 Δ", f"{s_diffs.get('sector2', 0.0):+.3f} s")
        k4.metric("Sector 3 Δ", f"{s_diffs.get('sector3', 0.0):+.3f} s")

        st.subheader("Gráficas Sincronizadas por Distancia")
        aligned_data = align_laps_by_distance(ref_lap.telemetry, comp_lap.telemetry)
        fig = build_detailed_telemetry_figure(
            aligned_data,
            ref_lap.lap_number,
            comp_lap.lap_number,
            comparison.corners,
        )
        st.plotly_chart(fig, use_container_width=True)

        st.subheader("Desglose Técnico por Viraje")
        corner_data = []
        for c in comparison.corners:
            corner_data.append({
                "Curva": f"T{c.corner_number} — {c.corner_name}",
                "Vmin Ref (km/h)": c.ref_min_speed,
                "Vmin Comp (km/h)": c.comp_min_speed,
                "Delta Vmin (km/h)": f"{c.speed_delta_min:+.1f}",
                "Delta Tiempo (s)": f"{c.time_delta_corner:+.3f}",
                "Frenada (m)": f"{c.brake_delta_dist:+.1f}m" if c.brake_delta_dist is not None else "--",
                "Diagnóstico Técnico": c.diagnosis,
            })
        st.dataframe(pd.DataFrame(corner_data), use_container_width=True)

    # -------------------------------------------------------------
    # PAGE 5: ENTRENADOR (AI COACH)
    # -------------------------------------------------------------
    elif page == "🧠 Entrenador":
        st.title("🧠 Entrenador de Conducción — Asistente de Pista")
        st.write("Genera recomendaciones técnicas fundamentadas exclusivamente en métricas de telemetría.")

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

        if st.button("🚀 Generar Informe de Conducción", type="primary"):
            with st.spinner("Analizando telemetría y redactando recomendaciones técnicas..."):
                comparison = compare_laps(ref_lap, comp_lap)
                report = advisor.generate_report(comparison, car=session.car, track=session.track)

                # Persist report
                storage.save_coach_report(session.id, ref_lap.lap_number, comp_lap.lap_number, report)

                st.markdown(report.raw_report)

                st.download_button(
                    label="💾 Descargar Informe en Markdown",
                    data=report.raw_report,
                    file_name=f"informe_coach_v{comp_lap.lap_number}_vs_v{ref_lap.lap_number}.md",
                    mime="text/markdown",
                )

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
            st.success(f"Conexión con Ollama establecida en {new_url}. {len(available_models)} modelos disponibles:")
            current_model_idx = available_models.index(st.session_state["ollama_model"]) if st.session_state["ollama_model"] in available_models else 0
            selected_model = st.selectbox("Modelo de Ollama Seleccionado", available_models, index=current_model_idx)
        else:
            st.warning("No se pudo conectar a Ollama o no hay modelos instalados. Puedes especificar el nombre manualmente:")
            selected_model = st.text_input("Nombre del Modelo", value=st.session_state["ollama_model"])

        if st.button("Guardar Preferencias"):
            st.session_state["ollama_url"] = new_url
            st.session_state["ollama_model"] = selected_model
            st.session_state["ai_enabled"] = new_ai_enabled
            st.session_state["ollama_timeout"] = float(new_timeout)
            st.success("Configuración guardada correctamente.")
            st.rerun()

        st.divider()
        st.subheader("Almacenamiento Local (SQLite)")
        st.write(f"**Ruta de la base de datos:** `{storage.db_path}`")
        if st.button("🗑️ Purgar base de datos (Reiniciar datos)"):
            if os.path.exists(storage.db_path):
                os.remove(storage.db_path)
                storage.init_db()
                st.success("Base de datos reiniciada.")
                st.rerun()


if __name__ == "__main__":
    main()
