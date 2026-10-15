import unittest
from tempfile import TemporaryDirectory
from pathlib import Path

from spine_tools.converter import (
    SpineConversionError,
    check_spine_converter,
    classify_spine_version,
    run_spine_converter,
)


class SpineConverterTests(unittest.TestCase):
    def test_classifies_spine_38_for_upgrade(self):
        self.assertEqual(classify_spine_version("3.8.99"), "upgrade")

    def test_classifies_spine_42_as_already_upgraded(self):
        self.assertEqual(classify_spine_version("4.2.11"), "already_4_2")

    def test_classifies_all_supported_older_versions_for_upgrade(self):
        versions = ("3.5.1", "3.6.53", "3.7.94", "3.8.99", "4.0.64", "4.1.24")

        for version in versions:
            with self.subTest(version=version):
                self.assertEqual(classify_spine_version(version), "upgrade")

    def test_runs_converter_with_fixed_target_version_and_no_curve_option(self):
        calls = []

        def fake_runner(command, **kwargs):
            calls.append((command, kwargs))
            return type("Result", (), {"returncode": 0, "stdout": "", "stderr": ""})()

        run_spine_converter(
            Path("converter.exe"),
            Path("input.json"),
            Path("temporary.json"),
            runner=fake_runner,
        )

        self.assertEqual(
            calls[0][0],
            [
                "converter.exe",
                "input.json",
                "temporary.json",
                "-v",
                "4.2.11",
            ],
        )
        self.assertNotIn("--remove-curve", calls[0][0])

    def test_converter_failure_includes_exit_code_and_stderr(self):
        def fake_runner(command, **kwargs):
            return type(
                "Result",
                (),
                {"returncode": 7, "stdout": "", "stderr": "bad skeleton"},
            )()

        with self.assertRaisesRegex(
            SpineConversionError, "code 7: bad skeleton"
        ):
            run_spine_converter(
                Path("converter.exe"),
                Path("input.json"),
                Path("temporary.json"),
                runner=fake_runner,
            )

    def test_preflight_calls_converter_help(self):
        calls = []

        def fake_runner(command, **kwargs):
            calls.append(command)
            return type("Result", (), {"returncode": 0, "stdout": "Usage", "stderr": ""})()

        with TemporaryDirectory() as temporary_dir:
            executable = Path(temporary_dir) / "converter.exe"
            executable.touch()
            check_spine_converter(executable, runner=fake_runner)

        self.assertEqual(calls, [[str(executable), "--help"]])


if __name__ == "__main__":
    unittest.main()
