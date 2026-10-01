import { markFailedItem } from "./session-state";
import { runOneGeneration } from "./session-generation";
import type { SequenceOptions } from "./session-types";

export async function runAvatarStorefrontPosterFlow(
  options: SequenceOptions
): Promise<void> {
  const {
    sourceImages,
    setters,
    shopName,
    platform,
    currentPlatform,
    avatar,
    storefront,
    avatarMode,
    avatarCategory,
    generationLine,
    onToast,
  } = options;

  const avatarResult = await runOneGeneration({
    kind: "avatar",
    sourceImages,
    setters,
    shopName,
    platform,
    currentPlatform,
    avatar,
    storefront,
    avatarMode,
    avatarCategory,
    generationLine,
    onToast,
  });
  if (!avatarResult) {
    markFailedItem("storefront", "头像生成失败，店招未生成", setters);
    markFailedItem("poster", "头像生成失败，海报未生成", setters);
    return;
  }

  const storefrontResult = await runOneGeneration({
    kind: "storefront",
    sourceImages,
    setters,
    shopName,
    platform,
    currentPlatform,
    avatar,
    storefront,
    avatarMode,
    avatarCategory,
    generationLine,
    onToast,
  });
  if (!storefrontResult) {
    markFailedItem("poster", "店招生成失败，海报未生成", setters);
    return;
  }

  await runOneGeneration({
    kind: "poster",
    sourceImages,
    setters,
    shopName,
    platform,
    currentPlatform,
    avatar,
    storefront,
    avatarMode,
    avatarCategory,
    generationLine,
    onToast,
  });
}
