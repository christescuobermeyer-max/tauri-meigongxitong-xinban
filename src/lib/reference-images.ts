export function selectAvatarReferenceImages(images: string[]): string[] {
  return images.length > 0 ? [images[0]] : [];
}

export function selectProductUploadReferenceImages(
  images: Array<{ productOssUrl?: string; productBase64?: string; base64?: string }>
): string[] {
  if (images.length === 0) return [];
  const first = images[0].productOssUrl || images[0].productBase64 || images[0].base64;
  return first ? [first] : [];
}

export function selectStorefrontReferenceImages(item: {
  remoteUrl?: string;
  rawBase64: string | null;
}): string[] | null {
  if (item.remoteUrl) return [item.remoteUrl];
  if (item.rawBase64) return [item.rawBase64];
  return null;
}

export function selectPosterReferenceImages(item: {
  remoteUrl?: string;
  rawBase64: string | null;
}): string[] | null {
  if (item.remoteUrl) return [item.remoteUrl];
  return null;
}
