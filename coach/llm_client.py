"""
Unified LLM Client for IdoRacing Analytics.
Supports Local Ollama (qwen3.8:27b) and OpenAI-compatible APIs (OpenAI, OpenRouter, Groq, vLLM).
"""

import logging
import os

import httpx

from coach.ollama_client import OllamaClient

logger = logging.getLogger(__name__)


class LLMClient:
    """Unified client supporting both local Ollama and cloud OpenAI-compatible providers."""

    def __init__(
        self,
        provider: str = "ollama",
        ollama_base_url: str | None = None,
        ollama_model: str | None = None,
        openai_api_key: str | None = None,
        openai_base_url: str | None = None,
        openai_model: str | None = None,
        timeout: float = 120.0,
        enabled: bool = True,
    ):
        self.provider = (provider or os.environ.get("LLM_PROVIDER", "ollama")).lower()
        self.enabled = enabled

        # Ollama config
        self.ollama_model = ollama_model or os.environ.get("OLLAMA_MODEL", "qwen3.8:27b")
        self.ollama_base_url = ollama_base_url or os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
        self.ollama = OllamaClient(
            base_url=self.ollama_base_url,
            model=self.ollama_model,
            timeout=timeout,
            enabled=enabled,
        )

        # OpenAI / OpenRouter config
        self.openai_api_key = openai_api_key or os.environ.get("OPENAI_API_KEY", "")
        self.openai_base_url = (
            openai_base_url or os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
        ).rstrip("/")
        self.openai_model = openai_model or os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
        self.timeout = timeout

    @property
    def active_model(self) -> str:
        if self.provider == "openai":
            return self.openai_model
        return self.ollama_model

    def is_available(self) -> bool:
        if not self.enabled:
            return False
        if self.provider == "openai":
            return bool(self.openai_api_key.strip())
        return self.ollama.is_available()

    def generate(self, prompt: str, system_prompt: str | None = None, timeout: float | None = None) -> str | None:
        """Generate a response using the active provider."""
        if not self.enabled:
            return None

        if self.provider == "openai":
            return self._generate_openai(prompt, system_prompt, timeout=timeout)
        return self.ollama.generate(prompt, system_prompt, timeout=timeout)

    def chat(self, messages: list[dict[str, str]], timeout: float | None = None) -> str | None:
        """Multi-turn chat interaction with the race engineer."""
        if not self.enabled:
            return None

        if self.provider == "openai":
            return self._chat_openai(messages, timeout=timeout)

        # For Ollama: combine messages into conversation format
        conversation_prompt = ""
        for m in messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            conversation_prompt += f"\n[{role.upper()}]: {content}\n"
        conversation_prompt += "\n[ASSISTANT]:"

        system_msg = next((m["content"] for m in messages if m.get("role") == "system"), None)
        return self.ollama.generate(conversation_prompt, system_prompt=system_msg, timeout=timeout)

    def _generate_openai(
        self, prompt: str, system_prompt: str | None = None, timeout: float | None = None
    ) -> str | None:
        if not self.openai_api_key:
            return None

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        return self._chat_openai(messages, timeout=timeout)

    def _chat_openai(self, messages: list[dict[str, str]], timeout: float | None = None) -> str | None:
        if not self.openai_api_key:
            return None

        url = f"{self.openai_base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.openai_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.openai_model,
            "messages": messages,
            "temperature": 0.2,
        }

        effective_timeout = timeout if timeout is not None else self.timeout
        try:
            with httpx.Client(timeout=effective_timeout) as client:
                res = client.post(url, headers=headers, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    choices = data.get("choices", [])
                    if choices:
                        return choices[0].get("message", {}).get("content", "")
                logger.warning("OpenAI-compatible API returned HTTP %s", res.status_code)
        except (httpx.HTTPError, ValueError) as e:
            logger.warning("OpenAI-compatible request to %s failed: %s", self.openai_base_url, e)
        return None
