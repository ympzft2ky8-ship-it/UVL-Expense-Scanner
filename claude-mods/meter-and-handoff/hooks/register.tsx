import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Handoff } from '../types'

const percentA = atom({ plugin: 'meter-and-handoff', key: 'percent' } as const, null as number | null)
const thresholdA = atom({ plugin: 'meter-and-handoff', key: 'threshold' } as const, 85)
const enabledA = atom({ plugin: 'meter-and-handoff', key: 'enabled' } as const, true)
const pendingA = atom({ plugin: 'meter-and-handoff', key: 'pending' } as const, false)
const lastA = atom({ plugin: 'meter-and-handoff', key: 'last' } as const, null as Handoff | null)

const HANDOFF_DIR = '/root/.claude/handoffs'

export const BRIEF_PROMPT = `This chat's context window is nearly full. The work will continue in a FRESH chat session that cannot see this conversation. You have no tools here; answer straight away with only the handoff brief, in Markdown, under these headings:

## Goal
What the person asked for, in their words where it matters, plus any constraints, preferences or ground rules they set.
## Done so far
What has been completed, with file paths, branch names, commits and commands that matter.
## In progress
Exactly where the work stopped: the step underway, anything half-edited or unverified.
## Next steps
A numbered list the new session should do next, in order.
## Key facts
Decisions made and why, gotchas found, test/eval results, IDs, URLs, anything costly to rediscover.
## Open questions
Anything waiting on the person.

Be specific and complete but concise (aim under 1,200 words). Do not invent progress.`

export const bar = (pct: number, width = 20): string => {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export const handoffMessage = (pct: number, brief: string, file: string | null): string =>
  `[Handoff from the previous chat session, whose context was ${pct}% full.]\n` +
  (file ? `The brief is also saved at ${file}.\n` : '') +
  `Pick the work up from the brief below: check the current state of the files first (git status, the files named), then continue with the next steps. Don't redo finished work.\n\n${brief.trim()}`

// Module-level guard so one handoff runs at a time.
let handingOff = false


async function meter($: EngineInterface): Promise<number | null> {
  try {
    const { context } = await $.session.usage()
    const pct = context.percent ?? (context.tokens !== undefined && context.window ? Math.round((context.tokens / context.window) * 100) : null)
    await update($, percentA, () => pct)
    if (pct !== null) $.ui.status(`context ${pct}%`)
    return pct
  } catch {
    return null
  }
}

async function handoff($: EngineInterface, why: string): Promise<string> {
  if (handingOff) return 'A handoff is already running.'
  handingOff = true
  const pct = (await read($, percentA)) ?? 0
  const record = async (h: Omit<Handoff, 'at'>) => {
    const entry: Handoff = { ...h, at: await $.clock.now() }
    await update($, lastA, () => entry)
  }
  try {
    $.ui.toast(`Context ${pct}% full (${why}): writing a handoff brief…`, { timeoutMs: 8000 })
    const r = await $.model.fork({ prompt: BRIEF_PROMPT })
    if (!r.isAnswered || r.text.trim().length < 40) {
      const note = r.isAnswered ? 'the brief came back empty' : `the brief could not be written (${r.reason})`
      await record({ percent: pct, file: null, ok: false, note })
      await update($, pendingA, () => false)
      $.ui.toast(`Handoff stopped: ${note}. This chat carries on as it was.`, { timeoutMs: 10000 })
      return `Handoff stopped: ${note}.`
    }
    const brief = r.text

    let file: string | null = `${HANDOFF_DIR}/handoff-${new Date(await $.clock.now()).toISOString().replace(/[:.]/g, '-')}.md`
    try {
      await $.fs.write(file, `# Handoff brief (context ${pct}% full)\n\n${brief}\n`)
    } catch {
      file = null
    }

    // Fresh session: /clear starts a new session id with an empty context;
    // the files on disk are untouched.
    await $.command.run({ command: 'clear' })
    await update($, percentA, () => null)
    await update($, pendingA, () => false)
    await record({ percent: pct, file, ok: true, note: why })
    await $.prompt.submit({ text: handoffMessage(pct, brief, file) })
    $.ui.toast('Handed off to a fresh session with the brief.', { timeoutMs: 6000 })
    return 'Handed off.'
  } catch (err) {
    const note = `handoff failed: ${String(err).slice(0, 120)}`
    await record({ percent: pct, file: null, ok: false, note })
    await update($, pendingA, () => false)
    $.ui.toast(`Handoff failed; this chat carries on. ${note}`, { timeoutMs: 10000 })
    return note
  } finally {
    handingOff = false
  }
}


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'handoff',
      description: 'Context meter: status | now | on | off | at <percent>',
    })
    await meter($)
    return next(e)
  })

  // Measure after every model request of the main loop.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (e.agentId === undefined) {
      const pct = await meter($)
      const limit = await read($, thresholdA)
      if (pct !== null && pct >= limit && (await read($, enabledA)) && !(await read($, pendingA))) {
        await update($, pendingA, () => true)
        $.ui.toast(`Context ${pct}% full: handing off to a fresh session as soon as this turn ends.`, { timeoutMs: 8000 })
      }
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    if (e.agentId !== undefined) return out
    const pct = await meter($)
    const limit = await read($, thresholdA)
    const due = (await read($, pendingA)) || (pct !== null && pct >= limit)
    if (due && (await read($, enabledA)) && !handingOff) {
      // Run once the turn has fully ended: /clear cannot run inside it.
      $.clock.after(250, () => void handoff($, `reached the ${limit}% mark`))
    }
    return out
  })

  on('command.run', { command: 'handoff' }, async ($, e) => {
    const [cmd = 'status', val] = e.args.trim().toLowerCase().split(/\s+/)
    if (cmd === 'now') {
      await meter($)
      $.clock.after(250, () => void handoff($, 'asked with /handoff now'))
      return { text: 'Handing off to a fresh session…' }
    }
    if (cmd === 'on' || cmd === 'off') {
      await update($, enabledA, () => cmd === 'on')
      if (cmd === 'off') await update($, pendingA, () => false)
      return { text: `Automatic handoff ${cmd === 'on' ? 'on' : 'off'}. The meter keeps running.` }
    }
    if (cmd === 'at') {
      const n = Number(val)
      if (!Number.isInteger(n) || n < 10 || n > 98) return { text: 'Give a whole percentage from 10 to 98, e.g. /handoff at 80' }
      await update($, thresholdA, () => n)
      return { text: `Handoff now happens at ${n}% context.` }
    }
    const pct = await meter($)
    const last = await read($, lastA)
    const lines = [
      `Context: ${pct === null ? 'not measured yet' : `${pct}% ${bar(pct)}`}`,
      `Automatic handoff: ${(await read($, enabledA)) ? 'on' : 'off'}, at ${await read($, thresholdA)}%`,
      last ? `Last handoff: ${last.ok ? 'done' : 'failed'} at ${last.percent}% (${last.note})${last.file ? `, brief at ${last.file}` : ''}` : 'No handoff yet.',
      'Commands: /handoff now · on · off · at <percent> · status',
    ]
    return { text: lines.join('\n') }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const pct = await read($, percentA)
    if (e.props.hasSurvey || pct === null) return next(e)
    const limit = await read($, thresholdA)
    const isOn = await read($, enabledA)
    const pending = await read($, pendingA)
    const color = pct >= limit ? 'red' : pct >= limit - 15 ? 'yellow' : 'green'
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text dimColor>Context </Text>
        <Text color={color}>{bar(pct)}</Text>
        <Text> {pct}%</Text>
        <Text dimColor>{pending ? ' · handoff after this turn' : isOn ? ` · handoff at ${limit}%` : ' · handoff off'}</Text>
      </Box>
    )
  })
}
