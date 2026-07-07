# 0005. Bun as package manager and script runner

- Status: Accepted
- Date: 2026-06-16
- Deciders: Kntro-Soft team

## Context

The project needs a package manager. npm, yarn, pnpm, and Bun are all viable. The main criteria
are installation speed (to keep CI times low), a single lockfile format, and compatibility with the
Angular CLI. Bun 1.3 has stable `bun install` and `bun run` and is compatible with the Angular CLI
when declared as the `packageManager` in `package.json`.

## Decision

Use **Bun 1.3** as the package manager (`packageManager: bun@1.3.14` in `package.json`). The
lockfile is `bun.lock`. All scripts are invoked via `bun run <script>`. The Angular CLI is still
used for `ng serve`, `ng build`, `ng test`, and `ng lint`; Bun runs them as `bun run start`,
`bun run build`, etc.

In CI, `bun install --frozen-lockfile` ensures reproducible installs. The `setup-bun@v2` GitHub
Action pins the same version.

## Consequences

- Significantly faster `install` compared to npm/yarn (disk I/O optimized, no node_modules symlinking quirks).
- A single lockfile (`bun.lock`) that must be committed; PRs that add/remove/upgrade packages will
  always include a `bun.lock` diff for review.
- The Angular CLI schematic runner is still `ng` (via `bunx ng` or the local `./node_modules/.bin/ng`);
  Bun does not replace the CLI's code-generation capabilities.
- Bun's Node.js compatibility is high but not 100%; if a dependency requires a Node.js-specific API
  not supported by Bun, the team must use `node` explicitly for that script.
