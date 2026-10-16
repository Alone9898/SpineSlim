import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tool_manager import TOOL_INFO, inspect_tools


class BundledToolsTest(unittest.TestCase):
    def test_all_tools_resolve_inside_bundle_without_configuration_or_path(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            expected = {}
            for key, (_, filename, _, _) in TOOL_INFO.items():
                directory = root / "tools" / key
                if key == "texturepacker":
                    directory /= "bin"
                directory.mkdir(parents=True)
                executable = directory / filename
                executable.touch()
                expected[key] = str(executable.resolve())
            with patch("tool_manager.shutil.which", return_value=None):
                self.assertEqual(inspect_tools(root), expected)
                self.assertEqual(inspect_tools(root, {key: str(root / "missing.exe") for key in TOOL_INFO}), expected)


if __name__ == "__main__":
    unittest.main()
