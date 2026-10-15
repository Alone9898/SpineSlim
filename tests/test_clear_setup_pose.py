import copy
import unittest

from spine_tools.clear_setup_pose import clear_setup_pose


class ClearSetupPoseTests(unittest.TestCase):
    def test_creates_time_zero_attachment_timeline(self):
        source = {
            "skeleton": {"spine": "4.2.11"},
            "bones": [{"name": "root"}],
            "slots": [
                {"name": "face", "bone": "root", "attachment": "smile"}
            ],
            "skins": [],
            "animations": {"idle": {}},
        }

        result = clear_setup_pose(copy.deepcopy(source))

        self.assertNotIn("attachment", result.data["slots"][0])
        self.assertEqual(
            result.data["animations"]["idle"]["slots"]["face"]["attachment"],
            [{"time": 0, "name": "smile"}],
        )

    def test_prepends_time_zero_frame_before_later_first_frame(self):
        source = {
            "slots": [
                {"name": "face", "bone": "root", "attachment": "smile"}
            ],
            "animations": {
                "idle": {
                    "slots": {
                        "face": {
                            "attachment": [{"time": 0.5, "name": "blink"}]
                        }
                    }
                }
            },
        }

        result = clear_setup_pose(copy.deepcopy(source))

        self.assertEqual(
            result.data["animations"]["idle"]["slots"]["face"]["attachment"],
            [
                {"time": 0, "name": "smile"},
                {"time": 0.5, "name": "blink"},
            ],
        )

    def test_creates_time_zero_frame_for_empty_attachment_timeline(self):
        source = {
            "slots": [{"name": "face", "attachment": "smile"}],
            "animations": {
                "idle": {"slots": {"face": {"attachment": []}}}
            },
        }

        result = clear_setup_pose(copy.deepcopy(source))

        self.assertEqual(
            result.data["animations"]["idle"]["slots"]["face"]["attachment"],
            [{"time": 0, "name": "smile"}],
        )

    def test_reports_transform_counts(self):
        source = {
            "slots": [{"name": "face", "attachment": "smile"}],
            "animations": {
                "created": {},
                "prepended": {
                    "slots": {
                        "face": {
                            "attachment": [{"time": 1, "name": "blink"}]
                        }
                    }
                },
                "preserved": {
                    "slots": {
                        "face": {
                            "attachment": [{"time": 0, "name": "neutral"}]
                        }
                    }
                },
            },
        }

        result = clear_setup_pose(copy.deepcopy(source))

        self.assertEqual(result.setup_attachment_count, 1)
        self.assertEqual(result.created_timeline_count, 1)
        self.assertEqual(result.prepended_frame_count, 1)
        self.assertEqual(result.preserved_time_zero_frame_count, 1)

    def test_rejects_setup_attachment_when_no_animation_can_receive_it(self):
        source = {
            "slots": [{"name": "face", "attachment": "smile"}],
            "animations": {},
        }
        working = copy.deepcopy(source)

        with self.assertRaisesRegex(ValueError, "no animations"):
            clear_setup_pose(working)

        self.assertEqual(working, source)


if __name__ == "__main__":
    unittest.main()
