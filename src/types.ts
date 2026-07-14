export interface PresetBlock {
  identifier: string
  name: string
  content: string
  role: 'system' | 'user' | 'assistant'
  system_prompt: boolean
  enabled: boolean
  marker: boolean
  [k: string]: any
}

export interface OrderItem {
  identifier: string
  enabled: boolean
  [k: string]: any
}

export interface OrderGroup {
  id: string
  _gid: string
  name: string
  collapsed: boolean
  enabled: boolean
  children: OrderItem[]
}

export type OrderNode = OrderItem | OrderGroup

export interface FlatNode {
  ref: OrderNode
  parent: OrderNode[]
  parentIdx: number
  depth: number
  isGroup: boolean
}

export interface PresetData {
  prompts: PresetBlock[]
  prompt_order: { order: OrderItem[]; [k: string]: any }[]
  [k: string]: any
}

export interface PreviewSegment {
  text: string
  added: boolean // true = 相对该块原始 content 新增/被替换出来的文本（比如宏被解析后的结果），用于高亮
}

export interface PreviewMessage {
  role: string
  tokens: number
  identifier: string
  segments: PreviewSegment[]
}

export interface PreviewBlockGroup {
  id: string
  name: string
  isMarker: boolean
  messages: PreviewMessage[]
}

export interface SearchResult {
  blockId: string
  blockName: string
  line: number
  col: number
  context: string
  ms: number
  ml: number
}

export interface VarOp {
  blockId: string
  blockName: string
  type: 'setvar' | 'addvar' | 'get'
  varName: string
  varValue: string
  line: number
  col: number
  pos: number
  ordIdx: number
}

export interface SyntaxColors {
  'hl-b': string; 'hl-k': string; 'hl-s': string; 'hl-v': string
  'hl-c': string; 'hl-cm': string; 'hl-m': string
  'hl-sq': string; 'hl-dq': string; 'hl-ab': string; 'hl-sb': string
}

export interface Settings {
  editorFontSize: number
  editorFontFamily: string
  syntaxColors: SyntaxColors
  sidebarWidth: number
  varPanelWidth: number
  previewWidth: number
  varPanelFloat: boolean
  previewFloat: boolean
  settingsDockWidth: number
  settingsDockFloat: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  editorFontSize: 15,
  editorFontFamily: 'JetBrains Mono',
  syntaxColors: {
    'hl-b': '#58b8c0', 'hl-k': '#a078c0', 'hl-s': '#555570',
    'hl-v': '#c8a045', 'hl-c': '#68b868', 'hl-cm': '#555570',
    'hl-m': '#6090c0', 'hl-sq': '#c89850', 'hl-dq': '#78b0c0',
    'hl-ab': '#60a870', 'hl-sb': '#d08a5c',
  },
  sidebarWidth: 340,
  varPanelWidth: 360,
  previewWidth: 640,
  varPanelFloat: false,
  previewFloat: false, 
  settingsDockWidth: 320,
  settingsDockFloat: false,
}

/** Cap on how many search-result rows SearchPanel.vue renders in the results list — doSearch()
 *  in store.ts still collects every match (used for prev/next/replace-all), this only limits the
 *  DOM list. Lives here instead of a local const in SearchPanel.vue so there's one source of
 *  truth if this ever needs to become a user setting. */
export const SEARCH_MAX = 200

export const FONT_OPTIONS = [
  { name: 'JetBrains Mono', value: "'JetBrains Mono','Fira Code',monospace" },
  { name: 'Fira Code', value: "'Fira Code',monospace" },
  { name: 'Source Code Pro', value: "'Source Code Pro',monospace" },
  { name: 'IBM Plex Mono', value: "'IBM Plex Mono',monospace" },
  { name: 'Ubuntu Mono', value: "'Ubuntu Mono',monospace" },
]

export const SYNTAX_LABELS: Record<string, string> = {
  'hl-b': 'Brackets {{ }}', 'hl-k': 'Keywords', 'hl-s': 'Separators (::)',
  'hl-v': 'Variable Names', 'hl-c': 'Values', 'hl-cm': 'Comments',
  'hl-m': 'Macro Content', 'hl-sq': "Single Quotes", 'hl-dq': "Double Quotes",
  'hl-ab': 'Angle Brackets < >', 'hl-sb': 'Square Brackets [ ]',
}

export interface RegexScript {
  id: string
  scriptName: string
  findRegex: string
  replaceString: string
  trimStrings: string[]
  placement: number[]
  disabled: boolean
  markdownOnly: boolean   // 仅影响显示
  promptOnly: boolean     // 仅影响后端提示词
  runOnEdit: boolean
  substituteRegex: number // 0 不替换 / 1 替换(原始) / 2 替换(转义)
  minDepth: number | null
  maxDepth: number | null
  [k: string]: any
}

/**No value 4 here*/
export const REGEX_PLACEMENT_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: '用户输入' },
  { value: 2, label: 'AI 输出' },
  { value: 3, label: '快捷命令' },
  { value: 5, label: '世界书' },
  { value: 6, label: '推理' },
]

export const REGEX_SUBSTITUTE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: '不替换' },
  { value: 1, label: '替换（原始）' },
  { value: 2, label: '替换（转义）' },
]
