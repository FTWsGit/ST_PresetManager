<!-- Renamed from ListToolBar.vue (filename casing now matches the <ListToolbar> tag it's used
     as everywhere — the old "ListToolBar.vue" / "<ListToolbar>" mismatch was harmless in practice
     (Vue/bundler component resolution is case-insensitive-ish for this), but confusing to grep
     for. No behavior change. -->
<template>
  <div class="pm-cp-toolbar">
    <slot />
    <span class="pm-spacer"></span>
    <span class="pm-muted">{{ store.t('shared.listToolbar.count', { count }) }}</span>
  </div>
</template>
<script setup lang="ts">
import { usePresetStore } from '../../stores/presetStore'
defineProps<{ count: number }>()
const store = usePresetStore()
</script>
