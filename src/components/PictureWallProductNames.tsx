import type { UploadedImage } from "../types";

export default function PictureWallProductNames({ images }: { images: UploadedImage[] }) {
  if (images.length === 0) {
    return <span className="field__hint">上传产品图后会按文件名自动提取产品名称，并写入对应图片墙生成任务。</span>;
  }

  return (
    <div className="picture-wall-product-names">
      <span className="picture-wall-product-names__title">已识别产品名称</span>
      <div className="picture-wall-product-names__list">
        {images.map((image, index) => (
          <span className="picture-wall-product-chip" key={image.id} title={image.name}>
            第 {index + 1} 张：{image.productName || "未识别产品名称"}
          </span>
        ))}
      </div>
    </div>
  );
}
