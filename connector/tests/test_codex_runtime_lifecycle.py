import asyncio
from types import SimpleNamespace

from connector.runtimes.codex.lifecycle.runtime_lifecycle import CodexRuntimeLifecycle


def test_concurrent_start_reads_models_once() -> None:
    async def run() -> None:
        calls = []
        result = object()

        async def start(handler):
            calls.append("start")
            await asyncio.sleep(0)

        async def models():
            calls.append("models")
            await asyncio.sleep(0)
            return result

        lifecycle = CodexRuntimeLifecycle(
            client=SimpleNamespace(start=start, list_models=models),
            notifications=SimpleNamespace(),
        )
        await asyncio.gather(*(lifecycle.start() for _ in range(5)))
        assert calls == ["start", "models"]
        assert lifecycle.model_list_result is result

    asyncio.run(run())


def test_failed_model_read_can_retry_without_restarting_client() -> None:
    async def run() -> None:
        calls = []
        result = object()

        async def start(handler):
            calls.append("start")

        async def models():
            calls.append("models")
            if calls.count("models") == 1:
                raise RuntimeError("暂时不可用")
            return result

        async def stop():
            calls.append("stop")

        lifecycle = CodexRuntimeLifecycle(
            client=SimpleNamespace(start=start, stop=stop, list_models=models),
            notifications=SimpleNamespace(),
        )
        await lifecycle.start()
        assert lifecycle.model_list_result is None
        await lifecycle.start()
        assert calls == ["start", "models", "models"]
        assert lifecycle.model_list_result is result
        await lifecycle.stop()
        assert lifecycle.model_list_result is None
        assert not lifecycle.started

    asyncio.run(run())
