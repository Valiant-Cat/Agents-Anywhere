import { getDesktopServerConnection } from "@/features/desktop/server-connection"

/** Fixed product configuration. Empty URLs remain visibly unavailable. */
export const PRODUCT_LINKS: {
  tokensAnywhereUrl: string
  desktopDownloadUrl: string
  landingPageUrl: string
  downloadPageUrl: string
  androidDownloadUrl: string
  iosDownloadUrl: string
  webAppHref: string
} = {
  // Tokens Anywhere's site origin, set with NEXT_PUBLIC_TOKENS_ANYWHERE_URL.
  tokensAnywhereUrl: process.env.NEXT_PUBLIC_TOKENS_ANYWHERE_URL ?? '',
  desktopDownloadUrl: '',
  landingPageUrl: '',
  get downloadPageUrl() {
    const origin = getDesktopServerConnection()?.serverUrl || process.env.NEXT_PUBLIC_AGENTS_ANYWHERE_API
    return origin ? new URL("/downloads/", origin).href : ""
  },
  androidDownloadUrl: '',
  iosDownloadUrl: '',
  webAppHref: '#/',
}
