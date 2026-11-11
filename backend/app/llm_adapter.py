from abc import ABC, abstractmethod
from typing import Literal

from app.schemas import AssistantContextResponse


class LLMAdapter(ABC):
    """Abstract interface for optional external LLM response synthesis.

    Implementations must ground their responses strictly on the verified facts
    provided in AssistantContextResponse and must not fabricate transactions or numbers.
    """

    @abstractmethod
    def generate_response(
        self,
        query: str,
        context: AssistantContextResponse,
    ) -> str | None:
        """Synthesize a conversational response given the query and ground-truth facts.

        Returns None if the adapter is disabled, unconfigured, or fails, triggering
        fallback to the deterministic query engine.
        """
        raise NotImplementedError


class DisabledLLMAdapter(LLMAdapter):
    """Default adapter operating completely offline with zero API calls or external keys."""

    def generate_response(
        self,
        query: str,
        context: AssistantContextResponse,
    ) -> str | None:
        return None


def get_llm_adapter() -> LLMAdapter:
    """Return the active LLM adapter instance.

    In Phase 2, this strictly returns the offline DisabledLLMAdapter.
    """
    return DisabledLLMAdapter()

