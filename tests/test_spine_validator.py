import unittest

from spine_tools.validator import validate_spine_json


class SpineValidatorTests(unittest.TestCase):
    def test_accepts_minimal_valid_spine_json(self):
        data = {
            "skeleton": {"spine": "4.2.11"},
            "bones": [{"name": "root"}],
            "slots": [],
            "skins": [],
            "animations": {},
        }

        result = validate_spine_json(data)

        self.assertTrue(result.success)
        self.assertEqual(result.errors, [])

    def test_rejects_non_object_json(self):
        result = validate_spine_json(None)

        self.assertFalse(result.success)
        self.assertEqual(result.errors, ["root_not_object"])

    def test_rejects_negative_attachment_frame_time(self):
        data = {
            "skeleton": {"spine": "4.2.11"},
            "bones": [{"name": "root"}],
            "slots": [{"name": "face", "bone": "root"}],
            "skins": [],
            "animations": {
                "idle": {
                    "slots": {
                        "face": {
                            "attachment": [{"time": -0.1, "name": "smile"}]
                        }
                    }
                }
            },
        }

        result = validate_spine_json(data)

        self.assertFalse(result.success)
        self.assertIn("negative_attachment_time:idle:face", result.errors)


if __name__ == "__main__":
    unittest.main()
