from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_server.api.desktop_downloads import create_download_router


def make_client(repository: str | None = "Valiant-Cat/Agents-Anywhere") -> TestClient:
    app = FastAPI()
    app.include_router(create_download_router(repository))
    return TestClient(app, follow_redirects=False)


@pytest.mark.parametrize(
    "platform,filename",
    [("mac", "Agents-Anywhere-latest.dmg"), ("windows", "Agents-Anywhere-Setup-latest.exe")],
)
@pytest.mark.parametrize("method", ["GET", "HEAD"])
def test_release_redirect(platform, filename, method) -> None:
    response = make_client().request(
        method,
        f"/download/{platform}/latest?from=update&url=https://example.com",
        headers={"Range": "bytes=0-8"},
    )
    assert response.status_code == 302
    assert response.headers["location"] == (
        f"https://github.com/Valiant-Cat/Agents-Anywhere/releases/latest/download/{filename}"
    )
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.content == b""


@pytest.mark.parametrize("repository", [None, "", "  "])
def test_disabled_downloads(repository) -> None:
    client = make_client(repository)
    for method in (client.get, client.head):
        assert method("/download/mac/latest").status_code == 404


@pytest.mark.parametrize(
    "repository",
    ["https://github.com/owner/repo", "owner/repo?next=evil", "../owner/repo", "owner/repo/extra"],
)
def test_invalid_repository(repository) -> None:
    with pytest.raises(ValueError, match="owner/repo"):
        make_client(repository)


def test_custom_repository() -> None:
    response = make_client(" other/repo ").get("/download/mac/latest")
    assert response.headers["location"].startswith("https://github.com/other/repo/releases/")


@pytest.mark.parametrize("method", ["GET", "HEAD"])
def test_unknown_downloads(method) -> None:
    client = make_client()
    for path in ("", "/", "/linux/latest", "/mac/latest.dmg.part"):
        response = client.request(method, f"/download{path}")
        assert response.status_code == 404
        assert response.headers["cache-control"] == "no-store"


def test_download_routes_precede_web_fallback(tmp_path, monkeypatch) -> None:
    from agent_server.app import create_app

    monkeypatch.setenv(
        "AGENT_SERVER_DB_URL",
        "postgresql+asyncpg://unused:unused@127.0.0.1:1/download_test",
    )
    monkeypatch.delenv("AGENT_SERVER_REDIS_URL", raising=False)
    monkeypatch.setenv("AGENT_SERVER_STATIC_DIR", str(tmp_path))
    monkeypatch.setenv("AGENT_SERVER_DOWNLOAD_RELEASE_REPO", "Valiant-Cat/Agents-Anywhere")
    (tmp_path / "index.html").write_text("web fallback", encoding="utf-8")
    client = TestClient(create_app(), follow_redirects=False)
    assert client.get("/download/mac/latest").status_code == 302
    for path in ("", "/", "/linux/latest", "/mac/latest.dmg.part"):
        assert client.get(f"/download{path}").status_code == 404
