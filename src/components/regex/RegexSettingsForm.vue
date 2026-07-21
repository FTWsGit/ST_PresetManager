<template>
  <div v-if="script" class="pm-rx-form">
    <label class="pm-rx-check"><input type="checkbox" v-model="enabled" /> {{ store.t('regex.settings.enabled') }}</label>

    <label class="pm-rx-label">{{ store.t('regex.settings.findRegexLabel') }}</label>
    <input class="pm-rx-input pm-rx-mono" :class="{ invalid: !findValid }" v-model="script.findRegex" :placeholder="store.t('regex.settings.findRegexPlaceholder')" />
    <p v-if="!findValid" class="pm-rx-err">{{ store.t('regex.settings.findRegexInvalid') }}</p>

    <label class="pm-rx-label">{{ store.t('regex.settings.scriptNameLabel') }}</label>
    <input class="pm-rx-input" v-model="script.scriptName" :placeholder="store.t('regex.settings.scriptNamePlaceholder')" />

    <label class="pm-rx-label">{{ store.t('regex.settings.placementLabel') }}</label>
    <div class="pm-row pm-rx-checks">
      <label v-for="opt in PLACEMENT_OPTIONS" :key="opt.value" class="pm-rx-check">
        <input type="checkbox" :checked="script.placement.includes(opt.value)" @change="togglePlacement(opt.value)" />
        {{ store.t(opt.labelKey) }}
      </label>
    </div>

    <label class="pm-rx-label">{{ store.t('regex.settings.surfaceLabel') }}</label>
    <div class="pm-rx-surface">
      <button class="pm-btn sm" :class="{ active: script.markdownOnly && !script.promptOnly }" @click="setSurfaceMode('display')">{{ store.t('regex.settings.displayOnly') }}</button>
      <button class="pm-btn sm" :class="{ active: script.promptOnly && !script.markdownOnly }" @click="setSurfaceMode('prompt')">{{ store.t('regex.settings.promptOnly') }}</button>
      <button class="pm-btn sm" :class="{ active: script.markdownOnly && script.promptOnly }" @click="setSurfaceMode('both')">{{ store.t('regex.settings.both') }}</button>
    </div>

    <button class="pm-btn pm-rx-advanced-toggle" @click="advancedOpen = !advancedOpen">{{ advancedOpen ? '▾' : '▸' }} {{ store.t('regex.settings.advancedToggle') }}</button>
    <div v-if="advancedOpen" class="pm-rx-advanced">
      <label class="pm-rx-label" style="margin:0">{{ store.t('regex.settings.trimLabel') }}</label>
      <textarea class="pm-rx-textarea" rows="3" v-model="trimStringsText"></textarea>
      <label class="pm-rx-check"><input type="checkbox" v-model="script.runOnEdit" /> {{ store.t('regex.settings.runOnEdit') }}</label>
      <label class="pm-rx-label" style="margin:0">{{ store.t('regex.settings.substituteLabel') }}</label>
      <select class="pm-select-wide" v-model.number="script.substituteRegex">
        <option v-for="o in SUBSTITUTE_OPTIONS" :key="o.value" :value="o.value">{{ store.t(o.labelKey) }}</option>
      </select>
      <div class="pm-row">
        <label class="pm-rx-label" style="margin:0">{{ store.t('regex.settings.minDepth') }}</label>
        <input class="pm-rx-input pm-rx-num" type="number" v-model.number="minDepthModel" :placeholder="store.t('regex.settings.depthPlaceholder')" />
        <label class="pm-rx-label" style="margin:0">{{ store.t('regex.settings.maxDepth') }}</label>
        <input class="pm-rx-input pm-rx-num" type="number" v-model.number="maxDepthModel" :placeholder="store.t('regex.settings.depthPlaceholder')" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { usePresetStore } from '../../stores/presetStore'
import { useTabsStore } from '../../stores/tabsStore'
import { REGEX_PLACEMENT_OPTIONS as PLACEMENT_OPTIONS, REGEX_SUBSTITUTE_OPTIONS as SUBSTITUTE_OPTIONS } from '../../types'
import { parseFindRegex } from '../../regexEngine'

const store = usePresetStore()
const tabsStore = useTabsStore()
const advancedOpen = ref(false)

const script = computed(() => store.regexScripts.find(r => r.id === tabsStore.activeTab?.key) ?? null)
const findValid = computed(() => !script.value || !script.value.findRegex || !!parseFindRegex(script.value.findRegex))
const enabled = computed({
  get: () => !script.value?.disabled,
  set: (v: boolean) => { if (script.value) script.value.disabled = !v }
})
const trimStringsText = computed({
  get: () => (script.value?.trimStrings || []).join('\n'),
  set: (v: string) => { if (script.value) script.value.trimStrings = v.split('\n') }
})
const minDepthModel = computed({
  get: () => script.value?.minDepth ?? null,
  set: (v: any) => { if (script.value) script.value.minDepth = (v === null || v === '' || Number.isNaN(v)) ? null : v }
})
const maxDepthModel = computed({
  get: () => script.value?.maxDepth ?? null,
  set: (v: any) => { if (script.value) script.value.maxDepth = (v === null || v === '' || Number.isNaN(v)) ? null : v }
})
function togglePlacement(v: number) {
  if (!script.value) return
  const p = script.value.placement
  const i = p.indexOf(v)
  if (i >= 0) p.splice(i, 1); else p.push(v)
}
function setSurfaceMode(mode: 'display' | 'prompt' | 'both') {
  if (!script.value) return
  script.value.markdownOnly = mode === 'display' || mode === 'both'
  script.value.promptOnly = mode === 'prompt' || mode === 'both'
}
// 名字改了，同步一下已开标签的显示文字，不然标签栏上的名字和这里改完的对不上。用
// renameTab() 而不是 open()：这里逐字触发，open() 会顺带 requestListScroll()（侧边栏
// scrollIntoView smooth），每敲一个字都跑一次会跟输入渲染抢主线程，是可感知的卡顿——
// 见 PROJECT.md「已知问题」。renameTab() 只改标签文字，没有这个副作用。
watch(() => script.value?.scriptName, (name) => {
  if (script.value && name !== undefined) tabsStore.renameTab('regex', script.value.id, name || store.t('common.unnamed'))
})
</script>
