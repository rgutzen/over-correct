"""
Abstracted LLM interface. Currently backed by Claude (Anthropic).
Swap out the backend by setting LLM_BACKEND in your .env:
  LLM_BACKEND=claude    (default)
  LLM_BACKEND=ollama    (local, requires ollama running)
"""

import os
from typing import Iterator, Protocol, runtime_checkable


@runtime_checkable
class LLMBackend(Protocol):
    def complete(self, system: str, user: str, max_tokens: int = 512, stream: bool = True) -> Iterator[str]: ...


class ClaudeBackend:
    def __init__(self):
        import anthropic
        self._client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        # Haiku is ~3-4x faster than Sonnet for this task; override with CLAUDE_MODEL if needed
        self._model = os.environ.get("CLAUDE_MODEL", "claude-haiku-4-5-20251001")

    def complete(self, system: str, user: str, max_tokens: int = 512, stream: bool = True) -> Iterator[str]:
        # Cache the system prompt — repeated calls with the same dial range reuse it,
        # cutting input-token processing time by ~10x on cache hits.
        system_block = [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]
        if stream:
            with self._client.messages.stream(
                model=self._model,
                max_tokens=max_tokens,
                system=system_block,
                messages=[{"role": "user", "content": user}],
            ) as s:
                for text in s.text_stream:
                    yield text
        else:
            msg = self._client.messages.create(
                model=self._model,
                max_tokens=max_tokens,
                system=system_block,
                messages=[{"role": "user", "content": user}],
            )
            yield msg.content[0].text


class OllamaBackend:
    def __init__(self):
        import httpx
        self._base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
        self._model = os.environ.get("OLLAMA_MODEL", "llama3.2")
        self._client = httpx.Client(base_url=self._base_url, timeout=60)

    def complete(self, system: str, user: str, max_tokens: int = 512, stream: bool = True) -> Iterator[str]:
        import json
        payload = {
            "model": self._model,
            "prompt": f"System: {system}\n\nUser: {user}",
            "stream": stream,
            "options": {"num_predict": max_tokens},
        }
        if stream:
            with self._client.stream("POST", "/api/generate", json=payload) as r:
                for line in r.iter_lines():
                    if line:
                        chunk = json.loads(line)
                        if "response" in chunk:
                            yield chunk["response"]
                        if chunk.get("done"):
                            break
        else:
            r = self._client.post("/api/generate", json={**payload, "stream": False})
            yield r.json()["response"]


def get_backend() -> LLMBackend:
    backend_name = os.environ.get("LLM_BACKEND", "claude").lower()
    if backend_name == "ollama":
        return OllamaBackend()
    return ClaudeBackend()
