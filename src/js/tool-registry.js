// src/js/tool-registry.js

// 导入所有模块化工具的类
import IPQueryTool from './tools/ipQueryTool.js';
import SystemInfoTool from './tools/systemInfoTool.js';
import SystemTool from './tools/systemTool.js';
import BiliHotTool from './tools/biliHotTool.js';
import QQAvatarTool from './tools/qqAvatarTool.js';
import BaiduHotTool from './tools/baiduHotTool.js';
import Base64Tool from './tools/base64Tool.js';
import ChineseConverterTool from './tools/chineseConverterTool.js';
import QRCodeGeneratorTool from './tools/qrCodeGeneratorTool.js';
import ProfanityCheckTool from './tools/profanityCheckTool.js';
import WxDomainCheckTool from './tools/wxDomainCheckTool.js';
import IpInfoTool from './tools/ipInfoTool.js';
import DnsQueryTool from './tools/dnsQueryTool.js';
import HotboardTool from './tools/hotboardTool.js';
import SmartSearchTool from './tools/smartSearchTool.js';
import AITranslationTool from './tools/aiTranslationTool.js';
// [修复 1] 导入缺失的工具类
import ImageProcessorTool from './tools/imageProcessorTool.js';
import ArchiveTool from './tools/archiveTool.js';
import MediaPlayerTool from './tools/mediaPlayerTool.js';
import PcBenchmarkTool from './tools/pcBenchmarkTool.js';
import WeatherDetailsTool from './tools/weatherDetailsTool.js';

/**
 * 将工具ID映射到它们的类定义
 * 键 (key) 必须与 uiManager.js 中定义的 ID 一致
 */
export const toolRegistry = {
    'ip-query': IPQueryTool,
    'system-info': SystemInfoTool,
    'system-tool': SystemTool,
    'bili-hot-ranking': BiliHotTool,
    'qq-avatar': QQAvatarTool,
    'baidu-hot': BaiduHotTool,
    'base64-converter': Base64Tool,
    'chinese-converter': ChineseConverterTool,
    'qr-code-generator': QRCodeGeneratorTool,
    'profanity-check': ProfanityCheckTool,
    'wx-domain-check': WxDomainCheckTool,
    'ip-info': IpInfoTool,
    'dns-query': DnsQueryTool,
    'hotboard': HotboardTool,
    'smart-search': SmartSearchTool,
    'ai-translation': AITranslationTool,
    // [修复 1] 注册工具
    'image-processor': ImageProcessorTool,
    'archive-tool': ArchiveTool,
    'media-player': MediaPlayerTool,
    'pc-benchmark': PcBenchmarkTool,
    'weather-details': WeatherDetailsTool
};
