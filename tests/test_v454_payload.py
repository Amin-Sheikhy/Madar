"""Release-integrity checks for the v4.54 one-click updater."""
from hashlib import sha256
from pathlib import Path
import re
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
PATCH = ROOT / "repair454" / "patch"
APP = ROOT / "app"
sys.path.insert(0, str(APP))
import local_pdf
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
        for name in ("BUILD.txt", "madar_launcher.py", "vault_server.py", "madar_ai_server.py", "local_pdf.py"):
            with self.subTest(name=name):
                self.assertEqual((PATCH / name).read_bytes(), (APP / name).read_bytes())

    def test_installer_has_exact_supported_baselines_and_target_hash_slots(self):
        script = INSTALLER.read_text("utf-8")
        for version in ("v4.49", "v4.50", "v4.51", "v4.52"):
            with self.subTest(version=version):
                self.assertIn("'" + version + "'=@{", script)
        for token in ("__HASH_BUILD__", "__HASH_LAUNCHER__", "__HASH_VAULT__", "__HASH_SERVER__", "__HASH_LOCAL_PDF__"):
            with self.subTest(token=token):
                self.assertIn(token, script)
        self.assertIn("4938d67ab359a3e587e0db7dda0e03afd7a045bf90ffbadfa0d914b05236b7f0", script)
        self.assertIn("cd4c310e775cd51a5ddc17b3a57aa2dc20494e2b1f773d73b580afbc13680596", script)
        self.assertIn("$digest -notin $acceptedHashes", script)
        self.assertIn("Test-LegacyPdfModule", script)

    def test_local_pdf_delete_is_safe_and_preserves_external_original(self):
        self.assertIn("def delete_book(", (APP / "local_pdf.py").read_text("utf-8"))
        with tempfile.TemporaryDirectory() as tmp:
            books = Path(tmp) / "Books"
            books.mkdir()
            original = Path(tmp) / "outside.pdf"
            managed = books / "managed.pdf"
            pdf = b"%PDF-1.4\\n"
            original.write_bytes(pdf)
            managed.write_bytes(pdf)
            with patch.object(local_pdf, "BOOKS", books):
                with self.assertRaises(PermissionError):
                    local_pdf.delete_book("managed.pdf", False)
                self.assertTrue(managed.exists())
                result = local_pdf.delete_book("managed.pdf", True)
            self.assertTrue(result["deleted"])
            self.assertFalse(managed.exists())
            self.assertTrue(original.exists())

    def test_public_path_is_not_hardcoded_in_application_source(self):
        for name in ("madar_launcher.py", "vault_server.py"):
            source = (APP / name).read_text("utf-8")
            self.assertNotIn(r"D:\AWHQ CENTER\MADAR", source)

    def test_target_hashes_are_sha256_sized(self):
        for name in ("BUILD.txt", "madar_launcher.py", "vault_server.py", "madar_ai_server.py", "local_pdf.py"):
            digest = sha256((PATCH / name).read_bytes()).hexdigest()
            self.assertRegex(digest, r"^[0-9a-f]{64}$")


if __name__ == "__main__":
    unittest.main()
