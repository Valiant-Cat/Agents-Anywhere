// 仅在内存中短时复用；账号、设备、运行时及配置共同决定缓存身份。
export function createCreationCatalogCache(ttl = 30_000) {
  const entries = new Map<string, { expires: number; promise: Promise<unknown> }>()
  return function read<T>(key: string, load: () => Promise<T>): Promise<T> {
    const cached = entries.get(key)
    if (cached && cached.expires > Date.now()) return cached.promise as Promise<T>
    const entry = { expires: Infinity, promise: Promise.resolve().then(load) }
    entries.delete(key)
    entries.set(key, entry)
    // 限制账号切换和配置变更留下的内存占用。
    if (entries.size > 100) entries.delete(entries.keys().next().value!)
    entry.promise.then(() => {
      entry.expires = Date.now() + ttl
    }, () => {
      if (entries.get(key) === entry) entries.delete(key)
    })
    return entry.promise
  }
}

export const readCreationCatalog = createCreationCatalogCache()
