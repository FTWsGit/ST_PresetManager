<template>
  <div v-if="store.currentBlock" class="pm-rx-form">
    <label class="pm-rx-label" style="margin-top:0">{{ store.t('block.settings.name') }}</label>
    <input class="pm-rx-input" type="text" :value="store.currentBlock.name" @input="onNameInput" :placeholder="store.t('block.settings.namePlaceholder')" />

    <label class="pm-rx-label">{{ store.t('block.settings.role') }}</label>
    <select class="pm-rx-input" :value="store.currentBlock.role" @change="onRoleChange">
      <option value="system">system</option>
      <option value="user">user</option>
      <option value="assistant">assistant</option>
    </select>

    <p v-if="store.currentBlock.marker" class="pm-muted" style="font-size:12px;margin-top:10px">
      {{ store.t('block.settings.markerHint', { id: store.currentBlock.identifier }) }}
    </p>
  </div>
  <p v-else class="pm-empty-note">{{ store.t('block.settings.empty') }}</p>
</template>

<script setup lang="ts">
// 对称于 RegexSettingsForm.vue：block 域的设置表单。store.currentBlock 是指向 prompts 数组里
// 对应元素的活引用（见 presetStore.ts 的 currentBlock computed），直接改它的字段就会同步进
// prompts/dirty 追踪，不需要像 HighlightedEditor 那样维护本地 ref 做防抖/高亮批处理——
// name/role 不是高频输入的热路径，没有那个必要。
import { usePresetStore } from '../../stores/presetStore'

const store = usePresetStore()

function onNameInput(e: Event) {
  if (store.currentBlock) store.currentBlock.name = (e.target as HTMLInputElement).value
}
function onRoleChange(e: Event) {
  if (store.currentBlock) store.currentBlock.role = (e.target as HTMLSelectElement).value as any
}
</script>
