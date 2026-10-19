import numpy as np
import pytest

from analysis.line_offset import corner_line_offsets, signed_offsets, turn_direction


def _arc(radius, start_deg, end_deg, n=200, left=True):
    """Points along a circular corner centred on the origin, driven anticlockwise (left) or clockwise."""
    angles = np.radians(np.linspace(start_deg, end_deg, n))
    if not left:
        angles = angles[::-1]
    return radius * np.cos(angles), radius * np.sin(angles)


@pytest.mark.parametrize("left", [True, False])
def test_a_line_wider_by_a_constant_reads_positive_everywhere(left):
    ref_x, ref_y = _arc(50.0, 0, 120, left=left)
    comp_x, comp_y = _arc(51.8, 0, 120, left=left)

    entry, apex, exit_ = corner_line_offsets(ref_x, ref_y, comp_x, comp_y, apex_idx=100)

    assert (entry, apex, exit_) == pytest.approx((1.8, 1.8, 1.8), abs=0.05)


def test_cutting_the_apex_reads_negative_only_at_the_apex():
    ref_x, ref_y = _arc(50.0, 0, 120)
    radius = 50.0 - 1.5 * np.exp(-((np.linspace(0, 120, 200) - 60.0) ** 2) / 200.0)
    angles = np.radians(np.linspace(0, 120, 200))
    comp_x, comp_y = radius * np.cos(angles), radius * np.sin(angles)

    entry, apex, exit_ = corner_line_offsets(ref_x, ref_y, comp_x, comp_y, apex_idx=100)

    assert apex == pytest.approx(-1.5, abs=0.1)
    assert abs(entry) < 0.1 and abs(exit_) < 0.1


def test_offset_sign_is_left_of_travel_direction():
    ref_x, ref_y = np.linspace(0, 100, 51), np.zeros(51)

    assert signed_offsets(ref_x, ref_y, ref_x, ref_y + 2.0) == pytest.approx(np.full(51, 2.0))
    assert turn_direction(*_arc(30.0, 0, 90)) == 1
    assert turn_direction(*_arc(30.0, 0, 90, left=False)) == -1
