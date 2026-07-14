<template>
  <div v-if="script" class="pm-rx-form">
    <label class="pm-rx-check"><input type="checkbox" v-model="enabled" /> 启用</label>

    <label class="pm-rx-label">查找正则表达式</label>
    <input class="pm-rx-input pm-rx-mono" :class="{ invalid: !findValid }" v-model="script.findRegex" placeholder="/pattern/flags" />
    <p v-if="!findValid" class="pm-rx-err">正则语法无效</p>

    <label class="pm-rx-label">脚本名称</label>
    <input class="pm-rx-input" v-model="script.scriptName" placeholder="给这条正则起个名字" />

    <label class="pm-rx-label">作用范围</label>
    <div class="pm-row pm-rx-checks">
      <label v-for="opt in PLACEMENT_OPTIONS" :key="opt.value" class="pm-rx-check">
        <input type="checkbox" :checked="script.placement.includes(opt.value)" @change="togglePlacement(opt.value)" />
        {{ opt.label }}
      </label>
    </div>

    <label class="pm-rx-label">表层替换</label>
    <div class="pm-rx-surface">
      <button class="pm-btn sm" :class="{ active: script.markdownOnly && !script.promptOnly }" @click="setSurfaceMode('display')">仅影响显示</button>
      <button class="pm-btn sm" :class="{ active: script.promptOnly && !script.markdownOnly }" @click="setSurfaceMode('prompt')">仅影响后端提示词</button>
      <button class="pm-btn sm" :class="{ active: script.markdownOnly && script.promptOnly }" @click="setSurfaceMode('both')">两者都影响</button>
    </div>

    <button class="pm-btn pm-rx-advanced-toggle" @click="advancedOpen = !advancedOpen">{{ advancedOpen ? '▾' : '▸' }} 高级选项</button>
    <div v-if="advancedOpen" class="pm-rx-advanced">
      <label class="pm-rx-label" style="margin:0">修剪掉（每行一条）</label>
      <textarea class="pm-rx-textarea" rows="3" v-model="trimStringsText"></textarea>
      <label class="pm-rx-check"><input type="checkbox" v-model="script.runOnEdit" /> 在编辑时运行</label>
      <label class="pm-rx-label" style="margin:0">正则表达式查找的宏</label>
      <select class="pm-select-wide" v-model.number="script.substituteRegex">
        <option v-for="o in SUBSTITUTE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <div class="pm-row">
        <label class="pm-rx-label" style="margin:0">最小深度</label>
        <input class="pm-rx-input pm-rx-num" type="number" v-model.number="minDepthModel" placeholder="无限" />
        <label class="pm-rx-label" style="margin:0">最大深度</label>
        <input class="pm-rx-input pm-rx-num" type="number" v-model.number="maxDepthModel" placeholder="无限" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useStore } from '../../store'
import { useTabsStore } from '../../tabsStore'
import { REGEX_PLACEMENT_OPTIONS as PLACEMENT_OPTIONS, REGEX_SUBSTITUTE_OPTIONS as SUBSTITUTE_OPTIONS } from '../../types'
import { parseFindRegex } from '../../regexEngine'

const store = useStore()
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
// 名字改了，同步一下已开标签的显示文字，不然标签栏上的名字和这里改完的对不上
watch(() => script.value?.scriptName, (name) => {
  if (script.value && name !== undefined) tabsStore.open({ domain: 'regex', key: script.value.id, label: name || '(未命名)' })
})
</script>
