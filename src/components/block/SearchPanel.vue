<template>
  <div class="pm-search">
    <div class="pm-search-bar">
      <input type="text" v-model="store.searchQuery" @input="store.doSearch()" placeholder="Search all blocks..." @keydown.enter.prevent="store.navSearch($event.shiftKey ? -1 : 1)">
      <input type="text" v-model="store.searchReplace" placeholder="Replace..." class="pm-repl-input" @keydown.enter.prevent="store.replaceCurrent()">
      <button class="pm-btn" @click="store.navSearch(-1)">◀</button>
      <button class="pm-btn" @click="store.navSearch(1)">▶</button>
      <button class="pm-btn" @click="store.replaceCurrent()">Replace</button>
      <button class="pm-btn" @click="store.replaceAll()">All</button>
      <span class="pm-search-count">{{ store.searchResults.length }} results</span>
    </div>
    <div class="pm-search-results" v-if="store.searchResults.length">
      <div v-for="(r, i) in displayResults" :key="i"
           class="pm-sr-item" :class="{ active: i === store.searchIdx }"
           @click="jumpTo(i)">
        <span class="pm-sr-block">{{ r.blockName }}</span>
        <span class="pm-sr-line">L{{ r.line + 1 }}</span>
        <span class="pm-sr-ctx" v-html="renderCtx(r)"></span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePresetStore } from '../../stores/presetStore'
import { esc } from '../../utils'
import { SEARCH_MAX } from '../../types'
import type { SearchResult } from '../../types'

const store = usePresetStore()
const displayResults = computed(() => store.searchResults.slice(0, SEARCH_MAX))

function renderCtx(r: SearchResult) {
  const b = esc(r.context.substring(0, r.ms)), m = esc(r.context.substring(r.ms, r.ms + r.ml)), a = esc(r.context.substring(r.ms + r.ml))
  return b + '<em>' + m + '</em>' + a
}
function jumpTo(i: number) {
  store.jumpToSearchResult(i)
}
</script>
