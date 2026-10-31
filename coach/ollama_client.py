"""
Ollama HTTP API client for IdoRacing Analytics.
Model listing, health checks and text generation against a local Ollama server.
"""

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
DEFAULT_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3.8:27b")
DEFAULT_TIMEOUT = float(os.environ.get("OLLAMA_TIMEOUT", "120.0"))
NUM_CTX = int(os.environ.get("OLLAMA_NUM_CTX", "8192"))
NUM_PREDICT = int(os.environ.get("OLLAMA_NUM_PREDICT", "2048"))
DEFAULT_AI_ENABLED = os.environ.get("AI_ENABLED", "true").lower() in ("true", "1", "yes")


class OllamaClient:
    """Client for interacting with local Ollama instance."""

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        timeout: float | None = None,
        enabled: bool | None = None,
    ):
        self.base_url = (base_url or DEFAULT_BASE_URL).rstrip("/")
        self.model = model or DEFAULT_MODEL
        self.timeout = timeout if timeout is not None else DEFAULT_TIMEOUT
        self.enabled = enabled if enabled is not None else DEFAULT_AI_ENABLED

    def is_available(self) -> bool:
        """Check if Ollama service is reachable."""
        if not self.enabled:
            return False
        try:
            with httpx.Client(timeout=3.0) as client:
                res = client.get(f"{self.base_url}/api/tags")
                return res.status_code == 200
        except httpx.HTTPError:
            return False

    def list_models(self) -> list[str]:
        """Fetch list of locally installed model names from Ollama."""
        if not self.enabled:
            return []
        try:
            with httpx.Client(timeout=3.0) as client:
                res = client.get(f"{self.base_url}/api/tags")
                if res.status_code == 200:
                    data = res.json()
                    return [m["name"] for m in data.get("models", [])]
        except (httpx.HTTPError, ValueError) as e:
            logger.warning("Could not list Ollama models at %s: %s", self.base_url, e)
        return []

    def generate(self, prompt: str, system_prompt: str | None = None, timeout: float | None = None) -> str | None:
        """
        Send generation request to Ollama. Returns response text or None if failed/disabled.
        """
        if not self.enabled:
            return None

        payload: dict[str, Any] = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "think": False,
            "options": {
                "temperature": 0.2,  # Low temperature for analytical consistency
                "num_ctx": NUM_CTX,  # Fits the prompt (engineering manual + context) plus the full answer
                "num_predict": NUM_PREDICT,  # Room for the full 3-4 section engineer answer
            },
        }
        if system_prompt:
            payload["system"] = system_prompt

        effective_timeout = timeout if timeout is not None else self.timeout
        try:
            with httpx.Client(timeout=effective_timeout) as client:
                res = client.post(f"{self.base_url}/api/generate", json=payload)
                if res.status_code == 200:
                    data = res.json()
                    text = data.get("response", "").strip()
                    if data.get("done_reason") == "length" and text:
                        logger.warning("Ollama answer hit the num_predict limit (%s tokens)", NUM_PREDICT)
                        text += "\n\n_⚠️ Respuesta cortada por el límite de longitud del modelo. Pídeme que continúe._"
                    return text
                logger.warning("Ollama returned HTTP %s", res.status_code)
        except (httpx.HTTPError, ValueError) as e:
            logger.warning("Ollama request to %s failed: %s", self.base_url, e)
        return None
