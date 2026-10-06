"""为云端 yt-dlp 补充抖音详情接口要求的设备参数和 SecSDK 签名。"""

import hashlib
import time
from urllib.parse import quote, urlencode

from yt_dlp.extractor.tiktok import DouyinIE
from yt_dlp.utils import ExtractorError


def build_signed_query(video_id, uifid, timestamp=None):
    """按请求顺序编码参数，签名使用协议固定常量，不包含服务器密钥。"""
    timestamp = int(time.time()) if timestamp is None else timestamp
    query = urlencode({
        "aweme_id": video_id,
        "aid": "6383",
        "device_platform": "webapp",
        "uifid": uifid,
        "timestamp": timestamp,
    }, quote_via=quote, safe="!*'()")
    message = f"{uifid}_{timestamp}_A96D855A08C0A9707F8BEF0D9A527E4E_{query}"
    signature = hashlib.md5(message.encode("utf-8")).hexdigest()
    return f"{query}&x-secsdk-web-signature={signature}"


class _CsghDouyinIE(DouyinIE, plugin_name="csgh-argus"):
    """仅替换抖音详情请求，视频字段和格式仍由 yt-dlp 原解析器处理。"""

    def _real_extract(self, url):
        video_id = self._match_id(url)
        cookies = self._get_cookies(self._WEBPAGE_HOST)
        uifid = next((cookies[name].value for name in ("UIFID", "UIFID_TEMP")
                      if name in cookies and cookies[name].value), None)
        if not uifid:
            raise ExtractorError("云端抖音 Cookie 缺少 UIFID，请重新导出并更新 Cookie", expected=True)

        query = build_signed_query(video_id, uifid)
        try:
            response = self._download_json(
                f"https://www.douyin.com/aweme/v1/web/aweme/detail/?{query}",
                video_id,
                headers={"uifid": uifid, "Referer": self._WEBPAGE_HOST},
            )
        except ExtractorError:
            # 不将带设备凭据的签名 URL 拼入面向用户的错误信息。
            raise ExtractorError(
                "抖音接口拒绝请求或暂时不可用；若浏览器可播放，请联系管理员检查云端解析器",
                expected=True,
            ) from None

        detail = response.get("aweme_detail") if isinstance(response, dict) else None
        if not isinstance(detail, dict) or not detail.get("video"):
            raise ExtractorError("抖音未返回可下载视频，请确认作品仍可播放且不是图文作品", expected=True)
        return self._parse_aweme_video_app(detail)
