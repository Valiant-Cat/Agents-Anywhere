from __future__ import annotations

import stat
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

_INSTALLERS = {
    "mac": ("mac/latest.dmg", "Agents-Anywhere-latest.dmg", "application/x-apple-diskimage"),
    "windows": (
        "windows/latest.exe",
        "Agents-Anywhere-Setup-latest.exe",
        "application/octet-stream",
    ),
}


def create_download_router(directory: str | None) -> APIRouter:
    router = APIRouter(prefix="/download", tags=["desktop-downloads"])
    root = Path(directory).resolve() if directory and directory.strip() else None
    headers = {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}

    @router.api_route("/{platform}/latest", methods=["GET", "HEAD"])
    def download_latest(platform: str) -> FileResponse:
        installer = _INSTALLERS.get(platform)
        if root is None or installer is None:
            raise HTTPException(status_code=404, detail="not found", headers=headers)
        relative, filename, media_type = installer
        try:
            path = (root / relative).resolve()
            if not path.is_relative_to(root):
                raise HTTPException(status_code=404, detail="not found", headers=headers)
            info = path.stat()
        except (OSError, RuntimeError):
            raise HTTPException(status_code=404, detail="not found", headers=headers) from None
        if not stat.S_ISREG(info.st_mode) or info.st_size == 0:
            raise HTTPException(status_code=404, detail="not found", headers=headers)
        return FileResponse(
            path,
            filename=filename,
            media_type=media_type,
            headers=headers,
        )

    # 下载目录不回退到前端页面，也不公开临时文件或历史安装包。
    @router.api_route("", methods=["GET", "HEAD"], include_in_schema=False)
    @router.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def unknown_download(path: str = "") -> None:
        raise HTTPException(status_code=404, detail="not found", headers=headers)

    return router
