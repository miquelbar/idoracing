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


def test_sebring_multitrack_corners_and_telemetry():
    from analysis.tracks import get_track_corners, get_track_length
    from analysis.telemetry_generator import generate_lap_telemetry_for_track

    corners = get_track_corners("Sebring International Raceway")
    assert len(corners) == 17
    assert corners[0]["name"] == "Turn 1 Sweeper"
    assert corners[16]["name"] == "Sunset Bend (T17)"

    track_len = get_track_length("Sebring International Raceway")
    assert track_len == 6019.0

    target_time = 118.350
    t_data = generate_lap_telemetry_for_track(
        track_name="Sebring International Raceway",
        target_lap_time=target_time,
        is_reference=True,
    )
    assert len(t_data["distance"]) > 2500
    assert abs(float(t_data["time"][-1]) - target_time) < 0.1
    assert float(t_data["distance"][-1]) >= 6000.0

    # Test corner analysis extraction on Sebring
    comp_t_data = generate_lap_telemetry_for_track(
        track_name="Sebring International Raceway",
        target_lap_time=120.100,
        is_reference=False,
    )
    ref_dict = {k: v.tolist() for k, v in t_data.items()}
    comp_dict = {k: v.tolist() for k, v in comp_t_data.items()}

    aligned = align_laps_by_distance(ref_dict, comp_dict, step_m=2.0)
    sebring_corners_analysis = extract_corners_analysis(aligned, track_name="Sebring International Raceway")
    assert len(sebring_corners_analysis) == 17
    assert sebring_corners_analysis[0].corner_number == 1
    assert sebring_corners_analysis[0].racing_line_svg is not None

    # Test verified track coordinates generation
    from analysis.tracks import generate_track_coordinates
    tx, ty = generate_track_coordinates("Sebring International Raceway", aligned["distance"])
    assert len(tx) == len(aligned["distance"])
    assert len(ty) == len(aligned["distance"])
    assert abs(tx[0] - tx[-1]) < 1e-4  # Closed loop
    assert abs(ty[0] - ty[-1]) < 1e-4  # Closed loop
    assert max(tx) - min(tx) > 500.0   # Real dimensions (span > 500m)



