import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useConfirmStore = defineStore('confirm', () => {
  const open = ref(false)
  const title = ref('')
  const message = ref('') // 允许简单 HTML（<strong>之类），跟原来 Modals.vue 里那份一致
  let onConfirm: (() => void) | null = null

  function ask(opts: { title: string; message: string; onConfirm: () => void }) {
    title.value = opts.title
    message.value = opts.message
    onConfirm = opts.onConfirm
    open.value = true
  }
  function confirm() { open.value = false; onConfirm?.(); onConfirm = null }
  function cancel() { open.value = false; onConfirm = null }

  return { open, title, message, ask, confirm, cancel }
})
