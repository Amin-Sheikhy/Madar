from pathlib import Path
import hashlib
import unittest

ROOT = Path(__file__).resolve().parents[1]
INSTALLER = (ROOT / "repair456" / "Install-Madar456-SIWC-Repair.ps1").read_text(encoding="utf-8")


class MadarV456InstallerBaselineTests(unittest.TestCase):
    def test_v455_build_identity_matches_git_blob_sha1(self):
        data = b"v4.55 14050825 MO GPT-6 SIWC_REFRESH_WINDOW_DIAGNOSTICS\n"
        digest = hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()
        self.assertEqual(digest, "9da9234c1df9ba7fb1a4e295e98d4a1f3e6fff2a")

    def test_installer_checks_v455_baseline_and_v456_payload(self):
        self.assertIn("'BUILD.txt'='9da9234c1df9ba7fb1a4e295e98d4a1f3e6fff2a'", INSTALLER)
        self.assertIn("'chatgpt_plan.py'='7041e5877ae870a39a9e763e9d4c283d2aa644e2'", INSTALLER)
        self.assertIn("'madar_ai_server.py'='50623753079d9e25672fafa33064bf6a9a06fa66'", INSTALLER)
        self.assertIn("'chatgpt_ui.js'='213b365070b50318b1ce2cb9df257fe0aada5610'", INSTALLER)
        self.assertIn("'dashboard_v452.js'='01cd772d61cad2f6004bdbd0147f67ed36a30db0'", INSTALLER)
        self.assertIn("'sw.js'='996d9d528be5f3fcf52780e442fbb0fbf795a886'", INSTALLER)
        self.assertIn("if ($sourceVersion -eq 'v4.56') { Hash-File $target } else { Git-BlobHash $target }", INSTALLER)

    def test_installer_updates_exactly_six_program_files(self):
        expected = "$files = @('BUILD.txt','chatgpt_plan.py','madar_ai_server.py','chatgpt_ui.js','dashboard_v452.js','sw.js')"
        self.assertIn(expected, INSTALLER)
        self.assertIn("learnerDataModified=$false; managedBooksModified=$false; automaticUpload=$false", INSTALLER)

    def test_installer_accepts_only_v455_or_v456(self):
        self.assertIn("@('v4.55','v4.56')", INSTALLER)
        self.assertIn("Wait-ForV456", INSTALLER)


if __name__ == "__main__":
    unittest.main()
