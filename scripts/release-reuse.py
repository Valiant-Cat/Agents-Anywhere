"""复用同一版本、源码及发布配置的已成功平台产物。"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess


PLATFORMS = {
    "mac": ("desktop-mac", "Agents-Anywhere-latest.dmg", "build (macos-15,"),
    "windows": ("desktop-win", "Agents-Anywhere-Setup-latest.exe", "build (windows-latest,"),
    "android": ("android-release", "Agents-Anywhere-latest.apk", "android / build"),
    "ios": (None, None, "ios / build"),
}
SIGNING_INPUTS = (
    "ANDROID_KEYSTORE_BASE64", "ANDROID_KEY_ALIAS", "IOS_CERTIFICATE_P12",
    "IOS_PROFILE", "ASC_KEY_ID", "ASC_ISSUER_ID", "MAC_CERT_P12_BASE64",
    "MACOS_SIGN_IDENTITY", "APPLE_ID", "APPLE_TEAM_ID", "WIN_CERT_P12_BASE64",
)
DESKTOP_MATRIX = [
    {"os": "macos-15", "platform": "mac", "arch": "universal",
     "extension": "dmg", "asset": "Agents-Anywhere-latest.dmg"},
    {"os": "windows-latest", "platform": "win", "arch": "x64",
     "extension": "exe", "asset": "Agents-Anywhere-Setup-latest.exe"},
]


def reuse_runs():
    runs = {}
    for platform in PLATFORMS:
        value = os.environ.get(f"REUSE_{platform.upper()}_RUN", "").strip()
        if value and (not value.isascii() or not value.isdecimal() or int(value) <= 0):
            raise ValueError(f"{platform} 复用运行编号必须是正整数")
        runs[platform] = value
    return runs


def context(tag, commit):
    # 不记录私钥、口令或配置原文；证书材料参与摘要，防止换签名后误复用。
    settings = {
        "variables": json.loads(os.environ.get("RELEASE_VARIABLES", "{}")),
        "signing": {key: os.environ.get(key, "") for key in SIGNING_INPUTS},
    }
    digest = hashlib.sha256(json.dumps(
        settings, sort_keys=True, ensure_ascii=True).encode()).hexdigest()
    root = Path(__file__).resolve().parents[1]
    shared = (root / ".github/workflows/desktop-release.yml").read_bytes()
    recipes = {}
    for platform in PLATFORMS:
        extra = {"android": "android-release.yml", "ios": "ios-testflight.yml"}.get(platform)
        content = shared
        if extra:
            content += (root / ".github/workflows" / extra).read_bytes()
        recipes[platform] = hashlib.sha256(content).hexdigest()
    return {"schema": 1, "tag": tag, "commit": commit,
            "configuration_digest": digest, "recipes": recipes}


def verify_context(expected, actual, platform=None):
    keys = ("schema", "tag", "commit", "configuration_digest")
    if (expected.get("schema") != 1
            or any(expected.get(key) != actual.get(key) for key in keys)
            or not isinstance(actual.get("recipes"), dict)
            or (platform and expected["recipes"][platform] != actual["recipes"].get(platform))
            or (not platform and expected.get("recipes") != actual.get("recipes"))):
        raise ValueError("复用产物的版本、源码或发布配置不一致，必须重新构建")


def verify_job(platform, jobs):
    matches = [job for job in jobs if job["name"].startswith(PLATFORMS[platform][2])]
    if len(matches) != 1 or matches[0]["conclusion"] != "success":
        raise ValueError(f"{platform} 来源任务未成功，不能复用")
    if platform == "ios":
        steps = {step["name"]: step["conclusion"] for step in matches[0]["steps"]}
        if any(steps.get(name) != "success" for name in (
                "配置签名材料", "编译与测试", "上传构建")):
            raise ValueError("iOS 未完成测试、签名和 TestFlight 上传")


def verify_asset(directory, name):
    asset = directory / name
    checksum = directory / f"{name}.sha256"
    if asset.is_symlink() or checksum.is_symlink() or not asset.is_file() or not checksum.is_file():
        raise ValueError(f"安装包或校验文件缺失：{name}")
    fields = checksum.read_text().strip().split()
    with asset.open("rb") as file:
        digest = hashlib.file_digest(file, "sha256").hexdigest()
    if fields != [digest, name] or asset.stat().st_size == 0:
        raise ValueError(f"安装包校验失败：{name}")


def gh_json(endpoint):
    return json.loads(subprocess.check_output(
        ["gh", "api", endpoint], text=True, timeout=60))


def run_jobs(repository, run):
    jobs = []
    page = 1
    while True:
        batch = gh_json(f"repos/{repository}/actions/runs/{run}/jobs?per_page=100&page={page}")["jobs"]
        jobs.extend(batch)
        if len(batch) < 100:
            return jobs
        page += 1


def download(repository, run, name, directory):
    subprocess.run(["gh", "run", "download", run, "--repo", repository,
                    "--name", name, "--dir", str(directory)], check=True, timeout=600)


def collect(expected, runs, destination, preflight=False):
    repository = os.environ["GITHUB_REPOSITORY"]
    current = os.environ["GITHUB_RUN_ID"]
    destination.mkdir(parents=True, exist_ok=False)
    cache = destination.parent / "reuse-downloads"
    verified = {}
    sources = {}
    for platform, (artifact, name, _) in PLATFORMS.items():
        if preflight and not runs[platform]:
            continue
        run = runs[platform] or current
        if run not in verified:
            metadata = gh_json(f"repos/{repository}/actions/runs/{run}")
            if (metadata["repository"]["full_name"] != repository
                    or metadata["path"] != ".github/workflows/desktop-release.yml"
                    or metadata["event"] not in ("push", "workflow_dispatch")):
                raise ValueError("来源必须是本仓库的正式发布工作流")
            directory = cache / run / "context"
            download(repository, run, "release-context", directory)
            verified[run] = (run_jobs(repository, run),
                             json.loads((directory / "context.json").read_text()))
        jobs, actual = verified[run]
        verify_context(expected, actual, platform)
        verify_job(platform, jobs)
        sources[platform] = run
        if artifact:
            if preflight:
                artifacts = gh_json(
                    f"repos/{repository}/actions/runs/{run}/artifacts?per_page=100")["artifacts"]
                if not any(item["name"] == artifact and not item["expired"] for item in artifacts):
                    raise ValueError(f"来源产物不存在或已过期：{artifact}")
                continue
            directory = cache / run / platform
            download(repository, run, artifact, directory)
            verify_asset(directory, name)
            for filename in (name, f"{name}.sha256"):
                shutil.copyfile(directory / filename, destination / filename)
    if not preflight:
        (destination / "provenance.json").write_text(
            json.dumps({"context": expected, "platform_runs": sources}, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("prepare", "collect"))
    parser.add_argument("--tag", required=True)
    parser.add_argument("--commit", required=True)
    args = parser.parse_args()
    runs = reuse_runs()
    if args.command == "prepare":
        record = context(args.tag, args.commit)
        Path("release-context").mkdir()
        Path("release-context/context.json").write_text(json.dumps(record) + "\n")
        if any(runs.values()):
            collect(record, runs, Path("reuse-preflight"), preflight=True)
        matrix = [item for item in DESKTOP_MATRIX
                  if not runs["windows" if item["platform"] == "win" else "mac"]]
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            output.write(f"matrix={json.dumps({'include': matrix or DESKTOP_MATRIX[:1]})}\n")
            output.write(f"build_desktop={'true' if matrix else 'false'}\n")
    else:
        directory = Path("expected-context")
        download(os.environ["GITHUB_REPOSITORY"], os.environ["GITHUB_RUN_ID"],
                 "release-context", directory)
        record = json.loads((directory / "context.json").read_text())
        if record["tag"] != args.tag or record["commit"] != args.commit:
            raise ValueError("本次发布上下文不一致")
        collect(record, runs, Path("assets"))


if __name__ == "__main__":
    main()
