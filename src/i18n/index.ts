import zhCN from './locales/zh-CN'
import en from './locales/en'

// zh-CN.ts is the reference table — every other locale is typed against its key set (see
// en.ts's `satisfies Record<keyof typeof zhCN, string>`), so LocaleKey derived here matches
// what en.ts is actually allowed to contain. Add new keys in zh-CN.ts first.
export type LocaleKey = keyof typeof zhCN

export const locales: Record<'zh-CN' | 'en', Record<LocaleKey, string>> = {
  'zh-CN': zhCN,
  'en': en,
}
