import os
import sys
import tempfile
import unittest
from pathlib import Path

# Set the vault root before importing the app modules; tests use only temp storage.
TEMP = tempfile.TemporaryDirectory(prefix="madar-test-")
ROOT = Path(TEMP.name) / "MADAR" / "Data"
os.environ["MADAR_DATA_DIR"] = str(ROOT)
APP = Path(__file__).resolve().parents[1] / "app"
sys.path.insert(0, str(APP))
import local_pdf  # noqa: E402


class ManagedBookDeleteTests(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        TEMP.cleanup()

    def setUp(self):
        local_pdf.BOOKS.mkdir(parents=True, exist_ok=True)

    def make_pdf(self, name):
        path = local_pdf.BOOKS / name
        path.write_bytes(b"%PDF-1.4\\n")
        return path

    def test_deletes_managed_copy_preserves_external_original(self):
        managed = self.make_pdf("managed-copy.pdf")
        external_dir = Path(TEMP.name) / "external"
        external_dir.mkdir(exist_ok=True)
        original = external_dir / "original.pdf"
        original.write_bytes(managed.read_bytes())

        result = local_pdf.delete_book("managed-copy.pdf", True)

        self.assertTrue(result["deleted"])
        self.assertTrue(result["originalSourcePreserved"])
        self.assertFalse(managed.exists())
        self.assertTrue(original.exists())

    def test_requires_explicit_confirmation(self):
        managed = self.make_pdf("needs-confirmation.pdf")
        with self.assertRaises(PermissionError):
            local_pdf.delete_book("needs-confirmation.pdf", False)
        self.assertTrue(managed.exists())

    def test_rejects_path_traversal(self):
        with self.assertRaises(ValueError):
            local_pdf.delete_book("../outside.pdf", True)


if __name__ == "__main__":
    unittest.main()
