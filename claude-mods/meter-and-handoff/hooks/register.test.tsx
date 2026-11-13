import { expect, mock, test } from 'claude-code/testing'
import { bar, handoffMessage } from './register'

const USAGE = (percent: number) => ({ value: { startedAt: 0, context: { tokens: percent * 2000, window: 200000, percent }, rateLimits: [] } })
const USE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const BRIEF = '## Goal\nShip the CSV import.\n## Next steps\n1. Run the tests.'

function world(on: any, percent: { v: number }, fork: any = { isAnswered: true, text: BRIEF, usage: USE }) {
  const log: string[] = []
  const clock = mock.clock(on)
  on('session.usage', () => USAGE(percent.v))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.write', (_: any, e: any) => { log.push(`write ${e.path ?? ''}`); return { value: undefined } })
  on('model.fork', () => { log.push('fork'); return { value: fork } })
  on('command.run', (_: any, e: any) => { log.push(`/${e.command}`); return { text: '' } })
  on('prompt.submit', (_: any, e: any) => { log.push(`submit ${e.text}`); return { text: e.text } })
  on('turn.complete', () => ({ text: 'done' }))
  return { log, clock }
}

test('under the mark: meter only, no handoff', async ($, on) => {
  const pct = { v: 40 }
  const { log, clock } = world(on, pct)
  await $.turn.complete({ turnId: 't', reason: 'answer', answer: 'done', durationMs: 1, isAborted: false })
  await clock.advance(1000)
  expect(log).toEqual([])
  expect((await $.command.run({ command: 'handoff', args: 'status' } as never)).text).toContain('Context: 40%')
})

test('at 85%: brief, /clear, then the brief is submitted to the fresh session', async ($, on) => {
  const pct = { v: 86 }
  const { log, clock } = world(on, pct)
  await $.turn.complete({ turnId: 't', reason: 'answer', answer: 'done', durationMs: 1, isAborted: false })
  await clock.advance(1000)
  expect(log[0]).toBe('fork')
  expect(log.indexOf('/clear')).toBeGreaterThan(0)
  const submit = log.find(l => l.startsWith('submit'))!
  expect(log.indexOf(submit)).toBeGreaterThan(log.indexOf('/clear'))
  expect(submit).toContain('Ship the CSV import.')
  expect(submit).toContain('86% full')
  expect((await $.command.run({ command: 'handoff', args: 'status' } as never)).text).toContain('Last handoff: done at 86%')
})

test('a failed brief never clears the chat', async ($, on) => {
  const pct = { v: 90 }
  const { log, clock } = world(on, pct, { isAnswered: false, reason: 'api-error', usage: USE })
  await $.turn.complete({ turnId: 't', reason: 'answer', answer: 'done', durationMs: 1, isAborted: false })
  await clock.advance(1000)
  expect(log).toEqual(['fork'])
  expect((await $.command.run({ command: 'handoff', args: 'status' } as never)).text).toContain('Last handoff: failed at 90%')
})

test('turned off: no handoff even when full', async ($, on) => {
  const pct = { v: 95 }
  const { log, clock } = world(on, pct)
  await $.command.run({ command: 'handoff', args: 'off' } as never)
  await $.turn.complete({ turnId: 't', reason: 'answer', answer: 'done', durationMs: 1, isAborted: false })
  await clock.advance(1000)
  expect(log.filter(l => l !== '/handoff')).toEqual([])
})

test('the band draws the meter on every surface', async ($, on) => {
  const pct = { v: 60 }
  world(on, pct)
  await $.turn.complete({ turnId: 't', reason: 'answer', answer: 'done', durationMs: 1, isAborted: false })
  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'meter-and-handoff', component: 'AbovePrompt', surface, props: { hasSurvey: false } } as never)
    expect((await ui.find({ type: 'Text', text: /60%/ }))?.text).toContain('60%')
    await ui.unmount()
  }
})

test('helpers', async () => {
  expect(bar(50, 10)).toBe('█████░░░░░')
  expect(handoffMessage(85, BRIEF, null)).toContain('85% full')
})
