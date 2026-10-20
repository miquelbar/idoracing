"""
Simracing Engineering Knowledge Base for Pep AI.
Loads canonical literature, setup guidelines, tyre models and vehicle dynamics
to ground LLM engineering advice in real motorsport science and simulator physics.
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path
from typing import Any

KNOWLEDGE_DIR = Path(__file__).resolve().parent / "knowledge"


def _normalize(text: str) -> str:
    """Lowercase and strip accents for robust keyword matching."""
    nfkd = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def detect_architecture(car_name: str | None) -> str:
    """Classify vehicle into RR (Rear), FR (Front), or MR (Mid-engine)."""
    if not car_name:
        return "MR"
    name = car_name.lower()
    if "porsche" in name or "991" in name or "992" in name or "911" in name:
        return "RR"
    if any(k in name for k in ("bmw", "aston", "amr", "mercedes", "amg", "bentley", "mustang", "corvette", "nissan", "gt-r")):
        return "FR"
    # Ferrari, Audi, Lamborghini, McLaren, Honda, Acura, etc.
    return "MR"


class SimracingKnowledgeBase:
    """Manages and queries engineering literature modules."""

    def __init__(self, directory: Path = KNOWLEDGE_DIR) -> None:
        self.directory = directory
        self._cache: dict[str, str] = {}
        self._load_files()

    def _load_files(self) -> None:
        if not self.directory.exists():
            return
        for md_file in self.directory.glob("*.md"):
            try:
                self._cache[md_file.stem] = md_file.read_text(encoding="utf-8")
            except Exception:
                pass

    def get_section(self, file_stem: str) -> str:
        return self._cache.get(file_stem, "")

    def get_car_guidelines(self, car_name: str | None) -> str:
        arch = detect_architecture(car_name)
        text = self.get_section("car_architectures")
        if not text:
            return ""

        # Extract the specific section for this architecture
        if arch == "RR":
            match = re.search(r"## 1\. Motor Trasero \(RR.*?(?=## 2\.|\Z)", text, re.DOTALL)
            return match.group(0).strip() if match else ""
        elif arch == "FR":
            match = re.search(r"## 2\. Motor Delantero Central \(FR.*?(?=## 3\.|\Z)", text, re.DOTALL)
            return match.group(0).strip() if match else ""
        else:
            match = re.search(r"## 3\. Motor Central Trasero \(MR.*?(?=\Z)", text, re.DOTALL)
            return match.group(0).strip() if match else ""

    def retrieve_context(
        self,
        car_name: str | None = None,
        query: str | None = None,
        symptoms: list[str] | None = None,
    ) -> str:
        """
        Extract relevant expert knowledge based on user query, active car, and telemetry symptoms.
        Returns a concise markdown block ready for injection into Pep's system prompt.
        """
        snippets: list[str] = []
        combined = _normalize(f"{query or ''} {' '.join(symptoms or [])}")

        # 1. Car architecture insights
        car_guide = self.get_car_guidelines(car_name)
        if car_guide:
            snippets.append(f"### Dinámica de Arquitectura del Coche ({detect_architecture(car_name)})\n{car_guide}")

        # 2. Tyre dynamics (if mentioned or relevant)
        tyre_text = self.get_section("tire_dynamics")
        if any(w in combined for w in ("presion", "neumatic", "goma", "tire", "caliente", "temperatura", "psi", "dhe", "slip")):
            snippets.append(f"### Dinámica de Neumáticos (Paul Haney / ACC DHE)\n{tyre_text}")
        elif "frenad" in combined or "trail" in combined or "gir" in combined:
            # Include at least the slip angle & friction circle rule
            match = re.search(r"## 1\. El Círculo de Adherencia.*?(?=## 2\.|\Z)", tyre_text, re.DOTALL)
            if match:
                snippets.append(f"### Principio de Círculo de Adherencia\n{match.group(0).strip()}")

        # 3. Troubleshooting Matrix (Targeted phases)
        trouble_text = self.get_section("troubleshooting_matrix")
        if any(w in combined for w in ("subviraj", "understeer", "morro", "no entra", "trail")):
            match = re.search(r"## 2\. Fase de Entrada y Giro en Apoyo.*?(?=## 3\.|\Z)", trouble_text, re.DOTALL)
            if match:
                snippets.append(f"### Solución a Subviraje en Entrada\n{match.group(0).strip()}")

            match_mid = re.search(r"## 3\. Fase de Vértice / Mitad de Curva.*?(?=## 4\.|\Z)", trouble_text, re.DOTALL)
            if match_mid:
                snippets.append(f"### Solución a Subviraje en Vértice\n{match_mid.group(0).strip()}")

        if any(w in combined for w in ("sobreviraj", "oversteer", "zaga", "traccion", "derrapa", "trompo", "cola")):
            match_exit = re.search(r"## 4\. Fase de Tracción Inicial.*?(?=## 5\.|\Z)", trouble_text, re.DOTALL)
            if match_exit:
                snippets.append(f"### Solución a Inestabilidad y Tracción\n{match_exit.group(0).strip()}")

        if any(w in combined for w in ("frenad", "brake", "reparto", "bias", "bloque")):
            match_brake = re.search(r"## 1\. Fase de Frenada Recta.*?(?=## 2\.|\Z)", trouble_text, re.DOTALL)
            if match_brake:
                snippets.append(f"### Ajustes en Frenada y Reparto (Brake Bias)\n{match_brake.group(0).strip()}")

        # 4. Chassis & ARB / Rake essentials
        chassis_text = self.get_section("chassis_dynamics")
        if any(w in combined for w in ("arb", "barra", "rake", "altura", "diferencial", "preload", "caida", "camber")):
            snippets.append(f"### Dinámica de Chasis y Setup (Carroll Smith)\n{chassis_text}")

        # If nothing specific matched, provide the core troubleshooting guide
        if len(snippets) <= 1:
            snippets.append(
                "### Guía Rápida de Setup\n"
                "- En ACC, presiones óptimas en caliente: 26.5 - 27.0 psi.\n"
                "- Subviraje en curva lenta: Ablandar ARB delantera (-1) o retrasar Brake Bias (-0.5%).\n"
                "- Subviraje en curva media/rápida: Aumentar Rake (bajar morro o subir trasera) para dar carga delantera.\n"
                "- Inestabilidad de zaga en frenada: Adelantar Brake Bias (+0.5%) o subir precarga del diferencial (+10 Nm).\n"
                "- Sobreconducir metiendo más volante cuando el neumático ya desliza destruye el tiempo de vuelta."
            )

        return "\n\n".join(snippets)


# Global singleton instance
knowledge_base = SimracingKnowledgeBase()
