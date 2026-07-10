// src/main.ts
;(globalThis as any).process = (globalThis as any).process || { env: {} }

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import mainCss from './styles/main.css?inline'
import { getHostDocument } from './composables/hostEnv'

function mount() {
  // 酒馆助手在 iframe (about:srcdoc) 里执行脚本
  // 必须挂到顶层文档，否则 FAB 在 iframe 里看不到
  const targetDoc = getHostDocument()

  // Inject the stylesheet as a plain string BEFORE creating/mounting anything.
  // We import the CSS with `?inline` (Vite gives it back as a raw string, with no
  // automatic runtime injection into *this* document) and write it into the target
  // document ourselves. This avoids the previous approach of waiting for a plugin to
  // inject a <style> tag into the iframe's own document and then cloning it over —
  // that had a real race condition (the clone could run before or after injection)
  // and, even when it "worked", was one extra layer of indirection for no benefit.
  if (!targetDoc.getElementById('st-preset-manager-style')) {
    const style = targetDoc.createElement('style')
    style.id = 'st-preset-manager-style'
    style.textContent = mainCss
    targetDoc.head!.appendChild(style)
  }

  const el = targetDoc.createElement('div')
  el.id = 'st-preset-manager'
  targetDoc.body!.appendChild(el)

  const app = createApp(App)
  app.use(createPinia())
  app.mount(el)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount)
} else {
  mount()
}
