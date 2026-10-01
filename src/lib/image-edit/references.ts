export function resolveImageEditReference(images: Array<{
  productOssUrl?: string;
  productBase64?: string;
  base64?: string;
}>) {
  const first = images[0];
  return resolveUploadedImageReference(first);
}

export function resolveImageEditSourceReferences(images: Array<{
  productOssUrl?: string;
  productBase64?: string;
  base64?: string;
}>) {
  return images.map(resolveUploadedImageReference).filter(Boolean);
}

export function resolveImageEditReferences(
  sourceImages: Array<{
    productOssUrl?: string;
    productBase64?: string;
    base64?: string;
  }>,
  referenceImages: Array<{
    productOssUrl?: string;
    productBase64?: string;
    base64?: string;
  }>,
  instruction = ""
) {
  const sourceReferences = resolveImageEditSourceReferences(sourceImages);
  const optionalReferences = referenceImages.map(resolveUploadedImageReference).filter(Boolean);
  if (shouldUseOptionalReferenceAsEditBase(instruction) && optionalReferences.length > 0) {
    return [...optionalReferences, ...sourceReferences];
  }
  return [...sourceReferences, ...optionalReferences];
}

export function shouldUseOptionalReferenceAsEditBase(instruction: string) {
  const text = instruction.trim().replace(/\s+/g, "");
  if (!text.includes("参考图")) return false;
  return (
    /(以|用|按照|保留)参考图(作为|为|的)?(底图|基础|画面|场景|构图|背景|容器|锅|盘|碗)/.test(text) ||
    /产品图.*(替换|放入|放进|放到|移入|移到|加入|合成到).*参考图/.test(text) ||
    /参考图.*(锅|盘|碗|容器|场景|画面|背景).*(替换|放入|放进|放到|移入|加入|放置)/.test(text)
  );
}

function resolveUploadedImageReference(image?: {
  productOssUrl?: string;
  productBase64?: string;
  base64?: string;
}) {
  return image?.productOssUrl || image?.productBase64 || image?.base64 || "";
}
