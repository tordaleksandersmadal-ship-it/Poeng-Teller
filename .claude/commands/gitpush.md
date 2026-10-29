---
description: Review uncommitted changes, then commit and push them
argument-hint: "[optional commit message]"
---

Review, commit and push the current changes in this repo. Work through the steps in order and stop as soon as a step fails.

## 1. Look at what changed

- Run `git status` and `git diff HEAD` (include staged and unstaged changes).
- If nothing has changed, say so and stop.
- If the current branch is not `main`, mention which branch it is.

## 2. Review the code

Read every changed file in the diff and check for:

- Bugs and logic errors, especially in the OCR pipeline (`scripts/lib/`) and the API (`app/api/bontora/route.ts`, `lib/state.ts`)
- Leftover debug code, `console.log` in app code, commented-out blocks, temporary `*.tmp.*` files
- Secrets: OBS passwords, `.env` files, tokens
- Files that must not be committed: `debug/`, `node_modules/`, `.next/`, `*.tsbuildinfo`, `next-env.d.ts`, large screenshots outside `samples/`
- Broken Norwegian characters (`Ã¥`, `Ã¸`, `Ã¦`) — files must be saved as UTF-8 without BOM

## 3. Run the checks

```bash
npm run lint
npx tsc --noEmit
npm run test:ocr
```

If `scripts/` or `samples/` did not change, `npm run test:ocr` can be skipped.

## 4. Report and wait

Give a short review: what changed, any problems found (with `file:line`), and the check results.

- If there are real problems, **stop here** and ask whether to fix them first.
- Otherwise show the proposed commit message and ask for confirmation before committing — unless the user's message already said to commit/push (e.g. "/gitpush go" or a commit message was given as an argument: `$ARGUMENTS`).

## 5. Commit

- Stage only the files that belong in the commit (`git add <files>`, not blindly `git add -A` if unrelated files are lying around).
- Commit message: short imperative summary line (max ~70 chars), blank line, then a few bullet points if the change is large. Use `$ARGUMENTS` as the summary if it was given.
- End the message with:

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

- Never use `--no-verify` or `--amend` unless explicitly asked.

## 6. Push

- `git push` (use `git push -u origin <branch>` if the branch has no upstream).
- **Never force-push.** If the push is rejected because the remote is ahead, stop and explain — do not pull/rebase on your own.
- Finish with the commit hash, branch and a one-line confirmation that the push succeeded.
