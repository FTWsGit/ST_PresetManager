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
}

export const DEFAULT_SETTINGS: Settings = {
  editorFontSize: 14.5,
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
}

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
