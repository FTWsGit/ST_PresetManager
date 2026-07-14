<template>
  <div class="pm-editor-panel pm-rce" v-if="script">
    <div class="pm-editor-meta pm-rce-meta">
      <span class="pm-rce-name">{{ script.scriptName || '(未命名)' }}</span>
      <span class="pm-spacer"></span>
      <button class="pm-btn sm" :class="{ active: mode === 'edit' }" @click="mode = 'edit'">✏️ 编辑</button>
      <button class="pm-btn sm" :class="{ active: mode === 'preview' }" @click="mode = 'preview'">👁 预览</button>
      <template v-if="mode === 'preview'">
        <button class="pm-btn sm" :class="{ active: !renderHtml }" @click="renderHtml = false">纯文本</button>
        <button class="pm-btn sm" :class="{ active: renderHtml }" @click="renderHtml = true">HTML</button>
      </template>
      <button class="pm-btn sm" :class="{ active: tabsStore.settingsDockOpen }" @click="tabsStore.toggleSettingsDock()" title="设置面板">⚙</button>
    </div>

    <div class="pm-rce-body">
      <textarea v-if="mode === 'edit'" class="pm-rce-replace"
                v-model="script.replaceString" spellcheck="false"
                placeholder="用 {{match}} 引用整个匹配，$1 / $2 引用捕获组"></textarea>
      <template v-else>
        <div v-if="!renderHtml" class="pm-rce-preview">{{ previewText }}</div>
        <div v-else class="pm-rce-preview" v-html="previewText"></div>
      </template>
    </div>

    <div class="pm-rce-testbar">
      <label class="pm-rx-label" style="margin:0">测试文本</label>
      <textarea class="pm-rce-testinput" rows="3" v-model="testInput" placeholder="粘贴一段消息文本，切到「预览」看效果…"></textarea>
      <p v-if="!findValid" class="pm-rx-err">查找正则语法无效，预览会原样返回输入文本</p>
      <p class="pm-muted" style="font-size:12px">预览只做本地查找/替换/修剪，不解析宏、不代表作用范围与深度限制。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useStore } from '../../store'
import { useTabsStore } from '../../tabsStore'
import { applyRegexScript, parseFindRegex } from '../../regexEngine'

const store = useStore()
const tabsStore = useTabsStore()
const mode = ref<'edit' | 'preview'>('edit')
const renderHtml = ref(false)
// 简化处理：测试文本这一版是单个共享 ref，切换正则标签不会各自记住各自的测试文本——
// 用起来发现真的需要"每条正则记自己的测试文本"再升级成 Record<id, string>，先别过度设计。
const testInput = ref('')

const script = computed(() => store.regexScripts.find(r => r.id === tabsStore.activeTab?.key) ?? null)
const findValid = computed(() => !script.value || !script.value.findRegex || !!parseFindRegex(script.value.findRegex))
const previewText = computed(() => {
  if (!script.value || !testInput.value) return ''
  try { return applyRegexScript(testInput.value, script.value) }
  catch (e: any) { return '(预览出错: ' + (e?.message || e) + ')' }
})
</script>
