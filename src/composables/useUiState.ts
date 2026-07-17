import { ref, computed } from 'vue'
import type { Settings } from '../types'
import { DEFAULT_SETTINGS, FONT_OPTIONS } from '../types'
import { useI18n } from './useI18n'

/**
 * Editor settings (font/colors/panel widths) + the toast notification, both currently only used
 * by the preset editor but neither one is actually preset-specific — a future characterStore or
 * worldbookStore will want the exact same "show a toast" / "persisted UI settings" behavior.
 *
 * Pulled out of store.ts as a composable rather than a second live Pinia store for now: turning
 * this into `useUiStore()` would mean every `store.showToast(...)` call site across every .vue
 * component (there are dozens) becomes `uiStore.showToast(...)`, which is real churn for no
 * runtime benefit until there's a second store that actually needs to share it. This composable
 * gets the code organized and ready for that move — store.ts just spreads its return value into
 * its own setup-store scope, so every existing `store.xxx` call site is unaffected. When
 * characterStore/worldbookStore exist, swapping this to a real shared Pinia store is a
 * search-and-replace on `useUiState()` -> `useUiStore()`, not a redesign.
 */
export function useUiState() {
  const settings = ref<Settings>(loadSettings())

  const cssVars = computed(() => {
    const fm = FONT_OPTIONS.find(f => f.name === settings.value.editorFontFamily)
    return {
      '--pm-fs': settings.value.editorFontSize + 'px',
      '--pm-ff': fm ? fm.value : FONT_OPTIONS[0].value,
      ...Object.fromEntries(Object.entries(settings.value.syntaxColors).map(([k, v]) => ['--' + k, v])),
    }
  })

  function loadSettings(): Settings {
    try {
      const s = localStorage.getItem('st-pm-settings')
      if (s) {
        const p = JSON.parse(s)
        return {
          ...DEFAULT_SETTINGS, ...p,
          syntaxColors: { ...DEFAULT_SETTINGS.syntaxColors, ...(p.syntaxColors || {}) },
        }
      }
    } catch {}
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
  }
  function saveSettings() { localStorage.setItem('st-pm-settings', JSON.stringify(settings.value)) }

  // useI18n reads off the same `settings` ref this composable owns — language is just another
  // Settings field, persisted through the loadSettings/saveSettings path above, not a second
  // store.
  const { t, currentLocale } = useI18n(settings)

  function resetSettings() {
    settings.value = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
    saveSettings()
    showToast(t('shared.toast.settingsReset'))
  }

  const toastMsg = ref('')
  const toastVisible = ref(false)
  let toastTimer: ReturnType<typeof setTimeout>
  function showToast(msg: string, ms = 2500) {
    toastMsg.value = msg
    toastVisible.value = true
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toastVisible.value = false }, ms)
  }

  return { settings, cssVars, loadSettings, saveSettings, resetSettings, toastMsg, toastVisible, showToast, t, currentLocale }
}
