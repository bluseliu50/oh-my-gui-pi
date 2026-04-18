---
name: upstream-merge
description: Repo-specific guide for merging upstream OMP changes into this fork while preserving fork-only decisions: backend-driven desktop slash commands, user config root ~/.omg-pi, and project-local .omp.
---

# Upstream Merge

Use this skill when pulling changes from upstream OMP into this fork.

## Upstream Remote

This fork expects:

- `origin`: `https://github.com/bluseliu50/oh-my-gui-pi.git`
- `upstream`: `https://github.com/can1357/oh-my-pi.git`

If `upstream` is missing:

```bash
git remote add upstream https://github.com/can1357/oh-my-pi.git
```

Confirm before merging:

```bash
git remote -v
git fetch upstream
```

## Recommended Flow

Prefer merging upstream into the fork branch you ship from, not hand-copying files.

```bash
git fetch upstream
git switch main
git merge upstream/main
```

If you keep fork work on a separate branch, first merge `upstream/main` into your local `main`, then merge `main` into the feature branch.

## Fork Decisions To Preserve

### 1. Desktop slash command picker stays backend-driven

Keep the backend as the single source of truth for desktop slash commands.

Current fork rule:

- desktop bootstrap asks RPC backend for `get_slash_commands`
- renderer only filters and inserts what backend returned
- RPC enumeration must include builtin, extension, custom, skill, and file slash commands

Conflict hotspot:

- `packages/coding-agent/src/modes/rpc/rpc-mode.ts`

When upstream touches slash commands, preserve the fork rule:

- do not reintroduce desktop-side hardcoded command lists
- do not reduce RPC results back to only `init` / `plan` or other partial subsets

### 2. User config root is `~/.omg-pi`, project config stays `./.omp`

This fork deliberately splits user and project config naming.

Keep:

- user-level native config under `~/.omg-pi` by default
- project-level native config under `./.omp`
- `PI_CONFIG_DIR` still overrides the user-level root only

Conflict hotspots:

- `packages/utils/src/dirs.ts`
- `packages/coding-agent/src/config.ts`
- `packages/coding-agent/src/discovery/helpers.ts`
- `packages/coding-agent/src/discovery/builtin.ts`

When upstream changes discovery or path helpers:

- keep project-local `.omp` intact
- do not collapse user + project native config back to one shared constant
- keep user-facing path/help text aligned with the split

### 3. This repo keeps fork-maintenance guidance in `.omp/skills/`

If upstream adds or restructures skills loading, make sure project skills under `.omp/skills/` still load.

Conflict hotspot:

- skill discovery / loading code under `packages/coding-agent/src/extensibility/` and `packages/coding-agent/src/discovery/`

## Merge Triage Checklist

When conflicts appear, resolve in this order:

1. Path/config helpers
2. Discovery/source mapping
3. RPC slash-command enumeration
4. Desktop build/runtime verification

This avoids fixing UI symptoms before restoring the underlying config/discovery contracts.

## Verification After Merge

Run the focused checks that protect this fork's deltas:

```bash
bun test packages/coding-agent/test/discovery/pi-config-dir.test.ts packages/coding-agent/test/marketplace/discovery.test.ts
bun --cwd=packages/coding-agent run desktop:build
printf '%s\n' '{"id":"1","type":"get_slash_commands"}' | bun --cwd=packages/coding-agent run src/cli.ts --mode rpc
```

Expected outcomes:

- config tests pass with user root `~/.omg-pi` and project root `./.omp`
- desktop bundle builds
- RPC slash command response contains the full backend-visible set, not just `init` and `plan`

## When To Push Back

If an upstream change conflicts with the fork on purpose, do not auto-accept whichever side was newest. Re-evaluate against these fork invariants first:

- backend owns desktop slash command truth
- user config root is `~/.omg-pi`
- project config root is `./.omp`
