/** Shared remote operations for UI and agent tools. No operation implicitly enables takeover. */
export function usable(set, id) {
  const rows = set?.capabilities
  const cap = Array.isArray(rows) ? rows.find(row => row.capabilityId === id) : null
  return Boolean(cap?.supported && cap.available && cap.allowed)
}

export async function sessionDetail(api, id, options = {}) {
  const path = `/sessions/${encodeURIComponent(id)}`
  const query = new URLSearchParams({ mode: options.before ? 'history' : 'latest', limit: '100' })
  if (options.before) query.set('beforeOrderSeq', String(options.before))
  const [meta, timeline] = await Promise.all([api.request(`${path}/meta`), api.request(`${path}/timeline?${query}`)])
  let capabilitySet = null
  let capabilityError = null
  try { capabilitySet = (await api.request(`${path}/runtime/capabilities`)).capabilitySet }
  catch (error) { capabilityError = error.message }
  let notices = []
  let noticesError = null
  try { notices = (await api.request(`${path}/runtime/notices`)).notices || [] }
  catch (error) { noticesError = error.message }
  return { session: meta.session, timeline, capabilitySet, capabilityError, notices, noticesError }
}

export async function sessionAction(api, id, action, input = {}) {
  const path = `/sessions/${encodeURIComponent(id)}`
  if (action === 'takeover') return api.request(`${path}/takeover`, { method: 'POST' })
  if (action === 'release') return api.request(`${path}/takeover`, { method: 'DELETE' })
  const capabilityId = action === 'send' ? 'session.send_message' : action === 'interrupt' ? 'session.interrupt' : null
  if (!capabilityId) throw new Error('不支持的远程会话操作。')
  const meta = await api.request(`${path}/meta`)
  if (!meta.session?.takeover) throw new Error('会话处于只读状态，请先明确接管。')
  const set = (await api.request(`${path}/runtime/capabilities`)).capabilitySet
  if (!usable(set, capabilityId)) throw new Error(`当前远程能力不可用：${capabilityId}`)
  let result
  if (action === 'send') {
    if (typeof input.message !== 'string' || !input.message.trim()) throw new Error('消息不能为空。')
    result = await api.request(`${path}/runtime/messages`, { method: 'POST', body: { content: input.message, clientMessageId: input.clientMessageId } })
  } else result = await api.request(`${path}/runtime/interrupt`, { method: 'POST', body: {} })
  if (!result || result.ok !== true) throw new Error(result?.error?.message || '远程操作失败。')
  return result
}

/** Complete text extraction for UI; unlike model summaries this does not truncate content. */
export function timelineText(item) {
  const c = item?.content || {}
  for (const key of ['text', 'message', 'rawText', 'content', 'summary']) {
    if (typeof c[key] === 'string' && c[key]) return c[key]
    if (Array.isArray(c[key])) {
      const text = c[key].map(block => typeof block?.text === 'string' ? block.text : '').filter(Boolean).join('\n')
      if (text) return text
    }
  }
  return JSON.stringify(c, null, 2)
}

export function mergeTimeline(previous, incoming) {
  const rows = new Map(previous.map(row => [row.id, row]))
  for (const row of incoming) rows.set(row.id, row)
  return [...rows.values()].sort((a, b) => a.orderSeq - b.orderSeq)
}

/** User-only interaction response. Agent control tools deliberately do not expose this operation. */
export async function respondNotice(api, id, noticeId, actionId, input) {
  const detail = await sessionDetail(api, id)
  if (!detail.session?.takeover || !usable(detail.capabilitySet, 'session.interaction.approval')) throw new Error('当前会话未接管或不允许交互操作。')
  const notice = detail.notices.find(row => row.noticeId === noticeId)
  const action = notice?.actions?.find(row => row.actionId === actionId)
  if (!action) throw new Error('此交互已失效，请刷新后重试。')
  const result = await api.request(`/sessions/${encodeURIComponent(id)}/runtime/notices/${encodeURIComponent(noticeId)}/respond`, { method: 'POST', body: { actionId, input } })
  if (!result || result.ok !== true) throw new Error(result?.error?.message || '交互操作失败，请刷新。')
  return result
}
