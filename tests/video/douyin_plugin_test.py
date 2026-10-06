"""离线验证抖音兼容插件，不读取真实 Cookie，也不请求网络。"""

import importlib.util
from http.cookies import SimpleCookie
from pathlib import Path
import sys
import types
import unittest
from urllib.parse import parse_qs, urlsplit


class ExtractorError(Exception):
    def __init__(self, message, expected=False):
        super().__init__(message)
        self.expected = expected


class DouyinIE:
    _WEBPAGE_HOST = "https://www.douyin.com/"

    def __init_subclass__(cls, plugin_name=None):
        cls.plugin_name = plugin_name

    def _match_id(self, url):
        return url.rsplit("/", 1)[-1]

    def _get_cookies(self, url):
        return self.cookies

    def _download_json(self, url, video_id, **kwargs):
        self.request = (url, kwargs)
        if isinstance(self.response, Exception):
            raise self.response
        return self.response

    def _parse_aweme_video_app(self, detail):
        return {"id": detail["aweme_id"], "url": detail["video"]["url"]}


for name in ("yt_dlp", "yt_dlp.extractor", "yt_dlp.extractor.tiktok", "yt_dlp.utils"):
    sys.modules[name] = types.ModuleType(name)
sys.modules["yt_dlp.extractor.tiktok"].DouyinIE = DouyinIE
sys.modules["yt_dlp.utils"].ExtractorError = ExtractorError
plugin_path = Path(__file__).resolve().parents[2] / "scripts/video/yt_dlp_plugins/extractor/csgh_douyin.py"
spec = importlib.util.spec_from_file_location("csgh_douyin", plugin_path)
plugin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plugin)


class DouyinPluginTests(unittest.TestCase):
    def setUp(self):
        self.extractor = plugin._CsghDouyinIE()
        self.extractor.cookies = SimpleCookie({"UIFID": "fake-device"})
        self.extractor.response = {"aweme_detail": {
            "aweme_id": "123456", "video": {"url": "https://video.example.test/test.mp4"},
        }}

    def test_signed_query_has_fixed_protocol_vector(self):
        query = plugin.build_signed_query("123456", "fake-device", timestamp=1_791_264_000)
        self.assertEqual(query, "aweme_id=123456&aid=6383&device_platform=webapp&uifid=fake-device"
                         "&timestamp=1791264000&x-secsdk-web-signature=86dc88c41cf86ef54765638371d1b365")

    def test_signature_encodes_cookie_without_changing_value(self):
        query = plugin.build_signed_query("123456", "fake+/= 中文", timestamp=123)
        parsed = parse_qs(query)
        self.assertEqual(parsed["uifid"], ["fake+/= 中文"])
        self.assertIn("%2B%2F%3D%20", query)
        self.assertNotEqual(parsed["x-secsdk-web-signature"],
                            parse_qs(plugin.build_signed_query("123456", "fake+/= 中文", timestamp=124))["x-secsdk-web-signature"])

    def test_extractor_sends_signature_and_keeps_video_result(self):
        result = self.extractor._real_extract("https://www.douyin.com/video/123456")
        url, options = self.extractor.request
        self.assertEqual(urlsplit(url).hostname, "www.douyin.com")
        self.assertIn("x-secsdk-web-signature", parse_qs(urlsplit(url).query))
        self.assertEqual(options["headers"]["uifid"], "fake-device")
        self.assertEqual(result, {"id": "123456", "url": "https://video.example.test/test.mp4"})

    def test_accepts_temporary_device_cookie(self):
        self.extractor.cookies = SimpleCookie({"UIFID_TEMP": "fake-temporary"})
        self.extractor._real_extract("https://www.douyin.com/video/123456")
        self.assertEqual(self.extractor.request[1]["headers"]["uifid"], "fake-temporary")

    def test_missing_device_cookie_is_explicit(self):
        self.extractor.cookies = SimpleCookie()
        with self.assertRaisesRegex(ExtractorError, "缺少 UIFID"):
            self.extractor._real_extract("https://www.douyin.com/video/123456")
        self.assertFalse(hasattr(self.extractor, "request"))

    def test_network_failure_does_not_disclose_signed_url(self):
        self.extractor.response = ExtractorError("403 https://private.test/?uifid=fake-secret")
        with self.assertRaises(ExtractorError) as raised:
            self.extractor._real_extract("https://www.douyin.com/video/123456")
        self.assertNotIn("fake-secret", str(raised.exception))
        self.assertNotIn("Fresh cookies", str(raised.exception))

    def test_missing_video_does_not_return_an_unrelated_result(self):
        self.extractor.response = {"status_code": 0, "aweme_detail": None}
        with self.assertRaisesRegex(ExtractorError, "未返回"):
            self.extractor._real_extract("https://www.douyin.com/video/123456")


if __name__ == "__main__":
    unittest.main()
