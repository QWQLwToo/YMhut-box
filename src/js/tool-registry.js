// src/js/tool-registry.js

// 导入所有模块化工具的类
import IPQueryTool from './tools/ipQueryTool.js';
import SystemInfoTool from './tools/systemInfoTool.js';
import SystemTool from './tools/systemTool.js';
import BiliHotTool from './tools/biliHotTool.js';
import QQAvatarTool from './tools/qqAvatarTool.js';
import BaiduHotTool from './tools/baiduHotTool.js';
import Base64Tool from './tools/base64Tool.js';
import ChineseConverterTool from './tools/chineseConverterTool.js'; // <-- 新增
import QRCodeGeneratorTool from './tools/qrCodeGeneratorTool.js'; // <-- 新增
import ProfanityCheckTool from './tools/profanityCheckTool.js'; // <-- 新增
import WxDomainCheckTool from './tools/wxDomainCheckTool.js'; // <-- 新增
import IpInfoTool from './tools/ipInfoTool.js'; // <-- 新增
import DnsQueryTool from './tools/dnsQueryTool.js'; // <-- 新增
import HotboardTool from './tools/hotboardTool.js'; // <-- 新增
// ...未来在这里添加更多工具

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
    'chinese-converter': ChineseConverterTool, // <-- 新增
    'qr-code-generator': QRCodeGeneratorTool, // <-- 新增
    'profanity-check': ProfanityCheckTool, // <-- 新增
    'wx-domain-check': WxDomainCheckTool, // <-- 新增
    'ip-info': IpInfoTool, // <-- 新增
    'dns-query': DnsQueryTool, // <-- 新增
    'hotboard': HotboardTool, // <-- 新增
    // ...未来在这里添加更多工具
};