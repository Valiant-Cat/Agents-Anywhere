import { useEffect, useState } from 'react'
import { hostBridge } from '../host-bridge.ts'
import css from './DevicesGroup.module.css'

if (typeof window !== 'undefined') {
  fetch('/agents-anywhere/diag', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: 'devices-module-evaluated' }) }).catch(() => {})
}

interface DeviceRow {
  id: string
  name: string
  status: string
  deviceOs?: string | null
  activeSessions?: number
}

function label(): string {
  const lang = typeof document === 'undefined' ? 'zh' : document.documentElement.lang || 'zh'
  return lang.toLowerCase().startsWith('en') ? 'Devices' : '设备'
}

/**
 * Agents Anywhere devices rendered above the workspace tree. Data comes from
 * this plugin's same-origin panel route; clicking a device opens the panel.
 */
export function DevicesGroup({ wide }: { wide: boolean }) {
  const [devices, setDevices] = useState<DeviceRow[] | null>(null)
  const [signedOut, setSignedOut] = useState(false)

  useEffect(() => {
    fetch('/agents-anywhere/diag', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: 'devices-group-mounted' }) }).catch(() => {})
    let live = true
    fetch('/agents-anywhere/devices', { headers: { accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((value) => { if (live) setDevices(Array.isArray(value.devices) ? value.devices : []) })
      .catch(() => { if (live) { setDevices([]); setSignedOut(true) } })
    return () => { live = false }
  }, [])

  if (!wide) {
    return (
      <div className={css.rail}>
        <button type="button" className={css.railButton} title={label()} onClick={() => hostBridge.selectPanel()}>
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2.5" y="6" width="8.5" height="13" rx="2" />
            <rect x="13.5" y="4" width="8" height="9" rx="1.6" />
            <path d="M5.5 16.5h2.5M16.5 10.5h2" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className={css.group}>
      <button type="button" className={css.header} onClick={() => hostBridge.selectPanel()}>
        <span className={css.headerLabel}>{label()}</span>
        <span className={css.count}>{devices ? devices.length : ''}</span>
      </button>
      {devices === null ? null : devices.length === 0 ? (
        <button type="button" className={css.hint} onClick={() => hostBridge.selectPanel()}>
          {signedOut ? '登录后显示设备' : '还没有设备'}
        </button>
      ) : devices.map((device) => (
        <button
          key={device.id}
          type="button"
          className={css.row}
          onClick={() => hostBridge.selectPanel(device.id)}
        >
          <span className={css.dot} data-online={device.status === 'online'} />
          <span className={css.name}>{device.name || device.id}</span>
          {device.activeSessions ? <span className={css.meta}>{device.activeSessions}</span> : null}
        </button>
      ))}
    </div>
  )
}
