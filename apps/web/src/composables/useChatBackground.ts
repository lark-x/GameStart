import { ref } from "vue";
import { useAppStore } from "../stores/app";
import { useTheme, createChatBackgroundItem, importChatBackgroundFile, MAX_CHAT_BACKGROUND_ITEMS } from "../lib/theme";

export function useChatBackground() {
  const store = useAppStore();
  const { chatBackground, setChatBackground } = useTheme();
  const backgroundStatus = ref("");
  const backgroundPickerOpen = ref(false);

  function pickBackgroundImage(backgroundInput: HTMLInputElement | null): void {
    if (chatBackground.items.length >= MAX_CHAT_BACKGROUND_ITEMS) {
      backgroundStatus.value = `最多保存 ${MAX_CHAT_BACKGROUND_ITEMS} 个聊天背景，请先删除旧背景`;
      return;
    }
    backgroundInput?.click();
  }

  async function onBackgroundFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (chatBackground.items.length >= MAX_CHAT_BACKGROUND_ITEMS) {
      backgroundStatus.value = `最多保存 ${MAX_CHAT_BACKGROUND_ITEMS} 个聊天背景，请先删除旧背景`;
      return;
    }
    backgroundStatus.value = "正在导入背景…";
    try {
      const imageRef = await importChatBackgroundFile(file);
      const item = createChatBackgroundItem(file.name, imageRef);
      setChatBackground({
        ...chatBackground,
        kind: "custom",
        imageRef,
        items: [...chatBackground.items, item],
      });
      backgroundStatus.value = "背景已添加";
    } catch (e: unknown) {
      backgroundStatus.value = e instanceof Error ? e.message : "导入失败";
    }
  }

  function selectBackgroundItem(imageRef: string): void {
    setChatBackground({ ...chatBackground, kind: "custom", imageRef });
    backgroundStatus.value = "已切换背景";
  }

  function removeBackgroundItem(id: string): void {
    const remaining = chatBackground.items.filter((item) => item.id !== id);
    if (remaining.length === 0) {
      setChatBackground({ ...chatBackground, kind: "theme", items: [] });
    } else {
      setChatBackground({ ...chatBackground, items: remaining });
    }
    backgroundStatus.value = "已删除背景";
  }

  function toggleBackgroundPicker(): void {
    backgroundPickerOpen.value = !backgroundPickerOpen.value;
  }

  function cleanup(): void {
    backgroundPickerOpen.value = false;
    backgroundStatus.value = "";
  }

  return {
    chatBackground,
    backgroundStatus,
    backgroundPickerOpen,
    pickBackgroundImage,
    onBackgroundFileChange,
    selectBackgroundItem,
    removeBackgroundItem,
    toggleBackgroundPicker,
    cleanup,
  };
}
