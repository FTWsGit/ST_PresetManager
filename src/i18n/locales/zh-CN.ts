import type { LocaleTable } from '../types'

// zh-CN 是这份 locale 表的"参照表"——index.ts 用 `keyof typeof zhCN` 反推出 LocaleKey 联合类型，
// en.ts 漏翻译某个 key 会在编译期直接报错（见 i18n/index.ts 顶部注释）。所以新增文案时，
// 永远先加在这份表里，再去 en.ts 补对应英文，顺序反过来 TS 不会帮你查漏。
//
// key 命名规范（域.场景.用途）、common vs 域内 key 怎么选，见 I18N_DESIGN.md 第 2 节，这里不重复。
export default {
  // ---- common：跨域复用、且语义不随上下文变化的通用词 ----
  'common.save': '保存',
  'common.cancel': '取消',
  'common.delete': '删除',
  'common.close': '关闭',
  'common.confirm': '确认',
  'common.ok': '确定',
  'common.new': '新建',
  'common.load': '加载',
  'common.all': '全部',
  'none': '无',
  'common.search': '搜索',
  'common.replace': '替换',
  'common.results': '结果',
  'common.prev': '上',
  'common.next': '下',
  'common.filter': '筛选',
  'common.generate': '生成',
  'common.copy': '复制',
  'common.generating': '生成中…',
  'common.hidden': '隐藏',
  'common.unnamed': '(未命名)',
  'common.messages': '消息',
  'common.tokens': 'tok',
  'common.lines': '{count} 行',
  'common.chars': '{count} 字符',

  // ---- shared.header：顶部工具栏 ----
  'shared.header.save': '💾 保存{star}',
  'shared.header.reload': '↻ 重新加载',
  'shared.header.copyBlocks': '⇆ 复制块',
  'shared.header.search': '🔍 搜索',
  'shared.header.settings': '⚙ 设置',
  'shared.header.varNav': '📊 变量导航',
  'shared.header.preview': '👁 预览',
  'shared.header.newPreset': '新建预设',
  'shared.header.deletePreset': '删除预设',
  'shared.header.switchPreset': '切换预设',
  'shared.header.noneLoaded': '(未加载任何预设)',
  'shared.header.mode.block': '预设',
  'shared.header.mode.regex': '正则',

  // Mobile-only header controls (App.vue) — ☰ opens the sidebar as a left drawer, ⋯ opens the
  // tools action sheet. Everything the action sheet lists reuses the existing shared.header.*
  // labels above (mode.block/mode.regex/reload/copyBlocks/search/settings/varNav/preview/
  // newPreset/deletePreset), so only these two container labels are new.
  'shared.mobile.sidebar': '侧边栏',
  'shared.mobile.tools': '更多工具',

  // ---- shared.settings：设置弹窗 ----
  'shared.settings.title': '编辑器设置',
  'shared.settings.language': '界面语言',
  'shared.settings.resetDefaults': '恢复默认',
  'shared.settings.fontSize': '字体大小',
  'shared.settings.fontFamily': '字体',
  'shared.settings.syntaxColors': '语法高亮颜色',

  // ---- shared.toast：跨域通用的 toast 文案 ----
  'shared.toast.settingsReset': '设置已重置',
  'shared.toast.loadPresetFirst': '请先加载一份预设',
  'shared.toast.listPresetsFailed': '无法获取预设列表：{msg}',
  'shared.toast.loadFailed': '加载失败：{msg}',
  'shared.toast.presetNotFound': '未找到预设：{name}',
  'shared.toast.loaded': '已加载：{name}',
  'shared.toast.cantLoadContext': '无法从 SillyTavern 加载当前预设：{msg}',
  'shared.toast.noPresetSelected': 'SillyTavern 中当前没有选中的预设',
  'shared.toast.noDataToSave': '没有可保存的数据',
  'shared.toast.saved': '已保存：{name}',
  'shared.toast.saveFailed': '保存失败：{msg}',
  'shared.toast.created': '已创建：{name}',
  'shared.toast.createFailed': '创建失败：{msg}',
  'shared.toast.deleted': '已删除：{name}',
  'shared.toast.deleteFailed': '删除失败：{msg}',
  'shared.toast.blockCreated': '已创建',
  'shared.toast.blockDeleted': '已删除',
  'shared.toast.blockHidden': '已隐藏',
  'shared.toast.blockAdded': '已添加',
  'shared.toast.nothingToCopy': '没有可复制的内容',
  'shared.toast.copied': '已复制',
  'shared.toast.copyFailed': '复制失败，请查看控制台',
  'shared.toast.duplicatePresetName': '已存在同名预设',
  'shared.toast.presetReloadNote': '注意：这是当前打开的预设——请在主编辑器中重新加载以查看更改',
  'shared.toast.copiedBlocks': '已复制 {n} 个块 {dir}',
  'shared.toast.listPresetsCopyPanel': '无法获取预设列表：{msg}',
  'shared.toast.loadFailedCopyPanel': '加载失败：{msg}',
  'shared.toast.select2PlusBlocks': '请选择至少 2 个顶层块',
  'shared.toast.boundBlocks': '已绑定 {count} 个块',
  'shared.toast.unbound': '已解除绑定',
  'shared.toast.replaced1': '已替换 1 处',
  'shared.toast.previewFailed': '预览失败：{msg}',
  'shared.toast.renderedFullPrompt': '已渲染完整提示词',
  'shared.toast.renderedBlocks': '已渲染 {count} 个块',
  'shared.toast.cannotDeleteMarker': '不能删除Marker块',

  // ---- shared.confirm：通用确认弹窗 ----
  'shared.confirm.switchPreset.title': '切换预设？',
  'shared.confirm.switchPreset.message': '切换到预设 <strong>{name}</strong>？当前预设的未保存更改将丢失。',
  'shared.confirm.switchPreset.confirm': '切换',
  'shared.confirm.deletePreset.title': '删除预设？',
  'shared.confirm.deletePreset.message': '这将永久移除 <strong>{name}</strong>，无法撤销。',
  'shared.confirm.deleteBlock.title': '删除提示词块？',
  'shared.confirm.deleteBlock.message': '这将从预设中永久移除 <strong>{name}</strong>。',
  'shared.confirm.deleteBlock.confirm': '删除',
  'shared.confirm.deleteBlock.cancel': '取消',
  'shared.confirm.deleteRegex.title': '删除正则脚本？',
  'shared.confirm.deleteRegex.message': '这将从预设中永久移除 <strong>{name}</strong>。',
  'shared.confirm.reloadPreset.title': '重新加载预设？',
  'shared.confirm.reloadPreset.message': '重新加载 <strong>{name}</strong> 将丢弃此侧未保存的复制/删除更改。',
  'shared.confirm.reloadPreset.confirm': '重新加载',
  'shared.confirm.removeBlock.title': '移除块？',
  'shared.confirm.removeBlock.message': '从列表中移除 <strong>{name}</strong>？这仅影响当前复制会话——不会写入磁盘，直到你点击保存。',
  'shared.confirm.removeBlock.confirm': '移除',
  'shared.confirm.closeUnsaved.title': '不保存就关闭？',
  'shared.confirm.closeUnsaved.message': '你在一侧或两侧有未保存的复制/删除更改。',
  'shared.confirm.closeUnsaved.confirm': '关闭',

  // ---- shared.prompt：通用输入弹窗 ----
  'shared.prompt.newPreset.title': '新预设名称',
  'shared.prompt.newPreset.placeholder': '预设名称',
  'shared.prompt.newPreset.confirm': '创建',
  'shared.prompt.newPreset.cancel': '取消',

  // ---- shared.tabBar：标签栏 ----
  'shared.tabBar.close': '关闭',

  // ---- shared.settingsDock：设置面板 ----
  'shared.settingsDock.title': '⚙ 设置',
  'shared.settingsDock.toggleFloat': '切换悬浮模式',

  // ---- shared.listToolbar：列表工具条 ----
  'shared.listToolbar.count': '{count} 条',

  // ---- shared.editorShell：编辑区空状态 ----
  'shared.editorShell.emptyRegex': '选一条正则，或者新建一条',
  'shared.editorShell.emptyBlock': '选择一个块进行编辑',
  'shared.editorShell.loading': '正在从上下文加载预设…',

  // ---- shared.highlightedEditor：编辑器状态栏 ----
  'shared.highlightedEditor.cursor': '行 {line}，列 {col}',

  // ---- block.sidebar：预设块侧边栏 ----
  'block.sidebar.title': '提示词块',
  'block.sidebar.newBlock': '+ 新建',
  'block.sidebar.hiddenBlock': '+ 隐藏块',
  'block.sidebar.bind': '🔗 绑定分组',
  'block.sidebar.unbind': '🔓 解除绑定',
  'block.sidebar.hiddenTitle': '不在当前生效顺序里',
  'block.sidebar.settingsPanel': '设置面板（名称/角色）',

  // ---- block.settingsForm：预设块设置表单 ----
  'block.settings.name': '名称',
  'block.settings.namePlaceholder': '给这个块起个名字',
  'block.settings.role': '角色',
  'block.settings.markerHint': '这是一个 marker 块（{id}），内容由 SillyTavern 内部生成，这里的角色/名称改动可能不影响实际渲染。',
  'block.settings.empty': '选择一个块以编辑其设置',

  // ---- block.search：搜索替换 ----
  'block.search.placeholder': '搜索所有块…',
  'block.search.replacePlaceholder': '替换…',
  'block.search.replace': '替换',
  'block.search.replaceAll': '替换全部',
  'block.search.results': '{count} 个结果',

  // ---- block.varPanel：变量导航面板 ----
  'block.varPanel.title': '📊 变量',
  'block.varPanel.toggleFloat': '切换悬浮模式',
  'block.varPanel.filter': '筛选…',
  'block.varPanel.prev': '◀ 上',
  'block.varPanel.next': '下 ▶',

  // ---- block.preview：预览面板 ----
  'block.preview.title': '👁 提示词预览',
  'block.preview.toggleFloat': '切换悬浮模式',
  'block.preview.collapseExpand': '折叠/展开全部',
  'block.preview.modeBlocks': '逐块',
  'block.preview.modeRaw': '最终请求',
  'block.preview.hintBlocks': '来自 SillyTavern 提示词管理器的真实逐块渲染。高亮文本是被替换进来的（宏/正则等）——并非块源码中的字面量。',
  'block.preview.hintRaw': 'SillyTavern 即将发送给 API 的精确 messages 数组——通过真实生成捕获，并在之后立即取消，因此不会实际发送任何内容。',
  'block.preview.generate': '▶ 生成',
  'block.preview.copy': '📋 复制',
  'block.preview.generating': '⏳ 生成中…',
  'block.preview.collapseExpandSingle': '折叠/展开',
  'block.preview.emptyBlocks': '点击"生成"进行真实的逐块渲染（这会运行一次实际的 dry-run 生成）。',
  'block.preview.emptyRaw': '点击"生成"捕获最终请求——这会短暂启动一次真实生成并立即取消。',

  // ---- block.varPopup：变量弹窗 ----
  'block.varPopup.hit': '{count} 处匹配',
  'block.varPopup.hitSingle': '{count} 处匹配',

  // ---- block.copyPanel：跨预设复制 ----
  'block.copyPanel.title': '🔀 跨预设复制提示词块',
  'block.copyPanel.selectPreset': '选择预设…',
  'block.copyPanel.load': '加载',
  'block.copyPanel.selectAll': '全部',
  'block.copyPanel.clearAll': '无',
  'block.copyPanel.noBlocks': '没有块',
  'block.copyPanel.pickPreset': '选择并加载一个预设',
  'block.copyPanel.copyRight': '复制选中项 → 右侧',
  'block.copyPanel.copyLeft': '复制选中项 → 左侧',
  'block.copyPanel.removeBlock': '从此列表中移除',
  'block.copyPanel.close': '关闭',
  'block.copyPanel.dirRight': '→ 右侧',
  'block.copyPanel.dirLeft': '→ 左侧',
  'block.copyPanel.loadBothFirst': '请先加载两侧预设',
  'block.copyPanel.selectBlocksFirst': '请先选择要复制的块',

  // ---- regex.sidebar：正则侧边栏 ----
  'regex.sidebar.title': '正则脚本',
  'regex.sidebar.newScript': '+ 新建',
  'regex.sidebar.empty': '还没有绑定的正则',
  'regex.sidebar.toggleTitle': '启用/禁用',
  'regex.sidebar.deleteTitle': '删除',

  // ---- regex.contentEditor：正则内容编辑 ----
  'regex.editor.edit': '✏️ 编辑',
  'regex.editor.preview': '👁 预览',
  'regex.editor.plainText': '纯文本',
  'regex.editor.html': 'HTML',
  'regex.editor.settingsPanel': '设置面板',
  'regex.editor.placeholder': '用 {{match}} 引用整个匹配，$1 / $2 引用捕获组',
  'regex.editor.testText': '测试文本',
  'regex.editor.testPlaceholder': '粘贴一段消息文本，切到「预览」看效果…',
  'regex.editor.invalidFindRegex': '查找正则语法无效，预览会原样返回输入文本',
  'regex.editor.previewLimitation': '预览只做本地查找/替换/修剪，不解析宏、不代表作用范围与深度限制。',
  'regex.editor.previewError': '预览出错: {msg}',

  // ---- regex.settingsForm：正则设置表单 ----
  'regex.settings.enabled': '启用',
  'regex.settings.findRegexLabel': '查找正则表达式',
  'regex.settings.findRegexPlaceholder': '/pattern/flags',
  'regex.settings.findRegexInvalid': '正则语法无效',
  'regex.settings.scriptNameLabel': '脚本名称',
  'regex.settings.scriptNamePlaceholder': '给这条正则起个名字',
  'regex.settings.placementLabel': '作用范围',
  'regex.settings.surfaceLabel': '表层替换',
  'regex.settings.displayOnly': '仅影响显示',
  'regex.settings.promptOnly': '仅影响后端提示词',
  'regex.settings.both': '两者都影响',
  'regex.settings.advancedToggle': '高级选项',
  'regex.settings.trimLabel': '修剪掉（每行一条）',
  'regex.settings.runOnEdit': '在编辑时运行',
  'regex.settings.substituteLabel': '正则表达式查找的宏',
  'regex.settings.minDepth': '最小深度',
  'regex.settings.maxDepth': '最大深度',
  'regex.settings.depthPlaceholder': '无限',

  // ---- regex.placement：作用范围选项（对应 types.ts REGEX_PLACEMENT_OPTIONS） ----
  'regex.placement.userInput': '用户输入',
  'regex.placement.aiOutput': 'AI 输出',
  'regex.placement.quickCommand': '快捷命令',
  'regex.placement.worldInfo': '世界书',
  'regex.placement.reasoning': '推理',

  // ---- regex.substitute：表层替换选项（对应 types.ts REGEX_SUBSTITUTE_OPTIONS） ----
  'regex.substitute.none': '不替换',
  'regex.substitute.raw': '替换（原始）',
  'regex.substitute.escaped': '替换（转义）',

  // ---- syntax highlight labels（对应 types.ts SYNTAX_LABELS） ----
  'syntax.hl-b': '花括号 {{ }}',
  'syntax.hl-k': '关键字',
  'syntax.hl-s': '分隔符 (::)',
  'syntax.hl-v': '变量名',
  'syntax.hl-c': '变量值',
  'syntax.hl-cm': '注释',
  'syntax.hl-m': '宏内容',
  'syntax.hl-sq': '单引号',
  'syntax.hl-dq': '双引号',
  'syntax.hl-ab': '尖括号 < >',
  'syntax.hl-sb': '方括号 [ ]',
} satisfies LocaleTable
