import { deepEqual } from "node:assert/strict";
import { extractClipboardImageFiles } from "../src/lib/clipboard-images.js";

class FakeFile {
  name: string;
  type: string;
  size: number;

  constructor(name: string, type: string, size = 1) {
    this.name = name;
    this.type = type;
    this.size = size;
  }
}

function fakeItem(
  type: string,
  file: FakeFile | null,
  kind = "file"
): {
  kind: string;
  type: string;
  getAsFile: () => File | null;
} {
  return {
    kind,
    type,
    getAsFile: () => file as File | null,
  };
}

const imageA = new FakeFile("a.png", "image/png", 12);
const imageB = new FakeFile("b.webp", "image/webp", 18);

deepEqual(
  extractClipboardImageFiles([
    fakeItem("image/png", imageA),
    fakeItem("text/plain", null, "string"),
    fakeItem("image/webp", imageB),
  ]),
  [imageA, imageB] as unknown as File[]
);

deepEqual(
  extractClipboardImageFiles([
    fakeItem("text/plain", null, "string"),
    fakeItem("image/jpeg", null),
  ]),
  []
);
