from unittest.mock import MagicMock, patch
from analysis.lap_comparison import compare_laps
from coach.advisor import CoachAdvisor
from coach.ollama_client import OllamaClient
from domain.session import CoachReport
from importers.synthetic import create_synthetic_session


def test_coach_deterministic_generation_without_ollama():
    session = create_synthetic_session()
    comp = compare_laps(session.laps[1], session.laps[2])

    disabled_client = OllamaClient(enabled=False)
    advisor = CoachAdvisor(disabled_client)

    report = advisor.generate_report(comp, car=session.car, track=session.track)

    assert isinstance(report, CoachReport)
    assert len(report.facts) > 0
    assert len(report.hypotheses) > 0
    assert len(report.exercises) > 0
    assert report.verification_indicator != ""
    assert "Alta" in report.confidence

    # Ensure required report structure is present in raw_report
    text = report.raw_report
    assert "1. Qué se ha observado" in text
    assert "2. Datos y métricas" in text
    assert "3. Hipótesis técnica" in text
    assert "4. Ejercicios concretos" in text
    assert "5. Indicador numérico" in text


def test_ollama_client_mock_generation():
    session = create_synthetic_session()
    comp = compare_laps(session.laps[1], session.laps[2])

    mock_client = OllamaClient(enabled=True)
    with patch.object(mock_client, "is_available", return_value=True):
        with patch.object(
            mock_client,
            "generate",
            return_value="# Informe LLM\n\n1. Qué se ha observado\n2. Datos\n3. Hipótesis\n4. Ejercicio\n5. Indicador",
        ):
            advisor = CoachAdvisor(mock_client)
            report = advisor.generate_report(comp, car=session.car, track=session.track)

            assert "Informe LLM" in report.raw_report
            assert "Ollama" in report.confidence


def test_ollama_client_timeout_or_error_handling():
    # Test client behavior with invalid / down URL
    client = OllamaClient(base_url="http://127.0.0.1:59999", timeout=0.5, enabled=True)
    assert client.is_available() is False
    assert client.list_models() == []
    assert client.generate("test prompt") is None
