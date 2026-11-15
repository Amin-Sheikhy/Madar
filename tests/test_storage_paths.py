"""Regression tests for the Madar local storage-root rules."""
from pathlib import Path
import os
import sys
import unittest
from unittest.mock import patch

APP_SOURCE = Path(__file__).resolve().parents[1] / "app"
sys.path.insert(0, str(APP_SOURCE))

import madar_launcher
import vault_server


class StoragePathTests(unittest.TestCase):
    def test_installed_launcher_uses_parent_of_app_folder(self):
        with patch.object(madar_launcher, "APP_DIR", Path("/install/Madar/App")):
            self.assertEqual(madar_launcher.default_home(), Path("/install/Madar"))

    def test_source_checkout_defaults_outside_repository(self):
        with patch.object(madar_launcher, "APP_DIR", Path("/repo/Madar/app")), patch.dict(
            os.environ, {"LOCALAPPDATA": "/private/local-app-data"}, clear=False
        ):
            self.assertEqual(madar_launcher.default_home(), Path("/private/local-app-data/Madar"))

    def test_installed_vault_uses_data_folder_under_install_root(self):
        with patch.object(vault_server, "ROOT", Path("/install/Madar/App")), patch.dict(
            os.environ, {"MADAR_DATA_DIR": ""}, clear=False
        ):
            self.assertEqual(vault_server.default_data_root(), Path("/install/Madar/Data"))

    def test_vault_honors_explicit_data_directory_override(self):
        with patch.object(vault_server, "ROOT", Path("/install/Madar/App")), patch.dict(
            os.environ, {"MADAR_DATA_DIR": "/custom/madar-data"}, clear=False
        ):
            self.assertEqual(vault_server.default_data_root(), Path("/custom/madar-data"))


if __name__ == "__main__":
    unittest.main()
