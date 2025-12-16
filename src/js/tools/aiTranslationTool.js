// src/js/tools/aiTranslationTool.js
import BaseTool from '../baseTool.js';
import configManager from '../configManager.js';
import i18n from '../i18n.js';
import uiManager from '../uiManager.js';

class AITranslationTool extends BaseTool {
    constructor() {
        super('ai-translation', 'AI 智能翻译');
        this.apiKey = configManager.config?.api_keys?.uapipro || null;
        this.abortController = null;
        this.dom = {}; // DOM 元素缓存
        
        // [新增] 内部状态，用于存储下拉菜单的选中值
        this.state = {
            source_lang: 'auto',
            target_lang: 'zh-CHS',
            style: 'professional',
            context: 'general'
        };

        this.languages = {
            'auto': '自动检测 (Auto)',
            // --- 常用 ---
            'zh-CHS': '中文 (简体)',
            'zh-CHT': '中文 (繁体)',
            'en': '英语 (English)',
            'ja': '日语 (日本語)',
            'ko': '韩语 (한국어)',
            'fr': '法语 (Français)',
            'de': '德语 (Deutsch)',
            'es': '西班牙语 (Español)',
            'ru': '俄语 (Русский)',
            'pt': '葡萄牙语 (Português)',
            'it': '意大利语 (Italiano)',
            'ar': '阿拉伯语 (العربية)',
            'th': '泰语 (ไทย)',
            'vi': '越南语 (Tiếng Việt)',
            // --- 按字母排序 ---
            'ae': '阿维斯陀语 (Avestan)',
            'am': '阿姆哈拉语 (Amharic)',
            'az': '阿塞拜疆语 (Azerbaijani)',
            'ga': '爱尔兰语 (Irish)',
            'et': '爱沙尼亚语 (Estonian)',
            'sq': '阿尔巴尼亚语 (Albanian)',
            'hy': '亚美尼亚语 (Armenian)',
            'bg': '保加利亚语 (Bulgarian)',
            'eu': '巴斯克语 (Basque)',
            'bs-Latn': '波斯尼亚语 (Bosnian, Latin)',
            'pl': '波兰语 (Polish)',
            'fa': '波斯语 (Persian)',
            'bn': '孟加拉语 (Bengali)',
            'my': '缅甸语 (Burmese)',
            'mi': '毛利语 (Maori)',
            'co': '科西嘉语 (Corsican)',
            'ceb': '宿务语 (Cebuano)',
            'da': '丹麦语 (Danish)',
            'fi': '芬兰语 (Finnish)',
            'fy': '弗里西语 (Frisian)',
            'tl': '菲律宾语 (Tagalog)',
            'km': '高棉语 (Khmer)',
            'ka': '格鲁吉亚语 (Georgian)',
            'gl': '加利西亚语 (Galician)',
            'gu': '古吉拉特语 (Gujarati)',
            'ht': '海地克里奥尔语 (Haitian Creole)',
            'nl': '荷兰语 (Dutch)',
            'hn': 'Hindustani (hn)',
            'haw': '夏威夷语 (Hawaiian)',
            'he': '希伯来语 (Hebrew)',
            'hi': '印地语 (Hindi)',
            'hu': '匈牙利语 (Hungarian)',
            'ig': '伊博语 (Igbo)',
            'id': '印尼语 (Indonesian)',
            'jw': '印尼爪哇语 (Javanese)',
            'su': '印尼巽他语 (Sundanese)',
            'cs': '捷克语 (Czech)',
            'ca': '加泰罗尼亚语 (Catalan)',
            'kk': '哈萨克语 (Kazakh)',
            'kn': '卡纳达语 (Kannada)',
            'ky': '吉尔吉斯语 (Kyrgyz)',
            'klh': '克林贡语 (Klingon)',
            'hr': '克罗地亚语 (Croatian)',
            'ku': '库尔德语 (Kurdish)',
            'la': '拉丁语 (Latin)',
            'lv': '拉脱维亚语 (Latvian)',
            'lt': '立陶宛语 (Lithuanian)',
            'lo': '老挝语 (Lao)',
            'ro': '罗马尼亚语 (Romanian)',
            'lb': '卢森堡语 (Luxembourgish)',
            'mg': '马尔加什语 (Malagasy)',
            'mt': '马耳他语 (Maltese)',
            'mr': '马拉地语 (Marathi)',
            'ms': '马来语 (Malay)',
            'ml': '马拉雅拉姆语 (Malayalam)',
            'mk': '马其顿语 (Macedonian)',
            'mn': '蒙古语 (Mongolian)',
            'mww': '苗语 (Hmong Daw)',
            'mnm': 'mnm', 
            'xh': '南非科萨语 (Xhosa)',
            'zu': '南非祖鲁语 (Zulu)',
            'ne': '尼泊尔语 (Nepali)',
            'no': '挪威语 (Norwegian)',
            'pa': '旁遮普语 (Punjabi)',
            'ps': '普什图语 (Pashto)',
            'ny': '齐切瓦语 (Chichewa)',
            'otq': '克雷塔罗奥托米语 (Otomi)',
            'sv': '瑞典语 (Swedish)',
            'sr-Latn': '塞尔维亚语 (Latin)',
            'sr-Cyrl': '塞尔维亚语 (Cyrillic)',
            'st': '塞索托语 (Sesotho)',
            'sm': '萨摩亚语 (Samoan)',
            'si': '僧伽罗语 (Sinhala)',
            'eo': '世界语 (Esperanto)',
            'sk': '斯洛伐克语 (Slovak)',
            'sl': '斯洛文尼亚语 (Slovenian)',
            'sw': '斯瓦希里语 (Swahili)',
            'gd': '苏格兰盖尔语 (Scottish Gaelic)',
            'so': '索马里语 (Somali)',
            'te': '泰卢固语 (Telugu)',
            'ta': '泰米尔语 (Tamil)',
            'tg': '塔吉克语 (Tajik)',
            'tr': '土耳其语 (Turkish)',
            'tn': '茨瓦纳语 (Tswana)',
            'cy': '威尔士语 (Welsh)',
            'zh-lzh': '文言文 (Chinese, Literary)',
            'ur': '乌尔都语 (Urdu)',
            'uk': '乌克兰语 (Ukrainian)',
            'uz': '乌兹别克语 (Uzbek)',
            'el': '希腊语 (Greek)',
            'sd': '信德语 (Sindhi)',
            'sn': '修纳语 (Shona)',
            'yua': '尤卡特克玛雅语 (Yucatec Maya)',
            'yo': '约鲁巴语 (Yoruba)'
        };

        this.styles = {
            'professional': '专业商务 (默认)',
            'casual': '随意口语化',
            'academic': '学术正式',
            'literary': '文学艺术'
        };

        this.contexts = {
            'general': '通用 (默认)',
            'business': '商务',
            'technical': '技术',
            'medical': '医疗',
            'legal': '法律',
            'marketing': '市场营销',
            'entertainment': '娱乐',
            'education': '教育',
            'news': '新闻'
        };
    }

    render() {
        // 将 options HTML 提取到 render 之外，以便 uiManager 移动到 body
        const dropdownOptionsHtml = [
            this._renderDropdownOptions('source_lang', this.languages, 'auto'),
            this._renderDropdownOptions('target_lang', this.languages, 'zh-CHS'),
            this._renderDropdownOptions('style', this.styles, 'professional'),
            this._renderDropdownOptions('context', this.contexts, 'general')
        ].join('');

        return `
        <div class="page-container" style="display: flex; flex-direction: column; height: 100%; padding: 20px; gap: 20px;">
            
            <div style="display: flex; flex-grow: 1; gap: 20px; min-height: 0;">
                
                <div class="settings-section" style="flex: 1; display: flex; flex-direction: column; margin-bottom: 0;">
                    ${this._renderDropdownTrigger('source_lang', this.languages, 'auto')}
                    <div class="converter-text-area" style="flex-grow: 1; margin-top: 10px; margin-bottom: 0;">
                        <textarea id="ai-trans-source-text" placeholder="输入待翻译的文本..."></textarea>
                        <div class="textarea-actions">
                            <button id="ai-trans-paste-btn" class="control-btn mini-btn ripple" title="粘贴"><i class="fas fa-paste"></i></button>
                            <button id="ai-trans-clear-btn" class="control-btn mini-btn ripple error-btn" title="清空"><i class="fas fa-times"></i></button>
                        </div>
                    </div>
                </div>

                <div class="settings-section" style="flex: 1; display: flex; flex-direction: column; margin-bottom: 0;">
                    ${this._renderDropdownTrigger('target_lang', this.languages, 'zh-CHS', true)}
                    <div class="converter-text-area" style="flex-grow: 1; margin-top: 10px; margin-bottom: 0;">
                        <textarea id="ai-trans-target-text" placeholder="翻译结果将显示在此处..." readonly></textarea>
                        <div class="textarea-actions">
                            <button id="ai-trans-copy-btn" class="control-btn mini-btn ripple" title="复制"><i class="fas fa-copy"></i></button>
                        </div>
                    </div>
                </div>

            </div>

            <div class="settings-section" style="flex-shrink: 0; margin-bottom: 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap;">
                    
                    <button id="ai-trans-submit-btn" class="action-btn ripple" style="min-width: 150px; font-size: 16px;">
                        <i class="fas fa-language"></i> 翻译
                    </button>

                    <div style="display: flex; gap: 20px; align-items: center; flex-wrap: wrap;">
                        <div class="setting-item" style="margin-bottom: 0;">
                            <span class="setting-item-description" style="margin-bottom: 5px;">翻译风格</span>
                            ${this._renderDropdownTrigger('style', this.styles, 'professional')}
                        </div>
                        <div class="setting-item" style="margin-bottom: 0;">
                            <span class="setting-item-description" style="margin-bottom: 5px;">翻译场景</span>
                            ${this._renderDropdownTrigger('context', this.contexts, 'general')}
                        </div>
                        <div class="setting-item" style="margin-bottom: 0; text-align: center;">
                            <span class="setting-item-description" style="margin-bottom: 5px;">快速模式</span>
                            <label class="option-toggle" title="启用快速模式 (准确率 95%+)"><input id="ai-trans-fast-mode" type="checkbox"><span class="slider-round"></span></label>
                        </div>
                        <div class="setting-item" style="margin-bottom: 0; text-align: center;">
                            <span class="setting-item-description" style="margin-bottom: 5px;">保留格式</span>
                            <label class="option-toggle" title="保留原文换行和缩进"><input id="ai-trans-preserve-format" type="checkbox"><span class="slider-round"></span></label>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        ${dropdownOptionsHtml}
        `;
    }

    init() {
        this._log('工具已初始化');

        // 缓存 DOM
        this.dom = {
            sourceText: document.getElementById('ai-trans-source-text'),
            targetText: document.getElementById('ai-trans-target-text'),
            submitBtn: document.getElementById('ai-trans-submit-btn'),
            pasteBtn: document.getElementById('ai-trans-paste-btn'),
            clearBtn: document.getElementById('ai-trans-clear-btn'),
            copyBtn: document.getElementById('ai-trans-copy-btn'),
            fastMode: document.getElementById('ai-trans-fast-mode'),
            preserveFormat: document.getElementById('ai-trans-preserve-format')
        };

        // 绑定按钮事件
        this.dom.submitBtn.addEventListener('click', this._performTranslation.bind(this));
        this.dom.pasteBtn.addEventListener('click', this._handlePaste.bind(this));
        this.dom.clearBtn.addEventListener('click', this._handleClear.bind(this));
        this.dom.copyBtn.addEventListener('click', this._handleCopy.bind(this));

        // [核心修复] 初始化下拉菜单并绑定状态
        const dropdowns = [
            { id: 'source_lang', key: 'source_lang' },
            { id: 'target_lang', key: 'target_lang' },
            { id: 'style', key: 'style' },
            { id: 'context', key: 'context' }
        ];

        dropdowns.forEach(dd => {
            const wrapperId = `dd-wrapper-${dd.id}`;
            const optionsId = `dd-options-${dd.id}`;
            
            // 使用 uiManager 的通用方法
            uiManager.setupAdaptiveDropdown(wrapperId, optionsId, (value) => {
                // 回调函数：更新内部状态
                this.state[dd.key] = value;
                this._log(`选项更新 [${dd.key}]: ${value}`);
            });
        });
    }

    async _performTranslation() {
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();

        const text = this.dom.sourceText.value.trim();
        // [修复] 从 this.state 读取选中值
        const target_lang = this.state.target_lang;

        if (!text) {
            this._notify(i18n.t('common.notification.title.info'), '请输入要翻译的文本。', 'info');
            return;
        }
        if (!target_lang || target_lang === 'auto') {
            this._notify(i18n.t('common.notification.title.info'), '必须选择一个目标语言。', 'info');
            return;
        }

        // 设置加载状态
        this.dom.targetText.value = i18n.t('common.loading') + "...";
        this.dom.submitBtn.disabled = true;

        const requestBody = {
            text: text, 
            target_lang: target_lang, 
            // [修复] 从 this.state 读取选中值
            source_lang: this.state.source_lang === 'auto' ? null : this.state.source_lang, 
            style: this.state.style, 
            context: this.state.context, 
            preserve_format: this.dom.preserveFormat.checked, 
            fast_mode: this.dom.fastMode.checked 
        };

        const requestHeaders = {
            'Content-Type': 'application/json'
        };
        if (this.apiKey) {
            this._log('使用 API Key 进行翻译');
            requestHeaders['Authorization'] = `Bearer ${this.apiKey}`;
        } else {
            this._log('进行免 Key 翻译');
        }

        try {
            const response = await fetch('https://uapis.cn/api/v1/ai/translate', {
                method: 'POST',
                signal: this.abortController.signal,
                headers: requestHeaders,
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.error || `HTTP 错误 ${response.status}`);
            }

            if (data.data && data.data.translated_text) {
                this.dom.targetText.value = data.data.translated_text;
                this._log(`翻译成功: ${data.data.detected_lang} -> ${target_lang}`);
            } else {
                throw new Error('API 响应中未找到翻译结果');
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                this._log('翻译被用户取消');
                this.dom.targetText.value = '翻译已取消。';
                return;
            }
            this._log(`翻译失败: ${error.message}`);
            this.dom.targetText.value = `翻译失败: ${error.message}`;
            this._notify(i18n.t('common.notification.title.error'), error.message, 'error');
        } finally {
            this.dom.submitBtn.disabled = false;
        }
    }

    // --- 剪贴板辅助函数 ---

    async _handlePaste() {
        try {
            const text = await navigator.clipboard.readText();
            this.dom.sourceText.value = text;
            this._log('内容已粘贴');
        } catch (err) {
            this._notify(i18n.t('common.notification.title.error'), '无法读取剪贴板内容', 'error');
        }
    }

    _handleClear() {
        this.dom.sourceText.value = '';
        this.dom.targetText.value = '';
        this._log('文本已清空');
    }

    _handleCopy() {
        const text = this.dom.targetText.value;
        if (!text) {
            this._notify(i18n.t('common.notification.title.info'), '没有内容可复制', 'info');
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            this._notify(i18n.t('common.notification.title.success'), '已复制到剪贴板', 'success');
            this._log('结果已复制');
        }).catch(err => {
            this._notify(i18n.t('common.notification.title.error'), '复制失败', 'error');
        });
    }

    // --- 下拉菜单 HTML 生成辅助函数 (供 render 使用) ---

    _renderDropdownTrigger(id, options, defaultValue, isRequired = false) {
        return `
        <div class="custom-select-wrapper" id="dd-wrapper-${id}">
            <div class="custom-select-trigger" data-value="${defaultValue}">
                <span class="custom-select-value">${options[defaultValue] || '请选择'} ${isRequired ? '*' : ''}</span>
                <i class="fas fa-chevron-down custom-select-arrow"></i>
            </div>
        </div>
        `;
    }

    _renderDropdownOptions(id, options, defaultValue) {
        let optionsHtml = '';
        const sortedKeys = Object.keys(options);
        
        const defaultIndex = sortedKeys.indexOf(defaultValue);
        if (defaultIndex > -1) {
            sortedKeys.splice(defaultIndex, 1);
        }
        
        const topLangs = ['zh-CHS', 'zh-CHT', 'en'];
        const topLangLabels = [];
        topLangs.forEach(lang => {
            const index = sortedKeys.indexOf(lang);
            if (index > -1 && lang !== defaultValue) {
                topLangLabels.push(sortedKeys.splice(index, 1)[0]);
            }
        });

        sortedKeys.sort((a, b) => {
            if (a === 'auto') return -1;
            if (b === 'auto') return 1;
            return (options[a] || '').localeCompare(options[b] || '');
        });
        
        const finalSortedKeys = [
            defaultValue,
            ...topLangLabels,
            ...sortedKeys
        ];

        for (const value of finalSortedKeys) {
            const label = options[value];
            if (!label) continue;
            if (value === 'auto' && id !== 'source_lang') continue;
            optionsHtml += `<div class="custom-select-option" data-value="${value}">${label}</div>`;
        }
        
        return `<div class="custom-select-options" id="dd-options-${id}">${optionsHtml}</div>`;
    }

    destroy() {
        if (this.abortController) {
            this.abortController.abort();
        }
        // 销毁时移除 DOM (因为 uiManager 可能会把它们移到 body)
        (this.dropdownIds || []).forEach(id => {
            document.getElementById(`dd-options-${id}`)?.remove();
        });
        
        this._log('工具已销毁');
        super.destroy();
    }
}

export default AITranslationTool;