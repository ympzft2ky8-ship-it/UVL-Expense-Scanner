import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Level, Mode, Pick } from '../types'

const LEVELS: readonly Level[] = ['low', 'medium', 'high', 'xhigh', 'max']
// The auto picker never goes above this; max only when the person asks.
const AUTO_CEILING: Level = 'xhigh'

const mode = atom({ plugin: 'effort-picker', key: 'mode' } as const, 'auto' as Mode)
const pick = atom({ plugin: 'effort-picker', key: 'pick' } as const, null as Pick | null)

const isLevel = (s: string): s is Level => (LEVELS as readonly string[]).includes(s)
const cap = (l: Level): Level => (LEVELS.indexOf(l) > LEVELS.indexOf(AUTO_CEILING) ? AUTO_CEILING : l)

// "use max effort", "effort: high", "think hard about this"
export function askedFor(text: string): Level | null {
  const t = text.toLowerCase()
  const m = t.match(/\b(low|medium|high|xhigh|max)\s+effort\b/) ?? t.match(/\beffort\s*[:=]?\s*(low|medium|high|xhigh|max)\b/)
  const named = m?.[1]
  if (named && isLevel(named)) return named
  if (/\b(ultrathink|think as hard as you can)\b/.test(t)) return 'max'
  if (/\b(think (really )?hard|be thorough|very carefully)\b/.test(t)) return 'xhigh'
  if (/\b(quick(ly)?|just a quick|briefly)\b/.test(t) && t.length < 200) return 'low'
  return null
}

const FOLLOW_UP = /^(y(es|ep|eah)?|ok(ay)?|sure|go( ahead)?|do it|continue|proceed|sounds good|lgtm|thanks?( you)?|please do|carry on|keep going)[.! ]*$/i

// Cheap fallback when the model call fails: size by words and length.
export function byRules(text: string): Pick {
  const t = text.toLowerCase()
  const words = t.split(/\s+/).filter(Boolean).length
  let score = 0
  if (words > 40) score += 1
  if (words > 150) score += 1
  if (/\b(refactor|architect|design|migrat|implement|build|feature|redesign|rewrite|security|audit|race condition|concurren|performance|optimi[sz]e)/.test(t)) score += 2
  if (/\b(debug|fix|bug|failing|error|broken|crash|investigate|why does)/.test(t)) score += 1
  if (/\b(test|spec|eval|across|every|all (the )?files|whole (repo|codebase)|end[- ]to[- ]end)/.test(t)) score += 1
  if (/\b(what is|what's|where is|rename|typo|explain|list|show me|how do i|summari[sz]e)\b/.test(t) && words < 30) score -= 1
  const level: Level = score <= 0 ? 'low' : score === 1 ? 'medium' : score <= 3 ? 'high' : 'xhigh'
  return { level, reason: `${words} words, scored ${score}`, source: 'rules' }
}

const SYSTEM = `You size up a request sent to a coding agent and pick its reasoning effort.
Levels:
- low: a quick question, a lookup, a one-line fix, a rename, a typo, chit-chat.
- medium: a small, well-scoped change or explanation touching one or two files.
- high: a normal feature, a bug that needs investigating, changes across several files, writing tests.
- xhigh: hard or risky work: architecture, a large refactor or migration, subtle bugs (concurrency, security, data loss), or anything where a mistake is costly.
Never answer max. Prefer the lower level when torn between two.
Reply with only JSON: {"level":"low|medium|high|xhigh","reason":"<under 12 words>"}`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'effort-picker',
      description: 'Effort picker: auto | off | low | medium | high | xhigh | max (pin) | status',
    })
    const m = await read($, mode)
    $.ui.status(m === 'off' ? undefined : `effort: ${m === 'auto' ? 'auto' : `${m} (pinned)`}`)
    return next(e)
  })

  on('command.run', { command: 'effort-picker' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === '' || arg === 'status') {
      const m = await read($, mode)
      const p = await read($, pick)
      const last = p ? `Last pick: ${p.level} (${p.source}: ${p.reason}).` : 'No pick yet.'
      return { text: `Effort picker is ${m === 'auto' || m === 'off' ? m : `pinned to ${m}`}. ${last}` }
    }
    if (arg === 'auto' || arg === 'off' || isLevel(arg)) {
      await update($, mode, () => arg as Mode)
      $.ui.status(arg === 'off' ? undefined : `effort: ${arg === 'auto' ? 'auto' : `${arg} (pinned)`}`)
      const text =
        arg === 'auto' ? 'Effort picker on: each request is sized up and its effort set.'
        : arg === 'off' ? 'Effort picker off: the session effort applies.'
        : `Effort pinned to ${arg} until you run /effort-picker auto.`
      return { text }
    }
    return { text: 'Usage: /effort-picker [auto | off | low | medium | high | xhigh | max | status]' }
  })

  on('prompt.submit', async ($, e, next) => {
    // Slash commands and messages the person did not type keep the current pick.
    if (e.command || e.isMeta) return next(e)
    const m = await read($, mode)
    if (m === 'off') return next(e)

    const prev = await read($, pick)
    let chosen: Pick
    const asked = askedFor(e.text)

    if (m !== 'auto') chosen = { level: m, reason: 'pinned with /effort-picker', source: 'pinned' }
    else if (asked) chosen = { level: asked, reason: 'you asked for it', source: 'asked' }
    else if (prev && FOLLOW_UP.test(e.text.trim())) chosen = { ...prev, reason: 'follow-up, kept last level', source: 'kept' }
    else {
      chosen = byRules(e.text)
      try {
        const r = await $.model.complete({
          model: 'haiku',
          system: SYSTEM,
          prompt: `${prev ? `Previous request was sized ${prev.level}.\n` : ''}Request:\n"""\n${e.text.slice(0, 6000)}\n"""`,
          maxTokens: 120,
          effort: 'low',
          timeoutMs: 6000,
        })
        if (r.isAnswered) {
          const json = JSON.parse(r.text.slice(r.text.indexOf('{'), r.text.lastIndexOf('}') + 1))
          if (typeof json.level === 'string' && isLevel(json.level)) {
            chosen = { level: cap(json.level), reason: String(json.reason ?? '').slice(0, 80), source: 'model' }
          }
        }
      } catch {
        // keep the rules pick
      }
    }

    await update($, pick, () => chosen)
    $.ui.status(`effort: ${chosen.level}${m === 'auto' ? ' (auto)' : ' (pinned)'}`)
    if (m === 'auto') $.ui.toast(`Effort → ${chosen.level}: ${chosen.reason}`)
    return next(e)
  }).catch(($, e, next) => next(e))

  // Every model request of the main loop runs at the picked level.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined || typeof e.effort !== 'string') return yield* next(e)
    if ((await read($, mode)) === 'off') return yield* next(e)
    const p = await read($, pick)
    return yield* next(p && p.level !== e.effort ? { ...e, effort: p.level } : e)
  })
}
