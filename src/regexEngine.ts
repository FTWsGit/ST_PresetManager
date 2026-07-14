import type { RegexScript } from './types'

/** 解析 ST 的 `/pattern/flags` 字符串格式。不带定界符的裸 pattern 也兼容（容错，不确定所有历史
 *  脚本都严格带 `//`）。强制带上 `g`——预览是"整段文本找全部匹配"，不是只找第一个。
 *  解析失败返回 null 而不是抛错，方便调用方直接显示"正则无效"而不是崩预览。 */
export function parseFindRegex(raw: string): RegExp | null {
  if (!raw) return null
  const m = raw.match(/^\/([\s\S]*)\/([a-zA-Z]*)$/)
  const pattern = m ? m[1] : raw
  const flags = m ? m[2] : ''
  try {
    return new RegExp(pattern, flags.includes('g') ? flags : flags + 'g')
  } catch {
    return null
  }
}

/**  */
export function applyRegexScript(text: string, script: RegexScript): string {
  const re = parseFindRegex(script.findRegex)
  if (!re) return text
  return text.replace(re, (...args: any[]) => {
    let a = args
    if (typeof a[a.length - 1] === 'object') a = a.slice(0, -1) // 有命名捕获组时最后一个参数是个对象，先摘掉
    const match: string = a[0]
    const groups = a.slice(1, -2) // 去掉末尾的 offset、完整字符串，剩下的是数字捕获组
    let trimmed = match
    for (const t of script.trimStrings || []) {
      if (t) trimmed = trimmed.split(t).join('')
    }
    const trimmedGroups = groups.map(group => {
      let trimmedGroup = group
      for (const t of script.trimStrings || []) {
        if (t) trimmedGroup = trimmedGroup.split(t).join('')
      }
      return trimmedGroup
    })
    let out = script.replaceString ?? ''
    out = out.replace(/\{\{match\}\}/g, () => trimmed)
    out = out.replace(/\$(\d+)/g, (_m: string, num: string) => {
      const g = trimmedGroups[parseInt(num, 10) - 1]
      return g == null ? '' : String(g)
    })
    console.debug("out: " + out)
    return out
  })
}
