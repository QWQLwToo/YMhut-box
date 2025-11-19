// src/js/i18n.js

class Translator {
    constructor() {
        this.strings = {};
        this.fallbackStrings = {};
    }

    /**
     * 初始化翻译器
     * @param {object} languagePack - 从 main.js 加载的语言包 (e.g., en-US.json)
     * @param {object} fallbackPack - 默认的中文语言包
     */
    init(languagePack, fallbackPack) {
        this.strings = languagePack || {};
        this.fallbackStrings = fallbackPack || {};
    }

    /**
     * 获取翻译后的字符串
     * @param {string} key - 语言键 (e.g., "nav.home")
     * @param {object} [replaces] - (可选) 替换占位符, e.g., {count: 5, time: 100}
     * @returns {string} - 翻译后的字符串
     */
    t(key, replaces = null) {
        let str = this.strings[key];
        
        if (str === undefined) {
            str = this.fallbackStrings[key];
        }

        if (str === undefined) {
            console.warn(`[i18n] Missing translation for key: ${key}`);
            return key;
        }
        
        // 处理占位符
        if (replaces) {
            for (const [placeholder, value] of Object.entries(replaces)) {
                str = str.replace(new RegExp(`{${placeholder}}`, 'g'), value);
            }
        }
        
        return str;
    }
}

// 导出一个单例
const i18n = new Translator();
export default i18n;