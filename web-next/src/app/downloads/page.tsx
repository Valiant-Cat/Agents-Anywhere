import type { Metadata } from "next"
import { DownloadsScreen } from "@/components/pages/downloads-screen"

export const metadata: Metadata = {
  title: "下载 Agents Anywhere",
  description: "下载 Mac、Windows、Android 客户端，或通过 TestFlight 安装 iPhone 和 iPad 测试版。",
}

export default function DownloadsPage() {
  return <DownloadsScreen />
}
