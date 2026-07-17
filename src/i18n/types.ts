// LocaleKey is derived from zh-CN.ts (the "reference" table) further down in index.ts via
// `keyof typeof zhCN` — this file only holds the plain value-table shape so locale files can
// import it without a circular dependency on index.ts (which imports the locale files).
export type LocaleTable = Record<string, string>
