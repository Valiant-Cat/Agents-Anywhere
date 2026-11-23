import React, { useCallback, useEffect, useRef, useState } from 'react'
import { hostBridge } from '../../vendor/workspace-browser/src/client/host-bridge.ts'

    const h = React.createElement

    const NS = 'agents-anywhere-remote'
    const ENDPOINT = '/agents-anywhere'

    const zh = {
      'Devices': '设备',
      'Sign in': '登录',
      'Sign in to Agents Anywhere': '登录 Agents Anywhere',
      'Waiting for the browser…': '等待浏览器授权…',
      'Open the sign-in page': '打开登录页面',
      'Refresh': '刷新',
      'Sign out': '退出登录',
      'No devices yet': '还没有设备。在工作设备上启动 Connector 后刷新。',
      'No sessions': '这个设备没有会话。',
      'Sessions': '会话',
      'Choose a device': '选择左侧的设备查看远程会话。',
      'Timeline': '时间线',
      'No timeline entries': '没有时间线记录。',
      'Loading…': '加载中…',
      'Not signed in': '未登录',
      'Online': '在线',
      'Offline': '离线',
      'Retry': '重试',
      'Open in Agents Anywhere': '在 Agents Anywhere 中打开',
      'SignInHint': '在浏览器中完成 Agents Anywhere 授权，授权后这里会显示设备和远程会话。',

    }
    const en = {
      'Devices': 'Devices',
      'Sign in': 'Sign in',
      'Sign in to Agents Anywhere': 'Sign in to Agents Anywhere',
      'Waiting for the browser…': 'Waiting for the browser…',
      'Open the sign-in page': 'Open the sign-in page',
      'Refresh': 'Refresh',
      'Sign out': 'Sign out',
      'No devices yet': 'No devices yet. Start the Connector on a work device, then refresh.',
      'No sessions': 'No sessions on this device.',
      'Sessions': 'Sessions',
      'Choose a device': 'Choose a device to see its remote sessions.',
      'Timeline': 'Timeline',
      'No timeline entries': 'No timeline entries.',
      'Loading…': 'Loading…',
      'Not signed in': 'Not signed in',
      'Online': 'Online',
      'Offline': 'Offline',
      'Retry': 'Retry',
      'Open in Agents Anywhere': 'Open in Agents Anywhere',
      'SignInHint': 'Authorize in the browser; devices and remote sessions appear here afterwards.',

    }

    const CSS = `
.aa-root { display: flex; height: 100%; min-height: 0; background: var(--dsw-alias-bg-base, #ffffff); color: var(--dsw-alias-label-primary, #111111); }
.aa-list { width: 340px; flex: none; display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--dsw-alias-border-l1, #e5e5e5); }
.aa-head { display: flex; align-items: center; gap: 8px; padding: 20px 18px 10px; }
.aa-title { margin: 0; font-size: 15px; font-weight: 600; flex: 1; }
.aa-account { padding: 0 18px 12px; font-size: 12px; color: var(--dsw-alias-label-secondary, #737373); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.aa-scroll { overflow: auto; padding: 0 10px 16px; min-height: 0; }
.aa-btn { border: 1px solid var(--dsw-alias-border-l2, #d4d4d4); background: transparent; color: inherit; font: inherit; font-size: 12px; border-radius: 999px; padding: 4px 10px; cursor: pointer; }
.aa-btn:hover { background: var(--dsw-alias-bg-layer-2, #f5f5f5); }
.aa-btn[data-primary="true"] { background: var(--dsw-alias-brand-primary, #2563eb); border-color: transparent; color: #ffffff; }
.aa-btn:disabled { opacity: .55; cursor: default; }
.aa-device { display: flex; width: 100%; align-items: center; gap: 10px; padding: 9px 10px; border: 0; border-radius: 10px; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.aa-device:hover { background: var(--dsw-alias-bg-layer-1, #f5f5f5); }
.aa-device[data-open="true"] { background: var(--dsw-alias-bg-layer-2, #eeeeee); }
.aa-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--dsw-alias-state-idle-primary, #a3a3a3); }
.aa-dot[data-online="true"] { background: var(--dsw-alias-state-success-primary, #22c55e); }
.aa-device-name { flex: 1; min-width: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.aa-meta { font-size: 11px; color: var(--dsw-alias-label-secondary, #737373); flex: none; }
.aa-group { display: flex; align-items: center; gap: 6px; width: 100%; border: 0; background: transparent; color: var(--dsw-alias-label-secondary, #737373); font: inherit; font-size: 11.5px; font-weight: 600; padding: 10px 10px 6px; cursor: pointer; }
.aa-group:hover { color: var(--dsw-alias-label-primary, #111111); }
.aa-group-label { flex: 1; text-align: left; }
.aa-group-count { font-weight: 400; color: var(--dsw-alias-label-secondary, #737373); }
.aa-caret { flex: none; color: var(--dsw-alias-label-secondary, #737373); transition: transform .15s ease; }
.aa-caret[data-open="false"] { transform: rotate(-90deg); }
.aa-group-body { padding-left: 6px; }
.aa-device { padding-left: 16px; }
.aa-sessions { display: flex; flex-direction: column; gap: 2px; padding: 2px 0 8px 30px; position: relative; }
.aa-sessions::before { content: ''; position: absolute; left: 17px; top: 2px; bottom: 8px; width: 1px; background: var(--dsw-alias-border-l1, #e5e5e5); }
.aa-session { display: block; width: 100%; border: 0; border-radius: 8px; background: transparent; color: inherit; font: inherit; text-align: left; padding: 7px 8px; cursor: pointer; }
.aa-session:hover { background: var(--dsw-alias-bg-layer-1, #f5f5f5); }
.aa-session[data-selected="true"] { background: var(--dsw-alias-bg-layer-2, #eeeeee); }
.aa-session-title { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.aa-session-sub { font-size: 11px; color: var(--dsw-alias-label-secondary, #737373); display: flex; gap: 6px; margin-top: 2px; }
.aa-pane { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
.aa-pane-head { padding: 20px 24px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1, #e5e5e5); }
.aa-pane-title { margin: 0; font-size: 15px; font-weight: 600; }
.aa-pane-sub { margin-top: 4px; font-size: 12px; color: var(--dsw-alias-label-secondary, #737373); display: flex; gap: 8px; flex-wrap: wrap; }
.aa-body { overflow: auto; padding: 16px 24px 32px; min-height: 0; }
.aa-entry { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--dsw-alias-border-l1, #f0f0f0); }
.aa-tag { flex: none; width: 64px; font-size: 11px; color: var(--dsw-alias-label-secondary, #737373); padding-top: 2px; text-transform: lowercase; }
.aa-text { flex: 1; font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; margin: 0; font-family: inherit; }
.aa-empty { padding: 32px 0; color: var(--dsw-alias-label-secondary, #737373); font-size: 13px; text-align: center; }
.aa-error { margin: 8px 0 0; color: var(--dsw-alias-state-error-primary, #dc2626); font-size: 12px; }
.aa-signin { padding: 24px 20px; display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
.aa-signin-title { font-size: 14px; font-weight: 600; margin: 0; }
.aa-signin-text { font-size: 12px; color: var(--dsw-alias-label-secondary, #737373); margin: 0; line-height: 1.6; }
.aa-link { color: var(--dsw-alias-brand-primary, #2563eb); word-break: break-all; font-size: 12px; }
@media (max-width: 720px) {
  .aa-root { flex-direction: column; }
  .aa-list { width: auto; border-right: 0; border-bottom: 1px solid var(--dsw-alias-border-l1, #e5e5e5); max-height: 55%; }
}
`

    async function request(path, options = {}) {
      const response = await fetch(`${ENDPOINT}${path}`, {
        ...options,
        headers: {
          accept: 'application/json',
          'x-agents-anywhere-token': window.__AA_REMOTE_TOKEN__ || '',
          ...(options.headers ?? {}),
        },
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload && payload.error ? payload.error : `HTTP ${response.status}`)
      if (payload && typeof payload === 'object' && typeof payload.error === 'string') throw new Error(payload.error)
      return payload
    }

    function DeviceIcon({ size = 20, active = false }) {
      const stroke = active ? 'currentColor' : 'currentColor'
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none',
        stroke, strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, style: { display: 'block', opacity: active ? 1 : 0.72 },
      },
      h('rect', { x: 2.5, y: 6, width: 8.5, height: 13, rx: 2 }),
      h('rect', { x: 13.5, y: 4, width: 8, height: 9, rx: 1.6 }),
      h('path', { d: 'M5.5 16.5h2.5M16.5 10.5h2' }))
    }

    function DevicesPanel(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const [status, setStatus] = useState(null)
      const [devices, setDevices] = useState(null)
      const [error, setError] = useState('')
      const [pending, setPending] = useState(null)
      const [groupOpen, setGroupOpen] = useState(true)
      const [expanded, setExpanded] = useState(null)
      const [loadingDevice, setLoadingDevice] = useState(null)
      const [sessions, setSessions] = useState({})
      const [selected, setSelected] = useState(null)
      const [timeline, setTimeline] = useState(null)
      const [timelineError, setTimelineError] = useState('')
      const [timelineLoading, setTimelineLoading] = useState(false)
      const poll = useRef(null)
      const attempts = useRef(0)

      const stopPolling = useCallback(() => {
        if (poll.current) { clearInterval(poll.current); poll.current = null }
      }, [])

      const loadDevices = useCallback(async () => {
        const value = await request('/devices')
        const list = Array.isArray(value.devices) ? value.devices : []
        setDevices(list)
      }, [])

      const loadStatus = useCallback(async () => {
        const value = await request('/status')
        setStatus(value)
        return value
      }, [])

      const reload = useCallback(async () => {
        setError('')
        try {
          const value = await loadStatus()
          if (value && value.signedIn) await loadDevices()
        } catch (error) {
          setError(error.message)
        }
      }, [loadStatus, loadDevices])

      useEffect(() => {
        void reload()
        return () => stopPolling()
      }, [reload, stopPolling])

      const signIn = useCallback(async () => {
        setError('')
        try {
          const value = await request('/login', { method: 'POST' })
          setPending(value)
          attempts.current = 0
          stopPolling()
          poll.current = setInterval(async () => {
            attempts.current += 1
            if (attempts.current > 300) { stopPolling(); return }
            try {
              const next = await loadStatus()
              if (next && next.signedIn) {
                stopPolling()
                setPending(null)
                await loadDevices()
              }
            } catch {
              // Keep the panel quiet while the browser is still on the sign-in page.
            }
          }, 2000)
        } catch (error) {
          setError(error.message)
        }
      }, [loadStatus, loadDevices, stopPolling])

      const signOut = useCallback(async () => {
        setError('')
        try {
          await request('/logout', { method: 'POST' })
          setDevices(null)
          setSessions({})
          setSelected(null)
          setTimeline(null)
          await loadStatus()
        } catch (error) {
          setError(error.message)
        }
      }, [loadStatus])

      const toggleDevice = useCallback(async (device) => {
        if (expanded === device.id) { setExpanded(null); return }
        setExpanded(device.id)
        setError('')
        if (sessions[device.id]) return
        setLoadingDevice(device.id)
        try {
          const value = await request(`/sessions?deviceId=${encodeURIComponent(device.id)}&limit=100`)
          setSessions((previous) => ({ ...previous, [device.id]: Array.isArray(value.sessions) ? value.sessions : [] }))
        } catch (error) {
          setError(error.message)
        } finally {
          setLoadingDevice(null)
        }
      }, [expanded, sessions])

      const openSession = useCallback(async (device, session) => {
        setSelected({ device, session })
        setTimeline(null)
        setTimelineError('')
        setTimelineLoading(true)
        try {
          const value = await request(`/timeline?sessionId=${encodeURIComponent(session.id)}&limit=40`)
          setTimeline(value)
        } catch (error) {
          setTimelineError(error.message)
        } finally {
          setTimelineLoading(false)
        }
      }, [])

      const signedIn = Boolean(status && status.signedIn)
      const server = status && status.server ? status.server : ''

      const groupHeader = h('button', {
        className: 'aa-group',
        'aria-expanded': groupOpen,
        onClick: () => setGroupOpen((open) => !open),
      },
      h('svg', {
        className: 'aa-caret', 'data-open': String(groupOpen), width: 12, height: 12,
        viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
      }, h('path', { d: 'M4 6l4 4 4-4', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' })),
      h('span', { className: 'aa-group-label' }, t('Devices')),
      h('span', { className: 'aa-group-count' }, String(devices === null ? '' : devices.length)))

      const sessionRow = (device, session) => h('button', {
        key: session.id,
        className: 'aa-session',
        'data-selected': selected && selected.session.id === session.id ? 'true' : 'false',
        onClick: () => { void openSession(device, session) },
      },
      h('div', { className: 'aa-session-title' }, session.title || session.id),
      h('div', { className: 'aa-session-sub' },
        h('span', null, session.runtime || ''),
        h('span', null, session.status || '')))

      const deviceRow = (device) => h('div', { key: device.id },
        h('button', {
          className: 'aa-device',
          'data-open': expanded === device.id ? 'true' : 'false',
          onClick: () => { void toggleDevice(device) },
        },
        h('span', { className: 'aa-dot', 'data-online': String(device.status === 'online') }),
        h('span', { className: 'aa-device-name' }, device.name || device.id),
        h('span', { className: 'aa-meta' }, device.deviceOs || ''),
        h('span', { className: 'aa-meta' }, String(device.activeSessions ?? 0))),
        expanded === device.id
          ? h('div', { className: 'aa-sessions' },
            loadingDevice === device.id
              ? h('p', { className: 'aa-session-sub' }, t('Loading…'))
              : (sessions[device.id] ?? []).length === 0
                ? h('p', { className: 'aa-session-sub' }, t('No sessions'))
                : (sessions[device.id] ?? []).map((session) => sessionRow(device, session)))
          : null)

      const deviceGroup = !groupOpen ? null : h('div', { className: 'aa-group-body' },
        devices === null
          ? h('p', { className: 'aa-empty' }, t('Loading…'))
          : devices.length === 0
            ? h('p', { className: 'aa-empty' }, t('No devices yet'))
            : devices.map((device) => deviceRow(device)))

      const signInCard = h('div', { className: 'aa-signin' },
        h('p', { className: 'aa-signin-title' }, t('Sign in to Agents Anywhere')),
        h('p', { className: 'aa-signin-text' }, pending ? t('Waiting for the browser…') : t('SignInHint')),
        h('button', {
          className: 'aa-btn', 'data-primary': 'true', disabled: Boolean(pending),
          onClick: () => { void signIn() },
        }, pending ? t('Open the sign-in page') : t('Sign in')),
        pending && pending.url
          ? h('a', { className: 'aa-link', href: pending.url, target: '_blank', rel: 'noreferrer' }, pending.url)
          : null)

      const listColumn = h('div', { className: 'aa-list' },
        h('div', { className: 'aa-head' },
          h('h2', { className: 'aa-title' }, 'Agents Anywhere'),
          signedIn ? h('button', { className: 'aa-btn', onClick: () => { void reload() } }, t('Refresh')) : null),
        signedIn
          ? h('div', { className: 'aa-account' },
            h('span', null, status.displayName || status.email || status.userId),
            server ? h('span', { className: 'aa-meta' }, server) : null,
            h('button', { className: 'aa-btn', onClick: () => { void signOut() } }, t('Sign out')))
          : null,
        error ? h('p', { className: 'aa-error', style: { padding: '0 18px' }, role: 'alert' }, error) : null,
        !signedIn
          ? signInCard
          : h('div', { className: 'aa-scroll' }, groupHeader, deviceGroup))

      const detailPane = h('div', { className: 'aa-pane' },
        selected
          ? h(React.Fragment, null,
            h('div', { className: 'aa-pane-head' },
              h('h3', { className: 'aa-pane-title' }, selected.session.title || selected.session.id),
              h('div', { className: 'aa-pane-sub' },
                h('span', null, selected.device.name || selected.device.id),
                h('span', null, selected.session.runtime || ''),
                h('span', null, selected.session.status || ''))),
            h('div', { className: 'aa-body' },
              timelineError ? h('p', { className: 'aa-error', role: 'alert' }, timelineError) : null,
              timelineLoading ? h('p', { className: 'aa-empty' }, t('Loading…')) : null,
              !timelineLoading && timeline && (timeline.items ?? []).length === 0
                ? h('p', { className: 'aa-empty' }, t('No timeline entries'))
                : null,
              !timelineLoading && timeline
                ? (timeline.items ?? []).map((item) => h('div', { className: 'aa-entry', key: String(item.seq) + String(item.type) },
                  h('span', { className: 'aa-tag' }, item.role || item.type),
                  h('p', { className: 'aa-text' }, item.text || item.label || '…')))
                : null))
          : h('div', { className: 'aa-body' },
            h('p', { className: 'aa-empty' }, t('Choose a device'))))

      return h('div', { className: 'aa-root' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        listColumn,
        detailPane)
    }


export function apply(ctx) {
        hostBridge.selectPanel = () => { ctx.layout.selectPanel('agents-anywhere') }
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'agents-anywhere-remote.locale')
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'agents-anywhere',
          order: 50,
          label: () => t('Devices'),
        }, DeviceIcon)), 'agents-anywhere-remote.sidebar')
        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'agents-anywhere',
          locale: NS,
        }, DevicesPanel)), 'agents-anywhere-remote.panel')
}

export const inject = ['slots', 'locale']
