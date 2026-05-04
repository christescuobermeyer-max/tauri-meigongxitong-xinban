export interface PSignboardGenerateInput {
  imageCount: number;
  originalText: string;
  newText: string;
  busy: boolean;
}

export function canGeneratePSignboard(input: PSignboardGenerateInput): boolean {
  return (
    input.imageCount === 1 &&
    input.originalText.trim().length > 0 &&
    input.newText.trim().length > 0 &&
    !input.busy
  );
}

export function getPSignboardShopName(shopName: string): string {
  return shopName.trim() || "P门头";
}
