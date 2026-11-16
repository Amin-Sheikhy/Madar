from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"


class MadarV456BuildIdentityTests(unittest.TestCase):
    def read(self, name):
        return (APP / name).read_text(encoding="utf-8")

    def test_health_and_startup_version_are_read_from_build_txt(self):
        server = self.read("madar_ai_server.py")
        self.assertIn("def build_info():", server)
        self.assertIn("'version':build_info()[0]", server)
        self.assertIn("'buildLabel':build_info()[1]", server)
        self.assertIn("print('MADAR ' + build_info()[0]", server)

    def test_dashboard_uses_server_build_label_and_has_no_hardcoded_v452_badge(self):
        dashboard = self.read("dashboard_v452.js")
        self.assertIn("h.buildLabel||version", dashboard)
        self.assertIn("buildNode.textContent=buildLabel", dashboard)
        self.assertNotIn("version.title='v4.52", dashboard)
        self.assertIn("document.title='مَدار '+buildLabel", dashboard)

    def test_chatgpt_panel_surfaces_fresh_login_after_invalid_grant(self):
        ui = self.read("chatgpt_ui.js")
        self.assertIn("CHATGPT_REAUTH_REQUIRED", ui)
        self.assertIn("account=await call('status')", ui)
        self.assertIn("account.error='توکن قبلی از سوی OpenAI رد شده است", ui)
        self.assertIn("madar:chatgpt-status", ui)

    def test_service_worker_cache_is_bumped_for_v456(self):
        sw = self.read("sw.js")
        self.assertIn("madar-ui-4.56-siwc-reauth-buildlabel", sw)
        self.assertNotIn("madar-ui-4.53-books-delete-direct", sw)

    def test_build_file_contains_exact_v456_identity(self):
        self.assertTrue((APP / "BUILD.txt").read_text(encoding="utf-8").startswith(
            "v4.56 14050825 MO GPT-6 SIWC_REAUTH_AND_BUILD_LABEL_FIX"
        ))


if __name__ == "__main__":
    unittest.main()
