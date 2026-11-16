from pathlib import Path
import hashlib
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
INSTALLER = (ROOT / "repair455" / "Install-Madar455-SIWC-Refresh.ps1").read_text(encoding="utf-8")


class TestV455InstallerBaselineHashing(unittest.TestCase):
    def test_v454_build_hash_is_git_blob_sha1(self):
        # Exact v4.54 BUILD.txt content from the verified storage-root baseline.
        data = b"v4.54 14050824 SU GPT-6 PORTABLE_STORAGE_ROOT_D\n"
        digest = hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()
        self.assertEqual(digest, "8a2ee471df63da20c6bc1e3b43fe72dee7ead9dc")

    def test_installer_uses_git_blob_sha1_only_for_v454(self):
        self.assertIn("function Git-BlobHash([string]$path)", INSTALLER)
        self.assertRegex(
            INSTALLER,
            r"\$digest=if \(\$sourceVersion -eq 'v4\.55'\) \{ Hash-File \$target \} else \{ Git-BlobHash \$target \}",
        )

    def test_v455_payload_hashes_remain_sha256(self):
        self.assertIn("Get-FileHash -LiteralPath $path -Algorithm SHA256", INSTALLER)
        self.assertIn("'BUILD.txt'='__HASH_BUILD__'", INSTALLER)


if __name__ == "__main__":
    unittest.main()
