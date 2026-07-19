import type { PresetData } from './types'

let cachedCtx: any = null

function getTopWindow(): Window {
  try { return window.top! } catch { return window }
}

function getCtx(): any {
  if (cachedCtx) return cachedCtx
  const top = getTopWindow()
  try { cachedCtx = (top as any).SillyTavern?.getContext?.() || {} }
  catch { cachedCtx = {} }
  return cachedCtx
}

/* ====== PresetManager ======
 * Everything here goes through ST's own PresetManager rather than poking at
 * `ctx.chatCompletionSettings` directly. That earlier approach could only ever see "whatever
 * preset ST currently has selected" and had no reliable way to even name it (the old
 * getCurrentPresetName() fallback chain — chatCompletionSettings.preset /
 * power_user.preset.name / power_user.instruct.preset — doesn't actually correspond to how
 * chat-completion preset names are tracked; none of those reliably resolve on a real ST
 * instance). PresetManager.getPresetList() gives us the real, complete list — every preset by
 * name, not just the selected one — which is what lets loadPreset()/savePresetAs() below operate
 * on an arbitrary preset the person picks, independent of ST's own currently-selected preset.
 *
 * Explicitly requesting the 'openai' PresetManager (rather than calling getPresetManager() with
 * no argument) matters too: ST keeps a separate PresetManager per API type (kobold, novel,
 * textgenerationwebui, openai/chat-completion, ...), and the no-argument form resolves to
 * whichever API is currently "main" in ST's UI — which may not be chat-completion at all. This
 * tool only ever means the chat-completion one, so we ask for it by name every time instead of
 * hoping the ambient default happens to line up. */
function getPresetManager(): any {
  const ctx = getCtx()
  const pm = ctx.getPresetManager?.('openai')
  if (!pm) throw new Error('SillyTavern context 不可用（getPresetManager 缺失，或当前 ST 版本 API 不同）')
  return pm
}

export interface PresetListEntry {
  name: string
  index: number
}

/** 列出全部 Chat Completion 预设（不是只有当前选中的那个）。 */
export function listPresets(): PresetListEntry[] {
  const pm = getPresetManager()
  const list = pm.getPresetList?.()
  const names = list?.preset_names
  if (!names || typeof names !== 'object') throw new Error('无法获取预设列表（getPresetList 结构异常，ST 版本可能已更新）')
  return Object.entries(names).map(([name, index]) => ({ name, index: index as number }))
}

/** ST 当前在自己 UI 里选中的预设名——仅用作"首次打开面板时默认加载哪个"的初始值，
 *  不代表我们这边接下来只能操作这一个预设。 */
export function getSelectedPresetName(): string {
  const pm = getPresetManager()
  return pm.getSelectedPresetName?.() || ''
}

/** 按名字读取指定预设的完整数据，可以是任意一个预设，不要求是当前选中的那个。
 *  优先用 `getCompletionPresetByName`（较新 ST 版本上更直接），拿不到就退化到从
 *  `getPresetList()` 里按名字查下标、取数组元素。 */
export function getPresetByName(name: string): PresetData | null {
  const pm = getPresetManager()
  let preset: any = typeof pm.getCompletionPresetByName === 'function'
    ? pm.getCompletionPresetByName(name)
    : null
  if (!preset) {
    const list = pm.getPresetList?.()
    const idx = list?.preset_names?.[name]
    if (typeof idx === 'number') preset = list.presets?.[idx]
  }
  if (!preset || !Array.isArray(preset.prompts) || !Array.isArray(preset.prompt_order)) return null
  // Deep-clone into a plain object before handing it back — both lookup paths above can return
  // ST's own live (possibly Vue-reactive) object, and we never want to hold or pass around
  // someone else's reactive reference (see savePresetAs() below for why that specifically bites).
  return JSON.parse(JSON.stringify(preset)) as PresetData
}

/** Select a preset: Can switch the preset that SillyTavern selects.
 * If don't switch the selection, when the external function running
 * you will get different data that is different with what you're looking
 * like window.SillyTavern.generate() will use selected preset to run
 * But this will be SLOW.
 */

export function selectPresetByName(name: string): boolean {
  const pm = getPresetManager()
  try {
    let id = pm.findPreset(name)
    pm.selectPreset(id)
  } catch {return false}

  return true
}

/** 保存到指定名字的预设——同样不要求是当前选中的那个，可以另存/切换后再存。
 *
 * 之前这里走的是 `/api/settings/save`，保存的是整个用户 settings.json，我们当时只拼了一个
 * `{ chatCompletionSettings: cs }` 传过去，这个接口不是按字段 merge 的，是整体覆盖式写入——
 * 结果是把 settings.json 里其它所有顶层字段都抹掉了。`pm.savePreset(name, data)` 只覆盖写入
 * `name` 这一个预设文件，不碰全局 settings。
 *
 * `data` 必须是一个纯对象，不能是我们自己 Pinia store 里的活跃响应式引用：ST 内部
 * `savePreset()` 会对传入对象跑 `structuredClone()`，Vue 的响应式 Proxy 过不了这一关
 * （"structuredClone ... could not be cloned"）；更麻烦的是，如果 ST 在触发这次克隆之前就已经
 * 把我们传入的对象引用赋值进了它自己的活跃状态里，我们这边的 Vue Proxy 就会残留在 ST 的内部状态
 * 里（表现为刷新前 `pm.getCompletionPresetByName()` 一直返回一个来自*我们*这个 Vue 实例的
 * `Proxy(Object)`），直到手动刷新页面才会清掉。调用方（store.ts）负责在传进来之前就用
 * `JSON.parse(JSON.stringify(...))` 深拷贝成纯数据——这里再断言一次，双重保险。 */
export async function savePresetAs(name: string, data: PresetData): Promise<void> {
  const pm = getPresetManager()
  if (typeof pm.savePreset !== 'function') throw new Error('SillyTavern context 不可用（savePreset 缺失）')
  const plain = JSON.parse(JSON.stringify(data)) as PresetData
  await Promise.resolve(pm.savePreset(name, plain))
}

export async function deletePreset(name: string): Promise<void> {
  const pm = getPresetManager()
  if (typeof pm.deletePreset !== 'function') throw new Error('SillyTavern context 不可用（deletePreset 缺失）')
  await Promise.resolve(pm.deletePreset(name))
}

/** 清除缓存 */
export function invalidateCache() {
  cachedCtx = null
}

/* ====== 精确预览：方案B（读 openai.js 内部真实的 promptManager 单例）======
 * 见《SillyTavern预设块渲染实现文档》第3节。核心限制：`import()` 必须在顶层文档的模块作用域里
 * 执行，否则拿到的不是 ST 页面自己用的那个单例。我们的脚本本身跑在 about:srcdoc 的 iframe 里
 * （见 hostEnv.ts 顶部注释），iframe 自己 dynamic import 一个以 '/' 开头的相对路径会按 iframe
 * 自己的 base URL（about:srcdoc，没有正常 origin）解析，行大概率会失败或指向错误的模块实例。
 * 解决方式：往顶层文档注入一个 <script type="module">，让 import() 在顶层文档的模块作用域里
 * 执行、正确解析相对路径，并把结果挂到顶层 window 上，我们再跨窗口拿这个函数引用来用。 */
let topImporterPromise: Promise<(spec: string) => Promise<any>> | null = null
function ensureTopImporter(): Promise<(spec: string) => Promise<any>> {
  if (topImporterPromise) return topImporterPromise
  topImporterPromise = (async () => {
    const top = getTopWindow() as any
    if (typeof top.__stpmImport === 'function') return top.__stpmImport
    const doc = top.document as Document
    if (!doc.getElementById('st-pm-importer')) {
      const script = doc.createElement('script')
      script.id = 'st-pm-importer'
      script.type = 'module'
      script.textContent = 'window.__stpmImport = (s) => import(s);'
      doc.head!.appendChild(script)
    }
    // module script 是异步执行的（下一个 microtask/task，而不是同步 appendChild 就绪），轮询等它跑完
    for (let i = 0; i < 100; i++) {
      if (typeof top.__stpmImport === 'function') return top.__stpmImport
      await new Promise(r => setTimeout(r, 10))
    }
    throw new Error('无法在宿主页面注入动态 import 助手（module script 未在预期时间内执行）')
  })()
  return topImporterPromise
}

export interface RenderedMsg {
  role: string
  content: string
  tokens: number
  identifier: string
}

/** 按 identifier 分组的、真实渲染后的消息（宏/正则/其他插件都已处理）。
 *  必须先真的跑一次 dry-run，`pm.messages` 才有数据；这里每次调用都会触发一次新的 dry-run，
 *  不复用旧数据（旧数据可能是上一次不同状态下生成的）。
 *  依赖 openai.js 内部实现细节，ST 版本更新可能失效——失败时明确抛错，不静默返回空结果。 */
export async function getPromptManagerMessages(): Promise<Record<string, RenderedMsg[]>> {
  const ctx = getCtx()
  if (typeof ctx.generate !== 'function') throw new Error('SillyTavern context 不可用（ctx.generate 缺失）')
  const importer = await ensureTopImporter()

  await ctx.generate('normal', {}, true)

  const module = await importer('/scripts/openai.js')
  const pm = module?.setupChatCompletionPromptManager?.()
  if (!pm?.messages?.collection) {
    throw new Error('promptManager.messages 结构异常，ST 版本可能已更新（方案B失效，需要重新翻源码确认）')
  }

  const results: Record<string, RenderedMsg[]> = {}
  for (const item of pm.messages.collection as any[]) {
    if (!item) continue // null = 这个位置在本次生成里被跳过（禁用/无内容）
    results[item.identifier] = (item.collection || []).map((m: any) => ({
      role: m.role,
      content: m.content ?? '',
      tokens: m.tokens ?? 0,
      identifier: m.identifier,
    }))
  }
  return results
}

export interface RawRequestMessage {
  role: string
  content: string
}

/* ====== 精确预览：整体原文（CHAT_COMPLETION_SETTINGS_READY 事件）======
 * 最初用的是 GENERATE_AFTER_DATA + dry-run（`ctx.generate('normal', {}, true)`）。问题是
 * dry-run 只处理宏/变量/正则这些 ST 自己内部的文本管线，不会走到"组装完 chatCompletionSettings
 * 发给后端 API 之前"这一步——插件对请求体的二次加工、连接档案（connection profile）/ API 级别的
 * 调度逻辑等都在这之后才发生，dry-run 根本不会触发。
 *
 * 所以整体原文预览必须跑一次真实的 `ctx.generate('normal')`（不带 dry-run 参数），并监听
 * CHAT_COMPLETION_SETTINGS_READY——这个事件在请求体最终组装完成、即将发给 API 之前触发，
 * `completion.messages` 就是真正会发出去的 `[{role, content}, ...]`。拿到之后立刻调用
 * `ctx.stopGeneration()` 把这次真实生成中断掉，避免真的打一次 API 产生费用/等待。
 *
 * 和 getPromptManagerMessages()（方案B）不是同一回事：方案B 是 dry-run 够用的场景（单块精确
 * 预览只关心宏/正则处理后的文本本身），这里是"最终发送前的完整请求"，两者互不替代。 */
export async function getFinalRequestMessages(): Promise<RawRequestMessage[]> {
  const ctx = getCtx()
  if (typeof ctx.generate !== 'function') throw new Error('SillyTavern context 不可用（ctx.generate 缺失）')
  if (!ctx.eventSource || !ctx.event_types?.CHAT_COMPLETION_SETTINGS_READY) {
    throw new Error('SillyTavern context 不可用（eventSource/event_types 缺失，或当前不是 Chat Completion 模式）')
  }

  const evt = ctx.event_types.CHAT_COMPLETION_SETTINGS_READY
  const src = ctx.eventSource
  const useOnce = typeof src.once === 'function'

  return new Promise((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout>
    const cleanup = () => {
      clearTimeout(timer)
      if (!useOnce) { try { src.removeListener?.(evt, handler) ?? src.off?.(evt, handler) } catch {} }
    }
    const handler = (completion: any) => {
      if (settled) return
      settled = true
      // Cut the real generation off right away — we only wanted the outgoing request payload,
      // not to actually spend API time/tokens on a completion nobody asked for. Whatever
      // rejection this causes on the ctx.generate() promise below is harmless: `settled` is
      // already true by the time it lands, so that .catch() is a no-op.
      try { ctx.stopGeneration?.() } catch {}
      cleanup()
      const msgs = Array.isArray(completion?.messages) ? completion.messages : []
      resolve(msgs.map((m: any) => ({
        role: m?.role || '',
        content: typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content ?? '', null, 2),
      })))
    }
    timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { ctx.stopGeneration?.() } catch {}
      cleanup()
      reject(new Error('等待 CHAT_COMPLETION_SETTINGS_READY 超时（可能没有配置好可用的 API 连接，或当前不是 Chat Completion 模式）'))
    }, 20000)

    if (useOnce) src.once(evt, handler)
    else src.on(evt, handler)

    ctx.generate('normal').catch((e: any) => {
      if (settled) return
      settled = true
      cleanup()
      reject(e instanceof Error ? e : new Error(String(e)))
    })
  })
}
