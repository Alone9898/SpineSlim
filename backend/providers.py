from dataclasses import dataclass
from urllib.parse import urlparse

PROTOCOL_OPENAI = "openai_compatible"
PROTOCOL_ANTHROPIC = "anthropic"
PROTOCOL_GEMINI = "gemini"
PROTOCOLS = (PROTOCOL_OPENAI, PROTOCOL_ANTHROPIC, PROTOCOL_GEMINI)
CUSTOM_PROVIDER = "custom"


@dataclass(frozen=True)
class ProviderPreset:
    provider_id: str
    name: str
    base_url: str
    protocol: str
    model_hint: str


# Base URLs and model IDs are suggestions; users can edit both.
# Verify against each vendor's current documentation before release.
PRESETS = (
    ProviderPreset("deepseek", "DeepSeek", "https://api.deepseek.com/v1", PROTOCOL_OPENAI, "deepseek-chat"),
    ProviderPreset("openai", "OpenAI", "https://api.openai.com/v1", PROTOCOL_OPENAI, "gpt-4o-mini"),
    ProviderPreset("anthropic", "Anthropic (Claude)", "https://api.anthropic.com/v1", PROTOCOL_ANTHROPIC, "claude-sonnet-5-5"),
    ProviderPreset("gemini", "Google (Gemini)", "https://generativelanguage.googleapis.com/v1beta", PROTOCOL_GEMINI, "gemini-2.5-flash"),
    ProviderPreset("groq", "Groq", "https://api.groq.com/openai/v1", PROTOCOL_OPENAI, "llama-3.3-70b-versatile"),
    ProviderPreset("xai", "xAI (Grok)", "https://api.x.ai/v1", PROTOCOL_OPENAI, "grok-3-mini"),
    ProviderPreset("mistral", "Mistral AI", "https://api.mistral.ai/v1", PROTOCOL_OPENAI, "mistral-small-latest"),
    ProviderPreset("openrouter", "OpenRouter", "https://openrouter.ai/api/v1", PROTOCOL_OPENAI, "openai/gpt-4o-mini"),
)

_BY_ID = {preset.provider_id: preset for preset in PRESETS}


def list_presets():
    return [preset.__dict__.copy() for preset in PRESETS]


def get_preset(provider_id):
    try:
        return _BY_ID[provider_id]
    except KeyError:
        raise ValueError("unknown_provider") from None


def validate_base_url(url):
    parsed = urlparse(url or "")
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError("invalid_base_url")
    return url.rstrip("/")


def build_model_config(provider_id, model, base_url=None, protocol=None):
    """Return a config entry without any API key. Keys are stored separately in the OS credential store."""
    if provider_id == CUSTOM_PROVIDER:
        if protocol not in PROTOCOLS:
            raise ValueError("invalid_protocol")
        resolved_base = validate_base_url(base_url)
        resolved_protocol = protocol
    else:
        preset = get_preset(provider_id)
        resolved_base = validate_base_url(base_url or preset.base_url)
        resolved_protocol = preset.protocol
    if not isinstance(model, str) or not model.strip():
        raise ValueError("invalid_model")
    return {
        "provider": provider_id,
        "base_url": resolved_base,
        "protocol": resolved_protocol,
        "model": model.strip(),
    }
