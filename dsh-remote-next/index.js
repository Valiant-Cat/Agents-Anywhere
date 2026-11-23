import { sessionDetail, sessionAction, timelineText, respondNotice } from './remote-session.js'
import { RemoteBindings, localSessionId, bindingContext } from './bindings.js'
/**
 * Agents Anywhere remote devices for DSH.
 *
 * Host plugin: signs in to an Agents Anywhere Server, then exposes tools that list
 * devices and remote sessions, read a remote timeline, and send a message to a
 * remote runtime. Remote work still happens on the device that runs the
 * Connector and the runtime; this plugin only talks to the Server API.
 *
 * @module @vvicat/dsh-agents-anywhere
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'

/** Product API namespace; the configured origin never carries it. */
const API_NAMESPACE = '/api/v2'
/** Default backend: Agents Anywhere Cloud. */
const CLOUD_ORIGIN = 'https://web.agents-anywhere.com'
/**
 * First-party native (loopback) OAuth client. The Server accepts this client id
 * for `http://127.0.0.1:<port>/oauth/callback`, the same loopback flow the
 * Agents Anywhere for DSH bridge uses.
 */
const OAUTH_CLIENT_ID = 'agents-anywhere-dsh-plugin'
/** Credential record that keeps the account token out of configuration. */
const ACCOUNT_RECORD = 'agents-anywhere-remote/account'
const REQUEST_TIMEOUT_MS = 20_000
const DEFAULT_LOGIN_WAIT_SECONDS = 120
const MAX_LOGIN_WAIT_SECONDS = 300
const TEXT_LIMIT = 1_200
const TIMELINE_TYPES = new Set(['message', 'tool', 'artifact', 'marker', 'system', 'turn.start', 'turn.end'])

/* ------------------------------------------------------------------ */
/* Settings and small helpers                                          */
/* ------------------------------------------------------------------ */

/**
 * Resolve the row config into the values this plugin uses.
 * @param {unknown} raw - the Loader row config.
 * @returns {{ serverUrl: string }} resolved settings.
 */
function resolveSettings(raw) {
  const config = raw && typeof raw === 'object' ? raw : {}
  const serverUrl = typeof config.serverUrl === 'string' && config.serverUrl.trim()
    ? config.serverUrl
    : CLOUD_ORIGIN
  return { serverUrl }
}

/**
 * Accept an origin-only server address, rejecting credentials, paths, and the
 * API namespace the product never stores.
 * @param {string} value - user-provided address.
 * @returns {string} normalized origin.
 */
function normalizeOrigin(value) {
  try {
    const input = String(value ?? '').trim()
    if (!input) throw new Error()
    const url = new URL(input.includes('://') ? input : `https://${input}`)
    const pathname = url.pathname.replace(/\/+$/, '')
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || url.search || url.hash || (pathname && pathname !== API_NAMESPACE)) throw new Error()
    return url.origin
  } catch {
    throw new Error('服务器地址无效：请输入 HTTP 或 HTTPS 地址，不要包含账号、密码或页面路径。')
  }
}

/**
 * Clamp a long text to a model-facing budget, marking the cut explicitly.
 * @param {unknown} value - candidate text.
 * @param {number} [limit] - maximum characters.
 * @returns {string} clamped text.
 */
function clampText(value, limit = TEXT_LIMIT) {
  const text = typeof value === 'string' ? value : ''
  return text.length > limit ? `${text.slice(0, limit)}…（已截断）` : text
}

/**
 * Read the first usable string out of a timeline item's opaque content.
 * @param {Record<string, unknown>} content - item content.
 * @returns {string} readable text.
 */
function contentText(content) {
  for (const key of ['text', 'content', 'message', 'rawText', 'summary', 'title', 'reason']) {
    const value = content[key]
    if (typeof value === 'string' && value.trim()) return value
    if (Array.isArray(value)) {
      const joined = value
        .map((block) => (block && typeof block === 'object' && typeof block.text === 'string' ? block.text : ''))
        .filter(Boolean)
        .join('\n')
      if (joined.trim()) return joined
    }
  }
  return ''
}

/**
 * Summarize one remote timeline item for the model.
 * @param {Record<string, any>} item - raw protocol item.
 * @returns {Record<string, unknown>} bounded summary.
 */
function summarizeItem(item) {
  const content = item.content && typeof item.content === 'object' ? item.content : {}
  const name = [content.name, content.tool, content.toolName, content.kind]
    .find((value) => typeof value === 'string' && value.trim())
  return {
    seq: item.orderSeq,
    type: item.type,
    role: item.role ?? null,
    status: item.status ?? null,
    at: item.createdAt ?? null,
    ...(name ? { label: String(name) } : {}),
    text: clampText(contentText(content)),
  }
}

/**
 * Render summaries as bounded plain text lines.
 * @param {readonly Record<string, unknown>[]} items - summarized items.
 * @returns {string} text block body.
 */
function renderItems(items) {
  return items.map((item) => {
    const who = item.role ? String(item.role) : String(item.type)
    const status = item.status && item.status !== 'done' ? ` (${item.status})` : ''
    const label = item.label ? ` <${item.label}>` : ''
    return `[${item.seq}] ${who}${label}${status}: ${String(item.text || '').replace(/\s+/g, ' ').trim()}`
  }).join('\n')
}

/* ------------------------------------------------------------------ */
/* HTTP client                                                         */
/* ------------------------------------------------------------------ */

class ApiError extends Error {
  /** @param {number} status @param {string} message */
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/**
 * Minimal Agents Anywhere client: one origin, one optional bearer token.
 */
class Api {
  /**
   * @param {string} origin - server origin.
   * @param {string | null} token - account token, if signed in.
   */
  constructor(origin, token) {
    this.origin = origin
    this.token = token
  }

  /**
   * @param {string} path - product path such as `/sessions`.
   * @param {{ method?: string, body?: unknown, signal?: AbortSignal }} [options] - request options.
   * @returns {Promise<any>} parsed JSON.
   */
  async request(path, options = {}) {
    const { method = 'GET', body, signal } = options
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    /** @type {HeadersInit} */
    const headers = { accept: 'application/json' }
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (this.token) headers.authorization = `Bearer ${this.token}`
    let response
    try {
      response = await fetch(`${this.origin}${API_NAMESPACE}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      })
    } catch (error) {
      signal?.throwIfAborted()
      if (timeout.aborted) throw new Error('连接 Agents Anywhere 服务器超时，请检查地址和网络后重试。')
      throw error
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      if (response.status === 401) throw new ApiError(401, '登录已失效，请重新登录：调用 aa_login。')
      if (response.status === 404) throw new ApiError(404, '资源不存在：请确认会话或设备仍属于当前账号。')
      throw new ApiError(response.status, `服务请求失败（HTTP ${response.status}）${detail ? `：${clampText(detail, 300)}` : ''}`)
    }
    if (response.status === 204) return null
    return await response.json().catch(() => null)
  }
}

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

/**
 * @typedef {{
 *   origin: string, accessToken: string, expiresAt: number,
 *   userId: string, displayName: string | null, email: string | null
 * }} Account
 */

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @returns {Promise<Account | null>} stored account, when present and well formed.
 */
async function readAccount(ctx) {
  const record = await ctx.credentials.readRecord(ACCOUNT_RECORD)
  const payload = record && typeof record === 'object' ? record.payload : null
  if (!payload || typeof payload !== 'object') return null
  const account = /** @type {Account} */ (payload)
  if (typeof account.accessToken !== 'string' || typeof account.origin !== 'string'
    || typeof account.userId !== 'string' || !Number.isFinite(account.expiresAt)) return null
  return account
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {Account} account - account to persist.
 * @returns {Promise<void>} when the record is written.
 */
async function writeAccount(ctx, account) {
  await ctx.credentials.modifyRecord(ACCOUNT_RECORD, async () => ({ kind: 'grant', payload: account }))
}

/**
 * Account for the configured server; a token issued by another server is not reused.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {string} origin - configured origin.
 * @returns {Promise<Account | null>} usable account.
 */
async function accountFor(ctx, origin) {
  let account = await readAccount(ctx)
  if (!account || account.origin !== origin) return null
  const identity = await readDshIdentity(ctx)
  if (!identity) {
    // The DSH unified identity is gone: drop the derived AA session. Agents
    // Anywhere has no independent login, so this is the only source.
    await ctx.credentials.deleteRecord(ACCOUNT_RECORD)
    return null
  }
  // Sessions obtained before the unified-identity model, and near-expiry
  // sessions, are replaced from the DSH identity.
  if (account.via !== 'dsh-sso' || account.expiresAt < Date.now() + 60_000) {
    try {
      account = await exchangeDshIdentity(origin, identity)
      await writeAccount(ctx, account)
    } catch {
      await ctx.credentials.deleteRecord(ACCOUNT_RECORD)
      return null
    }
  }
  return account
}

/** DSH profile record written by the VVICAT authorization plugin. */
const DSH_IDENTITY_RECORD = 'vvicat-authorization/default'

/**
 * Read the 侠猫 unified identity DSH already holds, if it is still valid.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @returns {Promise<{ accessToken: string, email: string | null, displayName: string | null, subject: string | null } | null>} identity or null.
 */
async function readDshIdentity(ctx) {
  try {
    const record = await ctx.credentials.readRecord(DSH_IDENTITY_RECORD)
    const payload = record && typeof record === 'object' ? record.payload : null
    if (!payload || typeof payload !== 'object') return null
    const accessToken = typeof payload.accessToken === 'string' ? payload.accessToken.trim() : ''
    if (!accessToken) return null
    const expiresAt = Number(payload.expiresAt)
    if (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt < Date.now() + 30_000) return null
    return {
      accessToken,
      email: typeof payload.email === 'string' ? payload.email : null,
      displayName: typeof payload.displayName === 'string' ? payload.displayName : null,
      subject: payload.subject === undefined || payload.subject === null ? null : String(payload.subject),
    }
  } catch {
    return null
  }
}

/**
 * Exchange the DSH identity-provider token for an Agents Anywhere session.
 * @param {string} origin - server origin.
 * @param {{ accessToken: string, email: string | null, displayName: string | null }} identity - DSH identity.
 * @returns {Promise<Account>} the signed-in account.
 */
async function exchangeDshIdentity(origin, identity) {
  const response = await fetch(`${origin}${API_NAMESPACE}/auth/oauth/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ accessToken: identity.accessToken }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    if (response.status === 404 || response.status === 405) throw new ApiError(response.status, '当前 AA 服务未部署统一身份交换接口，请更新服务端；无需在插件中重新登录。')
    if (response.status === 401) throw new ApiError(401, 'DSH 登录凭据已失效，请在 DSH 账号设置中重新登录；Agents Anywhere 将自动跟随同步。')
    throw new ApiError(response.status, `身份交换失败（HTTP ${response.status}）`)
  }
  const data = await response.json()
  if (!data || typeof data.accessToken !== 'string' || !data.accessToken) {
    throw new Error('身份服务没有返回有效凭据。')
  }
  const expiresIn = Number.isFinite(data.expiresIn) && data.expiresIn > 0 ? data.expiresIn : 15 * 60
  return {
    origin,
    accessToken: data.accessToken,
    via: 'dsh-sso',
    expiresAt: Date.now() + expiresIn * 1000,
    userId: typeof data.userId === 'string' ? data.userId : '',
    displayName: typeof data.displayName === 'string' ? data.displayName : identity.displayName,
    email: typeof data.email === 'string' ? data.email : identity.email,
  }
}

/** @param {import('@deepseek-ai/cordis').Context} ctx @param {string} origin */
async function requireApi(ctx, origin) {
  const account = await accountFor(ctx, origin)
  if (!account) throw new Error('Agents Anywhere 会话已失效：请先在 DSH 登录侠猫统一身份，再调用 aa_login 同步。')
  return new Api(origin, account.accessToken)
}

/* ------------------------------------------------------------------ */
/* Unified-identity sign-in                                            */
/* ------------------------------------------------------------------ */

/**
 * Build (or refresh) the Agents Anywhere session from the DSH unified
 * identity. There is deliberately no independent AA login: signing out of the
 * DSH identity clears this session.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {{ serverUrl: string }} settings - resolved settings.
 * @returns {Promise<Record<string, unknown>>} tool value.
 */
async function login(ctx, settings) {
  const origin = normalizeOrigin(settings.serverUrl)
  const identity = await readDshIdentity(ctx)
  if (!identity) {
    throw new Error('DSH 当前未登录侠猫统一身份。请先在 DSH 完成登录，Agents Anywhere 会跟随同步，不能单独登录。')
  }
  try {
    const account = await exchangeDshIdentity(origin, identity)
    await writeAccount(ctx, account)
    return {
      status: 'signed-in',
      server: origin,
      userId: account.userId,
      displayName: account.displayName,
      email: account.email,
      expiresAt: new Date(account.expiresAt).toISOString(),
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new Error('该 Agents Anywhere 实例不支持侠猫统一身份登录，请升级服务端或换用支持统一身份的实例。')
    }
    if (error instanceof ApiError && error.status === 403) {
      throw new Error('该 Agents Anywhere 实例已关闭侠猫注册，请让管理员为这个侠猫账号绑定 AA 账号。')
    }
    if (error instanceof ApiError && error.status === 409) {
      throw new Error('该侠猫身份尚未绑定可用的 Agents Anywhere 账号，请联系实例管理员。')
    }
    throw error
  }
}

/** @param {import('@deepseek-ai/cordis').Context} ctx @param {string} origin */
async function accountStatus(ctx, origin) {
  const account = await accountFor(ctx, origin)
  if (!account) return { server: origin, signedIn: false, dshSignedIn: Boolean(await readDshIdentity(ctx)) }
  let live = true
  try {
    await new Api(origin, account.accessToken).request('/auth/me')
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) live = false
    else throw error
  }
  return {
    server: origin,
    signedIn: true,
    authorized: live,
    userId: account.userId,
    displayName: account.displayName,
    email: account.email,
    expiresAt: new Date(account.expiresAt).toISOString(),
  }
}

/** @param {import('@deepseek-ai/cordis').Context} ctx @param {string} origin */
async function listDevices(ctx, origin) {
  const api = await requireApi(ctx, origin)
  const [connectorPage, sessionPage] = await Promise.all([
    api.request('/connectors'),
    api.request('/sessions?limit=100&archived=false').catch(() => ({ sessions: [] })),
  ])
  const connectors = Array.isArray(connectorPage?.connectors) ? connectorPage.connectors : []
  const sessions = Array.isArray(sessionPage?.sessions) ? sessionPage.sessions : []
  const counts = new Map()
  for (const session of sessions) counts.set(session.connectorId, (counts.get(session.connectorId) ?? 0) + 1)
  return {
    devices: connectors.map((connector) => ({
      id: connector.id,
      name: connector.name,
      status: connector.status,
      connectorKind: connector.connectorKind,
      deviceOs: connector.deviceOs ?? null,
      lastSeenAt: connector.lastSeenAt ?? null,
      activeSessions: counts.get(connector.id) ?? 0,
    })),
  }
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {string} origin - server origin.
 * @param {{ deviceId?: string, query?: string, limit: number, archived: boolean }} options - filters.
 * @returns {Promise<Record<string, unknown>>} session list.
 */
async function listSessions(ctx, origin, options) {
  const api = await requireApi(ctx, origin)
  const page = await api.request(`/sessions?limit=100&archived=${options.archived ? 'true' : 'false'}`)
  const devices = await api.request('/connectors').catch(() => ({ connectors: [] }))
  const deviceNames = new Map((devices.connectors ?? []).map((connector) => [connector.id, connector.name]))
  const query = (options.query ?? '').trim().toLowerCase()
  const filtered = (page?.sessions ?? []).filter((session) => {
    if (options.deviceId && session.connectorId !== options.deviceId) return false
    if (!query) return true
    return [session.title, session.externalSessionId, session.id, session.cwd]
      .some((value) => typeof value === 'string' && value.toLowerCase().includes(query))
  })
  return {
    sessions: filtered.slice().sort((a, b) => (Date.parse(b.lastActivityAt || b.updatedAt || b.lastItemAt || '') || 0) - (Date.parse(a.lastActivityAt || a.updatedAt || a.lastItemAt || '') || 0)).slice(0, options.limit).map((session) => ({
      id: session.id,
      title: session.title ?? null,
      deviceId: session.connectorId,
      device: deviceNames.get(session.connectorId) ?? null,
      runtime: session.runtime ?? null,
      runtimeName: session.runtimeName ?? session.runtimeTypeDisplayName ?? null,
      status: session.status ?? null,
      statusReason: session.statusReason ?? null,
      cwd: session.cwd ?? null,
      updatedAt: session.lastActivityAt ?? session.updatedAt ?? session.lastItemAt ?? null,
    })),
    matched: filtered.length,
    scanned: Array.isArray(page?.sessions) ? page.sessions.length : 0,
    hasMore: Boolean(page?.hasMore),
  }
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {string} origin - server origin.
 * @param {string} sessionId - remote session id.
 * @param {number} limit - number of latest items.
 * @returns {Promise<Record<string, unknown>>} timeline read.
 */
async function readTimeline(ctx, origin, sessionId, limit) {
  const api = await requireApi(ctx, origin)
  const meta = await api.request(`/sessions/${encodeURIComponent(sessionId)}/meta`)
  const timeline = await api.request(`/sessions/${encodeURIComponent(sessionId)}/timeline?mode=latest&limit=${limit}`)
  const items = (timeline?.items ?? [])
    .filter((item) => typeof item?.type === 'string')
    .map(summarizeItem)
    .sort((left, right) => Number(left.seq) - Number(right.seq))
  return {
    sessionId,
    title: meta?.session?.title ?? null,
    runtime: meta?.session?.runtime ?? null,
    deviceId: meta?.session?.connectorId ?? null,
    status: meta?.session?.status ?? null,
    items,
    hasMore: Boolean(timeline?.hasMore),
  }
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {string} origin - server origin.
 * @param {{ sessionId: string, message: string, queue?: string, waitSeconds: number }} options - send options.
 * @param {AbortSignal} signal - step cancellation.
 * @returns {Promise<Record<string, unknown>>} send result.
 */
async function sendMessage(ctx, origin, options, signal) {
  const api = await requireApi(ctx, origin)
  const path = `/sessions/${encodeURIComponent(options.sessionId)}`
  const baseline = await api.request(`${path}/timeline?mode=latest&limit=1`, { signal })
  const beforeSeq = Number(baseline?.nextSeq ?? 0)
  const body = { content: options.message }
  if (options.queue) body.queue = options.queue
  const result = await api.request(`${path}/runtime/messages`, { method: 'POST', body, signal })
  if (result && result.ok === false) {
    const reason = result.error?.message ?? '远端拒绝接收这条消息。'
    throw new Error(`发送失败：${reason}`)
  }
  const events = []
  let seq = beforeSeq
  if (options.waitSeconds > 0) {
    const deadline = Date.now() + options.waitSeconds * 1000
    while (Date.now() < deadline) {
      await delay(1_500, undefined, { signal })
      const page = await api.request(`${path}/timeline?mode=changes&afterSeq=${seq}&limit=200`, { signal })
      const items = Array.isArray(page?.items) ? page.items : []
      for (const item of items) if (TIMELINE_TYPES.has(item?.type)) events.push(summarizeItem(item))
      seq = Number(page?.nextSeq ?? seq)
      if (events.some((item) => item.type === 'message' && item.role === 'assistant' && item.status === 'done')) break
    }
  }
  const state = await api.request(`${path}/runtime/state`, { signal }).catch(() => null)
  return {
    sessionId: options.sessionId,
    accepted: true,
    status: state?.state?.status ?? null,
    events,
    waitedSeconds: options.waitSeconds,
  }
}

/* ------------------------------------------------------------------ */
/* Tool registration                                                   */
/* ------------------------------------------------------------------ */

/**
 * @param {string} name - tool name.
 * @param {string} description - model-facing description.
 * @param {Record<string, unknown>} parameters - parameter schema.
 * @param {Record<string, unknown>} outputSchema - result schema.
 * @param {string} outputTitle - first line of the rendered result.
 * @param {(value: any) => string} renderBody - rendered result body.
 * @param {(args: any, exec: any) => Promise<any>} execute - tool body.
 * @param {number} timeoutMs - execution deadline.
 * @returns {Record<string, unknown>} tool definition.
 */
function tool(name, description, parameters, outputSchema, outputTitle, renderBody, execute, timeoutMs) {
  return {
    name,
    description,
    parameters,
    output: {
      schema: outputSchema,
      render: (_args, value) => [{ type: 'text', text: `${outputTitle}\n${renderBody(value)}` }],
    },
    execute,
    timeoutMs,
  }
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {{ serverUrl: string }} settings - resolved settings.
 */
function registerTools(ctx, settings, bindings = null) {
  const origin = normalizeOrigin(settings.serverUrl)
  ctx.effect(() => ctx.tools.register(tool(
    'aa_session_control',
    'Inspect complete remote session records, explicitly enable or release takeover, or interrupt a remote turn. Takeover is account-wide and may release queued work; enable it only when the user requests control. This does not create a local subagent.',
    {
      sessionId: { type: 'string', required: true, description: 'AA remote session id.' },
      action: { type: 'string', required: true, enum: ['inspect', 'takeover', 'release', 'interrupt'], description: 'inspect is read-only; other actions change remote state.' },
    },
    { type: 'object', additionalProperties: true },
    'Remote session control', value => JSON.stringify(value),
    async (args) => {
      const api = await requireApi(ctx, origin)
      if (args.action !== 'inspect') return sessionAction(api, args.sessionId, args.action)
      const detail = await sessionDetail(api, args.sessionId)
      return { session: detail.session, capabilitySet: detail.capabilitySet, capabilityError: detail.capabilityError, items: (detail.timeline.items || []).map(summarizeItem), hasMore: detail.timeline.hasMore }
    }, 60_000,
  )))
  if (bindings) ctx.effect(() => ctx.tools.register(tool(
    'aa_binding',
    'Get, set or clear the remote session associated with this DSH conversation only. Set verifies the remote session belongs to the current AA account. Association never sends work and never changes another conversation.',
    {
      action: { type: 'string', enum: ['get', 'set', 'clear'], required: true, description: 'Operation on this conversation’s association.' },
      sessionId: { type: 'string', description: 'Remote session id, required for set; discover with aa_sessions.' },
    },
    { type: 'object', additionalProperties: true },
    'Agents Anywhere association',
    value => JSON.stringify(value),
    async (args, exec) => {
      const id = localSessionId(exec)
      if (args.action === 'clear') { await bindings.clear(id); return { bound: false } }
      const api = await requireApi(ctx, origin)
      const account = await accountFor(ctx, origin)
      const current = bindings.get(id)
      if (args.action === 'get' && !current) return { bound: false }
      if (args.action === 'get' && (current.origin !== origin || current.userId !== account.userId)) {
        return { bound: false, reason: '关联属于其他服务或账号，请重新选择目标。' }
      }
      const remoteId = args.action === 'set' ? args.sessionId : current.sessionId
      if (typeof remoteId !== 'string' || !remoteId.trim()) throw new Error('set 必须提供远程 sessionId。')
      const meta = await api.request(`/sessions/${encodeURIComponent(remoteId)}/meta`, { signal: exec.signal })
      const session = meta?.session
      if (!session || session.id !== remoteId) throw new Error('远程会话响应无效。')
      const row = { origin, userId: account.userId, sessionId: remoteId, deviceId: session.connectorId, runtime: session.runtime, title: clampText(session.title, 200), updatedAt: new Date().toISOString() }
      if (args.action === 'set') await bindings.set(id, row)
      return { bound: true, target: row, status: session.status, deviceStatus: session.connectorStatus }
    },
    60_000,
  )))

  ctx.effect(() => ctx.tools.register(tool(
    'aa_login',
    'Sync the Agents Anywhere session with the DSH unified identity. There is no separate Agents Anywhere login: the user signs in to DSH (侠猫统一身份) and this tool exchanges that identity for an AA session tailored to the current server.',
    {},
    {
      type: 'object',
      additionalProperties: true,
      required: ['status', 'server'],
      properties: {
        status: { type: 'string' },
        server: { type: 'string' },
        userId: { type: 'string' },
        displayName: { type: 'string' },
        email: { type: 'string' },
        expiresAt: { type: 'string' },
      },
    },
    'Agents Anywhere sign-in',
    (value) => `Signed in to ${value.server} as ${value.displayName ?? value.email ?? value.userId}.`,
    async () => login(ctx, settings),
    60_000,
  )))

  ctx.effect(() => ctx.tools.register(tool(
    'aa_account',
    'Show the Agents Anywhere account this DSH session is signed in to, the server address, and whether the stored token still works.',
    {},
    {
      type: 'object',
      additionalProperties: true,
      required: ['server', 'signedIn'],
      properties: {
        server: { type: 'string' },
        signedIn: { type: 'boolean' },
        authorized: { type: 'boolean' },
        userId: { type: 'string' },
        displayName: { type: 'string' },
        email: { type: 'string' },
        expiresAt: { type: 'string' },
      },
    },
    'Agents Anywhere account',
    (value) => value.signedIn
      ? `Signed in to ${value.server} as ${value.displayName ?? value.email ?? value.userId}${value.authorized === false ? ' (token expired, call aa_login)' : ''}.`
      : `Not signed in to ${value.server}. Call aa_login to sign in.`,
    async () => accountStatus(ctx, origin),
    30_000,
  )))

  ctx.effect(() => ctx.tools.register(tool(
    'aa_devices',
    'List the Agents Anywhere devices (Connectors) on this account with their online status and how many active sessions each one has.',
    {},
    {
      type: 'object',
      additionalProperties: true,
      required: ['devices'],
      properties: {
        devices: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
            required: ['id', 'name', 'status'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              status: { type: 'string' },
              deviceOs: { type: 'string' },
              lastSeenAt: { type: 'string' },
              activeSessions: { type: 'integer' },
            },
          },
        },
      },
    },
    'Agents Anywhere devices',
    (value) => value.devices.length === 0
      ? 'No devices on this account yet.'
      : value.devices.map((device) => `- ${device.name} (${device.id}) — ${device.status}${device.deviceOs ? `, ${device.deviceOs}` : ''}, ${device.activeSessions ?? 0} active sessions`).join('\n'),
    async () => listDevices(ctx, origin),
    60_000,
  )))

  ctx.effect(() => ctx.tools.register(tool(
    'aa_sessions',
    'List remote Agents Anywhere sessions with their device, runtime, status, and title. Session ids from here are the input for aa_timeline and aa_send.',
    {
      deviceId: { type: 'string', description: 'Only sessions on this device (Connector) id.' },
      query: { type: 'string', description: 'Case-insensitive match on title, external session id, session id, or working directory.' },
      limit: { type: 'integer', description: 'Maximum sessions to return, 1-100. Default 20.' },
      archived: { type: 'boolean', description: 'List archived sessions instead of active ones. Default false.' },
    },
    {
      type: 'object',
      additionalProperties: true,
      required: ['sessions'],
      properties: {
        sessions: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
            required: ['id'],
            properties: {
              id: { type: 'string' },
              title: { oneOf: [{ type: 'string' }, { type: 'null' }] },
              device: { oneOf: [{ type: 'string' }, { type: 'null' }] },
              runtime: { oneOf: [{ type: 'string' }, { type: 'null' }] },
              status: { oneOf: [{ type: 'string' }, { type: 'null' }] },
              cwd: { oneOf: [{ type: 'string' }, { type: 'null' }] },
              updatedAt: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            },
          },
        },
        matched: { type: 'integer' },
        scanned: { type: 'integer' },
        hasMore: { type: 'boolean' },
      },
    },
    'Agents Anywhere sessions',
    (value) => value.sessions.length === 0
      ? 'No sessions matched.'
      : value.sessions.map((session) => `- ${session.id} · ${session.runtime ?? 'unknown runtime'} · ${session.status ?? 'unknown'} · "${session.title ?? '(untitled)'}" · ${session.device ?? session.deviceId}${session.cwd ? ` · ${session.cwd}` : ''}`).join('\n'),
    async (args) => listSessions(ctx, origin, {
      deviceId: typeof args.deviceId === 'string' ? args.deviceId : undefined,
      query: typeof args.query === 'string' ? args.query : undefined,
      limit: Number.isFinite(args.limit) ? Math.min(Math.max(Math.trunc(args.limit), 1), 100) : 20,
      archived: args.archived === true,
    }),
    60_000,
  )))

  ctx.effect(() => ctx.tools.register(tool(
    'aa_timeline',
    'Read the latest timeline entries of one remote Agents Anywhere session, including user and assistant messages and tool activity. Use the session id from aa_sessions.',
    {
      sessionId: { type: 'string', required: true, description: 'Remote session id from aa_sessions.' },
      limit: { type: 'integer', description: 'Number of latest timeline entries, 1-200. Default 20.' },
    },
    {
      type: 'object',
      additionalProperties: true,
      required: ['sessionId', 'items'],
      properties: {
        sessionId: { type: 'string' },
        title: { type: 'string' },
        runtime: { type: 'string' },
        status: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
            required: ['seq', 'type'],
            properties: {
              seq: { type: 'integer' },
              type: { type: 'string' },
              role: { type: 'string' },
              status: { type: 'string' },
              text: { type: 'string' },
            },
          },
        },
        hasMore: { type: 'boolean' },
      },
    },
    'Agents Anywhere timeline',
    (value) => {
      const header = `${value.sessionId} · ${value.runtime ?? 'unknown'} · ${value.status ?? 'unknown'}${value.title ? ` · "${value.title}"` : ''}`
      return `${header}\n${value.items.length === 0 ? '(no timeline entries)' : renderItems(value.items)}`
    },
    async (args) => readTimeline(
      ctx,
      origin,
      String(args.sessionId),
      Number.isFinite(args.limit) ? Math.min(Math.max(Math.trunc(args.limit), 1), 200) : 20,
    ),
    60_000,
  )))

  ctx.effect(() => ctx.tools.register(tool(
    'aa_send',
    'Send a message to a remote Agents Anywhere session and optionally wait for the next assistant reply. The remote device must be online; work runs there, not on this machine.',
    {
      sessionId: { type: 'string', required: true, description: 'Remote session id from aa_sessions.' },
      message: { type: 'string', required: true, description: 'Message text to deliver to the remote runtime.' },
      queue: {
        type: 'string',
        enum: ['auto', 'interrupt', 'never'],
        description: 'Behavior when the remote session is busy: auto queues, interrupt queues and stops the current turn, never rejects. Default runtime policy when omitted.',
      },
      waitSeconds: { type: 'integer', description: 'Seconds to wait for the assistant reply after sending, 0-180. Default 0 (do not wait).' },
    },
    {
      type: 'object',
      additionalProperties: true,
      required: ['sessionId', 'accepted', 'events'],
      properties: {
        sessionId: { type: 'string' },
        accepted: { type: 'boolean' },
        status: { type: 'string' },
        events: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
            required: ['seq', 'type'],
            properties: {
              seq: { type: 'integer' },
              type: { type: 'string' },
              role: { type: 'string' },
              status: { type: 'string' },
              text: { type: 'string' },
            },
          },
        },
        waitedSeconds: { type: 'integer' },
      },
    },
    'Agents Anywhere send',
    (value) => {
      const head = `Delivered to ${value.sessionId}${value.status ? ` · ${value.status}` : ''}.`
      if (!value.events.length) return `${head} No new timeline entries were read.`
      return `${head}\n${renderItems(value.events)}`
    },
    async (args, exec) => {
      const waitSeconds = Number.isFinite(args.waitSeconds) ? Math.min(Math.max(Math.trunc(args.waitSeconds), 0), 180) : 0
      const queue = ['auto', 'interrupt', 'never'].includes(args.queue) ? args.queue : undefined
      return sendMessage(ctx, origin, {
        sessionId: String(args.sessionId),
        message: String(args.message),
        queue,
        waitSeconds,
      }, exec.signal)
    },
    240_000,
  )))
}

/* ------------------------------------------------------------------ */
/* Panel route                                                         */
/* ------------------------------------------------------------------ */

/** Same-origin HTTP surface the Client page reads; never carries the token. */
const ROUTE_PREFIX = '/agents-anywhere'
const BODY_LIMIT = 64 * 1024

/**
 * @param {import('node:http').ServerResponse} response - response.
 * @param {number} status - HTTP status.
 * @param {unknown} payload - JSON body.
 */
function sendJson(response, status, payload) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}

/**
 * @param {import('node:http').IncomingMessage} request - request.
 * @returns {Promise<Record<string, unknown>>} parsed body.
 */
async function readJsonBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > BODY_LIMIT) throw new Error('请求体过大。')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('请求体不是有效的 JSON。')
  }
}

/**
 * Build the route handler for the device panel. Paths stay relative to the
 * DSH web origin, and the account token never leaves the Host.
 *
 * The DSH web app authenticates page loads itself, but a raw prefix route is
 * served before that check. A per-activation random token, injected into the
 * authenticated index page only, keeps other local callers out.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {{ serverUrl: string }} settings - resolved settings.
 * @param {string} token - panel access token.
 * @returns {(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) => Promise<void>} handler.
 */
function createPanelRoute(ctx, settings, token) {
  const origin = normalizeOrigin(settings.serverUrl)
  /**
   * The panel is a same-origin page action. DSH authenticates the page itself;
   * a raw prefix route is served before that check, so accept either the token
   * injected into the index or a same-origin Referer/Origin from that page.
   * @param {import('node:http').IncomingMessage} request - request.
   * @returns {boolean} whether the caller may use the panel route.
   */
  const authorize = (request) => {
    const supplied = String(request.headers['x-agents-anywhere-token'] ?? '')
    if (supplied.length === token.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(token))) return true
    const webServer = typeof ctx.get === 'function' ? ctx.get('webServer') : undefined
    const webOrigin = webServer && typeof webServer.getOrigin === 'function' ? webServer.getOrigin().replace(/\/+$/, '') : ''
    // The Desktop renderer reaches this route through its `dsh-app://` proxy,
    // which forwards the app's own cookie and Host header but no Origin/Referer.
    if (webOrigin !== '' && request.headers.host === new URL(webOrigin).host) return true
    if (typeof request.headers.cookie === 'string' && request.headers.cookie.length > 0) return true
    const referer = typeof request.headers.referer === 'string' ? request.headers.referer : ''
    const requestOrigin = typeof request.headers.origin === 'string' ? request.headers.origin : ''
    // Desktop renders the page from its own dsh-app:// protocol; the browser
    // Web GUI uses the webserver origin. Either way the request comes from a
    // page the app already authenticated.
    if (request.headers['sec-fetch-site'] === 'same-origin') return true
    if (referer.startsWith('dsh-app://') || requestOrigin.startsWith('dsh-app://')) return true
    if (!webOrigin) return false
    return referer === webOrigin || referer.startsWith(`${webOrigin}/`) || requestOrigin === webOrigin
  }
  return async (request, response) => {
    if (!authorize(request)) {
      sendJson(response, 401, { error: 'unauthorized' })
      return
    }
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      const path = url.pathname.startsWith(ROUTE_PREFIX)
        ? url.pathname.slice(ROUTE_PREFIX.length) || '/'
        : url.pathname
      if (request.method === 'GET' && path === '/status') {
        sendJson(response, 200, await accountStatus(ctx, origin))
        return
      }
      if (request.method === 'POST' && path === '/login') {
        sendJson(response, 200, await login(ctx, settings))
        return
      }
      if (request.method === 'GET' && path === '/auth-config') {
        const response2 = await fetch(`${origin}${API_NAMESPACE}/auth/config`, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        })
        const data = await response2.json().catch(() => null)
        const dshIdentity = await readDshIdentity(ctx)
        const exchangeEnabled = Boolean(data && data.oauthExchangeEnabled)
        sendJson(response, 200, {
          oauthEnabled: Boolean(data && data.oauthEnabled),
          oauthProviderLabel: data && typeof data.oauthProviderLabel === 'string' ? data.oauthProviderLabel : null,
          registrationOpen: Boolean(data && data.registrationOpen),
          ssoAvailable: Boolean(dshIdentity && exchangeEnabled),
        })
        return
      }
      if (request.method === 'GET' && path === '/devices') {
        sendJson(response, 200, await listDevices(ctx, origin))
        return
      }
      if (request.method === 'GET' && path === '/sessions') {
        const limit = Number(url.searchParams.get('limit') ?? 100)
        sendJson(response, 200, await listSessions(ctx, origin, {
          deviceId: url.searchParams.get('deviceId') || undefined,
          limit: Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 100) : 100,
          archived: url.searchParams.get('archived') === 'true',
        }))
        return
      }
      if (request.method === 'GET' && path === '/session-detail') {
        const id = url.searchParams.get('sessionId')
        if (!id) throw new Error('缺少 sessionId。')
        const before = Number(url.searchParams.get('before') || 0)
        const detail = await sessionDetail(await requireApi(ctx, origin), id, { before: before > 0 ? before : undefined })
        sendJson(response, 200, { ...detail, timeline: { ...detail.timeline, items: (detail.timeline.items || []).map(item => ({ ...item, displayText: timelineText(item) })) } })
        return
      }
      if (request.method === 'POST' && path === '/notice-response') {
        const body = await readJsonBody(request)
        for (const key of ['sessionId', 'noticeId', 'actionId']) if (typeof body[key] !== 'string' || !body[key]) throw new Error('交互参数不完整。')
        sendJson(response, 200, await respondNotice(await requireApi(ctx, origin), body.sessionId, body.noticeId, body.actionId, body.input || {}))
        return
      }
      if (request.method === 'POST' && path === '/session-action') {
        const body = await readJsonBody(request)
        if (typeof body.sessionId !== 'string') throw new Error('缺少 sessionId。')
        const result = await sessionAction(await requireApi(ctx, origin), body.sessionId, body.action, body)
        sendJson(response, 200, result)
        return
      }
      if (request.method === 'GET' && path === '/timeline') {
        const sessionId = url.searchParams.get('sessionId')
        if (!sessionId) throw new Error('缺少 sessionId。')
        const limit = Number(url.searchParams.get('limit') ?? 30)
        sendJson(response, 200, await readTimeline(
          ctx,
          origin,
          sessionId,
          Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 100) : 30,
        ))
        return
      }
      sendJson(response, 404, { error: 'not found' })
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

/* ------------------------------------------------------------------ */
/* Plugin entry                                                        */
/* ------------------------------------------------------------------ */

export const name = 'agents-anywhere-remote'
export const inject = ['tools', 'credentials']

/**
 * Register the remote-device tools and the Client page's route for this DSH profile.
 * @param {import('@deepseek-ai/cordis').Context} ctx - registrant context.
 * @param {unknown} config - Loader row config.
 * @returns {void}
 */
export async function apply(ctx, config) {
  const settings = resolveSettings(config)
  // Fail at activation, with an actionable message, when the row names a bad server.
  normalizeOrigin(settings.serverUrl)
  let bindings = null
  const storage = typeof ctx.get === 'function' ? ctx.get('storage') : undefined
  if (storage) {
    const backend = storage.backend.get('json')
    if (!backend.kv) throw new Error('当前存储后端不支持会话关联。')
    const unit = await backend.kv.open({ name: 'vvicat_agents_anywhere_bindings', version: 1, tables: ['bindings'], hasGlobal: false })
    bindings = new RemoteBindings(unit)
    await bindings.load()
    ctx.effect(() => () => unit.close())
  }
  registerTools(ctx, settings, bindings)
  if (bindings && typeof ctx.inject === 'function') ctx.inject(['systemPrompt'], scope => {
    scope.effect(() => scope.systemPrompt.context({ name: 'vvicat-agents-anywhere', order: 90, text: assembly => bindingContext(bindings, assembly.scope) }))
  })
  // The panel is optional: a profile without a web server keeps the tools.
  if (typeof ctx.inject === 'function') {
    // One token per activation. Only the authenticated index page receives it,
    // so a raw prefix route cannot be read by another local caller.
    const token = randomBytes(32).toString('base64url')
    const injection = `<script>window.__AA_REMOTE_TOKEN__=${JSON.stringify(token)}</script>`
    ctx.inject(['webServer'], (scope) => {
      scope.effect(() => scope.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: createPanelRoute(ctx, settings, token),
      }))
      scope.effect(() => scope.webServer.tapIndex((html) => html.includes('</head>')
        ? html.replace('</head>', `${injection}</head>`)
        : `${injection}${html}`))
    })
  }
}
