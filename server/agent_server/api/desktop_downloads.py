from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

_INSTALLERS = {
    "mac": "Agents-Anywhere-latest.dmg",
    "windows": "Agents-Anywhere-Setup-latest.exe",
    "android": "Agents-Anywhere-latest.apk",
}


def create_download_router(repository: str | None) -> APIRouter:
    router = APIRouter(prefix="/download", tags=["desktop-downloads"])
    repository = (repository or "").strip()
    if repository and not re.fullmatch(r"[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+", repository):
        raise ValueError("AGENT_SERVER_DOWNLOAD_RELEASE_REPO 必须为 GitHub owner/repo")
    headers = {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}

    @router.api_route("/{platform}/latest", methods=["GET", "HEAD"])
    def download_latest(platform: str) -> RedirectResponse:
        filename = _INSTALLERS.get(platform)
        if not repository or filename is None:
            raise HTTPException(status_code=404, detail="not found", headers=headers)
        return RedirectResponse(
            f"https://github.com/{repository}/releases/latest/download/{filename}",
            status_code=302,
            headers=headers,
        )

    # 仅开放固定平台入口，查询参数不能改变跳转目标。
    @router.api_route("", methods=["GET", "HEAD"], include_in_schema=False)
    @router.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def unknown_download(path: str = "") -> None:
        raise HTTPException(status_code=404, detail="not found", headers=headers)

    return router
