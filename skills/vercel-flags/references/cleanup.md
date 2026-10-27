# Clean up a flag

Removing a flag from code is the first step of retiring it. The flag stays configured on Vercel while the change ships, so a cleanup PR only changes what production serves if it inlines the wrong value. Archive the flag later, after the deployment and evaluation checks in [cli.md — Lifecycle and safety](cli.md#lifecycle-and-safety). Do not merge, deploy, archive, or reconfigure the flag as part of the cleanup itself.

Work on one flag at a time and scope every CLI call to its project and team (`--project`, `--scope`).

## Gather evidence

- **Configuration**: `vercel flags inspect <key>` for what each environment serves, whether it uses a static value or targeting, and whether the flag is archived. `vercel flags versions <key>` for recent changes.
- **Evaluations**: `vercel flags evaluations <key> --since <window> --json` over the last few days, to see which variants production actually serves.
- **Repository**: the project's connected repository and where the flag is declared and evaluated.
- **Existing PR**: look for an earlier cleanup PR for the flag and judge it by its diff, not its title. Reuse an open one instead of opening a second, and do not overwrite another author's branch. If one was closed unmerged, find out why before replacing it. If one was merged and removes the flag, the code is already done.

## Choose the value to inline

- **Active flag**: the variant its production configuration serves to all traffic.
- **Archived flag**: the code default (`defaultValue`), not its last configured variant. An archived flag already serves the code default.

A code default that differs from the served value is expected, since inlining replaces it. So are evaluations that fell back to it, such as local development without flag configuration.

## When to stop

Stop only on concrete evidence that inlining changes what production serves:

- The flag is marked permanent or is a kill switch.
- Production has active rules, targets, splits, or rollouts.
- The production configuration changed within the last few days.
- Production evaluations show another configured variant.
- The repository reads the flag through a dynamic key you cannot resolve.

Absent evidence is not a reason to stop: missing or unlabeled telemetry, unidentified clients, no preview or development data, missing deployment references, and consumers outside the repository. These matter for archiving, not for removing the code. Note them in the PR instead.

## Remove the code

- **Search**: the key in its exact, camelCase, PascalCase, snake_case, and SCREAMING_SNAKE_CASE forms.
- **Inline**: replace every evaluation with the chosen value, fold the conditionals, and remove dead branches.
- **Delete**: the declaration or registration, flag-only config, analytics and exposure logging, and any code, imports, and exports that become unused.
- **Update**: tests, mocks, and docs that mention the flag, such as rollout or migration prerequisites.
- **Verify**: run the relevant type checks, lint, and tests, and follow any flag-removal process the repository documents.

Preserve production behavior. Do not touch other flags or refactor unrelated code.

If nothing references the flag, report the searches you ran instead of opening an empty PR.

## Open the PR

Title it "Remove `<key>` feature flag" and open it as a draft. Include:

- A link to the flag in the Vercel dashboard.
- The inlined value and why it was chosen.
- The evidence gathered and any gaps from [When to stop](#when-to-stop).
- The checks run and their results.
- The next steps: deploy to every environment, verify no evaluations, then archive ([cli.md — Lifecycle and safety](cli.md#lifecycle-and-safety)).
