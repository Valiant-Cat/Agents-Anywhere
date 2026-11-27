"""统一正式标签、系统版本和移动端构建配置，不改写源码版本文件。"""

import argparse
import json
import os
from pathlib import Path
import re
import tomllib
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]


def release_config(tag, server_version):
    match = re.fullmatch(r"v(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?", tag)
    if not match or tag != f"v{server_version}":
        raise ValueError("正式标签必须与 Server 版本一致")
    major, minor, patch = map(int, match.group(1, 2, 3))
    revision = int(match[4]) if match[4] is not None else 0
    if not (0 <= major <= 20 and minor < 100 and patch < 100):
        raise ValueError("版本超出 Android 编号范围")
    if match[4] is not None and (patch != 0 or not 1 <= revision <= 9999):
        raise ValueError("四段版本必须为 MAJOR.MINOR.0.N，N 为 1 至 9999")
    package = f"{major}.{minor}.{10000 + revision if revision else patch}"
    return {
        "RELEASE_VERSION": server_version,
        "RELEASE_PACKAGE_VERSION": package,
        "ANDROID_VERSION_NAME": server_version,
        "ANDROID_VERSION_CODE": str(major * 100_000_000 + minor * 1_000_000
                                    + patch * 10_000 + revision),
    }


def check_secrets():
    names = (
        "CLOUD_SERVER_URL", "IOS_TEAM_ID", "IOS_BUNDLE_ID",
        "IOS_CERTIFICATE_P12", "IOS_CERTIFICATE_PASSWORD", "IOS_PROFILE",
        "ASC_PRIVATE_KEY", "ASC_KEY_ID", "ASC_ISSUER_ID",
        "ANDROID_KEYSTORE_BASE64", "ANDROID_KEYSTORE_PASSWORD",
        "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD",
    )
    missing = [name for name in names if not os.environ.get(name, "").strip()]
    if missing:
        raise ValueError("缺少发布配置：" + "、".join(missing))
    origin = urlsplit(os.environ["CLOUD_SERVER_URL"])
    if (origin.scheme != "https" or not origin.hostname or origin.username
            or origin.password or origin.path not in ("", "/") or origin.query or origin.fragment):
        raise ValueError("CLOUD_SERVER_URL 必须是无认证信息的 HTTPS 服务源地址")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tag", nargs="?")
    parser.add_argument("--github-env", action="store_true")
    parser.add_argument("--check-secrets", action="store_true")
    args = parser.parse_args()
    if args.check_secrets:
        check_secrets()
        return
    with (ROOT / "server/pyproject.toml").open("rb") as source:
        values = release_config(args.tag or "", tomllib.load(source)["project"]["version"])
    if args.github_env:
        with open(os.environ["GITHUB_ENV"], "a") as output:
            for key, value in values.items():
                output.write(f"{key}={value}\n")
    print(json.dumps(values, ensure_ascii=False))


if __name__ == "__main__":
    main()
