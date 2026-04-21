<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export interface SearchableSelectOption {
  value: string
  label: string
  sublabel?: string
}

interface Props {
  modelValue: string | null
  options: SearchableSelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  allowClear?: boolean
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Seçin...',
  searchPlaceholder: 'Ara...',
  emptyText: 'Sonuç bulunamadı.',
  allowClear: true,
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const isOpen = ref(false)
const searchQuery = ref('')
const highlightedIndex = ref(-1)
const rootRef = ref<HTMLDivElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const listboxId = `ssel-listbox-${Math.random().toString(36).slice(2, 10)}`

const selectedOption = computed<SearchableSelectOption | null>(() => {
  if (props.modelValue === null) {
    return null
  }
  return props.options.find((opt) => opt.value === props.modelValue) ?? null
})

const filteredOptions = computed<SearchableSelectOption[]>(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (query.length === 0) {
    return props.options
  }
  return props.options.filter((opt) => {
    const haystack = `${opt.label} ${opt.sublabel ?? ''}`.toLowerCase()
    return haystack.includes(query)
  })
})

function openDropdown(): void {
  if (props.disabled || isOpen.value) {
    return
  }
  isOpen.value = true
  searchQuery.value = ''
  const currentIndex = filteredOptions.value.findIndex(
    (opt) => opt.value === props.modelValue,
  )
  highlightedIndex.value = currentIndex >= 0 ? currentIndex : 0
  void nextTick(() => {
    searchInputRef.value?.focus()
  })
}

function closeDropdown(): void {
  isOpen.value = false
  searchQuery.value = ''
  highlightedIndex.value = -1
}

function toggleDropdown(): void {
  if (isOpen.value) {
    closeDropdown()
  } else {
    openDropdown()
  }
}

function selectOption(option: SearchableSelectOption): void {
  emit('update:modelValue', option.value)
  closeDropdown()
}

function clearSelection(event: MouseEvent): void {
  event.stopPropagation()
  emit('update:modelValue', null)
}

function moveHighlight(offset: number): void {
  const total = filteredOptions.value.length
  if (total === 0) {
    highlightedIndex.value = -1
    return
  }
  const next = (highlightedIndex.value + offset + total) % total
  highlightedIndex.value = next
  void nextTick(() => {
    const list = rootRef.value?.querySelector(`#${listboxId}`)
    const active = list?.querySelector(
      `[data-index="${highlightedIndex.value}"]`,
    ) as HTMLElement | null
    active?.scrollIntoView({ block: 'nearest' })
  })
}

function onSearchKeydown(event: KeyboardEvent): void {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      moveHighlight(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      moveHighlight(-1)
      break
    case 'Enter': {
      event.preventDefault()
      const option = filteredOptions.value[highlightedIndex.value]
      if (option) {
        selectOption(option)
      }
      break
    }
    case 'Escape':
      event.preventDefault()
      closeDropdown()
      break
    default:
      break
  }
}

function onDocumentClick(event: MouseEvent): void {
  if (!rootRef.value) {
    return
  }
  const target = event.target as Node | null
  if (target && !rootRef.value.contains(target)) {
    closeDropdown()
  }
}

watch(searchQuery, () => {
  highlightedIndex.value = filteredOptions.value.length > 0 ? 0 : -1
})

onMounted(() => {
  document.addEventListener('mousedown', onDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentClick)
})
</script>

<template>
  <div ref="rootRef" class="relative w-full">
    <button
      type="button"
      :disabled="disabled"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      class="flex w-full items-center justify-between gap-2 rounded-md border bg-white px-3 py-2 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
      :class="[
        disabled
          ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
          : isOpen
          ? 'border-indigo-500 text-slate-900'
          : 'border-slate-300 text-slate-900 hover:border-slate-400',
      ]"
      @click="toggleDropdown"
    >
      <span
        v-if="selectedOption"
        class="flex min-w-0 flex-1 items-baseline gap-1.5 truncate"
      >
        <span class="truncate text-sm font-medium text-slate-900">
          {{ selectedOption.label }}
        </span>
        <span
          v-if="selectedOption.sublabel"
          class="truncate text-xs text-slate-500"
        >
          {{ selectedOption.sublabel }}
        </span>
      </span>
      <span v-else class="truncate text-sm text-slate-400">{{ placeholder }}</span>

      <span class="flex shrink-0 items-center gap-1">
        <button
          v-if="allowClear && selectedOption && !disabled"
          type="button"
          aria-label="Seçimi temizle"
          class="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          @click="clearSelection"
        >
          <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <svg
          class="h-4 w-4 text-slate-400 transition-transform"
          :class="isOpen ? 'rotate-180' : ''"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </span>
    </button>

    <div
      v-if="isOpen"
      class="absolute left-0 right-0 z-20 mt-1 rounded-md border border-slate-200 bg-white shadow-lg"
    >
      <div class="border-b border-slate-100 p-2">
        <div class="relative">
          <svg
            class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            :placeholder="searchPlaceholder"
            class="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            @keydown="onSearchKeydown"
          >
        </div>
      </div>

      <ul
        :id="listboxId"
        role="listbox"
        class="max-h-60 overflow-auto py-1"
      >
        <li
          v-if="filteredOptions.length === 0"
          class="px-3 py-4 text-center text-xs text-slate-500"
        >
          {{ emptyText }}
        </li>
        <li
          v-for="(option, index) in filteredOptions"
          :key="option.value"
          :data-index="index"
          role="option"
          :aria-selected="option.value === modelValue"
          class="cursor-pointer px-3 py-2 text-sm transition-colors"
          :class="[
            option.value === modelValue
              ? 'bg-indigo-50 text-indigo-700'
              : index === highlightedIndex
              ? 'bg-slate-100 text-slate-900'
              : 'text-slate-700 hover:bg-slate-50',
          ]"
          @mouseenter="highlightedIndex = index"
          @click="selectOption(option)"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{{ option.label }}</p>
              <p
                v-if="option.sublabel"
                class="truncate text-xs text-slate-500"
              >
                {{ option.sublabel }}
              </p>
            </div>
            <svg
              v-if="option.value === modelValue"
              class="h-4 w-4 shrink-0 text-indigo-600"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
