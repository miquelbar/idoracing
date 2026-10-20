import numpy as np

from analysis.alignment import align_laps_by_distance
from analysis.corners import extract_corners_analysis
from analysis.demo_session import create_synthetic_session, generate_lap_telemetry
from analysis.lap_comparison import compare_laps


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
    assert t1.comp_min_speed < t1.ref_min_speed
    # Slower comparison lap must yield negative delta (comp - ref)
    assert t1.speed_delta_min < -5.0
    assert t1.delta_v_min < -5.0
    assert "Frenada anticipada" in t1.diagnosis or "Exceso de reducción" in t1.diagnosis
    assert "ΔV: -" in t1.diagnosis


def test_strict_no_false_praise_on_time_loss():
    ref = generate_lap_telemetry(is_reference=True)
    comp = generate_lap_telemetry(is_reference=False)

    ref_dict = {k: v.tolist() for k, v in ref.items()}
    comp_dict = {k: v.tolist() for k, v in comp.items()}

    aligned = align_laps_by_distance(ref_dict, comp_dict, step_m=2.0)
    corners = extract_corners_analysis(aligned)

    # Any corner with significant time loss or apex speed drop must NEVER give false praises
    for c in corners:
        if c.time_delta_corner > 0.08 or c.delta_v_min <= -3.0 or c.delta_v_exit <= -3.0:
            assert c.balance_eval != "Equilibrio Neutro (Grip Óptimo)"
            assert c.racing_line_eval != "Excelente aproximación"
            assert c.trail_eval != "Trail Braking Efectivo"
            # Diagnosis string must never show false +0.0 km/h when delta is negative
            if c.delta_v_min <= -0.5:
                assert "+0.0 km/h" not in c.diagnosis
                assert f"{c.delta_v_min:+.1f} km/h" in c.diagnosis


def test_compare_laps_full():
    session = create_synthetic_session()
    ref_lap = session.laps[1]  # Reference lap
    comp_lap = session.laps[2]  # Comparison lap

    comp = compare_laps(ref_lap, comp_lap)
    assert comp.time_difference > 0.0
    assert len(comp.corners) > 0
    assert comp.aligned_distance is not None
    assert comp.time_delta_profile is not None


def test_sebring_multitrack_corners_and_telemetry():
    from analysis.telemetry_generator import generate_lap_telemetry_for_track
    from analysis.tracks import get_track_corners, get_track_length

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

    # Test telemetry-inferred track coordinates generation
    from analysis.tracks import generate_track_coordinates

    tx, ty = generate_track_coordinates("Sebring International Raceway", aligned["distance"], aligned)
    assert len(tx) == len(aligned["distance"])
    assert len(ty) == len(aligned["distance"])
    assert abs(tx[0] - tx[-1]) < 1e-4  # Closed loop
    assert abs(ty[0] - ty[-1]) < 1e-4  # Closed loop
    assert max(tx) - min(tx) > 100.0  # Real dimensions, not a collapsed line
    assert max(ty) - min(ty) > 100.0


def test_track_coordinates_infer_turn_directions_from_lateral_accel():
    import numpy as np

    from analysis.alignment import align_laps_by_distance
    from analysis.demo_session import generate_lap_telemetry
    from analysis.tracks import generate_track_coordinates

    ref = generate_lap_telemetry(is_reference=True)
    comp = generate_lap_telemetry(is_reference=False)
    aligned = align_laps_by_distance(
        {k: v.tolist() for k, v in ref.items()}, {k: v.tolist() for k, v in comp.items()}
    )

    tx, ty = generate_track_coordinates("Ricardo Tormo de Valencia", aligned["distance"], aligned)

    # The outline must turn the same way as the recorded lateral acceleration:
    # positive lat_accel (left) has to mean increasing heading at those samples.
    x, y = np.asarray(tx), np.asarray(ty)
    lat = np.asarray(aligned["ref_lat_accel"])
    heading = np.unwrap(np.arctan2(np.gradient(y), np.gradient(x)))
    turn = np.gradient(heading)
    strong = np.abs(lat) > 0.05
    assert strong.sum() > 50
    agreement = np.mean(np.sign(turn[strong]) == np.sign(lat[strong]))
    assert agreement > 0.9

    # Valencia runs counterclockwise with a left-handed Turn 1.
    assert float(np.sum(x[:-1] * y[1:] - x[1:] * y[:-1])) > 0
    t1 = (aligned["distance"] >= 360.0) & (aligned["distance"] <= 640.0)
    assert float(np.sum(turn[t1])) > 0  # Turn 1 turns left on the map


def test_track_coordinates_flip_mirrored_position_frames():
    import numpy as np

    from analysis.tracks import generate_track_coordinates

    # A left-handed circle walked with the y axis mirrored must be flipped back.
    s = np.linspace(0.0, 2.0 * np.pi, 200, endpoint=False)
    lat = np.ones_like(s)  # positive: turning left the whole way
    telemetry = {
        "x": (10.0 * np.cos(s)).tolist(),
        "y": (-10.0 * np.sin(s)).tolist(),  # mirrored frame
        "ref_lat_accel": lat.tolist(),
        "ref_speed": np.full_like(s, 50.0).tolist(),
    }
    tx, ty = generate_track_coordinates("any track", s, telemetry)
    area = float(np.sum(np.asarray(tx)[:-1] * np.asarray(ty)[1:] - np.asarray(tx)[1:] * np.asarray(ty)[:-1]))
    assert area > 0  # flipped back to counterclockwise


def test_detect_corners_finds_each_speed_dip():
    from analysis.corners import detect_corners

    distance = np.arange(0.0, 3000.0, 2.0)
    speed = np.full_like(distance, 240.0)
    for apex, v_min in ((600.0, 90.0), (1500.0, 150.0), (2400.0, 120.0)):
        speed = np.minimum(speed, v_min + np.abs(distance - apex) * 0.6)
    speed[1000:1005] -= 3.0  # noise on a straight is not a corner

    corners = detect_corners(distance, speed)

    assert [round(c["apex"]) for c in corners] == [600, 1500, 2400]
    assert all(c["start"] < c["apex"] < c["end"] for c in corners)


def test_unmapped_tracks_use_detected_corners_not_valencia():
    ref = generate_lap_telemetry(is_reference=True)
    comp = generate_lap_telemetry(is_reference=False)
    aligned = align_laps_by_distance({k: v.tolist() for k, v in ref.items()}, {k: v.tolist() for k, v in comp.items()})

    corners = extract_corners_analysis(aligned, track_name="Monza")

    assert corners
    assert all(c.corner_name.startswith("T") for c in corners)


def _sebring_lateral_accel(noise_g=0.0, bias_g=0.0, seed=0):
    import json
    import pathlib

    data = json.loads((pathlib.Path(__file__).parent.parent / "data/circuits/sebring.json").read_text())
    xy, dist = np.array(data["coordinates"]), np.array(data["distances"])
    grid = np.arange(0.0, dist[-1], 2.0)
    x, y = np.interp(grid, dist, xy[:, 0]), np.interp(grid, dist, xy[:, 1])
    heading = np.unwrap(np.arctan2(np.gradient(y), np.gradient(x)))
    speed_ms = 30.0
    lat_g = speed_ms**2 * np.gradient(heading) / np.gradient(grid) / 9.81
    lat_g = lat_g + bias_g + np.random.default_rng(seed).normal(0.0, noise_g, len(grid))
    return grid, np.full_like(grid, speed_ms * 3.6), lat_g, x, y


def _max_shape_error(x, y, rx, ry):
    def to_local(px, py):
        px, py = np.asarray(px) - px[0], np.asarray(py) - py[0]
        a = np.arctan2(py[5], px[5])
        return np.cos(-a) * px - np.sin(-a) * py, np.sin(-a) * px + np.cos(-a) * py

    (ox, oy), (qx, qy) = to_local(x, y), to_local(rx, ry)
    return float(np.max(np.hypot(ox - qx, oy - qy)))


def test_track_outline_is_recovered_from_speed_and_lateral_accel():
    from analysis.tracks import reconstruct_track_from_dynamics

    grid, speed, lat_g, x, y = _sebring_lateral_accel()
    rx, ry = reconstruct_track_from_dynamics(grid, speed, lat_g)

    assert _max_shape_error(x, y, rx, ry) < 10.0


def test_alignment_only_covers_the_stretch_both_laps_drove():
    ref = {"distance": [0.0, 1000.0, 2000.0], "speed": [100.0, 100.0, 100.0]}
    comp = {"distance": [500.0, 1500.0, 2500.0], "speed": [100.0, 100.0, 100.0]}

    aligned = align_laps_by_distance(ref, comp, step_m=100.0)

    assert aligned["distance"][0] == 500.0
    assert aligned["distance"][-1] == 1900.0


def test_track_coordinates_ignore_the_recording_frame():
    import numpy as np

    from analysis.alignment import align_laps_by_distance
    from analysis.demo_session import generate_lap_telemetry
    from analysis.tracks import generate_track_coordinates

    ref = generate_lap_telemetry(is_reference=True)
    comp = generate_lap_telemetry(is_reference=False)
    ref_dict = {k: v.tolist() for k, v in ref.items()}
    comp_dict = {k: v.tolist() for k, v in comp.items()}
    aligned = align_laps_by_distance(ref_dict, comp_dict)

    tx, ty = generate_track_coordinates("Ricardo Tormo de Valencia", aligned["distance"], aligned)

    # Treat that outline as recorded positions: the map must be drawn the same way
    # whichever frame the lap was recorded in (rotated, translated world frames).
    angle = 0.7
    cos_a, sin_a = np.cos(angle), np.sin(angle)
    recorded = dict(aligned)
    recorded["x"], recorded["y"] = tx, ty

    rx = np.asarray(tx) * cos_a - np.asarray(ty) * sin_a + 1234.0
    ry = np.asarray(tx) * sin_a + np.asarray(ty) * cos_a - 777.0
    recorded_rotated = dict(recorded)
    recorded_rotated["x"], recorded_rotated["y"] = rx.tolist(), ry.tolist()

    sx, sy = generate_track_coordinates("Ricardo Tormo de Valencia", aligned["distance"], recorded_rotated)

    assert np.allclose(np.asarray(tx), np.asarray(sx), atol=1e-6)
    assert np.allclose(np.asarray(ty), np.asarray(sy), atol=1e-6)
    # Canonical frame: centred on the origin and wider than tall.
    assert abs(float(np.mean(np.asarray(tx)))) < 1.0
    assert abs(float(np.mean(np.asarray(ty)))) < 1.0
    span_x = float(np.ptp(np.asarray(tx)))
    span_y = float(np.ptp(np.asarray(ty)))
    assert span_x >= span_y
