"""
Ollama HTTP API client for SimCoach.
Provides robust local communication with Ollama, model listing, health checks,
and timeout handling.
"""

import os
from typing import Any, Dict, List, Optional
import httpx

DEFAULT_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
DEFAULT_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3.8:27b-32k")
DEFAULT_TIMEOUT = float(os.environ.get("OLLAMA_TIMEOUT", "60.0"))
DEFAULT_AI_ENABLED = os.environ.get("AI_ENABLED", "true").lower() in ("true", "1", "yes")


class OllamaClient:
    """Client for interacting with local Ollama instance."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        timeout: Optional[float] = None,
        enabled: Optional[bool] = None,
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
        except Exception:
            return False

    def list_models(self) -> List[str]:
        """Fetch list of locally installed model names from Ollama."""
        if not self.enabled:
            return []
        try:
            with httpx.Client(timeout=3.0) as client:
                res = client.get(f"{self.base_url}/api/tags")
                if res.status_code == 200:
                    data = res.json()
                    return [m["name"] for m in data.get("models", [])]
        except Exception:
            pass
        return []

    def generate(self, prompt: str, system_prompt: Optional[str] = None) -> Optional[str]:
        """
        Send generation request to Ollama. Returns response text or None if failed/disabled.
        """
        if not self.enabled:
            return None

        payload: Dict[str, Any] = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.2,  # Low temperature for analytical consistency
            },
        }
        if system_prompt:
            payload["system"] = system_prompt

        try:
            with httpx.Client(timeout=self.timeout) as client:
                res = client.post(f"{self.base_url}/api/generate", json=payload)
                if res.status_code == 200:
                    data = res.json()
                    return data.get("response", "").strip()
        except Exception:
            return None
        return None
