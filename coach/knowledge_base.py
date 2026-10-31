"""
Simracing Engineering Knowledge Base for Pep AI.
Loads canonical literature, setup guidelines, tyre models and vehicle dynamics
to ground LLM engineering advice in real motorsport science and simulator physics.
"""

from __future__ import annotations

import contextlib
import re
import unicodedata
from pathlib import Path

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
    if any(
        k in name
        for k in ("bmw", "aston", "amr", "mercedes", "amg", "bentley", "mustang", "corvette", "nissan", "gt-r")
    ):
        return "FR"
    # Ferrari, Audi, Lamborghini, McLaren, Honda, Acura, etc.
    return "MR"


GAMEPAD_KEYWORDS = (
    "gamepad",
    "gemepad",
    "mando",
    "joystick",
    "stick",
    "gatillo",
    "controller",
    "dualsense",
    "dualshock",
    "xbox",
)
WHEEL_KEYWORDS = (
    "volante y pedales",
    "cockpit",
    "pedalera",
    "load cell",
    "load-cell",
    "celula de carga",
    "fanatec",
    "moza",
    "simucube",
    "thrustmaster",
    "logitech g29",
    "g923",
    "direct drive",
    "steering wheel",
)
KEYBOARD_KEYWORDS = (
    "teclado",
    "keyboard",
    "wasd",
)


def detect_input_device(text: str | None = None, explicit_device: str | None = None) -> str | None:
    """Return 'gamepad', 'wheel', or 'keyboard' if explicitly selected or mentioned in conversation text."""
    if explicit_device and explicit_device.lower() in ("gamepad", "wheel", "keyboard"):
        return explicit_device.lower()
    if not text:
        return None
    norm = _normalize(text)
    if any(w in norm for w in GAMEPAD_KEYWORDS):
        return "gamepad"
    if any(w in norm for w in KEYBOARD_KEYWORDS):
        return "keyboard"
    if any(w in norm for w in WHEEL_KEYWORDS):
        return "wheel"
    return None


def get_peripheral_settings_block(device: str, lang: str = "es") -> str:
    """Return a structured Markdown block of in-game peripheral settings for guaranteed inclusion."""
    is_en = lang.lower() == "en"
    if device == "gamepad":
        if is_en:
            return (
                "**In-Game Controller Settings (Gamepad Baseline):**\n"
                "* **Brake Gamma:** `1.0 - 1.2` (near-linear so the short LT/L2 trigger travel maps predictably to 15-20% trail brake pressure).\n"
                "* **Steer Gamma:** `2.2 - 2.5` (softens center thumbstick sensitivity to avoid saturating the front slip angle on entry).\n"
                "* **Speed Sensitivity:** `60% - 70%` (scales steering lock with speed; above 85% causes sluggish slow-corner understeer).\n"
                "* **Steer Filter & Steer Speed:** Filter `90% - 98%` and Speed `50% - 70%` for smooth virtual wheel rate, plus **Deadzone** `1% - 3%` and **Steer Assist** `Enabled`."
            )
        return (
            "**Configuración de Mando (Gamepad) en el Juego (Punto de partida):**\n"
            "* **Brake Gamma:** `1.0 - 1.2` (casi lineal para que el corto recorrido del gatillo LT/L2 permita dosificar el 15-20% de freno residual sin soltar de golpe).\n"
            "* **Steer Gamma:** `2.2 - 2.5` (hace más progresivo el centro del stick izquierdo para no meter exceso de dirección de golpe y evitar subviraje de entrada).\n"
            "* **Speed Sensitivity:** `60% - 70%` (si está por encima de 85%, el filtro limita demasiado el giro en curvas lentas provocando subviraje).\n"
            "* **Steer Filter y Steer Speed:** Filtro `90% - 98%` y Velocidad `50% - 70%` para suavizar el retorno al centro, con **Deadzone** `1% - 3%` y **Steer Assist** `Activado`."
        )
    if device == "wheel":
        if is_en:
            return (
                "**In-Game Wheel & Pedal Settings (Cockpit Baseline):**\n"
                "* **Brake Gamma:** `1.0` (100% linear for Load-Cell pedals, modulating by muscle force) or `1.8 - 2.2` for potentiometer pedals.\n"
                "* **Steer Lock:** `900°` / Auto per car (`480° - 540°` real GT3 ratio) with `0%` steering deadzone.\n"
                "* **FFB Gain & Dynamic Damping:** Gain `70% - 85%` (avoid red FFB clipping in high-load corners) and **Dynamic Damping** `100%` to feel the front axle lighten when exceeding peak slip angle."
            )
        return (
            "**Configuración de Volante y Pedales (Cockpit) en el Juego:**\n"
            "* **Brake Gamma:** `1.0` (100% lineal en pedalera con célula de carga / Load-Cell para modular por presión muscular) o `1.8 - 2.2` en pedales de potenciómetro.\n"
            "* **Steer Lock (Grados de giro):** `900°` o Automático por coche (`480° - 540°` reales en GT3) con **Deadzone** al `0%`.\n"
            "* **FFB Gain y Dynamic Damping:** Ganancia al `70% - 85%` (sin llegar a *clipping* en rojo) y **Dynamic Damping** al `100%` para sentir en las manos cómo se aligera la dirección cuando el neumático delantero empieza a subvirar."
        )
    if device == "keyboard":
        if is_en:
            return (
                "**In-Game Keyboard Settings & Modulation:**\n"
                "* **Steer Assist & Stability:** Enable **Steer Assist** to smooth out digital key inputs.\n"
                "* **Speed Sensitivity & Steer Filter:** Speed Sensitivity `75% - 85%`, **Steer Filter** `95% - 100%`, and **Steer Speed** `35% - 50%` so the virtual wheel turns progressively without snapping front slip angle.\n"
                "* **Pulse Braking (Tapping) & Electronics:** Hold 100% brake in a straight line, then use **2-3 quick release taps** during turn-in instead of releasing at once, and add **+1 to +2 clicks of ABS and TC** in the garage."
            )
        return (
            "**Configuración de Teclado en el Juego y Modulación:**\n"
            "* **Steer Assist y Asistencias:** Activa **Steer Assist** en el menú de controles para estabilizar los pulsos digitales.\n"
            "* **Speed Sensitivity y Steer Filter:** Sensibilidad de velocidad al `75% - 85%`, **Steer Filter** al `95% - 100%` y **Steer Speed** al `35% - 50%` para que las ruedas delanteras giren en rampa sin saturar el agarre de golpe.\n"
            "* **Frenada por Pulsos (*Tapping*) y Electrónica:** Frena al 100% en recta y, al girar, suelta mediante **2-3 micro-pulsos rápidos (tapping)** para mantener carga en el morro, apoyándote en **+1 o +2 clics de ABS y TC** en el setup."
        )
    return ""


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
            with contextlib.suppress(OSError):
                self._cache[md_file.stem] = md_file.read_text(encoding="utf-8")

    def get_section(self, file_stem: str) -> str:
        if file_stem not in self._cache:
            md_path = self.directory / f"{file_stem}.md"
            if md_path.exists():
                with contextlib.suppress(OSError):
                    self._cache[file_stem] = md_path.read_text(encoding="utf-8")
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
        include_setup: bool = False,
        input_device: str | None = None,
    ) -> str:
        """
        Extract relevant expert knowledge based on user query, active car, and telemetry symptoms.
        Returns a concise markdown block ready for injection into Pep's system prompt.
        """
        snippets: list[str] = []
        combined = _normalize(f"{query or ''} {' '.join(symptoms or [])}")
        detected_dev = detect_input_device(query, input_device)

        # 1. Car architecture insights
        car_guide = self.get_car_guidelines(car_name)
        if car_guide:
            if not include_setup:
                car_guide = re.sub(
                    r"- .*?(?:Ajustes de setup|Ajuste de setup|Rake aerodinámico y aflojar|Brake Bias).*?\n",
                    "",
                    car_guide,
                ).strip()
            snippets.append(f"### Dinámica de Arquitectura del Coche ({detect_architecture(car_name)})\n{car_guide}")

        # 2. Tyre dynamics (if mentioned or relevant)
        tyre_text = self.get_section("tire_dynamics")
        if any(
            w in combined
            for w in ("presion", "neumatic", "goma", "tire", "caliente", "temperatura", "psi", "dhe", "slip")
        ):
            snippets.append(f"### Dinámica de Neumáticos (Paul Haney / ACC DHE)\n{tyre_text}")
        elif "frenad" in combined or "trail" in combined or "gir" in combined:
            # Include at least the slip angle & friction circle rule
            match = re.search(r"## 1\. El Círculo de Adherencia.*?(?=## 2\.|\Z)", tyre_text, re.DOTALL)
            if match:
                snippets.append(f"### Principio de Círculo de Adherencia\n{match.group(0).strip()}")

        # 3. Troubleshooting Matrix (Targeted phases)
        trouble_text = self.get_section("troubleshooting_matrix")
        if not include_setup:
            trouble_text = re.sub(
                r"- \*\*Ajuste de Setup[^\n]*\*\*.*?(?=(?:\n###|\n##|\Z))", "", trouble_text, flags=re.DOTALL
            )

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

        # 3b. Peripheral / controller driving: in-game control settings that change trail braking and understeer
        gamepad_text = self.get_section("gamepad_controller")
        if gamepad_text and (
            detected_dev is not None
            or any(w in combined for w in ("gamma", "deadzone", "zona muerta", "ffb", "force feedback"))
        ):
            snippets.append(f"### Periféricos de Conducción y Ajustes en el Juego\n{gamepad_text}")

        # 4. Chassis & ARB / Rake essentials
        chassis_text = self.get_section("chassis_dynamics")
        if include_setup and any(
            w in combined for w in ("arb", "barra", "rake", "altura", "diferencial", "preload", "caida", "camber")
        ):
            snippets.append(f"### Dinámica de Chasis y Setup (Carroll Smith)\n{chassis_text}")

        # If nothing specific matched, provide the core driving principles
        if len(snippets) <= 1:
            if include_setup:
                snippets.append(
                    "### Guía Rápida de Setup\n"
                    "- En ACC, presiones óptimas en caliente: 26.5 - 27.0 psi.\n"
                    "- Subviraje en curva lenta: Ablandar ARB delantera (-1) o retrasar Brake Bias (-0.5%).\n"
                    "- Subviraje en curva media/rápida: Aumentar Rake (bajar morro o subir trasera) para dar carga delantera.\n"
                    "- Inestabilidad de zaga en frenada: Adelantar Brake Bias (+0.5%) o subir precarga del diferencial (+10 Nm).\n"
                    "- Sobreconducir metiendo más volante cuando el neumático ya desliza destruye el tiempo de vuelta."
                )
            else:
                snippets.append(
                    "### Principios Clave de Pilotaje\n"
                    "- Círculo de adherencia: desvanecer progresivamente la frenada en curva (trail braking) para transferir agarre al giro.\n"
                    "- Evitar sobreconducir: girar más el volante cuando el neumático delantero desliza solo satura el slip angle y destruye el tiempo.\n"
                    "- Estabilizar el morro: una soltada brusca de freno descarga el eje delantero provocando subviraje inmediato."
                )

        return "\n\n".join(snippets)


# Global singleton instance
knowledge_base = SimracingKnowledgeBase()
