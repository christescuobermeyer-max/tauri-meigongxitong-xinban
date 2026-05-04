# **GPT-Image-2 API 调用说明**

## **基本信息**

| **项目** | **值**                                   |
| -------- | ---------------------------------------- |
| 模型名称 | `gpt-image-2-all`                        |
| API 地址 | `https://api3.wlai.vip/v1/images/generations` |
| 认证方式 | Bearer Token                             |
| 超时时间 | 450秒                                    |

## **环境变量配置**

项目运行时从 `.env.local`、`.env` 或系统环境变量读取密钥。不要把真实密钥写入源码或提交到仓库。

```env
IMAGE_2_API_KEY=替换为 image-2 API 密钥
NEW_PICTURE_WALL_IMAGE2_API_KEY=兼容旧命名，可与上面二选一
ALI_OSS_REGION=oss-cn-hangzhou
ALI_OSS_ACCESS_KEY_ID=替换为阿里云 OSS AccessKey ID
ALI_OSS_ACCESS_KEY_SECRET=替换为阿里云 OSS AccessKey Secret
ALI_OSS_BUCKET=替换为 OSS Bucket 名称
```

## **请求格式**

```
POST <https://api3.wlai.vip/v1/images/generations>
Authorization: Bearer {API_KEY}
Content-Type: application/json
{
  "model": "gpt-image-2-all",
  "prompt": "根据上传的菜品图，设计一张精美的菜品宣传海报，突出食物的色泽与质感，画面精致好看，左上角标注品牌名\\"{店铺名称}\\"。",
  "size": "1024x1536",
  "n": 1,
  "image": ["{base64纯数据，不含data:前缀}"]
}
```

## **支持的图片尺寸**

- `1024x1024`（正方形）
- `1024x1536`（竖版，默认）
- `1536x1024`（横版）

## **代码调用位置**

| **文件**                                         | **说明**                         |
| ------------------------------------------------ | -------------------------------- |
| `src-tauri/src/api.rs`                           | GPT-Image-2 API 客户端实现       |
| `src-tauri/src/env_config.rs`                    | 运行时环境变量读取               |

## **Prompt 说明**

- **image2 专用 prompt**：`根据上传的菜品图，设计一张精美的菜品宣传海报，突出食物的色泽与质感，画面精致好看，左上角标注品牌名"{shopName}"。`
- **图片墙 prompt**：外卖店铺广告海报 KV 风格，传入店铺名、产品名和产品图 OSS URL。

## **注意事项**

1. image 字段传纯 base64，不含 `data:image/jpeg;base64,` 前缀
