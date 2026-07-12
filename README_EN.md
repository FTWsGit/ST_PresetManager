# st-preset-manager

A Chat Completion preset management tool for [SillyTavern](https://github.com/SillyTavern/SillyTavern) "Tavern Helper". Built with Vue 3 + Pinia + TypeScript and packaged as a single-file script that injects directly into the SillyTavern page. Click the floating button in the bottom-right corner to open.

It provides a fullscreen independent panel for **visually organizing, editing, searching, and previewing** every prompt block in your preset — no more digging through SillyTavern's native small popups one by one.

---

## Features

- **Preset Management**: Load, save, and switch SillyTavern Chat Completion presets. Operate on any preset, not just the currently selected one.
- **Block-level Editing**: Create, delete, and edit prompt blocks in real time — content, name, role (system/user/assistant), and enable/disable state.
- **Visual Sorting**: Drag to reorder blocks. Bind multiple blocks into a **collapsible group**, or unbind them back to top-level.
- **Search & Replace**: Full-text search across all blocks, with per-result navigation and replacement.
- **Variable Tracking**: Automatically index all `{{setvar}}` / `{{addvar}}` / `{{getvar}}` usages. A side navigation panel and click-to-popup let you jump to any variable's definition or usage with one click.
- **Precise Preview**: Real preview powered by SillyTavern's own rendering pipeline, not local simulation:
  - **Per-Block Preview**: Run a dry-run to see each block's actual rendered text after macros/variables/regex processing. Added or substituted text is highlighted so you can verify macro expansion at a glance.
  - **Full Request Text**: Trigger a real generation, intercept the complete `messages` array right before it's sent to the API, then immediately abort. Use this for a final sanity check on plugin or connection-profile modifications to the request body.
- **Cross-Preset Copy**: Copy prompt blocks freely between two different presets via an independent side-by-side panel.

---

## Installation & Usage

Two methods: **Tavern Helper** (recommended) or **SillyTavern native extension**.

### Method 1: Tavern Helper (Recommended)

1. Install Tavern Helper (see [Tavern Helper Docs](https://n0vi028.github.io/JS-Slash-Runner-Doc/guide/关于酒馆助手/介绍.html))
2. Create a new script
3. In the script content, paste:
   ```js
   import 'https://cdn.jsdelivr.net/gh/FTWsGit/ST_PresetManager@latest/dist/index.iife.js'
   ```
   This pulls the built artifact from GitHub.
4. Run the script. A floating button appears in the bottom-right corner. Click it to open the panel.

### Method 2: SillyTavern Native Extension

0. In essence, you need to place this repository under `SillyTavern/data/default-user/extensions/`
1. In SillyTavern, open **Extensions**, click **Install Extension**, and enter the repository URL: `https://github.com/FTWsGit/ST_PresetManager`
2. Install it. A floating button appears in the bottom-right corner. Click it to open the panel.

---

## Feature Details

### Preset I/O

Reads and writes presets through SillyTavern's `PresetManager` API. Supports operating on **any** preset, not limited to the one currently selected in SillyTavern's UI.

### Grouping System

Bind multiple prompt blocks into a collapsible group for better organization. Group metadata is flattened into a SillyTavern-compatible format on save, ensuring compatibility with other tools.

### Syntax Highlighting

The editor features recursive priority-based syntax highlighting covering `{{}}` macros, angle brackets, square brackets, and quotes. `{{}}` macros always take the highest priority.

### Precise Preview

Two preview modes, both powered by SillyTavern's actual rendering pipeline rather than local simulation:

- **Per-Block Preview**: Runs a dry-run generation to retrieve each block's real rendered text after macros, variables, and regex have been applied. Added or substituted text is highlighted to verify macro expansion at a glance.
- **Full Request Text**: Triggers a real generation, intercepts the complete `messages` array right before it's sent to the API, then immediately aborts the generation. Use this to verify the final request body after all plugin and connection-profile processing.

### Variable Tracking

Automatically scans all blocks for `{{setvar::name::value}}`, `{{addvar::name::value}}`, and `{{getvar::name}}` usages:

- **Variable Navigation Panel**: Lists all variable operations on the right side, grouped by variable name, with filtering and per-item navigation.
- **Click Popup**: Click any variable name in the editor to open a popup near the cursor, listing all occurrences of that variable in the current preset order for quick jumping.

### Cross-Preset Copy

An independent copy panel with two side-by-side columns. Load a different preset in each column, select blocks, and copy them across with one click. Supports multi-select.

### Drag-to-Sort

Sorting is implemented with custom mouse events to ensure reliable operation across all environments (including Tauri/WebView2 where native HTML5 drag-and-drop is partially broken).
