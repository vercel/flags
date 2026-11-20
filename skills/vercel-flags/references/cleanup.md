# Clean up a flag

Removing a flag from code is the first step of retiring it. The flag stays configured on Vercel while the change ships, so a cleanup PR only changes what production serves if it inlines the wrong value. Archive the flag later, after the deployment and evaluation checks in [cli.md — Lifecycle and safety](cli.md#lifecycle-and-safety). Do not merge, deploy, archive, or reconfigure the flag as part of the cleanup itself.

Work on one flag at a time and scope every CLI call to its project and team (`--project`, `--scope`).

## Follow the repository's rules

Before changing code, read what the repository documents for contributors and agents: `AGENTS.md`, `CLAUDE.md`, contributing guides, any flag-removal guide or skill, and the pull request template (for example `.github/pull_request_template.md`). Where they differ from this reference, follow the repository. That covers which tests to write and how, which checks to run, how to title the PR, and how to format its body.

## Gather evidence

- **Configuration**: `vercel flags inspect <key>` for what each environment serves, whether it uses a static value or targeting, whether the flag is archived or permanent, and its description. `vercel flags versions <key>` for recent changes.
- **Evaluations**: `vercel flags evaluations <key> --since <window> --json` over the last few days, to see which variants production actually serves.
- **Repository**: the project's connected repository and where the flag is declared and evaluated. Fetch the default branch and search it, not a stale local branch, since the flag's owner may have removed it already.
- **Existing PR**: look for an earlier cleanup PR for the flag and judge it by its diff, not its title. Reuse an open one instead of opening a second, and do not overwrite another author's branch. If one was closed unmerged, find out why before replacing it. If one was merged and removes the flag, the code is already done.
- **Overlapping work**: look for open pull requests by other authors that change the files where the flag is read.

## Choose the value to inline

- **Active flag**: the variant its production configuration serves to all traffic.
- **Archived flag**: the code default (`defaultValue`), not its last configured variant. An archived flag already serves the code default.

A code default that differs from the served value is expected, since inlining replaces it. So are evaluations that fell back to it, such as local development without flag configuration.

## When to stop

Stop on concrete evidence that inlining changes what production serves:

- The flag is marked permanent or is a kill switch.
- Production has active rules, targets, splits, or rollouts.
- The production configuration changed within the last few days.
- Production evaluations show another configured variant.
- The repository reads the flag through a dynamic key you cannot resolve.

Also stop when the flag's owner asked to keep it, or when the cleanup would collide with someone else's work:

- The flag's description, or a comment at its declaration or call sites, says to keep it (for example "do not remove" or "permanent").
- Another author has an open, non-draft PR updated in the last two weeks that changes the lines where the flag is read. Ignore stale drafts.

Absent evidence is not a reason to stop: missing or unlabeled telemetry, unidentified clients, no preview or development data, missing deployment references, and consumers outside the repository. These matter for archiving, not for removing the code. Note them in the PR instead.

## Remove the code

- **Search**: the key in its exact, camelCase, PascalCase, snake_case, and SCREAMING_SNAKE_CASE forms, and any constant or enum that holds the key.
- **Inline**: replace every evaluation with the chosen value, fold the conditionals, and remove dead branches.
- **Delete**: the declaration or registration, flag-only config, analytics and exposure logging, and any code, imports, and exports that become unused.
- **Update**: tests, mocks, and docs that mention the flag, such as rollout or migration prerequisites. Prefer updating existing tests. Add a test only in a style the repository already uses and allows; do not add a kind of test its guidelines rule out.
- **Verify**: run the relevant type checks, lint, and tests, and follow any flag-removal process the repository documents. If a check cannot run, for example because dependencies fail to install, do not report it as passed: name it in the PR with the reason.

Preserve production behavior. Do not touch other flags or refactor unrelated code.

If nothing references the flag, report the searches you ran instead of opening an empty PR.

## Open the PR

Open it as a draft. Use the repository's PR template and title conventions when it has them, and fit the content below into that format. Otherwise, title it "Remove `<key>` feature flag". Include the following, unless the repository's format leaves it out:

- A link to the flag in the Vercel dashboard: `https://vercel.com/<team-slug>/<project-name>/flag/<key>`, with the team slug and project name, not their IDs.
- The inlined value and why it was chosen.
- The evidence gathered and any gaps from [When to stop](#when-to-stop).
- The checks run and their results, including any that could not run.
- The next steps: deploy to every environment, verify no evaluations, then archive ([cli.md — Lifecycle and safety](cli.md#lifecycle-and-safety)).
