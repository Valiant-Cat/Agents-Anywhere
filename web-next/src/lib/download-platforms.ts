export type DownloadPlatform = "mac" | "ios" | "windows" | "android"

export const DOWNLOAD_PLATFORMS: DownloadPlatform[] = ["mac", "ios", "windows", "android"]

export function detectDownloadPlatform(userAgent: string, touchPoints = 0): DownloadPlatform {
  if (/android/i.test(userAgent)) return "android"
  if (/iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && touchPoints > 1)) return "ios"
  if (/windows/i.test(userAgent)) return "windows"
  return "mac"
}

export function configuredDownloadUrl(value: string | undefined, testFlight = false): string {
  if (!value?.trim()) return ""
  try {
    const url = new URL(value.trim())
    if (url.protocol !== "https:" || url.username || url.password) return ""
    if (testFlight && (url.hostname !== "testflight.apple.com" || !/^\/join\/[a-z0-9]+\/?$/i.test(url.pathname))) return ""
    return url.href
  } catch {
    return ""
  }
}
