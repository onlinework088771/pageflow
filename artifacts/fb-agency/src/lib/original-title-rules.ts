export interface OriginalTitleItem {
  originalTitle: string | null;
  titleOverride?: string;
  captionOverride?: string;
  titleManuallyEdited: boolean;
  captionManuallyEdited: boolean;
}

export function resolveOriginalTitleForItem(
  item: OriginalTitleItem,
  fallbackTitle: string,
  useOriginalTitle: boolean,
): string {
  if (useOriginalTitle && item.titleManuallyEdited) return item.titleOverride?.trim() ?? "";
  if (useOriginalTitle && item.originalTitle) return item.originalTitle;
  return fallbackTitle;
}

export function resolveOriginalCaptionForItem(
  item: OriginalTitleItem,
  fallbackCaption: string,
  useOriginalTitle: boolean,
): string {
  if (useOriginalTitle && item.captionManuallyEdited) return item.captionOverride?.trim() ?? "";
  if (useOriginalTitle && item.originalTitle) return item.originalTitle;
  return fallbackCaption;
}
