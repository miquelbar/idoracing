from unittest.mock import patch

from analysis.demo_session import create_synthetic_session
from analysis.lap_comparison import compare_laps
from coach.advisor import CoachAdvisor
from coach.ollama_client import OllamaClient
from domain.session import CoachReport


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
    assert report.confidence == "Alta (motor de reglas)"

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
    with (
        patch.object(mock_client, "is_available", return_value=True),
        patch.object(
            mock_client,
            "generate",
            return_value="# Informe LLM\n\n1. Qué se ha observado\n2. Datos\n3. Hipótesis\n4. Ejercicio\n5. Indicador",
        ),
    ):
        advisor = CoachAdvisor(mock_client)
        report = advisor.generate_report(comp, car=session.car, track=session.track)

        assert "Informe LLM" in report.raw_report
        assert report.confidence == "Alta (LLM + telemetría)"


def test_ollama_client_timeout_or_error_handling():
    # Test client behavior with invalid / down URL
    client = OllamaClient(base_url="http://127.0.0.1:59999", timeout=0.5, enabled=True)
    assert client.is_available() is False
    assert client.list_models() == []
    assert client.generate("test prompt") is None


def test_race_engineer_response_trail_braking_and_porsche():
    from coach.radio import generate_race_engineer_response

    resp_es = generate_race_engineer_response(
        query="¿Cómo puedo optimizar la técnica de trail braking con el Porsche 911 GT3 R (992)?",
        car="Porsche 911 GT3 R (992)",
        track="Ricardo Tormo de Valencia",
        lang="es",
    )
    assert "Trail Braking" in resp_es
    assert "15-20%" in resp_es
    assert "Porsche 911 GT3 R" in resp_es
    # Pep greeting in Spanish without corner
    assert resp_es.startswith("Copiado en el muro por radio.")

    resp_en = generate_race_engineer_response(
        query="How can I optimize trail braking technique in the Porsche 911 GT3 R (992)?",
        car="Porsche 911 GT3 R (992)",
        track="Ricardo Tormo de Valencia",
        lang="en",
    )
    assert "Trail Braking" in resp_en
    assert "Apex" in resp_en or "apex" in resp_en
    assert "15-20%" in resp_en
    assert resp_en.startswith("Pit wall radio check.")


def test_pep_corner_context_and_strict_diagnostics():
    from coach.prompt import PEP_SYSTEM_PROMPT_EN, PEP_SYSTEM_PROMPT_ES
    from coach.radio import generate_race_engineer_response

    # Verify system prompts enforce zero false praise
    assert "PROHIBIDO emitir elogios" in PEP_SYSTEM_PROMPT_ES
    assert "FORBIDDEN to issue praise" in PEP_SYSTEM_PROMPT_EN
    assert "Pep" in PEP_SYSTEM_PROMPT_ES
    assert "Pep" in PEP_SYSTEM_PROMPT_EN

    # Test Pep corner-specific transmission in Spanish with loss
    corner_loss = {
        "corner_number": 1,
        "name": "Curva Aspar",
        "delta_time": 0.605,
        "v_min_ref": 142.0,
        "v_min_comp": 126.0,
        "delta_v_min": -16.0,
        "comp_gear": 3,
        "gear_eval": "Óptima",
        "balance_eval": "Pérdida en vértice / Subviraje",
        "trail_braking_eval": "Soltado Brusco",
        "racing_line_eval": "Apertura Tardía",
        "racing_line_advice": "Ábrete 1.5m más en entrada",
    }
    resp_corner = generate_race_engineer_response(
        query="¿Por qué he perdido tanto tiempo en T1?",
        car="Porsche 911 GT3 R (992)",
        track="Ricardo Tormo de Valencia",
        corner=corner_loss,
        lang="es",
    )
    # Pep distinctive greeting with corner
    assert resp_corner.startswith("Idò, mirando los datos de T1:")
    # Must report performance alert with exact negative delta
    assert "Alerta de Rendimiento" in resp_corner
    assert "+0.605s" in resp_corner
    assert "-16.0 km/h" in resp_corner or "16.0 km/h" in resp_corner


def test_knowledge_base_retrieval():
    from coach.knowledge_base import detect_architecture, knowledge_base

    assert detect_architecture("Porsche 992 GT3 R") == "RR"
    assert detect_architecture("BMW M4 GT3") == "FR"
    assert detect_architecture("Ferrari 296 GT3") == "MR"

    # Query with understeer
    kb_understeer = knowledge_base.retrieve_context(
        car_name="Porsche 992 GT3 R",
        query="tengo mucho subviraje en la curva lenta",
        symptoms=["subviraje en entrada"],
    )
    assert "Motor Trasero (RR" in kb_understeer
    assert "Subviraje" in kb_understeer

    # Query with tire pressures
    kb_tyres = knowledge_base.retrieve_context(
        car_name="BMW M4 GT3",
        query="¿cuál es la presión ideal?",
    )
    assert "Dinámica de Neumáticos" in kb_tyres
    assert "26.5" in kb_tyres and "27.0" in kb_tyres
