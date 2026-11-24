from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from connector.logging import logger
from connector.runtimes.codex.notifications import CodexNotificationProjector
from connector.runtimes.codex.sdk.runtime_client import (
    CodexModelListResult,
    CodexNotificationMessage,
    CodexRuntimeClient,
)


@dataclass(slots=True)
class CodexRuntimeLifecycle:
    client: CodexRuntimeClient | None
    notifications: CodexNotificationProjector
    started: bool = False
    model_list_result: CodexModelListResult | None = None
    on_handled: Callable[[CodexNotificationMessage], Awaitable[None]] | None = None
    _start_lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def start(self) -> None:
        async with self._start_lock:
            if not self.started:
                if self.client is not None:
                    await self.client.start(self.handle_notification)
                self.started = True
            # 首次读取失败不能永久缓存为空；后续目录请求可再次读取。
            if self.model_list_result is None:
                await self.bootstrap()

    async def stop(self) -> None:
        async with self._start_lock:
            if self.client is not None:
                await self.client.stop()
            self.started = False
            self.model_list_result = None

    async def bootstrap(self) -> None:
        if self.client is None:
            return
        try:
            self.model_list_result = await self.client.list_models()
        except Exception as exc:  # noqa: BLE001
            logger.debug("codex bootstrap read failed method=model/list error={}", exc)

    async def handle_notification(self, message: CodexNotificationMessage) -> None:
        await self.notifications.handle(message)
        if self.on_handled is not None:
            await self.on_handled(message)
