"""统一发布版本及工作流依赖回归。"""

import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "release_config", Path(__file__).with_name("release-config.py"))
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


class ReleaseConfigTest(unittest.TestCase):
    def test_release_workflow_dependencies(self):
        root = Path(__file__).resolve().parents[1]
        workflow = (root / ".github/workflows/desktop-release.yml").read_text()
        self.assertIn("needs: [validate, build, android, ios]", workflow)
        self.assertIn("needs: [validate, publish]", workflow)
        self.assertIn("name: android-release", workflow)
        self.assertNotIn("PACKAGING_COMMIT", workflow)
        android = (root / ".github/workflows/android-release.yml").read_text()
        self.assertIn("apksigner", android)
        self.assertIn("testReleaseUnitTest assembleRelease", android)
        ios = (root / ".github/workflows/ios-testflight.yml").read_text()
        self.assertIn("ref: ${{ inputs.commit || github.sha }}", ios)
        self.assertIn("github.run_attempt", ios)

    def test_self_hosted_version(self):
        values = release.release_config("v2.2.0.3", "2.2.0.3")
        self.assertEqual(values["RELEASE_PACKAGE_VERSION"], "2.2.10003")
        self.assertEqual(values["ANDROID_VERSION_NAME"], "2.2.0.3")
        self.assertEqual(values["ANDROID_VERSION_CODE"], "202000003")

    def test_three_part_version(self):
        self.assertEqual(release.release_config("v2.3.1", "2.3.1")[
            "RELEASE_PACKAGE_VERSION"], "2.3.1")

    def test_android_code_is_monotonic(self):
        versions = ["2.2.0.1", "2.2.0.2", "2.2.0.9999", "2.2.1", "2.3.0"]
        codes = [int(release.release_config(f"v{v}", v)["ANDROID_VERSION_CODE"])
                 for v in versions]
        self.assertEqual(codes, sorted(set(codes)))
        self.assertLess(codes[-1], 2_100_000_000)

    def test_reject_bad_versions(self):
        for version in ["2.2.0.0", "2.2.0.10000", "2.2.1.1", "2.2.0-rc.1",
                        "21.0.0", "2.100.0", "2.2.100"]:
            with self.subTest(version=version), self.assertRaises(ValueError):
                release.release_config(f"v{version}", version)
        with self.assertRaises(ValueError):
            release.release_config("v2.2.0.3", "2.2.0.2")

    def test_missing_secrets_only_print_names(self):
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaisesRegex(ValueError, "ANDROID_KEYSTORE_BASE64"):
                release.check_secrets()

    def test_valid_secrets_and_origin(self):
        names = [
            "IOS_TEAM_ID", "IOS_BUNDLE_ID", "IOS_CERTIFICATE_P12",
            "IOS_CERTIFICATE_PASSWORD", "IOS_PROFILE", "ASC_PRIVATE_KEY",
            "ASC_KEY_ID", "ASC_ISSUER_ID", "ANDROID_KEYSTORE_BASE64",
            "ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD",
        ]
        env = {name: "仅供测试" for name in names}
        env["CLOUD_SERVER_URL"] = "https://example.com"
        with patch.dict("os.environ", env, clear=True):
            release.check_secrets()
            for origin in ["http://example.com", "https://user:pass@example.com",
                           "https://example.com/path", "https://example.com?token=x"]:
                with patch.dict("os.environ", {"CLOUD_SERVER_URL": origin}):
                    with self.assertRaises(ValueError):
                        release.check_secrets()


if __name__ == "__main__":
    unittest.main()
