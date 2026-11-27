"""从 CI 的已推送提交编译、签名并上传 iOS 构建。"""

import base64
import json
import os
from pathlib import Path
import plistlib
import secrets
import shlex
import shutil
import subprocess
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
WORK = Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "aa-ios"
KEYCHAIN = WORK / "signing.keychain-db"
PROFILE = Path.home() / "Library/MobileDevice/Provisioning Profiles/aa-testflight.mobileprovision"
KEY_DIR = WORK / "private_keys"


def run(*args, **kwargs):
    result = subprocess.run(args, check=False, **kwargs)
    if result.returncode:
        raise RuntimeError(f"{args[0]} 执行失败，退出码 {result.returncode}")
    return result


def required(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"缺少配置：{name}")
    return value


def prepare_signing():
    WORK.mkdir(parents=True, exist_ok=True)
    os.chmod(WORK, 0o700)
    certificate = WORK / "distribution.p12"
    certificate.write_bytes(base64.b64decode(required("IOS_CERTIFICATE_P12"), validate=True))
    PROFILE.parent.mkdir(parents=True, exist_ok=True)
    PROFILE.write_bytes(base64.b64decode(required("IOS_PROFILE"), validate=True))
    decoded = run("security", "cms", "-D", "-i", str(PROFILE), capture_output=True).stdout
    profile = plistlib.loads(decoded)
    team = required("IOS_TEAM_ID")
    bundle = required("IOS_BUNDLE_ID")
    entitlements = profile["Entitlements"]
    if (team not in profile["TeamIdentifier"]
            or entitlements.get("application-identifier") != f"{team}.{bundle}"
            or entitlements.get("get-task-allow", False)
            or "ProvisionedDevices" in profile
            or profile.get("ProvisionsAllDevices", False)):
        raise ValueError("描述文件不是目标应用的 App Store 分发配置")
    (WORK / "profile-name.txt").write_text(profile["Name"])
    password = secrets.token_urlsafe(32)
    run("security", "create-keychain", "-p", password, str(KEYCHAIN))
    run("security", "set-keychain-settings", "-lut", "21600", str(KEYCHAIN))
    run("security", "unlock-keychain", "-p", password, str(KEYCHAIN))
    run("security", "import", str(certificate), "-k", str(KEYCHAIN),
        "-P", required("IOS_CERTIFICATE_PASSWORD"),
        "-T", "/usr/bin/codesign", "-T", "/usr/bin/security")
    run("security", "set-key-partition-list", "-S", "apple-tool:,apple:,codesign:",
        "-k", password, str(KEYCHAIN))
    search_list = shlex.split(run("security", "list-keychains", "-d", "user",
                                 capture_output=True, text=True).stdout)
    (WORK / "keychain-search-list.json").write_text(json.dumps(search_list))
    run("security", "list-keychains", "-d", "user", "-s", str(KEYCHAIN), *search_list)
    KEY_DIR.mkdir(mode=0o700, exist_ok=True)
    key_id = required("ASC_KEY_ID")
    if not key_id.isalnum():
        raise ValueError("ASC_KEY_ID 格式无效")
    key = KEY_DIR / f"AuthKey_{key_id}.p8"
    key.write_text(required("ASC_PRIVATE_KEY"))
    os.chmod(key, 0o600)
    certificate.unlink()


def build():
    WORK.mkdir(parents=True, exist_ok=True)
    origin = required("CLOUD_SERVER_URL")
    parsed = urlsplit(origin)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.query or parsed.fragment or parsed.path not in ("", "/")):
        raise ValueError("CLOUD_SERVER_URL 必须是无认证信息的 HTTPS 服务源地址")
    upload = os.environ.get("IOS_UPLOAD") == "true"
    number = required("IOS_BUILD_NUMBER")
    if not number.isdecimal() or int(number) < 1:
        raise ValueError("IOS_BUILD_NUMBER 必须是正整数")
    sha = run("git", "rev-parse", "HEAD", cwd=ROOT, capture_output=True, text=True).stdout.strip()
    (WORK / "build-record.json").write_text(json.dumps({
        "commit": sha, "build": number, "upload_requested": upload,
        "runner": os.environ.get("ImageVersion"),
        "xcode": run("xcodebuild", "-version", capture_output=True, text=True).stdout,
    }, ensure_ascii=False, indent=2))
    args = [
        "xcodebuild", "-project", str(ROOT / "ios/Agents Anywhere/Agents Anywhere.xcodeproj"),
        "-scheme", "Agents Anywhere", "-configuration", "Release",
        "-destination", "generic/platform=iOS", "-derivedDataPath", str(WORK / "derived"),
        f"CLOUD_SERVER_URL={origin}", f"CURRENT_PROJECT_VERSION={number}",
        "SUPPORTS_MACCATALYST=NO", "TARGETED_DEVICE_FAMILY=1,2",
    ]
    if not upload:
        run(*args, "CODE_SIGNING_ALLOWED=NO", "build")
        return
    team, bundle = required("IOS_TEAM_ID"), required("IOS_BUNDLE_ID")
    profile = (WORK / "profile-name.txt").read_text()
    archive = WORK / "AgentsAnywhere.xcarchive"
    run(*args, f"DEVELOPMENT_TEAM={team}", f"PRODUCT_BUNDLE_IDENTIFIER={bundle}",
        "CODE_SIGN_STYLE=Manual", "CODE_SIGN_IDENTITY=Apple Distribution",
        f"PROVISIONING_PROFILE_SPECIFIER={profile}",
        f"OTHER_CODE_SIGN_FLAGS=--keychain {KEYCHAIN}",
        "-archivePath", str(archive), "archive")
    options = WORK / "ExportOptions.plist"
    options.write_bytes(plistlib.dumps({
        "method": "app-store-connect", "destination": "export", "teamID": team,
        "signingStyle": "manual", "signingCertificate": "Apple Distribution",
        "provisioningProfiles": {bundle: profile}, "manageAppVersionAndBuildNumber": False,
    }))
    run("xcodebuild", "-exportArchive", "-archivePath", str(archive),
        "-exportOptionsPlist", str(options), "-exportPath", str(WORK / "export"))


def upload():
    packages = list((WORK / "export").glob("*.ipa"))
    if len(packages) != 1:
        raise ValueError("预期只有一个待上传 IPA")
    env = dict(os.environ, API_PRIVATE_KEYS_DIR=str(KEY_DIR))
    run("xcrun", "altool", "--upload-app", "--type", "ios", "--file", str(packages[0]),
        "--apiKey", required("ASC_KEY_ID"), "--apiIssuer", required("ASC_ISSUER_ID"), env=env)


def cleanup():
    saved_list = WORK / "keychain-search-list.json"
    if saved_list.exists():
        run("security", "list-keychains", "-d", "user", "-s", *json.loads(saved_list.read_text()))
    if KEYCHAIN.exists():
        run("security", "delete-keychain", str(KEYCHAIN))
    PROFILE.unlink(missing_ok=True)
    (WORK / "distribution.p12").unlink(missing_ok=True)
    shutil.rmtree(KEY_DIR, ignore_errors=True)


if __name__ == "__main__":
    actions = {"prepare-signing": prepare_signing, "build": build, "upload": upload, "cleanup": cleanup}
    if len(sys.argv) != 2 or sys.argv[1] not in actions:
        raise SystemExit("用法：testflight-build.py prepare-signing|build|upload|cleanup")
    actions[sys.argv[1]]()
