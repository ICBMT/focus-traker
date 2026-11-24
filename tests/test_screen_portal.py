"""Worker guard tests, not a real portal/PipeWire or hardware test."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

WORKER = Path(__file__).resolve().parents[1] / "src-tauri/resources/screen_portal.py"


def load_worker():
    spec = importlib.util.spec_from_file_location("focus_screen_worker", WORKER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ScreenPortalGuardTests(unittest.TestCase):
    def test_import_has_no_capture_or_output_side_effect(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), patch.dict(sys.modules, {"gi": None}):
            worker = load_worker()
        self.assertTrue(callable(worker.main))
        self.assertEqual(out.getvalue(), "")

    def test_missing_optional_gi_fails_before_any_portal_selection(self):
        worker = load_worker()
        out = io.StringIO()
        with contextlib.redirect_stdout(out), patch.dict(sys.modules, {"gi": None}):
            self.assertEqual(worker.main(), 1)
        self.assertEqual(json.loads(out.getvalue()), {"error": "dependencies"})
        self.assertNotIn("traceback", out.getvalue().lower())

    def test_protocol_is_one_bounded_json_line_not_arbitrary_log_text(self):
        worker = load_worker()
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            worker.emit({"ready": True})
        self.assertEqual(out.getvalue(), '{"ready":true}\n')


if __name__ == "__main__":
    unittest.main()
