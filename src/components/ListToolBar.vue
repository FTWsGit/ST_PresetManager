<template>
  <div class="pm-cp-toolbar">
    <slot />
    <span class="pm-spacer"></span>
    <span class="pm-muted">{{ count }} 条</span>
  </div>
</template>
<script setup lang="ts">
defineProps<{ count: number }>()
</script>
