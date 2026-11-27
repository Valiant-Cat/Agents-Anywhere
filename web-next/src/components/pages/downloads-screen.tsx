"use client"

import * as React from "react"
import { ArrowUpRight, Check, Download, Globe, Laptop, Monitor, Smartphone } from "lucide-react"
import { DOWNLOAD_PLATFORMS, configuredDownloadUrl, detectDownloadPlatform, type DownloadPlatform } from "@/lib/download-platforms"
import "./downloads-screen.css"

const platforms = {
  mac: {
    label: "Mac", system: "macOS · Universal", icon: Laptop,
    title: "会话、文件与终端，集中呈现。",
    description: "连接本机与远程设备，在 Mac 上管理 Agent 会话、查看文件和使用终端。",
    features: ["完整桌面工作台", "连接本地与远程设备", "会话、文件与终端"],
    image: "/images/onboarding/desktop.webp", action: "下载安装包",
  },
  ios: {
    label: "iPhone · iPad", system: "iOS · iPadOS · TestFlight", icon: Smartphone,
    title: "离开电脑，也能继续。",
    description: "通过 TestFlight 安装测试版，在 iPhone 和 iPad 上查看会话、发送消息和处理审批。",
    features: ["远程查看 Agent 会话", "消息、审批与文件", "通过 TestFlight 接收测试版更新"],
    image: "/images/onboarding/phone.webp", action: "加入 TestFlight",
  },
  windows: {
    label: "Windows", system: "Windows · x64", icon: Monitor,
    title: "你的 Agent，随时就绪。",
    description: "连接 Windows 工作设备，把会话、文件和终端放在同一个工作台。",
    features: ["完整桌面工作台", "连接本地与远程设备", "会话、文件与终端"],
    image: "/images/onboarding/desktop.webp", action: "下载安装包",
  },
  android: {
    label: "Android", system: "Android · APK", icon: Smartphone,
    title: "工作在电脑，掌控在手中。",
    description: "在 Android 手机上连接工作设备，查看 Agent 进度、继续对话和处理审批。",
    features: ["跨设备同步会话", "远程发送消息与处理审批", "查看工作设备上的文件"],
    image: "/images/onboarding/phone.webp", action: "下载 Android 安装包",
  },
}

export function DownloadsScreen() {
  const [platform, setPlatform] = React.useState<DownloadPlatform>("mac")
  const [detected, setDetected] = React.useState<DownloadPlatform | null>(null)
  React.useEffect(() => {
    const device = detectDownloadPlatform(navigator.userAgent, navigator.maxTouchPoints)
    setDetected(device)
    const sync = () => {
      const requested = new URLSearchParams(window.location.search).get("platform")
      setPlatform(DOWNLOAD_PLATFORMS.includes(requested as DownloadPlatform) ? requested as DownloadPlatform : device)
    }
    sync()
    window.addEventListener("popstate", sync)
    return () => window.removeEventListener("popstate", sync)
  }, [])

  const select = (value: DownloadPlatform) => {
    setPlatform(value)
    const url = new URL(window.location.href)
    url.searchParams.set("platform", value)
    window.history.pushState(null, "", url)
  }
  const entry = platforms[platform]
  const Icon = entry.icon
  const urls = {
    mac: "/download/mac/latest?from=web",
    windows: "/download/windows/latest?from=web",
    ios: configuredDownloadUrl(process.env.NEXT_PUBLIC_IOS_TESTFLIGHT_URL, true),
    android: "/download/android/latest?from=web",
  }
  const href = urls[platform]

  return (
    <div className="aa-downloads">
      <a className="download-skip" href="#download-main">跳转至内容</a>
      <header className="download-header">
        <a href="/" className="download-brand">Agents Anywhere</a>
        <nav aria-label="下载页导航">
          <a href="https://github.com/Valiant-Cat/Agents-Anywhere" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={14} /></a>
          <a href="/" className="download-nav-web">进入工作台 <ArrowUpRight size={14} /></a>
        </nav>
      </header>
      <main id="download-main">
        <section className="download-heading">
          <p>桌面端与移动端</p>
          <h1>下载 Agents Anywhere</h1>
          <p className="download-intro">在电脑上连接设备与 Agent，在手机、平板或 Web 继续操作。</p>
        </section>
        <div className="download-tabs" role="tablist" aria-label="选择下载平台">
          {DOWNLOAD_PLATFORMS.map((value, index) => {
            const TabIcon = platforms[value].icon
            return <button key={value} type="button" role="tab" id={`tab-${value}`} aria-selected={platform === value}
              aria-controls="download-platform" tabIndex={platform === value ? 0 : -1}
              onClick={() => select(value)}
              onKeyDown={event => {
                let next: number | undefined
                if (event.key === "ArrowRight") next = (index + 1) % DOWNLOAD_PLATFORMS.length
                if (event.key === "ArrowLeft") next = (index + DOWNLOAD_PLATFORMS.length - 1) % DOWNLOAD_PLATFORMS.length
                if (event.key === "Home") next = 0
                if (event.key === "End") next = DOWNLOAD_PLATFORMS.length - 1
                if (next !== undefined) {
                  event.preventDefault()
                  const target = DOWNLOAD_PLATFORMS[next]!
                  select(target)
                  document.getElementById(`tab-${target}`)?.focus()
                }
              }}>
              <TabIcon size={18} aria-hidden="true" />{platforms[value].label}
            </button>
          })}
        </div>
        <section className="download-platform" id="download-platform" role="tabpanel" aria-labelledby={`tab-${platform}`}>
          <div className="download-copy">
            <div className="download-platform-top"><Icon size={34} aria-hidden="true" />
              {detected === platform ? <span className="download-device">适合当前设备</span> : null}
            </div>
            <p className="download-system">{entry.label} <span>· {entry.system}</span></p>
            <h2>{entry.title}</h2>
            <p className="download-description">{entry.description}</p>
            <ul>{entry.features.map(feature => <li key={feature}><Check size={15} aria-hidden="true" />{feature}</li>)}</ul>
            {href ? <a className="download-primary" href={href} {...(platform === "ios" ? { target: "_blank", rel: "noreferrer" } : {})}>
              <Download size={18} />{entry.action}
            </a> : <button type="button" className="download-primary" disabled>{platform === "ios" ? "TestFlight 暂未开放" : "Android 暂未开放下载"}</button>}
            {platform === "ios" ? <p className="download-note">测试版通过 TestFlight 分发，以邀请页面的可用名额为准。</p> : null}
            <a className="download-guide" href="https://github.com/Valiant-Cat/Agents-Anywhere/blob/self-hosted-2.2.0/docs/getting-started.md" target="_blank" rel="noreferrer">安装与连接指南 <ArrowUpRight size={13} /></a>
          </div>
          <figure className={`download-media ${platform === "ios" || platform === "android" ? "download-media-phone" : ""}`}>
            {/* 复用仓库内的真实产品截图，不依赖外部图片服务。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={entry.image} alt={`${entry.label} 上的 Agents Anywhere 会话工作台`} width={960} height={720} />
            <figcaption>{entry.label}</figcaption>
          </figure>
        </section>
        <section className="download-browser">
          <Globe size={28} aria-hidden="true" />
          <div><h2>浏览器，也是你的工作台。</h2><p>登录同一服务和账号，访问已连接的设备和会话。</p></div>
          <a href="/">在浏览器中使用 <ArrowUpRight size={16} /></a>
        </section>
      </main>
      <footer className="download-footer"><span className="download-brand">Agents Anywhere</span><span>在桌面、手机和 Web 使用你的 Agent。</span><a href="/">返回工作台 <ArrowUpRight size={14} /></a></footer>
    </div>
  )
}
