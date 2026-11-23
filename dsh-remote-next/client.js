window.__ModuleLoader__.load({
  id: '@vvicat/dsh-agents-anywhere',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    const NS = 'agents-anywhere-remote'
    const ENDPOINT = '/agents-anywhere'

    // The panel remounts on every sidebar switch; keeping the last snapshot at
    // module scope avoids flashing the signed-out card before the first fetch.
    let cachedStatus = null
    let cachedDevices = null
    let cachedProvider = null
    let cachedRecentSessions = null


    const zh = {
      'Recent sessions': '最近会话',
      'Choose a session': '选择左侧的会话查看详情。',
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
      'Recent sessions': 'Recent sessions',
      'Choose a session': 'Choose a session on the left to view details.',
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
.aa-root, .aa-root * { box-sizing: border-box; }
.aa-root { display: flex; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; background: var(--dsw-alias-bg-base, #ffffff); color: var(--dsw-alias-label-primary, #111111); }
.aa-loading { align-items: center; justify-content: center; }
.aa-loading-inner { display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--dsw-alias-label-secondary, #737373); }
.aa-loading-title { margin: 0; font-size: 15px; font-weight: 600; color: var(--dsw-alias-label-primary, #111111); }
.aa-loading-text { margin: 0; font-size: 13px; }
.aa-spinner { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--dsw-alias-border-l2, #d4d4d4); border-top-color: var(--dsw-alias-brand-primary, #2563eb); animation: aa-spin .8s linear infinite; }
@keyframes aa-spin { to { transform: rotate(360deg); } }
.aa-list { width: 340px; flex: none; display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--dsw-alias-border-l1, #e5e5e5); }
.aa-head { display: flex; align-items: center; gap: 8px; padding: 20px 18px 10px; }
.aa-title { margin: 0; font-size: 15px; font-weight: 600; flex: 1; }
.aa-account { padding: 0 18px 12px; font-size: 12px; color: var(--dsw-alias-label-secondary, #737373); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.aa-scroll { overflow-x: hidden; overflow-y: auto; padding: 0 10px 16px; min-width: 0; min-height: 0; }
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
.aa-group-label { text-align: left; }
.aa-group-count { margin-left: auto; font-weight: 400; color: var(--dsw-alias-label-secondary, #737373); }
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
.aa-recent-header { margin-top: 18px; }
.aa-recent-list .aa-session { padding: 12px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; }
.aa-session-device { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.aa-session-state { margin-left: auto; flex: none; }
.aa-session-sub { font-size: 11px; color: var(--dsw-alias-label-secondary, #737373); display: flex; gap: 6px; margin-top: 2px; }
.aa-pane { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
.aa-controls { display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; }
.aa-composer { flex:none; padding:16px 24px; border-top:1px solid var(--dsw-alias-border-l1); }
.aa-composer textarea { width:100%; resize:vertical; background:var(--dsw-alias-bg-base); color:inherit; border:1px solid var(--dsw-alias-border-l2); border-radius:8px; padding:10px; font:inherit; }
.aa-record { padding:10px 0; border-bottom:1px solid var(--dsw-alias-border-l1); }
.aa-record summary { cursor:pointer; font-size:12px; color:var(--dsw-alias-label-secondary); }
.aa-record pre { margin:8px 0; }
.aa-body { flex:1; }
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
        signal: options.signal || AbortSignal.timeout(25000),
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
      const [status, setStatus] = useState(cachedStatus)
      const [devices, setDevices] = useState(cachedDevices)
      const [error, setError] = useState('')
      const [syncing, setSyncing] = useState(!cachedStatus?.signedIn)
      const [groupOpen, setGroupOpen] = useState(true)
      const [provider, setProvider] = useState(cachedProvider)
      const [recentSessions, setRecentSessions] = useState(cachedRecentSessions)
      const [recentOpen, setRecentOpen] = useState(true)
      const [recentError, setRecentError] = useState('')
      const [selected, setSelected] = useState(null)
      const [timeline, setTimeline] = useState(null)
      const [timelineError, setTimelineError] = useState('')
      const [timelineLoading, setTimelineLoading] = useState(false)
      const [draft, setDraft] = useState('')
      const [acting, setActing] = useState(false)
      const [actionError, setActionError] = useState('')
      const [noticeInputs, setNoticeInputs] = useState({})
      const historyScroll = useRef(null)
      const selectionVersion = useRef(0)
      const selectedId = useRef(null)
      const detailRequest = useRef(0)
      const appliedRequest = useRef(0)
      const draftId = useRef(null)
      const bodyRef = useRef(null)
      const stickToLatest = useRef(true)
      const loadDevices = useCallback(async () => {
        const value = await request('/devices')
        const list = Array.isArray(value.devices) ? value.devices : []
        cachedDevices = list
        setDevices(list)
        window.__AA_REMOTE_REFRESH_SIDEBAR__?.()
      }, [])

      const loadRecent = useCallback(async () => {
        setRecentError('')
        try {
          const value = await request('/sessions?limit=50')
          const rows = Array.isArray(value.sessions) ? value.sessions : []
          cachedRecentSessions = rows
          setRecentSessions(rows)
        } catch (reason) {
          setRecentError(reason.message)
        }
      }, [])

      const loadStatus = useCallback(async () => {
        const value = await request('/status')
        cachedStatus = value
        setStatus(value)
        return value
      }, [])

      const reload = useCallback(async () => {
        setError('')
        setSyncing(true)
        try {
          let value = await loadStatus()
          if (!value?.signedIn && value?.dshSignedIn) {
            await request('/login', { method: 'POST' })
            value = await loadStatus()
          }
          if (value?.signedIn) await Promise.all([loadDevices(), loadRecent()])
          else {
            cachedDevices = null
            cachedRecentSessions = null
            setDevices(null)
            setRecentSessions(null)
            setError(value?.dshSignedIn === false ? '请先在 DSH 登录，Agents Anywhere 将跟随同步。' : '未能完成同步，请重试。')
          }
        } catch (reason) {
          setError(reason.name === 'TimeoutError' ? '同步超时，请检查网络后重试。' : reason.message)
        } finally {
          setSyncing(false)
        }
      }, [loadStatus, loadDevices, loadRecent])

      useEffect(() => { void reload() }, [reload])

      const signIn = reload

      const fetchDetail = useCallback(async (id, before) => {
        const generation = selectionVersion.current
        const requestNumber = ++detailRequest.current
        const value = await request(`/session-detail?sessionId=${encodeURIComponent(id)}${before ? `&before=${before}` : ''}`)
        if (selectedId.current !== id || generation !== selectionVersion.current || (!before && requestNumber < appliedRequest.current)) return
        if (!before) appliedRequest.current = requestNumber
        if (!before) setSelected(previous => previous ? { ...previous, session: value.session } : previous)
        setRecentSessions(previous => previous ? previous.map(row => row.id === id ? { ...row, status: value.session.status } : row) : previous)
        setTimeline(previous => {
          const rows = new Map((previous ? previous.timeline.items : []).map(row => [row.id, row]))
          for (const item of value.timeline.items || []) rows.set(item.id, item)
          return { ...value, timeline: { ...value.timeline, hasMore: before || !previous ? value.timeline.hasMore : previous.timeline.hasMore, items: [...rows.values()].sort((a, b) => a.orderSeq - b.orderSeq) } }
        })
        setTimelineError('')
      }, [])

      const openSession = useCallback(async (device, session) => {
        selectionVersion.current += 1
        selectedId.current = session.id
        stickToLatest.current = true
        setSelected({ device, session })
        setTimeline(null)
        setDraft('')
        draftId.current = null
        setActionError('')
        setTimelineError('')
        setTimelineLoading(true)
        try { await fetchDetail(session.id) }
        catch (error) { if (selectedId.current === session.id) setTimelineError(error.message) }
        finally { if (selectedId.current === session.id) setTimelineLoading(false) }
      }, [fetchDetail])

      useEffect(() => {
        if (historyScroll.current && bodyRef.current) {
          bodyRef.current.scrollTop = historyScroll.current.top + bodyRef.current.scrollHeight - historyScroll.current.height
          historyScroll.current = null
        } else if (stickToLatest.current && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
      }, [timeline])

      const answerNotice = async (notice, action) => {
        let input = {}
        if (action.input?.schema || action.input?.required) {
          try {
            input = JSON.parse(noticeInputs[notice.noticeId] || '{}')
            if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error()
          } catch { setActionError('交互输入必须是 JSON 对象。'); return }
        }
        if (!window.confirm(`确定执行「${action.label || action.actionId}」？此操作会回复远程交互。`)) return
        setActing(true)
        try {
          await request('/notice-response', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: selectedId.current, noticeId: notice.noticeId, actionId: action.actionId, input }) })
          await fetchDetail(selectedId.current)
        } catch (error) { setActionError(error.message) }
        finally { setActing(false) }
      }

      const remoteId = selected?.session?.id
      useEffect(() => {
        if (!remoteId) return
        let live = true
        let timer
        const refresh = async () => {
          try { await fetchDetail(remoteId) }
          catch (error) { if (live) setTimelineError(error.message) }
          if (live) timer = setTimeout(refresh, 5000)
        }
        timer = setTimeout(refresh, 5000)
        return () => { live = false; clearTimeout(timer) }
      }, [remoteId, fetchDetail])

      const operate = async (action) => {
        if (!remoteId || acting) return
        if (action === 'takeover' && !window.confirm('接管会话会允许远程执行，并可能继续派发已有队列消息。确定接管？')) return
        if (action === 'interrupt' && !window.confirm('确定中断远程会话当前回合？')) return
        const id = remoteId
        setActing(true)
        setActionError('')
        try {
          if (action === 'send') draftId.current ||= globalThis.crypto.randomUUID()
          await request('/session-action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: id, action, message: action === 'send' ? draft : undefined, clientMessageId: action === 'send' ? draftId.current : undefined }) })
          if (action === 'send' && selectedId.current === id) { setDraft(''); draftId.current = null }
          await fetchDetail(id)
        } catch (error) { if (selectedId.current === id) setActionError(error.message) }
        finally { setActing(false) }
      }

      const signedIn = Boolean(status && status.signedIn)


      if (!signedIn) {
        return h('div', { className: 'aa-root aa-loading' },
          h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
          h('div', { className: 'aa-loading-inner' },
            h('p', { className: 'aa-loading-title' }, 'Agents Anywhere'),
            !syncing ? null : h('span', { className: 'aa-spinner', 'aria-hidden': true }),
            h('p', { className: 'aa-loading-text', role: error ? 'alert' : 'status' }, syncing ? '正在同步' : error || '同步未完成，请重试。'),
            !syncing ? h('button', { className: 'aa-btn', onClick: () => { void reload() } }, '重试') : null))
      }

      const groupHeader = h('button', {
        className: 'aa-group',
        'aria-expanded': groupOpen,
        onClick: () => setGroupOpen((open) => !open),
      },
      h('span', { className: 'aa-group-label' }, t('Devices')),
      h('svg', {
        className: 'aa-caret', 'data-open': String(groupOpen), width: 12, height: 12,
        viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
      }, h('path', { d: 'M4 6l4 4 4-4', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' })),
      h('span', { className: 'aa-group-count' }, String(devices === null ? '' : devices.length)))

      const sessionRow = (device, session) => h('button', {
        key: session.id,
        className: 'aa-session',
        'data-selected': selected && selected.session.id === session.id ? 'true' : 'false',
        onClick: () => { if (!acting) void openSession(device, session) },
        disabled: acting,
      },
      h('div', { className: 'aa-session-title' }, session.title || session.id),
      h('div', { className: 'aa-session-sub' },
        h('span', null, session.runtimeName || session.runtime || ''),
        h('span', null, '·'),
        h('span', { className: 'aa-session-device' }, session.device || device.name || device.id),
        h('span', { className: 'aa-session-state' }, session.status || '')))

      const deviceRow = (device) => h('div', { key: device.id, className: 'aa-device', style: { cursor: 'default' } },
        h('span', { className: 'aa-dot', 'data-online': String(device.status === 'online') }),
        h('span', { className: 'aa-device-name' }, device.name || device.id),
        h('span', { className: 'aa-meta' }, device.deviceOs || ''))

      const deviceGroup = !groupOpen ? null : h('div', { className: 'aa-group-body' },
        devices === null
          ? h('p', { className: 'aa-empty' }, t('Loading…'))
          : devices.length === 0
            ? h('p', { className: 'aa-empty' }, t('No devices yet'))
            : devices.map((device) => deviceRow(device)))

      const listColumn = h('div', { className: 'aa-list' },
        h('div', { className: 'aa-head' },
          h('h2', { className: 'aa-title' }, 'Agents Anywhere'),
          signedIn ? h('button', { className: 'aa-btn', onClick: () => { void reload() } }, t('Refresh')) : null),
        error ? h('p', { className: 'aa-error', style: { padding: '0 18px' }, role: 'alert' }, error) : null,
        h('div', { className: 'aa-scroll' }, groupHeader, deviceGroup,
          h('button', { className: 'aa-group aa-recent-header', 'aria-expanded': recentOpen, onClick: () => setRecentOpen(value => !value) },
            h('span', { className: 'aa-group-label' }, t('Recent sessions')),
            h('svg', { className: 'aa-caret', 'data-open': String(recentOpen), width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
              h('path', { d: 'M4 6l4 4 4-4', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }))),
          recentOpen ? h('div', { className: 'aa-recent-list' },
            recentError ? h('p', { className: 'aa-error', role: 'alert' }, recentError) : null,
            recentSessions === null ? h('p', { className: 'aa-empty' }, t('Loading…'))
              : recentSessions.length === 0 ? h('p', { className: 'aa-empty' }, t('No sessions'))
              : recentSessions.map(session => sessionRow({ id: session.deviceId, name: session.device }, session))) : null))

      const caps = timeline?.capabilitySet?.capabilities || []
      const can = id => caps.some(cap => cap.capabilityId === id && cap.supported && cap.available && cap.allowed)
      const rows = timeline?.timeline?.items || []
      const detailPane = h('div', { className: 'aa-pane' },
        selected ? h(React.Fragment, null,
          h('div', { className: 'aa-pane-head' },
            h('h3', { className: 'aa-pane-title' }, selected.session.title || selected.session.id),
            h('div', { className: 'aa-pane-sub' }, selected.device.name, ' · ', selected.session.runtime, ' · ', selected.session.status,
              h('span', null, selected.session.takeover ? '已接管' : '只读')),
            h('div', { className: 'aa-controls' },
              h('button', { className: 'aa-btn', disabled: acting, onClick: () => { stickToLatest.current = true; void fetchDetail(remoteId).catch(error => setTimelineError(error.message)) } }, '刷新最新'),
              h('button', { className: 'aa-btn', disabled: acting, onClick: () => { void operate(selected.session.takeover ? 'release' : 'takeover') } }, selected.session.takeover ? '释放接管' : '接管会话'),
              h('button', { className: 'aa-btn', disabled: acting || !can('session.interrupt'), onClick: () => { void operate('interrupt') } }, '中断'))),
          h('div', { className: 'aa-body', ref: bodyRef, onScroll: event => { const el = event.currentTarget; stickToLatest.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 } },
            timelineError ? h('p', { className: 'aa-error', role: 'alert' }, timelineError) : null,
            timeline?.capabilityError ? h('p', { className: 'aa-error' }, `暂无法读取操作能力：${timeline.capabilityError}`) : null,
            timeline?.timeline?.hasMore && rows.length ? h('button', { className: 'aa-btn', onClick: () => { stickToLatest.current = false; historyScroll.current = bodyRef.current ? { height: bodyRef.current.scrollHeight, top: bodyRef.current.scrollTop } : null; void fetchDetail(remoteId, rows[0].orderSeq).catch(error => setTimelineError(error.message)) } }, '加载更早记录') : null,
            timelineLoading ? h('p', { className: 'aa-empty' }, '正在加载') : null,
            rows.map(item => h('details', { className: 'aa-record', key: item.id, open: item.type === 'message' },
              h('summary', null, item.role || item.type, ' · ', item.content?.kind || item.type, ' · ', item.status),
              h('pre', { className: 'aa-text' }, item.displayText || '（无文本内容）')))),
          h('div', { className: 'aa-composer' },
            (timeline?.notices || []).map(notice => h('div', { className: 'aa-record', key: notice.noticeId },
              h('strong', null, notice.title || notice.interactionType || '远程交互'),
              h('p', { className: 'aa-text' }, notice.message || ''),
              (notice.actions || []).some(action => action.input?.schema || action.input?.required) ? h('div', null,
                h('p', null, '此交互需要 JSON 输入，请按远端 Schema 填写：'),
                h('pre', { className: 'aa-text' }, JSON.stringify((notice.actions || []).map(action => ({ action: action.label, schema: action.input?.schema })), null, 2)),
                h('textarea', { value: noticeInputs[notice.noticeId] || '', placeholder: '{}', onChange: event => { const value = event.target.value; setNoticeInputs(previous => ({ ...previous, [notice.noticeId]: value })) }, rows: 3 })) : null,
              (notice.actions || []).map(action => h('button', { key: action.actionId, className: 'aa-btn', disabled: acting || !can('session.interaction.approval'), onClick: () => { void answerNotice(notice, action) } }, action.label || action.actionId)))),
            timeline?.noticesError ? h('p', { className: 'aa-error' }, `交互读取失败：${timeline.noticesError}`) : null,
            actionError ? h('p', { className: 'aa-error', role: 'alert' }, actionError) : null,
            h('textarea', { value: draft, disabled: acting || !can('session.send_message'), placeholder: selected.session.takeover ? '向远程会话发送消息' : '接管后可继续对话', onChange: event => { setDraft(event.target.value); draftId.current = null }, rows: 3 }),
            h('button', { className: 'aa-btn', disabled: acting || !draft.trim() || !can('session.send_message'), onClick: () => { void operate('send') } }, acting ? '处理中' : '发送')))
          : h('div', { className: 'aa-body' }, h('p', { className: 'aa-empty' }, t('Choose a session'))))

      return h('div', { className: 'aa-root' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        listColumn,
        detailPane)
    }

    const MORE_CSS = `
.aa-more { display: flex; flex-direction: column; min-width: 180px; }
.aa-more-label { padding: 6px 8px 4px; font-size: 11.5px; font-weight: 600; color: var(--dsw-alias-label-tertiary, #a3a3a3); }
.aa-more-row { display: flex; align-items: center; gap: 8px; width: 100%; height: 30px; padding: 0 8px; box-sizing: border-box; border: 0; border-radius: 7px; background: transparent; color: var(--dsw-alias-label-primary, #111111); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.aa-more-row:hover { background: var(--dsw-alias-interactive-bg-hover, #ececec); }
.aa-more-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.aa-more-meta { flex: none; font-size: 11px; color: var(--dsw-alias-label-tertiary, #a3a3a3); }
.aa-more-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--dsw-alias-state-idle-primary, #a3a3a3); }
.aa-more-dot[data-online="true"] { background: var(--dsw-alias-state-success-primary, #22c55e); }
`

    /** Device rows inside the sidebar's More menu (a safe additive slot). */
    function MoreDevices() {
      const [devices, setDevices] = useState(null)
      const [signedOut, setSignedOut] = useState(false)
      useEffect(() => {
        let live = true
        fetch('/agents-anywhere/devices', { headers: { accept: 'application/json' } })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
          .then((value) => { if (live) setDevices(Array.isArray(value.devices) ? value.devices : []) })
          .catch(() => { if (live) { setDevices([]); setSignedOut(true) } })
        return () => { live = false }
      }, [])
      const select = () => { window.__AA_REMOTE_SELECT_PANEL__?.() }
      return h(React.Fragment, null,
        h('style', { dangerouslySetInnerHTML: { __html: MORE_CSS } }),
        h('div', { className: 'aa-more' },
          h('div', { className: 'aa-more-label' }, 'Agents Anywhere'),
          (devices ?? []).length > 0
            ? (devices ?? []).map((device) => h('button', {
              key: device.id,
              className: 'aa-more-row',
              onClick: select,
            },
            h('span', { className: 'aa-more-dot', 'data-online': String(device.status === 'online') }),
            h('span', { className: 'aa-more-name' }, device.name || device.id),
            h('span', { className: 'aa-more-meta' }, device.activeSessions ? String(device.activeSessions) : '')))
            : h('button', { className: 'aa-more-row', onClick: select }, signedOut ? '登录 Agents Anywhere' : '暂无设备')))
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        window.__AA_REMOTE_SELECT_PANEL__ = () => { ctx.layout.selectPanel('agents-anywhere') }
        window.__AA_REMOTE_OPEN_SESSION__ = (id) => { ctx.get('uiWorkspace')?.openSession(id) }
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'agents-anywhere-remote.locale')
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'agents-anywhere',
          order: 50,
          label: () => 'Agents Anywhere',
        }, DeviceIcon)), 'agents-anywhere-remote.sidebar')
        ctx.effect(() => ctx.slots.inject('sidebar.panellist.actions', () => ctx.slots.register({
          name: 'sidebar.panellist.actions',
          id: 'agents-anywhere',
          order: 50,
          label: () => 'Agents Anywhere',
        }, MoreDevices)), 'agents-anywhere-remote.more-menu')
        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'agents-anywhere',
          locale: NS,
        }, DevicesPanel)), 'agents-anywhere-remote.panel')
      },
    }
  },
})
