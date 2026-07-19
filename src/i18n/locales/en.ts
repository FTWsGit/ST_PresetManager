import type { LocaleTable } from '../types'
import type zhCN from './zh-CN'

// Must cover every key in zh-CN.ts — typed against `keyof typeof zhCN` directly (not via
// index.ts) to avoid a circular import: index.ts imports this file, so this file can't import
// LocaleKey back from index.ts. A missing key here is a compile-time error, not a silent
// runtime `undefined`.
export default {
  // ---- common ----
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.close': 'Close',
  'common.confirm': 'Confirm',
  'common.ok': 'OK',
  'common.new': 'New',
  'common.load': 'Load',
  'common.all': 'All',
  'none': 'None',
  'common.search': 'Search',
  'common.replace': 'Replace',
  'common.results': 'results',
  'common.prev': 'Prev',
  'common.next': 'Next',
  'common.filter': 'Filter',
  'common.generate': 'Generate',
  'common.copy': 'Copy',
  'common.generating': 'Generating…',
  'common.hidden': 'Hidden',
  'common.unnamed': '(Unnamed)',
  'common.messages': 'messages',
  'common.tokens': 'tok',
  'common.lines': '{count} lines',
  'common.chars': '{count} chars',

  // ---- shared.header ----
  'shared.header.save': '💾 Save{star}',
  'shared.header.reload': '↻ Reload',
  'shared.header.copyBlocks': '⇆ Copy Blocks',
  'shared.header.search': '🔍 Search',
  'shared.header.settings': '⚙ Settings',
  'shared.header.varNav': '📊 Var Nav',
  'shared.header.preview': '👁 Preview',
  'shared.header.newPreset': 'New preset',
  'shared.header.deletePreset': 'Delete preset',
  'shared.header.switchPreset': 'Switch preset',
  'shared.header.noneLoaded': '(none loaded)',
  'shared.header.mode.block': 'Presets',
  'shared.header.mode.regex': 'Regex',

  // Mobile-only header controls (App.vue) — ☰ opens the sidebar as a left drawer, ⋯ opens the
  // tools action sheet. Everything the action sheet lists reuses the existing shared.header.*
  // labels above (mode.block/mode.regex/reload/copyBlocks/search/settings/varNav/preview/
  // newPreset/deletePreset), so only these two container labels are new.
  'shared.mobile.sidebar': 'Sidebar',
  'shared.mobile.tools': 'More Tools',

  // ---- shared.settings ----
  'shared.settings.title': 'Editor Settings',
  'shared.settings.language': 'Language',
  'shared.settings.resetDefaults': 'Reset Defaults',
  'shared.settings.fontSize': 'Font Size',
  'shared.settings.fontFamily': 'Font Family',
  'shared.settings.syntaxColors': 'Syntax Highlight Colors',

  // ---- shared.toast ----
  'shared.toast.settingsReset': 'Settings reset',
  'shared.toast.loadPresetFirst': 'Load a preset first',
  'shared.toast.listPresetsFailed': 'Could not list presets: {msg}',
  'shared.toast.loadFailed': 'Load failed: {msg}',
  'shared.toast.presetNotFound': 'Preset not found: {name}',
  'shared.toast.loaded': 'Loaded: {name}',
  'shared.toast.cantLoadContext': 'Can\'t load selected preset in SillyTavern: {msg}',
  'shared.toast.noPresetSelected': 'No preset currently selected in SillyTavern',
  'shared.toast.noDataToSave': 'No data to save',
  'shared.toast.saved': 'Saved: {name}',
  'shared.toast.saveFailed': 'Save failed: {msg}',
  'shared.toast.created': 'Created: {name}',
  'shared.toast.createFailed': 'Create failed: {msg}',
  'shared.toast.deleted': 'Deleted: {name}',
  'shared.toast.deleteFailed': 'Delete failed: {msg}',
  'shared.toast.blockCreated': 'Created',
  'shared.toast.blockDeleted': 'Deleted',
  'shared.toast.blockHidden': 'Hidden',
  'shared.toast.blockAdded': 'Added',
  'shared.toast.nothingToCopy': 'Nothing to copy',
  'shared.toast.copied': 'Copied',
  'shared.toast.copyFailed': 'Copy failed — see console for details',
  'shared.toast.duplicatePresetName': 'A preset with this name already exists',
  'shared.toast.presetReloadNote': 'Note: this is your currently-open preset — Reload it in the main editor to see these changes',
  'shared.toast.copiedBlocks': 'Copied {n} block(s) {dir}',
  'shared.toast.listPresetsCopyPanel': 'Could not list presets: {msg}',
  'shared.toast.loadFailedCopyPanel': 'Load failed: {msg}',
  'shared.toast.select2PlusBlocks': 'Please select at least 2 top-level blocks',
  'shared.toast.boundBlocks': 'Bound {count} blocks',
  'shared.toast.unbound': 'Unbound',
  'shared.toast.replaced1': 'Replaced 1 occurrence',
  'shared.toast.previewFailed': 'Preview failed: {msg}',
  'shared.toast.renderedFullPrompt': 'Rendered full prompt',
  'shared.toast.renderedBlocks': 'Rendered {count} block(s)',
  'shared.toast.cannotDeleteMarker': 'Can not delete Marker',
  'shared.toast.selectPresetFailed': 'Failed to select preset in ST Main Menu, shown data might be incorrect',

  // ---- shared.confirm ----
  'shared.confirm.switchPreset.title': 'Switch preset?',
  'shared.confirm.switchPreset.message': 'Switch to preset <strong>{name}</strong>? Any unsaved edits to the current preset will be lost.',
  'shared.confirm.switchPreset.confirm': 'Switch',
  'shared.confirm.deletePreset.title': 'Delete preset?',
  'shared.confirm.deletePreset.message': 'This will permanently remove <strong>{name}</strong>. This cannot be undone.',
  'shared.confirm.deleteBlock.title': 'Delete prompt block?',
  'shared.confirm.deleteBlock.message': 'This will permanently remove <strong>{name}</strong> from the preset.',
  'shared.confirm.deleteBlock.confirm': 'Delete',
  'shared.confirm.deleteBlock.cancel': 'Cancel',
  'shared.confirm.deleteRegex.title': 'Delete regex script?',
  'shared.confirm.deleteRegex.message': 'This will permanently remove <strong>{name}</strong> from the preset.',
  'shared.confirm.reloadPreset.title': 'Reload preset?',
  'shared.confirm.reloadPreset.message': 'Reloading <strong>{name}</strong> will discard unsaved copy/delete changes on this side.',
  'shared.confirm.reloadPreset.confirm': 'Reload',
  'shared.confirm.removeBlock.title': 'Remove block?',
  'shared.confirm.removeBlock.message': 'Remove <strong>{name}</strong> from this list? This only affects the in-progress copy session — nothing is written to disk until you hit Save.',
  'shared.confirm.removeBlock.confirm': 'Remove',
  'shared.confirm.closeUnsaved.title': 'Close without saving?',
  'shared.confirm.closeUnsaved.message': 'You have unsaved copy/delete changes on one or both sides.',
  'shared.confirm.closeUnsaved.confirm': 'Close',

  // ---- shared.prompt ----
  'shared.prompt.newPreset.title': 'New Preset Name',
  'shared.prompt.newPreset.placeholder': 'Preset name',
  'shared.prompt.newPreset.confirm': 'Create',
  'shared.prompt.newPreset.cancel': 'Cancel',

  // ---- shared.tabBar ----
  'shared.tabBar.close': 'Close',

  // ---- shared.settingsDock ----
  'shared.settingsDock.title': '⚙ Settings',
  'shared.settingsDock.toggleFloat': 'Toggle float mode',

  // ---- shared.listToolbar ----
  'shared.listToolbar.count': '{count} items',

  // ---- shared.editorShell ----
  'shared.editorShell.emptyRegex': 'Select a regex or create a new one',
  'shared.editorShell.emptyBlock': 'Select a block to edit',
  'shared.editorShell.loading': 'Loading preset from context...',

  // ---- shared.highlightedEditor ----
  'shared.highlightedEditor.cursor': 'Ln {line}, Col {col}',

  // ---- block.sidebar ----
  'block.sidebar.title': 'Prompt Blocks',
  'block.sidebar.newBlock': '+ New',
  'block.sidebar.hiddenBlock': '+ Hidden',
  'block.sidebar.bind': '🔗 Bind',
  'block.sidebar.unbind': '🔓 Unbind',
  'block.sidebar.hiddenTitle': 'Not in current active order',
  'block.sidebar.settingsPanel': 'Settings panel (name/role)',

  // ---- block.settingsForm ----
  'block.settings.name': 'Name',
  'block.settings.namePlaceholder': 'Give this block a name',
  'block.settings.role': 'Role',
  'block.settings.markerHint': 'This is a marker block ({id}), content is internally generated by SillyTavern. Role/name changes here may not affect actual rendering.',
  'block.settings.empty': 'Select a block to edit its settings',

  // ---- block.search ----
  'block.search.placeholder': 'Search all blocks…',
  'block.search.replacePlaceholder': 'Replace…',
  'block.search.replace': 'Replace',
  'block.search.replaceAll': 'Replace All',
  'block.search.results': '{count} results',

  // ---- block.varPanel ----
  'block.varPanel.title': '📊 Variables',
  'block.varPanel.toggleFloat': 'Toggle float mode',
  'block.varPanel.filter': 'Filter…',
  'block.varPanel.prev': '◀ Prev',
  'block.varPanel.next': 'Next ▶',

  // ---- block.preview ----
  'block.preview.title': '👁 Prompt Preview',
  'block.preview.toggleFloat': 'Toggle float mode',
  'block.preview.collapseExpand': 'Collapse/Expand all',
  'block.preview.modeBlocks': 'Per-Block',
  'block.preview.modeRaw': 'Final Request',
  'block.preview.hintBlocks': 'Real per-block rendering from SillyTavern\'s own prompt manager. Highlighted text was substituted in (macros/regex/etc) — not literally in the block\'s source.',
  'block.preview.hintRaw': 'The exact messages array SillyTavern was about to send to the API — captured off a real generation that\'s cancelled immediately after, so nothing actually gets sent.',
  'block.preview.generate': '▶ Generate',
  'block.preview.copy': '📋 Copy',
  'block.preview.generating': '⏳ Generating…',
  'block.preview.collapseExpandSingle': 'Collapse/Expand',
  'block.preview.emptyBlocks': 'Click "Generate" for a real per-block render (this runs an actual dry-run generation).',
  'block.preview.emptyRaw': 'Click "Generate" to capture the final request — this briefly starts a real generation and cancels it right after.',

  // ---- block.varPopup ----
  'block.varPopup.hit': '{count} hits',
  'block.varPopup.hitSingle': '{count} hit',

  // ---- block.copyPanel ----
  'block.copyPanel.title': '🔀 Copy Blocks Between Presets',
  'block.copyPanel.selectPreset': 'Select preset…',
  'block.copyPanel.load': 'Load',
  'block.copyPanel.selectAll': 'All',
  'block.copyPanel.clearAll': 'None',
  'block.copyPanel.noBlocks': 'No blocks',
  'block.copyPanel.pickPreset': 'Pick and load a preset',
  'block.copyPanel.copyRight': 'Copy selected → right',
  'block.copyPanel.copyLeft': 'Copy selected → left',
  'block.copyPanel.removeBlock': 'Remove from this list',
  'block.copyPanel.close': 'Close',
  'block.copyPanel.dirRight': '→ right',
  'block.copyPanel.dirLeft': '→ left',
  'block.copyPanel.loadBothFirst': 'Load both sides first',
  'block.copyPanel.selectBlocksFirst': 'Select block(s) to copy first',

  // ---- regex.sidebar ----
  'regex.sidebar.title': 'Regex Scripts',
  'regex.sidebar.newScript': '+ New',
  'regex.sidebar.empty': 'No bound regex scripts yet',
  'regex.sidebar.toggleTitle': 'Enable/Disable',
  'regex.sidebar.deleteTitle': 'Delete',

  // ---- regex.contentEditor ----
  'regex.editor.edit': '✏️ Edit',
  'regex.editor.preview': '👁 Preview',
  'regex.editor.plainText': 'Plain Text',
  'regex.editor.html': 'HTML',
  'regex.editor.settingsPanel': 'Settings panel',
  'regex.editor.placeholder': 'Use {{match}} for full match, $1 / $2 for capture groups',
  'regex.editor.testText': 'Test Text',
  'regex.editor.testPlaceholder': 'Paste a message text here, switch to "Preview" to see the effect…',
  'regex.editor.invalidFindRegex': 'Find regex syntax is invalid, preview will return input text as-is',
  'regex.editor.previewLimitation': 'Preview only does local find/replace/trim — it does not parse macros and does not represent placement/depth restrictions.',
  'regex.editor.previewError': 'Preview error: {msg}',

  // ---- regex.settingsForm ----
  'regex.settings.enabled': 'Enabled',
  'regex.settings.findRegexLabel': 'Find Regex',
  'regex.settings.findRegexPlaceholder': '/pattern/flags',
  'regex.settings.findRegexInvalid': 'Invalid regex syntax',
  'regex.settings.scriptNameLabel': 'Script Name',
  'regex.settings.scriptNamePlaceholder': 'Give this regex a name',
  'regex.settings.placementLabel': 'Placement',
  'regex.settings.surfaceLabel': 'Surface Replacement',
  'regex.settings.displayOnly': 'Display Only',
  'regex.settings.promptOnly': 'Prompt Only',
  'regex.settings.both': 'Both',
  'regex.settings.advancedToggle': 'Advanced Options',
  'regex.settings.trimLabel': 'Trim Strings (one per line)',
  'regex.settings.runOnEdit': 'Run on Edit',
  'regex.settings.substituteLabel': 'Macro for Regex Find',
  'regex.settings.minDepth': 'Min Depth',
  'regex.settings.maxDepth': 'Max Depth',
  'regex.settings.depthPlaceholder': 'Unlimited',

  // ---- regex.placement ----
  'regex.placement.userInput': 'User Input',
  'regex.placement.aiOutput': 'AI Output',
  'regex.placement.quickCommand': 'Quick Command',
  'regex.placement.worldInfo': 'World Info',
  'regex.placement.reasoning': 'Reasoning',

  // ---- regex.substitute ----
  'regex.substitute.none': 'No Replace',
  'regex.substitute.raw': 'Replace (Raw)',
  'regex.substitute.escaped': 'Replace (Escaped)',

  // ---- syntax highlight labels ----
  'syntax.hl-b': 'Brackets {{ }}',
  'syntax.hl-k': 'Keywords',
  'syntax.hl-s': 'Separators (::)',
  'syntax.hl-v': 'Variable Names',
  'syntax.hl-c': 'Variable Values',
  'syntax.hl-cm': 'Comments',
  'syntax.hl-m': 'Macro Content',
  'syntax.hl-sq': 'Single Quotes',
  'syntax.hl-dq': 'Double Quotes',
  'syntax.hl-ab': 'Angle Brackets < >',
  'syntax.hl-sb': 'Square Brackets [ ]',
} satisfies Record<keyof typeof zhCN, string> satisfies LocaleTable
