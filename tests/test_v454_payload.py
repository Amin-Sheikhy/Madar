"""Release-integrity checks for the v4.54 one-click updater."""
from hashlib import sha256
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
PATCH = ROOT / "repair454" / "patch"
APP = ROOT / "app"
INSTALLER = ROOT / "repair454" / "Install-Madar454-Storage-Root.ps1"
BUILD_ID = "v4.54 14050824 SU GPT-6 PORTABLE_STORAGE_ROOT_D"


class V454PayloadTests(unittest.TestCase):
    def test_build_identity_is_consistent(self):
        self.assertEqual((APP / "BUILD.txt").read_text("utf-8").strip(), BUILD_ID)
        self.assertEqual((PATCH / "BUILD.txt").read_text("utf-8").strip(), BUILD_ID)
        server = (APP / "madar_ai_server.py").read_text("utf-8")
        self.assertIn("'version':'v4.54'", server)
        self.assertIn("MADAR v4.54 |", server)

    def test_overlay_files_match_the_application_source(self):
        for name in ("BUILD.txt", "madar_launcher.py", "vault_server.py", "madar_ai_server.py"):
            with self.subTest(name=name):
                self.assertEqual((PATCH / name).read_bytes(), (APP / name).read_bytes())

    def test_installer_has_exact_supported_baselines_and_target_hash_slots(self):
        script = INSTALLER.read_text("utf-8")
        for version in ("v4.49", "v4.50", "v4.51", "v4.52", "v4.53"):
            with self.subTest(version=version):
                self.assertIn("'" + version + "':@{", script)
        for token in ("__HASH_BUILD__", "__HASH_LAUNCHER__", "__HASH_VAULT__", "__HASH_SERVER__"):
            with self.subTest(token=token):
                self.assertIn(token, script)

    def test_public_path_is_not_hardcoded_in_application_source(self):
        for name in ("madar_launcher.py", "vault_server.py"):
            source = (APP / name).read_text("utf-8")
            self.assertNotIn(r"D:\AWHQ CENTER\MADAR", source)

    def test_target_hashes_are_sha256_sized(self):
        for name in ("BUILD.txt", "madar_launcher.py", "vault_server.py", "madar_ai_server.py"):
            digest = sha256((PATCH / name).read_bytes()).hexdigest()
            self.assertRegex(digest, r"^[0-9a-f]{64}$")


if __name__ == "__main__":
    unittest.main()
