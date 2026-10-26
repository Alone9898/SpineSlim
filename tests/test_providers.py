import unittest

from backend.providers import (
    CUSTOM_PROVIDER,
    PROTOCOL_ANTHROPIC,
    PROTOCOL_OPENAI,
    build_model_config,
    get_preset,
    list_presets,
)


class ProviderPresetTests(unittest.TestCase):
    def test_lists_all_builtin_vendors_without_keys(self):
        presets = list_presets()

        self.assertEqual(
            [preset["provider_id"] for preset in presets],
            ["deepseek", "openai", "anthropic", "gemini", "groq", "xai", "mistral", "openrouter"],
        )
        self.assertNotIn("api_key", presets[0])

    def test_openai_compatible_vendors_share_protocol(self):
        self.assertEqual(get_preset("groq").protocol, PROTOCOL_OPENAI)
        self.assertEqual(get_preset("anthropic").protocol, PROTOCOL_ANTHROPIC)

    def test_unknown_provider_is_rejected(self):
        with self.assertRaises(ValueError) as raised:
            get_preset("nope")

        self.assertEqual(str(raised.exception), "unknown_provider")


class ModelConfigTests(unittest.TestCase):
    def test_preset_uses_default_base_url_and_protocol(self):
        config = build_model_config("deepseek", "deepseek-chat")

        self.assertEqual(config, {
            "provider": "deepseek",
            "base_url": "https://api.deepseek.com",
            "protocol": PROTOCOL_OPENAI,
            "model": "deepseek-chat",
        })

    def test_user_can_override_base_url_and_trailing_slash_is_removed(self):
        config = build_model_config("openai", " gpt-4o ", base_url="https://proxy.example.com/v1/")

        self.assertEqual(config["base_url"], "https://proxy.example.com/v1")
        self.assertEqual(config["model"], "gpt-4o")

    def test_custom_provider_requires_protocol(self):
        with self.assertRaises(ValueError) as raised:
            build_model_config(CUSTOM_PROVIDER, "m", base_url="https://x.example.com/v1")

        self.assertEqual(str(raised.exception), "invalid_protocol")

    def test_empty_base_url_falls_back_to_preset(self):
        config = build_model_config("openai", "gpt-4o", base_url="")

        self.assertEqual(config["base_url"], "https://api.openai.com/v1")

    def test_rejects_non_https_base_url(self):
        for url in ("http://api.example.com/v1", "api.example.com", "https://"):
            with self.subTest(url=url):
                with self.assertRaises(ValueError) as raised:
                    build_model_config(CUSTOM_PROVIDER, "m", base_url=url, protocol=PROTOCOL_OPENAI)
                self.assertEqual(str(raised.exception), "invalid_base_url")

    def test_rejects_empty_model(self):
        with self.assertRaises(ValueError) as raised:
            build_model_config("openai", "  ")

        self.assertEqual(str(raised.exception), "invalid_model")

    def test_config_never_contains_key_fields(self):
        config = build_model_config("groq", "llama-3.3-70b-versatile")

        self.assertFalse(any("key" in name.lower() for name in config))


if __name__ == "__main__":
    unittest.main()
