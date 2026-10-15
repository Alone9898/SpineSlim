import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import app_runtime


class RuntimeDirectoryTests(unittest.TestCase):
    def test_source_tools_are_resolved_beside_source(self):
        with patch.object(sys, "frozen", False, create=True):
            self.assertEqual(
                app_runtime.get_application_directory(),
                Path(app_runtime.__file__).resolve().parent,
            )

    def test_frozen_tools_are_resolved_beside_exe_not_extraction_directory(self):
        executable = Path("portable") / "SpineSlim.exe"
        with (
            patch.object(sys, "frozen", True, create=True),
            patch.object(sys, "executable", str(executable)),
            patch.object(sys, "_MEIPASS", "temporary-extraction", create=True),
        ):
            self.assertEqual(
                app_runtime.get_application_directory(), executable.resolve().parent
            )
