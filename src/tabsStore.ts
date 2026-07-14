import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/** 一个 tab 对应"某个 domain 里的某一条具体数据"——预设块、正则脚本、世界书条目、角色卡字段……
 *  domain 用字符串而不是枚举，是因为这个 store 完全不需要知道每个 domain 具体是什么，它只管
 *  "开着哪些标签、谁是当前激活的、顺序是什么"，内容渲染完全交给调用方按 domain 路由到对应组件。
 *  key 只要求在同一 domain 内唯一（通常就是那条数据自己的 id/identifier）；跨 domain 允许重复，
 *  实际判重靠 domain+key 这个组合（见 tabId）。 */
export interface OpenTab {
  domain: string
  key: string
  label: string
}

function tabId(t: Pick<OpenTab, 'domain' | 'key'>): string {
  return t.domain + ':' + t.key
}

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<OpenTab[]>([])
  const activeId = ref<string | null>(null)

  const activeTab = computed<OpenTab | null>(
    () => tabs.value.find(t => tabId(t) === activeId.value) ?? null
  )
    
  const settingsDockOpen = ref(true)
  function toggleSettingsDock() { settingsDockOpen.value = !settingsDockOpen.value }

  const sidebarMode = ref<string>('block')
  function setSidebarMode(mode: string) { sidebarMode.value = mode }

  /** 打开一个标签。已经开着就只 focus，不重复插入、也不挪到末尾——不然每次点一个已经打开的
   *  标签，它在标签栏里的位置还会跳来跳去，体验会很怪。label 允许在已存在时刷新（比如 block
   *  改名之后再从 sidebar 点开，标签上的文字要跟着更新）。 */
  function open(tab: OpenTab) {
    const id = tabId(tab)
    const existing = tabs.value.find(t => tabId(t) === id)
    if (existing) existing.label = tab.label
    else tabs.value.push(tab)
    activeId.value = id
  }

  function close(domain: string, key: string) {
    const id = domain + ':' + key
    const i = tabs.value.findIndex(t => tabId(t) === id)
    if (i < 0) return
    tabs.value.splice(i, 1)
    if (activeId.value === id) {
      // 关掉的是当前激活的标签：焦点交给右边相邻的一个，右边没有就交给左边，都没有就空着——
      // 跟浏览器/VSCode关标签页的落焦行为一致，用户最不容易"找不到东西"。
      const next = tabs.value[i] ?? tabs.value[i - 1] ?? null
      activeId.value = next ? tabId(next) : null
    }
  }

  function closeAll() {
    tabs.value = []
    activeId.value = null
  }

  /** 只关掉某个 domain 的全部标签——比如切换/重新加载预设时，指向旧数据的 block 标签（引用的
   *  identifier 在新预设里根本不存在了）需要清掉，但正则、世界书这些跟这次预设重载无关的标签
   *  不该被一起打扫掉，所以按 domain 精确清，不做"全部清空"。 */
  function closeDomain(domain: string) {
    const closingActive = activeTab.value?.domain === domain
    tabs.value = tabs.value.filter(t => t.domain !== domain)
    if (closingActive) activeId.value = tabs.value[0] ? tabId(tabs.value[0]) : null
  }

  function focus(domain: string, key: string) {
    const id = domain + ':' + key
    if (tabs.value.some(t => tabId(t) === id)) activeId.value = id
  }

  function isOpen(domain: string, key: string): boolean {
    return tabs.value.some(t => t.domain === domain && t.key === key)
  }


  return { tabs, activeId, activeTab, open, close, closeAll, closeDomain, focus, isOpen, sidebarMode, setSidebarMode, settingsDockOpen, toggleSettingsDock}
})
