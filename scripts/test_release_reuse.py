"""发布产物复用的安全边界回归。"""

import importlib.util
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "reuse", Path(__file__).with_name("release-reuse.py"))
reuse = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(reuse)


class ReuseTest(unittest.TestCase):
    def test_context_requires_exact_match(self):
        with patch.dict(os.environ, {}, clear=True):
            record = reuse.context("v2.2.0.3", "a" * 40)
            reuse.verify_context(record, record.copy())
            for key in record:
                with self.subTest(key=key), self.assertRaises(ValueError):
                    reuse.verify_context(record, {**record, key: "不一致"})
            with self.assertRaises(ValueError):
                reuse.verify_context(record, {})

    def test_signing_and_variables_affect_context(self):
        with patch.dict(os.environ, {}, clear=True):
            record = reuse.context("v2.2.0.3", "a" * 40)
            for key, value in (("IOS_PROFILE", "测试证书"),
                               ("RELEASE_VARIABLES", '{"CLOUD_SERVER_URL":"https://example.com"}')):
                with patch.dict(os.environ, {key: value}):
                    self.assertNotEqual(record, reuse.context("v2.2.0.3", "a" * 40))

    def test_only_changed_platform_recipe_blocks_reuse(self):
        with patch.dict(os.environ, {}, clear=True):
            record = reuse.context("v2.2.0.3", "a" * 40)
        other = {**record, "recipes": {**record["recipes"], "android": "已变更"}}
        reuse.verify_context(record, other, "mac")
        with self.assertRaises(ValueError):
            reuse.verify_context(record, other, "android")

    def test_invalid_run_ids(self):
        for value in ("-1", "0", "../a", "１２", "1;echo"):
            with patch.dict(os.environ, {"REUSE_MAC_RUN": value}), self.assertRaises(ValueError):
                reuse.reuse_runs()

    def test_successful_job_required(self):
        with self.assertRaises(ValueError):
            reuse.verify_job("android", [])
        with self.assertRaises(ValueError):
            reuse.verify_job("android", [{"name": "android / build", "conclusion": "failure"}])
        reuse.verify_job("android", [{"name": "android / build", "conclusion": "success"}])

    def test_ios_upload_required(self):
        job = {"name": "ios / build", "conclusion": "success", "steps": []}
        with self.assertRaises(ValueError):
            reuse.verify_job("ios", [job])
        job["steps"] = [{"name": name, "conclusion": "success"} for name in
                        ("配置签名材料", "编译与测试", "上传构建")]
        reuse.verify_job("ios", [job])

    def test_checksum_required(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            name = "test.apk"
            (directory / name).write_bytes(b"apk")
            with self.assertRaises(ValueError):
                reuse.verify_asset(directory, name)
            digest = hashlib.sha256(b"apk").hexdigest()
            (directory / f"{name}.sha256").write_text(f"{digest}  {name}\n")
            reuse.verify_asset(directory, name)
            (directory / name).write_bytes(b"changed")
            with self.assertRaises(ValueError):
                reuse.verify_asset(directory, name)

    def test_collect_mixed_runs_without_rebuilding_ios(self):
        record = {"schema": 1, "tag": "v2.2.0.3", "commit": "a" * 40,
                  "configuration_digest": "digest",
                  "recipes": {platform: "recipe" for platform in reuse.PLATFORMS}}
        jobs = [{"name": prefix, "conclusion": "success", "steps": [
            {"name": name, "conclusion": "success"}
            for name in ("配置签名材料", "编译与测试", "上传构建")]}
                for _, _, prefix in reuse.PLATFORMS.values()]

        def api(endpoint):
            return {"repository": {"full_name": "owner/repo"},
                    "path": ".github/workflows/desktop-release.yml",
                    "event": "workflow_dispatch"}

        def download(repository, run, artifact, directory):
            directory.mkdir(parents=True)
            if artifact == "release-context":
                (directory / "context.json").write_text(json.dumps(record))
            else:
                name = next(name for name_artifact, name, _ in reuse.PLATFORMS.values()
                            if name_artifact == artifact)
                (directory / name).write_bytes(b"package")
                digest = hashlib.sha256(b"package").hexdigest()
                (directory / f"{name}.sha256").write_text(f"{digest}  {name}\n")

        with tempfile.TemporaryDirectory() as temporary, patch.dict(
            os.environ, {"GITHUB_REPOSITORY": "owner/repo", "GITHUB_RUN_ID": "2"}
        ), patch.object(reuse, "gh_json", side_effect=api), patch.object(
            reuse, "run_jobs", return_value=jobs
        ), patch.object(reuse, "download", side_effect=download) as downloader:
            destination = Path(temporary) / "assets"
            runs = {"mac": "1", "windows": "1", "android": "", "ios": "1"}
            reuse.collect(record, runs, destination)
            provenance = json.loads((destination / "provenance.json").read_text())
            self.assertEqual(provenance["platform_runs"]["android"], "2")
            self.assertEqual(provenance["platform_runs"]["ios"], "1")
            self.assertEqual(len(list(destination.iterdir())), 7)
            self.assertFalse(any(call.args[2].startswith("ios-")
                                 for call in downloader.call_args_list))

    def test_workflow_skip_and_publish_guards(self):
        workflow = (Path(__file__).resolve().parents[1] /
                    ".github/workflows/desktop-release.yml").read_text()
        for platform in reuse.PLATFORMS:
            self.assertIn(f"reuse_{platform}_run:", workflow)
        self.assertIn("needs.validate.outputs.build_desktop == 'true'", workflow)
        self.assertIn("always() && needs.validate.result == 'success'", workflow)
        self.assertIn("needs.publish.result == 'success'", workflow)


if __name__ == "__main__":
    unittest.main()
