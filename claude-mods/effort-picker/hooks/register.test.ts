import { expect, test } from 'claude-code/testing'
import { askedFor, byRules } from './register'

test('explicit asks win', async () => {
  expect(askedFor('please use max effort on this')).toBe('max')
  expect(askedFor('effort: low, what time is it')).toBe('low')
  expect(askedFor('fix the bug')).toBe(null)
})

test('rules size small and big jobs apart', async () => {
  expect(byRules('what is in package.json?').level).toBe('low')
  expect(byRules('Refactor the export module and implement a migration for every property across all files, then add tests').level).toBe('high')
  expect(byRules('Investigate the race condition in sync, redesign the concurrency model, audit security, and add end-to-end tests across every module. ' + 'Context. '.repeat(40)).level).toBe('xhigh')
})

test('a prompt is sized and its steps run at that level', async ($, on) => {
  on('model.complete', () => ({ value: { isAnswered: true, text: '{"level":"high","reason":"multi-file feature"}', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  let sent: unknown
  on('turn.step', async function* (_, e) { sent = e.effort; return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never })

  await $.prompt.submit({ text: 'Add a CSV import for receipts with validation' } as never)
  for await (const _ of $.turn.step({ turnId: 't', index: 0, model: 'opus', effort: 'medium', messageCount: 1 })) {}
  expect(sent).toBe('high')
})
