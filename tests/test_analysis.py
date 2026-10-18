import numpy as np
from analysis.alignment import align_laps_by_distance
from analysis.corners import analyze_corner, extract_corners_analysis
from analysis.lap_comparison import compare_laps
from domain.session import Lap
from importers.synthetic import create_synthetic_session, generate_lap_telemetry


def test_align_laps_by_distance():
    ref = generate_lap_telemetry(is_reference=True)
    comp = generate_lap_telemetry(is_reference=False)

    ref_dict = {k: v.tolist() for k, v in ref.items()}
    comp_dict = {k: v.tolist() for k, v in comp.items()}

    aligned = align_laps_by_distance(ref_dict, comp_dict, step_m=2.0)

    assert "distance" in aligned
    assert "ref_speed" in aligned
    assert "comp_speed" in aligned
    assert "time_delta" in aligned
    assert len(aligned["distance"]) > 1000

    # In comparison lap, it should accumulate positive time delta (slower)
    final_delta = aligned["time_delta"][-1]
    assert final_delta > 0.5


def test_corner_analysis():
    ref = generate_lap_telemetry(is_reference=True)
    comp = generate_lap_telemetry(is_reference=False)

    ref_dict = {k: v.tolist() for k, v in ref.items()}
    comp_dict = {k: v.tolist() for k, v in comp.items()}

    aligned = align_laps_by_distance(ref_dict, comp_dict, step_m=2.0)
    corners = extract_corners_analysis(aligned)

    assert len(corners) >= 6
    # Check Turn 1 (Aspar)
    t1 = next(c for c in corners if c.corner_number == 1)
    assert t1.ref_min_speed > 135.0
    assert t1.comp_min_speed < 135.0
    assert t1.speed_delta_min > 5.0
    assert "Frenada anticipada" in t1.diagnosis or "Exceso de reducción" in t1.diagnosis


def test_compare_laps_full():
    session = create_synthetic_session()
    ref_lap = session.laps[1]   # Reference lap
    comp_lap = session.laps[2]  # Comparison lap

    comp = compare_laps(ref_lap, comp_lap)
    assert comp.time_difference > 0.0
    assert len(comp.corners) > 0
    assert comp.aligned_distance is not None
    assert comp.time_delta_profile is not None


def test_ui_figures_generation():
    from ui.components import build_evolution_figure, build_track_map_figure
    from storage.database import Storage
    import tempfile
    import os

    session = create_synthetic_session()
    with tempfile.TemporaryDirectory() as tmpdir:
        st = Storage(os.path.join(tmpdir, "test.db"))
        st.save_session(session)
        summaries = st.list_sessions()
        fig_evo = build_evolution_figure(summaries)
        assert fig_evo is not None

    aligned = align_laps_by_distance(session.laps[1].telemetry, session.laps[2].telemetry)
    corners = extract_corners_analysis(aligned)
    fig_map = build_track_map_figure(aligned, corners)
    assert fig_map is not None

