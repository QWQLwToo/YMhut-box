// src/js/tools/profanityCheckTool.js
import BaseTool from '../baseTool.js';

class ProfanityCheckTool extends BaseTool {
    constructor() {
        super('profanity-check', '敏感词检测');
        this.dom = {};
        this.abortController = null;
    }

    render() {
        return `
            <div class="page-container chinese-converter-container" style="display: flex; flex-direction: column; height: 100%;">
                <div class="content-area" style="padding: 20px; flex-grow: 1; display: flex; flex-direction: column; gap: 20px; overflow-y: auto;">
                    <div class="settings-section" style="padding: 20px; flex: 1; display: flex; flex-direction: column;">
                        <h2><i class="fas fa-shield-alt"></i> 敏感词检测</h2>
                        <p class="setting-item-description" style="margin-bottom: 15px;">输入需要检测的文本，接口将返回检测结果和屏蔽后的文本。</p>

                        <div class="converter-text-area">
                            <textarea id="profanity-input-textarea" placeholder="在此输入需要检测的文本..."></textarea>
                            <div class="textarea-actions">
                                <button id="profanity-paste-btn" class="control-btn mini-btn ripple" title="粘贴"><i class="fas fa-paste"></i></button>
                                <button id="profanity-clear-input-btn" class="control-btn mini-btn ripple error-btn" title="清空输入"><i class="fas fa-times"></i></button>
                            </div>
                        </div>

                        <div class="converter-controls" style="justify-content: flex-end;">
                            <button id="profanity-check-btn" class="action-btn ripple"><i class="fas fa-search"></i> 开始检测</button>
                        </div>

                        <div class="converter-text-area">
                            <textarea id="profanity-output-textarea" placeholder="屏蔽后的结果将显示在这里..." readonly></textarea>
                             <div class="textarea-actions">
                                <button id="profanity-copy-btn" class="control-btn mini-btn ripple" title="复制结果"><i class="fas fa-copy"></i></button>
                            </div>
                        </div>
                        
                        <div id="profanity-results-details" style="margin-top: 15px;"></div>
                    </div>
                </div>
            </div>
        `;
    }

    init() {
        this._log('工具已初始化');

        // Cache DOM elements
        this.dom.inputTextArea = document.getElementById('profanity-input-textarea');
        this.dom.outputTextArea = document.getElementById('profanity-output-textarea');
        this.dom.pasteBtn = document.getElementById('profanity-paste-btn');
        this.dom.clearInputBtn = document.getElementById('profanity-clear-input-btn');
        this.dom.copyBtn = document.getElementById('profanity-copy-btn');
        this.dom.checkBtn = document.getElementById('profanity-check-btn');
        this.dom.resultsDetails = document.getElementById('profanity-results-details');

        // Bind events
        this.dom.pasteBtn.addEventListener('click', this._handlePaste.bind(this));
        this.dom.clearInputBtn.addEventListener('click', this._handleClearInput.bind(this));
        this.dom.copyBtn.addEventListener('click', this._handleCopyOutput.bind(this));
        this.dom.checkBtn.addEventListener('click', this._handleCheck.bind(this));
        this.dom.inputTextArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this._handleCheck();
            }
        });
    }

    async _handlePaste() {
        try {
            const text = await navigator.clipboard.readText();
            this.dom.inputTextArea.value = text;
            this._log('输入内容已粘贴');
        } catch (err) {
            this._notify('错误', '无法读取剪贴板内容', 'error');
            this._log('粘贴失败: ' + err.message);
        }
    }

    _handleClearInput() {
        this.dom.inputTextArea.value = '';
        this.dom.outputTextArea.value = '';
        this.dom.resultsDetails.innerHTML = '';
        this._log('输入内容已清空');
    }

    _handleCopyOutput() {
        const text = this.dom.outputTextArea.value;
        if (!text) {
            this._notify('提示', '没有结果可复制', 'info');
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            this._notify('成功', '结果已复制到剪贴板', 'success');
            this._log('结果已复制');
        }).catch(err => {
            this._notify('错误', '复制失败', 'error');
            this._log('复制失败: ' + err.message);
        });
    }

    async _handleCheck() {
        const textToConvert = this.dom.inputTextArea.value.trim();
        if (!textToConvert) {
            this._notify('提示', '请输入需要检测的内容', 'info');
            return;
        }

        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();

        const apiUrl = 'https://uapis.cn/api/v1/text/profanitycheck';

        this.dom.checkBtn.disabled = true;
        this.dom.checkBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 检测中...';
        this.dom.outputTextArea.value = '';
        this.dom.resultsDetails.innerHTML = '';

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                signal: this.abortController.signal,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text: textToConvert })
            });

            const blob = await response.blob();
            window.electronAPI.addTraffic(blob.size);
            const json = JSON.parse(await blob.text());

            if (!response.ok) {
                throw new Error(json.message || `API 请求失败: ${response.status}`);
            }

            this.dom.outputTextArea.value = json.masked_text || '';
            
            let detailsHtml = '';
            
            // 1. 先根据 status 显示状态行
            if (json.status === 'forbidden') {
                const count = (json.forbidden_words && json.forbidden_words.length > 0) ? json.forbidden_words.length : 0;
                detailsHtml += `
                    <div class="info-row" style="padding-top: 10px; border-top: 1px solid var(--border-color);">
                        <span>检测状态:</span>
                        <span style="color: var(--error-color); font-weight: 600;">检测到违禁词 ${count > 0 ? `(${count} 个)` : ''}</span>
                    </div>
                `;
            } else {
                 detailsHtml += `
                    <div class="info-row" style="padding-top: 10px; border-top: 1px solid var(--border-color);">
                        <span>检测状态:</span>
                        <span style="color: var(--success-color); font-weight: 600;">内容安全</span>
                    </div>
                `;
            }
            
            // 2. 只有当 forbidden_words 数组存在且有内容时，才附加 "小卡片" 容器
            if (json.status === 'forbidden' && json.forbidden_words && json.forbidden_words.length > 0) {
                
                // [修改] 从 <table> 切换到 flexbox "tag" 布局
                detailsHtml += `
                    <div class="profanity-results-list profanity-tag-container">
                        ${json.forbidden_words.map(word => `
                            <span class="profanity-tag">${word}</span>
                        `).join('')}
                    </div>
                `;
            }

            this.dom.resultsDetails.innerHTML = detailsHtml;
            this._log(`敏感词检测成功: ${json.status}`);

        } catch (error) {
            if (error.name === 'AbortError') {
                this._log('检测请求被中止');
            } else {
                this._notify('检测失败', error.message, 'error');
                this._log(`检测失败: ${error.message}`);
                this.dom.outputTextArea.value = `错误: ${error.message}`;
            }
        } finally {
            this.dom.checkBtn.disabled = false;
            this.dom.checkBtn.innerHTML = '<i class="fas fa-search"></i> 开始检测';
            this.abortController = null;
        }
    }

    destroy() {
        if (this.abortController) {
            this.abortController.abort();
        }
        this._log('工具已销毁');
        super.destroy();
    }
}

export default ProfanityCheckTool;