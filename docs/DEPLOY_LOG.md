# Deploy log

Manual notes for out-of-band production deploys. Vercel normally deploys
`main` automatically on push; entries here record when that did not happen and
had to be forced.

- **2026-09-03** — The PR #52 squash-merge (`7a1a217`, 14:33 UTC) produced no
  `push` CI run on `main` and no Vercel production deployment; production
  stayed on `ef7fcad` (#51). Root cause was a dropped `push` event on `main`
  during the merge — GitHub Actions and Vercel's Git integration both missed
  it, though both worked on every other ref before and after. Forced a
  redeploy with this commit. After any merge, verify
  `gh api repos/<owner>/<repo>/actions/runs?branch=main&event=push` has a run
  for the new HEAD before assuming the merge deployed.
