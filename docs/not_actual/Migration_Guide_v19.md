# Migration Guide: ExoFrame v19 Folder Structure

## Overview

ExoFrame v19 introduces a new, domain-driven folder structure for clarity, maintainability, and lifecycle transparency. This guide helps you migrate from the old structure to the new one, explains symlink compatibility, and highlights key changes.

---

## New Folder Structure

```
ExoFrame/
├── .exo/                    # Runtime state (gitignored)
├── Blueprints/              # Agent & Flow definitions
├── Workspace/               # Request/Plan/Active/Archive pipeline
├── Memory/                  # Persistent knowledge
├── Portals/                 # External project links
├── .copilot/                # AI assistant/dev knowledge base
├── docs/                    # Documentation
├── migrations/              # DB migrations
├── scripts/                 # Build scripts
├── src/                     # Source code
├── tests/                   # Tests
└── tests_infra/             # Test infrastructure
```

---

## Migration Steps

1. **Backup**: The migration script creates a backup in `.exo/migration-backup/`.
2. **Run Migration**:
   ```bash
   deno run --allow-all scripts/migrate_folders.ts --dry-run   # Preview changes
   deno run --allow-all scripts/migrate_folders.ts             # Execute migration
   ```
3. **Symlinks**: Symlinks are created for backward compatibility:
   - `Inbox/` → `Workspace/`
   - `System/Active/` → `Workspace/Active/`
   - `agents/` → `.copilot/`
4. **Rollback**: Restore original structure if needed:
   ```bash
   deno run --allow-all scripts/migrate_folders.ts --rollback
   ```

---

## Key Path Changes

| Old Path          | New Path                     |
| ----------------- | ---------------------------- |
| System/journal.db | .exo/journal.db              |
| System/daemon.pid | .exo/daemon.pid              |
| System/daemon.log | .exo/daemon.log              |
| Inbox/Requests/   | Workspace/Requests/          |
| Inbox/Plans/      | Workspace/Plans/             |
| System/Active/    | Workspace/Active/            |
| agents/           | .copilot/                    |
| templates/        | Blueprints/Agents/templates/ |

---

## .gitignore Changes

- `.exo/` and `Workspace/` subfolders are now ignored.
- Old patterns are kept with deprecation comments for transition.

---

## Deprecation Warnings

- Using old paths will print a warning and redirect to the new location.
- Symlinks will be removed in v2.0.0.

---

## Troubleshooting

- If you encounter issues, restore from backup using the rollback command.
- Update your scripts and integrations to use the new paths.

---

## Need Help?

See [docs/ExoFrame_Architecture.md](./ExoFrame_Architecture.md) for diagrams and rationale.
