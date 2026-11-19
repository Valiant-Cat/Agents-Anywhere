from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_server.api.desktop_downloads import create_download_router


def make_client(directory) -> TestClient:
    app = FastAPI()
    app.include_router(create_download_router(str(directory) if directory else None))
    return TestClient(app)


@pytest.mark.parametrize("platform,extension", [("mac", "dmg"), ("windows", "exe")])
def test_download_and_head(tmp_path, platform, extension) -> None:
    directory = tmp_path / platform
    directory.mkdir()
    payload = b"installer-test-content"
    (directory / f"latest.{extension}").write_bytes(payload)
    client = make_client(tmp_path)
    url = f"/download/{platform}/latest?from=update"

    response = client.get(url)
    assert response.status_code == 200
    assert response.content == payload
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "attachment;" in response.headers["content-disposition"]
    assert response.headers["content-type"].startswith("application/")
    assert int(response.headers["content-length"]) == len(payload)
    head = client.head(url)
    assert head.status_code == 200
    assert head.content == b""
    assert head.headers["content-length"] == str(len(payload))

    partial = client.get(url, headers={"Range": "bytes=0-8"})
    assert partial.status_code == 206
    assert partial.content == payload[:9]
    assert partial.headers["content-range"] == f"bytes 0-8/{len(payload)}"
    assert client.get(url, headers={"Range": "bytes=999-"}).status_code == 416


@pytest.mark.parametrize("configured", [False, True])
def test_missing_or_disabled_downloads_return_404(tmp_path, configured) -> None:
    client = make_client(tmp_path if configured else None)
    for path in ("mac/latest", "windows/latest", "linux/latest", "mac/latest.dmg.part"):
        for method in (client.get, client.head):
            response = method(f"/download/{path}")
            assert response.status_code == 404
            assert response.headers["cache-control"] == "no-store"


def test_empty_files_and_directories_are_not_installers(tmp_path) -> None:
    (tmp_path / "mac").mkdir()
    target = tmp_path / "mac/latest.dmg"
    target.touch()
    client = make_client(tmp_path)
    assert client.get("/download/mac/latest").status_code == 404
    target.unlink()
    target.mkdir()
    assert client.get("/download/mac/latest").status_code == 404


def test_external_symlink_is_not_served(tmp_path) -> None:
    root = tmp_path / "downloads"
    (root / "mac").mkdir(parents=True)
    outside = tmp_path / "secret.dmg"
    outside.write_bytes(b"private")
    (root / "mac/latest.dmg").symlink_to(outside)
    assert make_client(root).get("/download/mac/latest").status_code == 404


def test_replacing_installer_is_visible_without_restart(tmp_path) -> None:
    (tmp_path / "mac").mkdir()
    target = tmp_path / "mac/latest.dmg"
    target.write_bytes(b"old")
    client = make_client(tmp_path)
    assert client.get("/download/mac/latest").content == b"old"
    staging = target.with_suffix(".part")
    staging.write_bytes(b"new-version")
    staging.replace(target)
    assert client.get("/download/mac/latest").content == b"new-version"


def test_download_routes_precede_web_fallback(tmp_path, monkeypatch) -> None:
    from agent_server.app import create_app

    monkeypatch.setenv(
        "AGENT_SERVER_DB_URL",
        "postgresql+asyncpg://unused:unused@127.0.0.1:1/download_test",
    )
    monkeypatch.delenv("AGENT_SERVER_REDIS_URL", raising=False)
    monkeypatch.setenv("AGENT_SERVER_STATIC_DIR", str(tmp_path))
    monkeypatch.setenv("AGENT_SERVER_DOWNLOAD_DIR", str(tmp_path / "downloads"))
    (tmp_path / "index.html").write_text("web fallback", encoding="utf-8")
    (tmp_path / "downloads/mac").mkdir(parents=True)
    (tmp_path / "downloads/mac/latest.dmg").write_bytes(b"installer")
    client = TestClient(create_app())
    assert client.get("/download").status_code == 404
    assert client.get("/download/").status_code == 404
    assert client.get("/download/mac/latest").content == b"installer"
    assert client.get("/download/windows/latest").status_code == 404
    assert client.get("/download/mac/latest.dmg.part").status_code == 404
