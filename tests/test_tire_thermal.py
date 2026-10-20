"""Unit tests for tyre thermal I/M/O and pressure diagnostics."""

from analysis.tire_thermal import analyze_all_tyres, analyze_corner_tire


def test_tyre_optimal_camber_and_pressure():
    diag = analyze_corner_tire("FL", hot_psi=26.8, cold_psi=24.5, imo=[85.0, 81.0, 78.0])
    assert diag["camber_status"] == "optimal"
    assert diag["pressure_status"] == "optimal"
    assert diag["health"] == "ok"
    assert diag["delta_camber"] == 7.0


def test_tyre_excess_camber_detection():
    # Inner 95°C vs Outer 75°C -> Delta 20°C (excessive negative camber)
    diag = analyze_corner_tire("FL", hot_psi=26.8, cold_psi=24.5, imo=[95.0, 82.0, 75.0])
    assert diag["camber_status"] == "excess_camber"
    assert "reduce caída" in diag["camber_advice"]
    assert diag["health"] == "warning"


def test_tyre_overpressure_crowning():
    # Middle hotter than both shoulders (ballooning crown)
    diag = analyze_corner_tire("RR", hot_psi=27.4, cold_psi=25.0, imo=[80.0, 85.0, 78.0])
    assert diag["pressure_status"] == "overpressure"
    assert "corona central" in diag["pressure_advice"]
    assert diag["health"] == "warning"


def test_analyze_all_tyres():
    payload = {
        "pressures_hot": {"FL": 26.8, "FR": 27.2, "RL": 26.7, "RR": 26.3},
        "pressures_cold": {"FL": 24.5, "FR": 24.8, "RL": 24.2, "RR": 24.1},
        "temps_c": {
            "FL": [84.0, 81.0, 77.0],
            "FR": [86.0, 83.0, 78.0],
            "RL": [80.0, 78.0, 75.0],
            "RR": [82.0, 79.0, 76.0],
        },
    }
    all_diags = analyze_all_tyres(payload)
    assert "FL" in all_diags
    assert "FR" in all_diags
    assert all_diags["FR"]["pressure_status"] == "overpressure"
    assert all_diags["RR"]["pressure_status"] == "underpressure"
