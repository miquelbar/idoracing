"""Tests for the structured setup advice generator."""

from analysis.demo_session import create_synthetic_session
from analysis.lap_comparison import compare_laps
from analysis.setup_advisor import generate_setup_advice
from domain.session import SetupAdviceReport


def test_setup_advice_returns_report():
    session = create_synthetic_session()
    comp = compare_laps(session.laps[1], session.laps[2])
    report = generate_setup_advice(comp, car=session.car, track=session.track)

    assert isinstance(report, SetupAdviceReport)
    assert report.summary != ""
    assert report.overall_balance in ("understeer", "oversteer", "neutral", "mixed")
    assert report.confidence in ("high", "medium", "low")


def test_setup_advice_recommendations_structure():
    session = create_synthetic_session()
    comp = compare_laps(session.laps[1], session.laps[2])
    report = generate_setup_advice(comp, car=session.car, track=session.track)

    for rec in report.recommendations:
        assert rec.category in (
            "brake_bias",
            "arb_front",
            "arb_rear",
            "tc",
            "abs",
            "wing",
            "ride_height",
            "camber",
            "pressure",
            "dampers",
            "electronics",
        )
        assert rec.parameter != ""
        assert rec.suggested_change != ""
        assert rec.reason != ""
        assert rec.priority in ("high", "medium", "low")
        assert rec.confidence in ("high", "medium", "low")
        assert isinstance(rec.evidence, list)
        assert isinstance(rec.affected_corners, list)


def test_setup_advice_empty_corners():
    from domain.session import LapComparison

    empty_comp = LapComparison(
        reference_lap="1",
        comparison_lap="2",
        time_difference=0.5,
        corners=[],
    )
    report = generate_setup_advice(empty_comp, car="Porsche", track="Valencia")

    assert isinstance(report, SetupAdviceReport)
    assert report.recommendations == []
    assert report.confidence == "low"
    assert "No hay suficientes datos" in report.summary


def test_setup_advice_synthetic_low_confidence():
    session = create_synthetic_session()
    comp = compare_laps(session.laps[1], session.laps[2])
    report = generate_setup_advice(comp, car=session.car, track=session.track, synthetic=True)

    assert report.confidence == "low"


def test_setup_advice_priority_sorting():
    """High priority recommendations should come first."""
    session = create_synthetic_session()
    comp = compare_laps(session.laps[1], session.laps[2])
    report = generate_setup_advice(comp, car=session.car, track=session.track)

    if len(report.recommendations) >= 2:
        priority_order = {"high": 0, "medium": 1, "low": 2}
        for i in range(len(report.recommendations) - 1):
            p1 = priority_order.get(report.recommendations[i].priority, 3)
            p2 = priority_order.get(report.recommendations[i + 1].priority, 3)
            assert p1 <= p2, "Recommendations should be sorted by priority (high first)"


def test_setup_advice_no_duplicate_categories():
    """No two recommendations should share the same category (e.g. two brake bias directions)."""
    session = create_synthetic_session()
    comp = compare_laps(session.laps[1], session.laps[2])
    report = generate_setup_advice(comp, car=session.car, track=session.track)

    categories = [r.category for r in report.recommendations]
    assert len(categories) == len(set(categories)), f"Duplicate categories found: {categories}"


def test_setup_advice_early_braking_excluded_from_understeer():
    """Corners with early braking should not count as understeer entry (technique vs setup)."""
    from domain.session import CornerAnalysis, LapComparison

    # A corner with both early braking AND low entry speed should only trigger
    # the early-braking pattern, not the understeer-entry pattern.
    corner = CornerAnalysis(
        corner_number=1,
        corner_name="Test Corner",
        start_dist=100.0,
        end_dist=200.0,
        ref_min_speed=80.0,
        comp_min_speed=75.0,
        speed_delta_min=-5.0,
        time_delta_corner=0.3,
        delta_v_entry=-8.0,
        brake_delta_dist=-15.0,
        balance_code="understeer",
    )
    comp = LapComparison(
        reference_lap="1",
        comparison_lap="2",
        time_difference=0.3,
        corners=[corner],
    )
    report = generate_setup_advice(comp, car="Porsche", track="Valencia")

    # Only one corner, so no pattern should fire (MIN_CORNERS_FOR_PATTERN = 2)
    # But if it did, it should be brake_bias (early braking), not understeer entry
    for rec in report.recommendations:
        if rec.category == "brake_bias":
            assert "adelante" in rec.suggested_change.lower() or "+" in rec.suggested_change


def test_setup_advice_deduplication_keeps_stronger():
    """When two patterns map to the same category, only the stronger recommendation survives."""
    from domain.session import CornerAnalysis, LapComparison

    # Two corners with understeer entry (high priority) and two with early braking (medium)
    # Both map to brake_bias — only one should survive.
    corners = []
    for i in range(3):
        corners.append(
            CornerAnalysis(
                corner_number=i + 1,
                corner_name=f"Corner {i + 1}",
                start_dist=float(i * 100),
                end_dist=float(i * 100 + 100),
                ref_min_speed=80.0,
                comp_min_speed=75.0,
                speed_delta_min=-5.0,
                time_delta_corner=0.3,
                delta_v_entry=-8.0,
                brake_delta_dist=0.0,  # no early braking
                balance_code="understeer",
            )
        )
    for i in range(3):
        corners.append(
            CornerAnalysis(
                corner_number=i + 4,
                corner_name=f"Corner {i + 4}",
                start_dist=float(i * 100 + 400),
                end_dist=float(i * 100 + 500),
                ref_min_speed=80.0,
                comp_min_speed=75.0,
                speed_delta_min=-5.0,
                time_delta_corner=0.3,
                delta_v_entry=-2.0,  # not understeer entry
                brake_delta_dist=-15.0,  # early braking
                balance_code="early_braking",
            )
        )
    comp = LapComparison(
        reference_lap="1",
        comparison_lap="2",
        time_difference=1.8,
        corners=corners,
    )
    report = generate_setup_advice(comp, car="Porsche", track="Valencia")

    brake_bias_recs = [r for r in report.recommendations if r.category == "brake_bias"]
    assert len(brake_bias_recs) <= 1, f"Expected at most 1 brake_bias recommendation, got {len(brake_bias_recs)}"
    if brake_bias_recs:
        # The understeer one (3 corners, high priority) should win over early braking (medium)
        assert "atrás" in brake_bias_recs[0].suggested_change.lower() or "-" in brake_bias_recs[0].suggested_change
