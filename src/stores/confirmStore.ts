import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Generic modal-based confirm/prompt store, domain-agnostic (see PROJECT_HANDOFF.md 架构总览 1).
 *
 * Two independent flows, both rendered by Modals.vue:
 *  - ask()/confirm()/cancel(): "are you sure" style — title + message (message allows simple
 *    HTML like <strong>) + confirm/cancel button labels + optional onCancel (for callers that
 *    need to revert some UI state, e.g. App.vue snapping a <select> back to its previous value
 *    when the user cancels a preset switch). `danger` (default true) switches the confirm button
 *    to the red/danger style — most existing callers are delete-style actions, but e.g. "switch
 *    preset" isn't destructive so passes false.
 *  - askInput()/confirmPrompt()/cancelPrompt(): single-line text input + confirm callback that
 *    receives the trimmed value. Replaces window.prompt(), which — like window.confirm() — is
 *    unreliable inside TauriTavern's WebView2 host (see hostEnv.ts's doc comment for the general
 *    iframe/top-document story; native window.confirm/prompt/alert are a separate, host-specific
 *    problem on top of that one).
 *
 * RULE: nothing in this codebase should call getHostWindow().confirm()/.prompt() — always go
 * through ask()/askInput() instead, even for one-off "are you sure" checks.
 *
 * Both flows are deliberately flat state on one store rather than a stack/queue — this app never
 * needs to show two confirms at once, and a queue would be speculative complexity for a UI this
 * size. If that ever changes, this is the file to revisit.
 */
export interface ConfirmOptions {
  title: string
  message: string // 允许简单 HTML（<strong>之类）——调用方自己负责转义任何插入的用户数据，见 utils.ts 的 esc()
  confirmText?: string
  cancelText?: string
  danger?: boolean // 危险操作（删除类）用红色强调，默认 true
  onConfirm: () => void
  onCancel?: () => void
}

export interface PromptOptions {
  title: string
  message?: string
  placeholder?: string
  initialValue?: string
  confirmText?: string
  cancelText?: string
  onConfirm: (value: string) => void
}

export const useConfirmStore = defineStore('confirm', () => {
  /* ====== Confirm ====== */
  const open = ref(false)
  const title = ref('')
  const message = ref('')
  const confirmText = ref('Delete')
  const cancelText = ref('Cancel')
  const danger = ref(true)
  let onConfirmCb: (() => void) | null = null
  let onCancelCb: (() => void) | null = null

  function ask(opts: ConfirmOptions) {
    title.value = opts.title
    message.value = opts.message
    confirmText.value = opts.confirmText ?? 'Delete'
    cancelText.value = opts.cancelText ?? 'Cancel'
    danger.value = opts.danger ?? true
    onConfirmCb = opts.onConfirm
    onCancelCb = opts.onCancel ?? null
    open.value = true
  }
  function confirm() {
    open.value = false
    const cb = onConfirmCb
    onConfirmCb = null; onCancelCb = null
    cb?.()
  }
  function cancel() {
    open.value = false
    const cb = onCancelCb
    onConfirmCb = null; onCancelCb = null
    cb?.()
  }

  /* ====== Prompt (single-line text input) ====== */
  const promptOpen = ref(false)
  const promptTitle = ref('')
  const promptMessage = ref('')
  const promptPlaceholder = ref('')
  const promptValue = ref('')
  const promptConfirmText = ref('OK')
  const promptCancelText = ref('Cancel')
  let onPromptConfirmCb: ((value: string) => void) | null = null

  function askInput(opts: PromptOptions) {
    promptTitle.value = opts.title
    promptMessage.value = opts.message ?? ''
    promptPlaceholder.value = opts.placeholder ?? ''
    promptValue.value = opts.initialValue ?? ''
    promptConfirmText.value = opts.confirmText ?? 'OK'
    promptCancelText.value = opts.cancelText ?? 'Cancel'
    onPromptConfirmCb = opts.onConfirm
    promptOpen.value = true
  }
  function confirmPrompt() {
    const v = promptValue.value.trim()
    if (!v) return // 空值直接挡住、不关弹窗——调用方不需要自己再校验"不能为空"
    promptOpen.value = false
    const cb = onPromptConfirmCb
    onPromptConfirmCb = null
    cb?.(v)
  }
  function cancelPrompt() {
    promptOpen.value = false
    onPromptConfirmCb = null
  }

  return {
    open, title, message, confirmText, cancelText, danger, ask, confirm, cancel,
    promptOpen, promptTitle, promptMessage, promptPlaceholder, promptValue,
    promptConfirmText, promptCancelText, askInput, confirmPrompt, cancelPrompt,
  }
})
