# st-preset-manager

[中文](README.md)

A Chat Completion preset management tool for [SillyTavern](https://github.com/SillyTavern/SillyTavern) / [TauriTavern](https://github.com/Darkatse/TauriTavern). Built with Vue 3 + Pinia + TypeScript and packaged as a single-file script that injects directly into the host page. Click the floating button in the bottom-right corner to open.

It provides a fullscreen independent panel for **visually organizing, editing, searching, and previewing** every prompt block in your preset, as well as the regex scripts bound to it — no more digging through SillyTavern's native small popups one by one.

---

## Features

- **Prompt Block Editing**: create/delete/edit, reorder, enable/disable, group, search & replace, variable tracking, cross-preset copy, and precise preview powered by SillyTavern's real rendering pipeline.
- **Regex Script Editing**: edit the regex scripts bound to a preset (find/replace, trim, scope, depth) with local-simulation preview.
- **Chinese / English UI**: switchable anytime in settings.

Tabs, multi-select (Ctrl/Shift/long-press), drag-to-sort, and syntax highlighting are shared low-level interactions used by both data types — see "Feature Details" below rather than the top-level list.

---

## Installation & Usage

Two methods: **Tavern Helper** (recommended) or **SillyTavern native extension**.

### Method 1: Tavern Helper (Recommended)

1. Install Tavern Helper (see [Tavern Helper Docs](https://n0vi028.github.io/JS-Slash-Runner-Doc/guide/%E5%85%B3%E4%BA%8E%E9%85%92%E9%A6%86%E5%8A%A9%E6%89%8B/%E4%BB%8B%E7%BB%8D.html))
2. Create a new script
3. In the script content, paste:

```
import 'https://cdn.jsdelivr.net/gh/FTWsGit/ST_PresetManager@latest/dist/index.iife.js'
```

This pulls the built artifact from GitHub.

4. Enable the script. A floating button appears in the bottom-right corner. Click it to open the panel.

### Method 2: SillyTavern Native Extension

0. In essence, you need to place this repository under `SillyTavern/data/default-user/extensions/`
1. In SillyTavern, open **Extensions**, click **Install Extension**, and enter the repository URL: `https://github.com/FTWsGit/ST_PresetManager`
2. Install it. A floating button appears in the bottom-right corner. Click it to open the panel.

---

## Feature Details

### Prompt Block Editing

Reads and writes presets through SillyTavern's `PresetManager` API. Supports operating on **any** preset, not limited to the one currently selected.

- **Grouping**: bind multiple blocks into a collapsible group, children keep their relative order; flattened into a SillyTavern-compatible format on save, so other tools can still read the preset normally.
- **Multi-select**: Ctrl+Click / Shift+Click on desktop, long-press (~200ms) on mobile. Selection state and visual highlight are fully unified — no "selected but not highlighted" mismatches.
- **Search & Replace**: full-text search across all blocks, with per-result navigation and replacement.
- **Drag-to-Sort**: implemented with custom mouse events rather than native browser drag-and-drop — native HTML5 drag gets hijacked by the OS-level drag system under Tauri/WebView2, so it's avoided entirely.

### Regex Script Editing

Edits the regex scripts stored on the preset itself (`extensions.regex_scripts`, saved together with the preset — no separate read/write path needed): find/replace pattern, trim, scope, effective depth, and other parameters are all configurable through the UI, with a local-simulation preview (find/replace/trim) for instant feedback.

**Limitation**: the preview is a pure local simulation — it does not resolve macros (`substituteRegex`) and does not represent scope/depth restrictions, since those require real SillyTavern context. The editor shows a note about this; treat the preview as a reference, not a guarantee of the final in-chat effect.

### Precise Preview

Both preview modes are powered by SillyTavern's **actual** rendering pipeline, not a local simulation of macro substitution:

- **Per-Block Preview**: runs a dry-run generation to show each block's real rendered text after macros/variables/regex processing, with added/substituted text highlighted.
- **Full Request Text**: triggers a real generation, intercepts the complete `messages` array right before it's sent to the API, then immediately aborts. Use this to verify the final request body after all plugin/connection-profile processing.

(Currently only available for prompt blocks; regex scripts aren't wired into either preview mode yet.)

### Variable Tracking

Automatically scans all blocks for `{{setvar::name::value}}`, `{{addvar::name::value}}`, and `{{getvar::name}}` usages:

- **Variable Navigation Panel**: lists all variable operations on the right, grouped by variable name, with filtering and per-item navigation.
- **Click Popup**: click any variable name in the editor to open a popup near the cursor, listing all occurrences of that variable in the current preset.

### Cross-Preset Copy

An independent copy panel with two side-by-side columns. Load a different preset in each column, select blocks (multi-select supported), and copy them across with one click.

---

## Known Limitations

- Regex scripts don't yet support multi-select/batch operations/grouping, and aren't wired into precise preview or full-text search — these are currently prompt-block-only.
