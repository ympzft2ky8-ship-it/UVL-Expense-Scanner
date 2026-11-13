# Meter and handoff

Shows how full the chat's context window is and, when it reaches 85%, hands the work off to a fresh chat session so Claude never runs out of room mid-job.

## What you see

A meter above the prompt box (`Context ████████░░░░ 62% · handoff at 85%`) and the percentage on the status line. It turns yellow 15 points before the mark and red at it.

## What happens at 85%

1. As soon as a model request pushes the context to 85% or more, a toast says a handoff is coming; the current turn is allowed to finish so no work is cut off halfway.
2. When the turn ends, Claude writes a handoff brief: goal, what's done, what's in progress, next steps, key facts and open questions. It's saved under `/root/.claude/handoffs/`.
3. The chat is cleared (`/clear`, a new session with an empty context; files on disk stay as they are) and the brief is sent as the new session's first message, so the work carries on.

If the brief can't be written, nothing is cleared and the chat carries on as it was.

## Command

`/handoff` with `status` (default), `now` (hand off right away), `on`, `off`, or `at <percent>` (10 to 98).

## Install

```
/plugin install meter-and-handoff --marketplace ympzft2ky8-ship-it/UVL-Expense-Scanner
```

Or from a shell: `claude plugin install meter-and-handoff --marketplace ympzft2ky8-ship-it/UVL-Expense-Scanner`. See [../README.md](../README.md) for the desktop app.
