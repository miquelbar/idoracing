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
    assert corners[0]["name"] == "Turn 1"
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


def test_red_bull_ring_corners_and_clockwise_outline():
    import numpy as np

    from analysis.telemetry_generator import generate_lap_telemetry_for_track
    from analysis.tracks import generate_track_coordinates, get_track_corners, get_track_length

    corners = get_track_corners("Red Bull Ring")
    assert len(corners) == 10
    assert corners[0]["name"] == "Niki Lauda"
    assert corners[9]["name"] == "Turn 10"
    assert sum(c["turn_deg"] for c in corners) == -360

    assert get_track_length("Red Bull Ring") == 4318.0

    target_time = 105.669
    t_data = generate_lap_telemetry_for_track(
        track_name="Red Bull Ring",
        target_lap_time=target_time,
        is_reference=True,
    )
    assert abs(float(t_data["time"][-1]) - target_time) < 0.1
    assert float(t_data["distance"][-1]) >= 4300.0

    comp_t_data = generate_lap_telemetry_for_track(
        track_name="Red Bull Ring",
        target_lap_time=107.200,
        is_reference=False,
    )
    ref_dict = {k: v.tolist() for k, v in t_data.items()}
    comp_dict = {k: v.tolist() for k, v in comp_t_data.items()}
    aligned = align_laps_by_distance(ref_dict, comp_dict, step_m=2.0)

    rbr_corners = extract_corners_analysis(aligned, track_name="Red Bull Ring")
    assert len(rbr_corners) == 10
    assert rbr_corners[0].corner_number == 1

    tx, ty = generate_track_coordinates("Red Bull Ring", aligned["distance"], aligned)
    assert len(tx) == len(aligned["distance"])
    assert abs(tx[0] - tx[-1]) < 1e-4  # Closed loop
    assert abs(ty[0] - ty[-1]) < 1e-4  # Closed loop
    assert max(tx) - min(tx) > 100.0  # Real dimensions, not a collapsed line
    assert max(ty) - min(ty) > 100.0

    # Red Bull Ring runs clockwise: the outline's signed area must be negative and
    # Turn 1 (Niki Lauda) must turn right on the map.
    x, y = np.asarray(tx), np.asarray(ty)
    assert float(np.sum(x[:-1] * y[1:] - x[1:] * y[:-1])) < 0
    heading = np.unwrap(np.arctan2(np.gradient(y), np.gradient(x)))
    turn = np.gradient(heading)
    t1 = (aligned["distance"] >= 400.0) & (aligned["distance"] <= 510.0)
    assert float(np.sum(turn[t1])) < 0  # Turn 1 turns right on the map


def test_track_coordinates_infer_turn_directions_from_lateral_accel():
    import numpy as np

    from analysis.alignment import align_laps_by_distance
    from analysis.demo_session import generate_lap_telemetry
    from analysis.tracks import generate_track_coordinates

    ref = generate_lap_telemetry(is_reference=True)
    comp = generate_lap_telemetry(is_reference=False)
    aligned = align_laps_by_distance({k: v.tolist() for k, v in ref.items()}, {k: v.tolist() for k, v in comp.items()})

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


def test_corner_turn_direction_matches_xy_geometry():
    """
    Verify that every corner in Ricardo Tormo de Valencia (T1 Aspar left, T2 Doohan left,
    T4 Nico Terol right, T10 right, etc.) has screen-space cross product matching its label:
    cross_screen < 0 for 'left' and cross_screen > 0 for 'right' (where +X is right, +Y is down).
    Also verifies that recorded world positions in a mirrored game frame are auto-oriented on
    both track_x/y and ref_x/y + comp_x/y.
    """
    import numpy as np

    from analysis.alignment import align_laps_by_distance
    from analysis.corners import extract_corners_analysis
    from analysis.demo_session import generate_lap_telemetry
    from analysis.tracks import VALENCIA_CORNERS, generate_track_coordinates

    ref = generate_lap_telemetry(is_reference=True)
    comp = generate_lap_telemetry(is_reference=False)
    ref_dict = {k: v.tolist() for k, v in ref.items()}
    comp_dict = {k: v.tolist() for k, v in comp.items()}
    aligned = align_laps_by_distance(ref_dict, comp_dict)
    tx, ty = generate_track_coordinates("Ricardo Tormo de Valencia", aligned["distance"], aligned)

    # Also simulate a session with recorded world (x, y) in a mirrored (left-handed) game frame
    ref_mirrored = dict(ref_dict)
    comp_mirrored = dict(comp_dict)
    ref_mirrored["x"] = np.interp(ref_dict["distance"], aligned["distance"], tx).tolist()
    ref_mirrored["y"] = (-np.interp(ref_dict["distance"], aligned["distance"], ty)).tolist()
    comp_mirrored["x"] = ref_mirrored["x"]
    comp_mirrored["y"] = ref_mirrored["y"]
    aligned_mirrored = align_laps_by_distance(ref_mirrored, comp_mirrored)
    tx_m, ty_m = generate_track_coordinates("Ricardo Tormo de Valencia", aligned_mirrored["distance"], aligned_mirrored)

    for dataset_label, dist, xs, ys, aln in (
        ("reconstructed", aligned["distance"], tx, ty, aligned),
        ("mirrored_world_track", aligned_mirrored["distance"], tx_m, ty_m, aligned_mirrored),
        (
            "mirrored_world_ref_xy",
            aligned_mirrored["distance"],
            aligned_mirrored["ref_x"],
            aligned_mirrored["ref_y"],
            aligned_mirrored,
        ),
    ):
        x_screen = np.asarray(xs, dtype=np.float64)
        y_screen = -np.asarray(ys, dtype=np.float64)  # Screen coords: +X right, +Y down
        corners = extract_corners_analysis(aln, track_name="Ricardo Tormo de Valencia")
        assert len(corners) == 14
        # Specifically validate T1 Aspar and T2 Doohan are left, T4 Nico Terol is right
        assert corners[0].racing_line_svg["turn_dir"] == "left"
        assert corners[1].racing_line_svg["turn_dir"] == "left"
        assert corners[3].racing_line_svg["turn_dir"] == "right"

        for c_def, c_ana in zip(VALENCIA_CORNERS, corners, strict=True):
            turn_dir = c_ana.racing_line_svg["turn_dir"]
            assert turn_dir == c_def["turn_dir"], f"[{dataset_label}] T{c_def['number']} label mismatch"
            i_entry = int(np.searchsorted(dist, c_ana.start_dist))
            i_apex = int(np.searchsorted(dist, c_ana.apex_dist or c_def["apex"]))
            i_exit = min(int(np.searchsorted(dist, c_ana.end_dist)), len(dist) - 1)

            x_entry, y_entry = x_screen[i_entry], y_screen[i_entry]
            x_apex, y_apex = x_screen[i_apex], y_screen[i_apex]
            x_exit, y_exit = x_screen[i_exit], y_screen[i_exit]

            cross_screen = (x_apex - x_entry) * (y_exit - y_apex) - (y_apex - y_entry) * (x_exit - x_apex)
            if turn_dir == "left":
                assert cross_screen < 0.0, (
                    f"[{dataset_label}] T{c_def['number']} ({c_def['name']}) is 'left' "
                    f"but cross_screen={cross_screen:.2f} >= 0"
                )
            else:
                assert cross_screen > 0.0, (
                    f"[{dataset_label}] T{c_def['number']} ({c_def['name']}) is 'right' "
                    f"but cross_screen={cross_screen:.2f} <= 0"
                )


def test_track_loop_winding_order():
    """
    Verify the signed Shoelace area sum(x_i * y_{i+1} - x_{i+1} * y_i) in screen coordinates
    (+X right, +Y down):
    - Counter-clockwise circuit (Ricardo Tormo de Valencia): shoelace_screen < 0 (shoelace_world > 0).
    - Clockwise circuit (Red Bull Ring): shoelace_screen > 0 (shoelace_world < 0).
    """
    import numpy as np

    from analysis.alignment import align_laps_by_distance
    from analysis.demo_session import generate_lap_telemetry
    from analysis.telemetry_generator import generate_lap_telemetry_for_track
    from analysis.tracks import generate_track_coordinates

    # 1. Counter-clockwise: Ricardo Tormo de Valencia
    ref_v = generate_lap_telemetry(is_reference=True)
    comp_v = generate_lap_telemetry(is_reference=False)
    aligned_v = align_laps_by_distance(
        {k: v.tolist() for k, v in ref_v.items()},
        {k: v.tolist() for k, v in comp_v.items()},
    )
    vx, vy = generate_track_coordinates("Ricardo Tormo de Valencia", aligned_v["distance"], aligned_v)
    vx_screen = np.asarray(vx, dtype=np.float64)
    vy_screen = -np.asarray(vy, dtype=np.float64)
    shoelace_valencia_screen = float(np.sum(vx_screen[:-1] * vy_screen[1:] - vx_screen[1:] * vy_screen[:-1]))
    assert shoelace_valencia_screen < 0.0, "Valencia is counter-clockwise: screen Shoelace area must be < 0"

    # 2. Clockwise: Red Bull Ring
    ref_rbr = generate_lap_telemetry_for_track("Red Bull Ring", 105.6, is_reference=True)
    comp_rbr = generate_lap_telemetry_for_track("Red Bull Ring", 107.1, is_reference=False)
    aligned_rbr = align_laps_by_distance(
        {k: v.tolist() for k, v in ref_rbr.items()},
        {k: v.tolist() for k, v in comp_rbr.items()},
    )
    rx, ry = generate_track_coordinates("Red Bull Ring", aligned_rbr["distance"], aligned_rbr)
    rx_screen = np.asarray(rx, dtype=np.float64)
    ry_screen = -np.asarray(ry, dtype=np.float64)
    shoelace_rbr_screen = float(np.sum(rx_screen[:-1] * ry_screen[1:] - rx_screen[1:] * ry_screen[:-1]))
    assert shoelace_rbr_screen > 0.0, "Red Bull Ring is clockwise: screen Shoelace area must be > 0"


def test_no_teleport_spikes_in_track_map():
    """
    Simulate an aborted lap where the driver presses 'Escape / Return to Garage' mid-lap
    (creating a spatial jump > 25m). Verify that:
    - truncate_teleport_jumps truncates at i - 1 and marks is_incomplete = True,
    - generate_track_coordinates and align_laps_by_distance contain zero segments with hypot(dx, dy) > 25m,
    - the incomplete loop is NEVER closed back to the start point.
    """
    import numpy as np

    from analysis.alignment import align_laps_by_distance
    from analysis.demo_session import generate_lap_telemetry
    from analysis.tracks import generate_track_coordinates
    from importers.laps import truncate_teleport_jumps

    ref = generate_lap_telemetry(is_reference=True)
    ref_dict = {k: v.tolist() for k, v in ref.items()}
    n = len(ref_dict["distance"])
    theta = np.linspace(0.0, 2.0 * np.pi, n)
    x_clean = (600.0 * np.cos(theta)).tolist()
    y_clean = (400.0 * np.sin(theta)).tolist()

    # Inject a "Return to Garage" teleport jump at sample 900 (mid-lap)
    aborted = dict(ref_dict)
    x_abort = list(x_clean)
    y_abort = list(y_clean)
    for k in range(900, n):
        x_abort[k] = 0.0  # Teleported back to pit garage at (0, 0)
        y_abort[k] = 0.0
    aborted["x"] = x_abort
    aborted["y"] = y_abort

    truncated_tel, is_incomplete = truncate_teleport_jumps(aborted)
    assert is_incomplete is True
    assert truncated_tel is not None
    assert len(truncated_tel["x"]) == 900

    # Also pass the raw un-truncated aborted telemetry directly into generate_track_coordinates
    tx, ty = generate_track_coordinates("Ricardo Tormo de Valencia", np.asarray(aborted["distance"]), aborted)
    tx_arr, ty_arr = np.asarray(tx), np.asarray(ty)
    step_dists = np.hypot(np.diff(tx_arr), np.diff(ty_arr))
    assert float(np.max(step_dists)) <= 25.0, f"Found teleport spike of {float(np.max(step_dists)):.1f}m"
    # Must NOT have closed the polygon from mid-lap back to start
    start_end_gap = float(np.hypot(tx_arr[-1] - tx_arr[0], ty_arr[-1] - ty_arr[0]))
    assert start_end_gap > 30.0, "Incomplete aborted lap must not be closed back to start"

    # Also verify align_laps_by_distance truncates teleport spikes
    comp_clean = dict(ref_dict)
    comp_clean["x"] = x_clean
    comp_clean["y"] = y_clean
    aligned = align_laps_by_distance(aborted, comp_clean)
    ref_steps = np.hypot(np.diff(aligned["ref_x"]), np.diff(aligned["ref_y"]))
    assert float(np.max(ref_steps)) <= 25.0


def test_outlap_lap1_excluded_from_default_selection():
    """
    Lap 1 (Out-lap from pitlane with initial speed < 180 km/h at distance < 50m or >5% slower than PB)
    must be flagged as is_outlap and excluded from automatic P1 / P2 selection.
    """
    from datetime import datetime

    from api.server import _rank_flying_laps
    from domain.session import Lap, Session, is_outlap_detected

    n = 150
    dists = np.linspace(0.0, 4000.0, n).tolist()
    flying_speeds = np.full(n, 220.0).tolist()
    outlap_speeds = ([135.0] * 10) + np.full(n - 10, 215.0).tolist()
    base_tel = {
        "distance": dists,
        "throttle": [1.0] * n,
        "brake": [0.0] * n,
        "gear": [4.0] * n,
        "lat_accel": [0.0] * n,
        "long_accel": [0.0] * n,
    }

    assert is_outlap_detected(1, 111.5, 100.2, {**base_tel, "speed": outlap_speeds}, True) is True
    assert is_outlap_detected(1, 101.0, 100.2, {**base_tel, "speed": outlap_speeds}, True) is True
    assert is_outlap_detected(1, 106.0, 100.0, {**base_tel, "speed": flying_speeds}, True) is True
    assert is_outlap_detected(5, 117.4, 100.15, {**base_tel, "speed": flying_speeds}, True) is True
    assert is_outlap_detected(2, 100.2, 100.2, {**base_tel, "speed": flying_speeds}, True) is False

    sess = Session(
        session_id="test_outlap_exclusion",
        car="Porsche 911 GT3 R (992)",
        track="Ricardo Tormo de Valencia",
        date=datetime.now(),
        laps=[
            Lap(lap_number=1, lap_time=111.4, is_valid=True, telemetry={**base_tel, "speed": outlap_speeds}),
            Lap(lap_number=2, lap_time=100.2, is_valid=True, telemetry={**base_tel, "speed": flying_speeds}),
            Lap(lap_number=3, lap_time=100.6, is_valid=True, telemetry={**base_tel, "speed": flying_speeds}),
            Lap(lap_number=5, lap_time=117.4, is_valid=True, telemetry={**base_tel, "speed": flying_speeds}),
        ],
    )
    assert sess.laps[0].is_outlap is True
    assert sess.laps[1].is_outlap is False
    assert sess.laps[3].is_outlap is True
    ranked = _rank_flying_laps(sess)
    assert [l.lap_number for l in ranked] == [2, 3]


def test_all_tracks_render_closed_complete_loops():
    """
    Verify across all supported circuits (Ricardo Tormo de Valencia, Sebring International Raceway,
    Red Bull Ring, Zandvoort) and stored telemetry sessions that track_x, track_y from
    generate_track_coordinates and /api/comparison:
    1. Has >= 200 points (len(track_x) >= 200).
    2. Covers >= 98% of the circuit length (never cut off after T14 or before finish line).
    3. Contains zero abrupt jumps (max(step_dist) < 25.0 meters).
    4. Closes smoothly at the finish line: hypot(track_x[-1] - track_x[0], track_y[-1] - track_y[0]) < 5.0m.
    5. All numbered corners (T1..T14 Valencia, T1..T17 Sebring, T1..T10 Red Bull Ring) are present and positioned.
    """
    import numpy as np

    from analysis.alignment import align_laps_by_distance
    from analysis.corners import extract_corners_analysis
    from analysis.telemetry_generator import generate_lap_telemetry_for_track
    from analysis.tracks import (
        generate_track_coordinates,
        get_track_length,
        known_track_corners,
    )
    from api.server import get_lap_comparison, storage

    supported_tracks = [
        ("Ricardo Tormo de Valencia", 98.5, 14),
        ("Sebring International Raceway", 119.2, 17),
        ("Red Bull Ring", 89.4, 10),
        ("Zandvoort", 94.8, None),
    ]

    for track_name, base_lap_time, expected_corners in supported_tracks:
        track_len = get_track_length(track_name)
        ref_t = generate_lap_telemetry_for_track(track_name, base_lap_time, is_reference=True)
        comp_t = generate_lap_telemetry_for_track(track_name, base_lap_time + 0.8, is_reference=False)
        aligned = align_laps_by_distance(
            {k: v.tolist() for k, v in ref_t.items()},
            {k: v.tolist() for k, v in comp_t.items()},
            step_m=2.0,
        )
        tx, ty = generate_track_coordinates(track_name, aligned["distance"], aligned)
        tx_arr = np.asarray(tx, dtype=np.float64)
        ty_arr = np.asarray(ty, dtype=np.float64)

        assert len(tx_arr) >= 200, f"[{track_name}] Expected >= 200 points, got {len(tx_arr)}"
        covered_len = float(aligned["distance"][-1] - aligned["distance"][0])
        assert covered_len >= 0.98 * track_len, (
            f"[{track_name}] Track cut short: covered {covered_len:.1f}m < 98% of {track_len:.1f}m"
        )
        step_dists = np.hypot(np.diff(tx_arr), np.diff(ty_arr))
        assert float(np.max(step_dists)) < 25.0, (
            f"[{track_name}] Abrupt step jump of {float(np.max(step_dists)):.2f}m >= 25.0m"
        )
        closure_gap = float(np.hypot(tx_arr[-1] - tx_arr[0], ty_arr[-1] - ty_arr[0]))
        assert closure_gap < 5.0, (
            f"[{track_name}] Track loop not closed at finish line: gap = {closure_gap:.2f}m >= 5.0m"
        )

        corners = extract_corners_analysis(aligned, track_name=track_name)
        assert len(corners) >= 5, f"[{track_name}] Expected corners on outline, got {len(corners)}"
        if expected_corners is not None:
            assert len(corners) == expected_corners, (
                f"[{track_name}] Expected {expected_corners} corners, got {len(corners)}"
            )
            assert [c.corner_number for c in corners] == list(range(1, expected_corners + 1))
        for c in corners:
            assert 0.0 <= (c.apex_dist or c.start_dist) <= aligned["distance"][-1]

    # Also verify all stored real/demo sessions with 50Hz telemetry via get_lap_comparison
    for summary in storage.list_sessions():
        if not summary.has_telemetry:
            continue
        resp = get_lap_comparison(session_id=summary.session_id)
        if not resp.has_telemetry:
            continue
        tx_arr = np.asarray(resp.track_x, dtype=np.float64)
        ty_arr = np.asarray(resp.track_y, dtype=np.float64)
        track_len = get_track_length(resp.track_name)
        assert len(tx_arr) >= 200, f"[{summary.session_id}] len(track_x)={len(tx_arr)} < 200"
        assert float(resp.distance[-1] - resp.distance[0]) >= 0.98 * track_len, (
            f"[{summary.session_id}] distance ends at {resp.distance[-1]:.1f}m (< 98% of {track_len:.1f}m)"
        )
        step_dists = np.hypot(np.diff(tx_arr), np.diff(ty_arr))
        assert float(np.max(step_dists)) < 25.0, f"[{summary.session_id}] step jump {float(np.max(step_dists)):.2f}m"
        closure_gap = float(np.hypot(tx_arr[-1] - tx_arr[0], ty_arr[-1] - ty_arr[0]))
        assert closure_gap < 5.0, f"[{summary.session_id}] loop closure gap {closure_gap:.2f}m >= 5.0m"
        expected_tbl = known_track_corners(resp.track_name)
        if expected_tbl is not None:
            assert len(resp.corners) == len(expected_tbl)
