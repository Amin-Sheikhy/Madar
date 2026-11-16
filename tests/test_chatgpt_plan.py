"""Regression tests for Sign in with ChatGPT refresh timing and safe diagnostics."""
import io
import sys
import unittest
import urllib.error
from email.message import Message
from pathlib import Path
from unittest.mock import patch

APP = Path(__file__).resolve().parents[1] / "app"
sys.path.insert(0, str(APP))
import chatgpt_plan as plan

SCOPE = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct"

def profile(**overrides):
    value = {
        "client_id": "oaiapp_test1234", "subject": "subject-test",
        "email": "test@example.invalid", "access_token": "ACCESS_SECRET",
        "refresh_token": "REFRESH_SECRET", "id_token": "ID_SECRET",
        "scope": SCOPE, "saved_at": 1000, "expires_in": 3600,
        "model": "gpt-6-astra",
    }
    value.update(overrides)
    return value

class ChatGPTPlanRefreshTests(unittest.TestCase):
    def test_near_expiry_but_before_earliest_refresh_uses_still_valid_access_token(self):
        saved = profile(earliest_refresh_at=4700)
        with patch.object(plan, "_load", return_value=saved), \
             patch.object(plan.time, "time", return_value=4550), \
             patch.object(plan, "_request_json") as request, \
             patch.object(plan, "_save") as save:
            result = plan._session()
        self.assertEqual(result["access_token"], "ACCESS_SECRET")
        request.assert_not_called()
        save.assert_not_called()

    def test_expired_token_waits_for_earliest_refresh_without_consuming_refresh_token(self):
        saved = profile(earliest_refresh_at=4700)
        with patch.object(plan, "_load", return_value=saved), \
             patch.object(plan.time, "time", return_value=4650), \
             patch.object(plan, "_request_json") as request:
            with self.assertRaisesRegex(RuntimeError, "REFRESH_NOT_READY"):
                plan._session()
        request.assert_not_called()

    def test_refresh_after_earliest_refresh_rotates_and_persists_all_timing_fields(self):
        saved = profile(earliest_refresh_at=4700)
        response = {"access_token": "ACCESS_NEW", "refresh_token": "REFRESH_NEW",
                    "expires_in": 3600, "earliest_refresh_at": 5000}
        with patch.object(plan, "_load", return_value=saved), \
             patch.object(plan.time, "time", return_value=4701), \
             patch.object(plan, "_request_json", return_value=response) as request, \
             patch.object(plan, "_save") as save:
            result = plan._session()
        self.assertEqual(result["access_token"], "ACCESS_NEW")
        self.assertEqual(result["refresh_token"], "REFRESH_NEW")
        self.assertEqual(result["earliest_refresh_at"], 5000)
        request.assert_called_once()
        persisted = save.call_args.args[0]
        self.assertEqual(persisted["refresh_token"], "REFRESH_NEW")
        self.assertEqual(persisted["earliest_refresh_at"], 5000)

    def test_legacy_profile_without_earliest_refresh_at_uses_sixty_second_window(self):
        saved = profile()
        response = {"access_token": "ACCESS_NEW", "refresh_token": "REFRESH_NEW", "expires_in": 3600}
        with patch.object(plan, "_load", return_value=saved), \
             patch.object(plan.time, "time", return_value=4550), \
             patch.object(plan, "_request_json", return_value=response) as request:
            result = plan._session()
        self.assertEqual(result["access_token"], "ACCESS_NEW")
        request.assert_called_once()

    def test_status_expired_means_access_token_is_actually_expired(self):
        saved = profile(earliest_refresh_at=4700)
        with patch.object(plan, "_load", return_value=saved), \
             patch.object(plan.time, "time", return_value=4550):
            result = plan.status()
        self.assertFalse(result["expired"])
        self.assertFalse(result["refreshReady"])

    def test_iso_earliest_refresh_timestamp_is_supported(self):
        self.assertEqual(plan._epoch_time("1970-01-01T01:23:20Z"), 5000)

    def test_authorization_response_persists_earliest_refresh_at(self):
        attempt = {
            "state": "state-test", "nonce": "nonce-test", "used": False,
            "deadline": plan.time.monotonic() + 60, "verifier": "pkce-verifier",
            "redirect": "http://127.0.0.1:54321/auth/callback",
            "client_id": "oaiapp_test1234", "old_subject": "subject-test",
        }
        token = {
            "id_token": "ID_SECRET", "access_token": "ACCESS_SECRET",
            "refresh_token": "REFRESH_SECRET", "scope": SCOPE,
            "expires_in": 3600, "earliest_refresh_at": "2026-11-16T08:00:00Z",
        }
        plan.ATTEMPT = attempt
        try:
            with patch.object(plan, "_load", return_value={"client_id": "oaiapp_test1234", "model": "gpt-6-astra"}), \
                 patch.object(plan, "_save") as save, \
                 patch.object(plan, "_request_json", side_effect=[token, {"keys": []}]), \
                 patch.object(plan, "verify_id_token", return_value={"subject": "subject-test", "email": "test@example.invalid"}), \
                 patch.object(plan, "_host_id", return_value="urn:uuid:00000000-0000-4000-8000-000000000001"), \
                 patch.object(plan, "_public_status", return_value={"connected": True, "permission": True}):
                plan._complete_callback(
                    {"state": ["state-test"], "code": ["123456789"], "client_id": ["oaiapp_test1234"]},
                    attempt,
                )
            persisted = save.call_args.args[0]
            self.assertEqual(persisted["earliest_refresh_at"], token["earliest_refresh_at"])
        finally:
            plan.ATTEMPT = None

class ChatGPTPlanDiagnosticsTests(unittest.TestCase):
    def make_http_error(self, url, body, request_id="req_test_123"):
        headers = Message()
        headers.add_header("x-request-id", request_id)
        return urllib.error.HTTPError(url, 400, "Bad Request", headers, io.BytesIO(body.encode("utf-8")))

    def test_refresh_error_reports_stage_code_reason_and_request_id_without_body_secrets(self):
        body = ('{"error":"invalid_grant","error_reason":"refresh_token_invalidated",'
                '"error_description":"Bearer DO_NOT_PRINT_THIS_SECRET"}')
        error = self.make_http_error(plan.TOKEN, body)
        form = b"grant_type=refresh_token&client_id=oaiapp_test1234&refresh_token=SECRET"
        with patch.object(plan.urllib.request, "urlopen", side_effect=error):
            with self.assertRaises(RuntimeError) as caught:
                plan._request_json(plan.TOKEN, method="POST", data=form,
                                   headers={"Content-Type": "application/x-www-form-urlencoded"})
        message = str(caught.exception)
        self.assertIn("TOKEN_REFRESH", message)
        self.assertIn("HTTP 400", message)
        self.assertIn("invalid_grant", message)
        self.assertIn("refresh_token_invalidated", message)
        self.assertIn("req_test_123", message)
        self.assertNotIn("DO_NOT_PRINT_THIS_SECRET", message)
        self.assertNotIn("SECRET", message)

    def test_model_catalog_error_is_distinguished_from_token_refresh(self):
        url = plan.API + "/models"
        error = self.make_http_error(url, '{"error":{"code":"model_catalog_unavailable","param":"model"}}')
        with patch.object(plan.urllib.request, "urlopen", side_effect=error):
            with self.assertRaises(RuntimeError) as caught:
                plan._request_json(url, headers={"Authorization": "Bearer SECRET"})
        self.assertIn("MODEL_CATALOG", str(caught.exception))
        self.assertIn("model_catalog_unavailable", str(caught.exception))
        self.assertNotIn("SECRET", str(caught.exception))

if __name__ == "__main__":
    unittest.main()
