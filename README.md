# Claude Config Manager

A browser-based dashboard to inspect and manage everything loaded into your Claude Code context window — skills, plugins, hooks, and MCP servers.

![Dashboard Screenshot](https://img.shields.io/badge/status-active-brightgreen) ![Node.js](https://img.shields.io/badge/node-%3E%3D18-blue) ![License](https://img.shields.io/badge/license-MIT-yellow)

## Features

- **Skills** — View all active and disabled skills. Toggle any skill on/off with a single click. Disabled skills are physically moved out of `~/.claude/skills/` so they don't consume context window tokens.
- **Plugins** — See installed Claude Code plugins and toggle them via `settings.json`.
- **Hooks** — View all lifecycle hooks (PreToolUse, PostToolUse, PreCompact, SessionStart, SessionEnd, Stop) and enable/disable individually.
- **MCP Servers** — See MCP servers registered by plugins (read-only).
- **Search** — Filter across all items instantly.
- **Bulk operations** — Enable or disable all visible skills at once.
- **Active/total badges** — Tab badges show enabled vs total count at a glance (e.g. `4/132`).
- **Tooltips** — Hover any card title to see the full name and description.

## Quick Start

```bash
git clone https://github.com/chesketh/claude-config-manager.git
cd claude-config-manager
npm install
npm start
```

The dashboard opens automatically at [http://localhost:3847](http://localhost:3847).

## How It Works

| Item | Toggle Mechanism |
|------|-----------------|
| Skills | Moves the skill directory between `~/.claude/skills/` (active) and a disabled directory |
| Plugins | Sets `enabledPlugins[id]` in `~/.claude/settings.json` |
| Hooks | Sets `"disabled": true` on the hook entry in `~/.claude/hooks.json` |
| MCP Servers | Read-only — controlled by their parent plugin |

### Disabled Skills Directory

The server auto-detects where disabled skills are stored, checking these locations in order:

1. `CLAUDE_DISABLED_SKILLS_DIR` environment variable (if set)
2. `~/Documents/Claudetemp/Skills/` (common user location)
3. `~/.claude/skills-disabled/` (default fallback, created if needed)

## Auto-Start on Windows Boot

A VBS launcher script is included for silent startup:

```
start-hidden.vbs
```

Create a shortcut to this file in your Windows Startup folder:

```
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\
```

The VBS script auto-detects its own directory and starts the Node server in the background.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/overview` | Returns all skills, plugins, hooks, and MCP servers |
| POST | `/api/skills/:name/toggle` | Toggle a skill on/off |
| POST | `/api/plugins/:id/toggle` | Toggle a plugin on/off |
| POST | `/api/hooks/:lifecycle/:index/toggle` | Toggle a hook on/off |
| POST | `/api/skills/bulk` | Bulk enable/disable skills |

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `CLAUDE_DISABLED_SKILLS_DIR` | Override the disabled skills directory | Auto-detected |

## Tech Stack

- **Backend**: Express.js — reads/writes Claude Code config files directly
- **Frontend**: Vanilla HTML/CSS/JS — single `index.html`, no build step
- **No database** — all state lives in Claude Code's own config files

## Requirements

- Node.js 18+
- Claude Code installed with `~/.claude/` directory present
