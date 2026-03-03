"""
Core dial routing logic.

dial < 0  → algorithmic chaos (no LLM needed)
dial = 0  → pass-through
dial > 0  → LLM-based correction/transformation, streamed
"""

import threading
from typing import Iterator
from .chaos import apply_chaos
from .prompts import get_prompts
from .llm import get_backend, LLMBackend

_backend: LLMBackend | None = None
_backend_lock = threading.Lock()


def _get_backend() -> LLMBackend:
    global _backend
    if _backend is None:
        with _backend_lock:
            if _backend is None:  # double-checked locking
                _backend = get_backend()
    return _backend


def process(text: str, dial: float) -> Iterator[str]:
    """
    Process text according to dial value.
    Always yields at least one string chunk; multiple chunks when streaming.
    """
    if not text.strip():
        yield text
        return

    if dial == 0.0:
        yield text
        return

    if dial < 0.0:
        yield apply_chaos(text, dial)
        return

    # dial > 0: LLM path
    system, user = get_prompts(text, dial)
    backend = _get_backend()
    # Budget tokens proportional to input size (1 token ≈ 4 chars, 1.5x buffer)
    max_tokens = max(256, min(2048, len(text) * 3 // 8))
    yield from backend.complete(system, user, max_tokens=max_tokens, stream=True)
