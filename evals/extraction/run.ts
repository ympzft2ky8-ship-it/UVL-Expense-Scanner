/**
 * Measure receipt reading against the answer keys in samples/receipts.
 *
 *   npm run eval:extraction -- --split test [--model claude-opus-5-5] [--effort high] [--label my-change]
 *
 * This calls the paid Anthropic API (about $2-3 for 30 receipts). It uses the same
 * prompt, schema and checks as the app. See .claude/skills/extraction-eval.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL, extractReceipt, runChecks, type DocumentPart } from '@uvl/shared';
import { report, scoreSample, summarize, type Expected, type SampleScore } from './score.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const samplesDir = path.resolve(here, '../../samples/receipts');

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const MEDIA: Record<string, DocumentPart['mediaType']> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.pdf': 'application/pdf' };

async function main() {
  const split = arg('split', 'test');
  const model = arg('model', DEFAULT_MODEL);
  const effort = arg('effort', 'high') as 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  const label = arg('label', 'run');
  const dir = path.join(samplesDir, split);
  const manifest = JSON.parse(readFileSync(path.join(samplesDir, 'manifest.json'), 'utf8')) as Record<string, { tags?: string[] }>;
  const keys = readdirSync(dir).filter((f) => f.endsWith('.expected.json'));
  if (keys.length === 0) {
    console.error(`No answer keys in ${dir}. Add samples first (see samples/receipts/README.md).`);
    process.exit(1);
  }
  const client = new Anthropic();
  const scores: SampleScore[] = [];
  let n = 0;
  for (const keyFile of keys) {
    const id = keyFile.replace('.expected.json', '');
    const expected = JSON.parse(readFileSync(path.join(dir, keyFile), 'utf8')) as Expected;
    if (!expected.verified_by) console.warn(`! ${id}: answer key has not been confirmed by an owner`);
    const files = readdirSync(dir).filter((f) => f.startsWith(`${id}.`) && MEDIA[path.extname(f).toLowerCase()]).sort();
    const parts: DocumentPart[] = files.map((f) => ({ mediaType: MEDIA[path.extname(f).toLowerCase()]!, base64: readFileSync(path.join(dir, f)).toString('base64') }));
    const tags = manifest[id]?.tags ?? [];
    const result = await extractReceipt(client, parts, { model, effort, newId: () => `l${++n}` });
    if (!result.ok) {
      scores.push({ id, tags, fields: [], linesExpected: 0, linesCorrect: 0, costMicros: result.costMicros, error: result.message });
    } else {
      const year = Number((expected.date ?? '').slice(0, 4)) || new Date().getFullYear();
      // Date checks are judged as if the receipt were scanned in its own year.
      const flags = { ...result.draft.flags, ...runChecks(result.draft, { today: `${year}-12-31`, openYears: [year] }) };
      scores.push(scoreSample(id, tags, expected, result.draft, flags, result.costMicros));
    }
    console.log(`${id}: ${scores.at(-1)!.error ?? `${scores.at(-1)!.fields.filter((f) => !f.correct).length} wrong`}`);
  }
  const out = path.join(here, 'reports');
  mkdirSync(out, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  writeFileSync(path.join(out, `${stamp}-${label}.md`), report(label, model, scores));
  writeFileSync(path.join(out, `${stamp}-${label}.json`), JSON.stringify(scores, null, 2));
  const s = summarize(scores);
  console.log(`\nGate ${s.gate.passed ? 'PASSED' : 'NOT PASSED'}${s.gate.reasons.length ? ': ' + s.gate.reasons.join('; ') : ''}`);
  console.log(`Report: evals/extraction/reports/${stamp}-${label}.md`);
}

await main();
