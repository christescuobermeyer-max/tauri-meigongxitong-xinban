import { equal, ok } from "node:assert/strict";
import {
  buildAvatarPrompt,
  buildAvatarCategoryPrompt,
  buildPosterPrompt,
  buildProductPrompt,
  buildStorefrontPrompt,
} from "../src/lib/prompts.js";

const avatarPrompt = buildAvatarPrompt("鲜椒鸡排");
ok(avatarPrompt.includes("上传的产品图"));
ok(avatarPrompt.includes("醒目且极具冲击力"));
ok(avatarPrompt.includes("广告电商头像logo图"));
ok(avatarPrompt.includes("极具戏剧性的商业食品摄影风格"));
ok(avatarPrompt.includes("商业海报式的构图"));
ok(avatarPrompt.includes("高端诱人的快餐广告美学"));
ok(avatarPrompt.includes("1:1正方形构图"));
ok(avatarPrompt.includes("不要圆形边框"));
ok(avatarPrompt.includes("不要圆形徽章"));
ok(avatarPrompt.includes("不要圆形裁切"));
ok(avatarPrompt.includes("内容需覆盖全部页面"));
equal(avatarPrompt.includes("必须保留上传产品图的主体造型、核心食材和颜色特征"), false);
equal(avatarPrompt.includes("主体造型"), false);
equal(avatarPrompt.includes("颜色特征"), false);
equal(avatarPrompt.includes("外卖头像logo图"), false);
equal(avatarPrompt.includes("精美好看有视觉冲击力有吸引力"), false);
equal(avatarPrompt.includes("把logo字样移除掉"), false);
equal(avatarPrompt.includes("不要额外添加logo文字"), false);

const avatarCategoryPrompt = buildAvatarCategoryPrompt("鲜椒鸡排", "炸货");
ok(avatarCategoryPrompt.includes("店铺经营品类：炸货"));
ok(avatarCategoryPrompt.includes("醒目且极具冲击力"));
ok(avatarCategoryPrompt.includes("广告电商头像logo图"));
ok(avatarCategoryPrompt.includes("极具戏剧性的商业食品摄影风格"));
ok(avatarCategoryPrompt.includes("1:1正方形构图"));
equal(avatarCategoryPrompt.includes("上传的产品图"), false);

const storefrontPrompt = buildStorefrontPrompt("鲜椒鸡排");
ok(storefrontPrompt.includes("醒目且极具冲击力"));
ok(storefrontPrompt.includes("16:9横版店招宣传图"));
ok(storefrontPrompt.includes("极具戏剧性的商业食品摄影风格"));
ok(storefrontPrompt.includes("商业海报式的构图"));
ok(storefrontPrompt.includes("高端诱人的快餐广告美学"));
ok(storefrontPrompt.includes("不要加入促销价格"));
ok(storefrontPrompt.includes("满减信息"));
ok(storefrontPrompt.includes("二维码"));
ok(storefrontPrompt.includes("地址"));
ok(storefrontPrompt.includes("电话"));
ok(storefrontPrompt.includes("联系方式"));
equal(storefrontPrompt.includes("店招宣传图"), true);
equal(storefrontPrompt.includes("不要写入促销文案"), false);
equal(storefrontPrompt.includes("偏年轻"), false);
equal(storefrontPrompt.includes("清爽"), false);
equal(storefrontPrompt.includes("带点情绪感"), false);
equal(storefrontPrompt.includes("产品宣传KV图"), false);
equal(storefrontPrompt.includes("精美好看的宣传海报图"), false);
equal(storefrontPrompt.includes("横版宣传海报"), false);
equal(storefrontPrompt.includes("只延续头像的整体主题色、视觉风格和画面氛围"), false);

const posterPrompt = buildPosterPrompt("鲜椒鸡排");
ok(posterPrompt.includes("请参考已生成的头像宣传图"));
ok(posterPrompt.includes("醒目且极具冲击力"));
ok(posterPrompt.includes("21:9横版广告电商海报图"));
ok(posterPrompt.includes("极具戏剧性的商业食品摄影风格"));
ok(posterPrompt.includes("商业海报式的构图"));
ok(posterPrompt.includes("高端诱人的快餐广告美学"));
ok(posterPrompt.includes("不要加入促销价格"));
ok(posterPrompt.includes("满减信息"));
ok(posterPrompt.includes("二维码"));
ok(posterPrompt.includes("地址"));
ok(posterPrompt.includes("电话"));
ok(posterPrompt.includes("联系方式"));
equal(posterPrompt.includes("广告电商海报图"), true);
equal(posterPrompt.includes("请参考已生成的店招宣传图"), false);
equal(posterPrompt.includes("横版宣传海报"), false);
equal(posterPrompt.includes("整体风格与店招保持一致"), false);
equal(posterPrompt.includes("重新排版设计"), false);
equal(posterPrompt.includes("不一样内容的图"), false);

const meituanProductPrompt = buildProductPrompt("鲜椒鸡排", "招牌鸡排饭", "meituan");
ok(meituanProductPrompt.includes("请参考输入的店铺名"));
ok(meituanProductPrompt.includes("将上传的产品图中的主题背景重新设计"));
ok(meituanProductPrompt.includes("更加具有视觉冲击力和吸引力的背景图"));
ok(meituanProductPrompt.includes("并写入产品名称“招牌鸡排饭”在图中"));
equal(meituanProductPrompt.includes("一句简短有吸引力的产品卖点文案"), false);
equal(meituanProductPrompt.includes("不能空白无字"), false);
equal(meituanProductPrompt.includes("1536×1024横版构图"), false);

const taobaoProductPrompt = buildProductPrompt("鲜椒鸡排", "招牌鸡排饭", "taobao");
ok(taobaoProductPrompt.includes("产品名称“招牌鸡排饭”"));
