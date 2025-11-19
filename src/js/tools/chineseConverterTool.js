// src/js/tools/chineseConverterTool.js
import BaseTool from '../baseTool.js';

class ChineseConverterTool extends BaseTool {
    constructor() {
        super('chinese-converter', '简繁转换');
        this.dom = {};
        this.abortController = null;
    }

    render() {
        return `
            <div class="page-container chinese-converter-container" style="display: flex; flex-direction: column; height: 100%;">
                <div class="section-header tool-window-header">
                    <button id="back-to-toolbox-btn" class="back-btn ripple"><i class="fas fa-arrow-left"></i> 返回</button>
                    <h1 style="flex-grow: 1; text-align: center;">${this.name}</h1>
                    <div style="width: 70px;"></div> </div>

                <div class="content-area" style="padding: 20px; flex-grow: 1; display: flex; flex-direction: column; gap: 20px; overflow-y: auto;">
                    <div class="settings-section" style="padding: 20px; flex: 1; display: flex; flex-direction: column;">
                        <h2><i class="fas fa-language"></i> 输入与输出</h2>
                        <p class="setting-item-description" style="margin-bottom: 15px;">输入需要转换的文本，选择转换类型，然后点击“转换”。</p>

                        <div class="converter-text-area">
                            <textarea id="cc-input-textarea" placeholder="在此输入简体或繁体文本..."></textarea>
                            <div class="textarea-actions">
                                <button id="cc-paste-btn" class="control-btn mini-btn ripple" title="粘贴"><i class="fas fa-paste"></i></button>
                                <button id="cc-clear-input-btn" class="control-btn mini-btn ripple error-btn" title="清空输入"><i class="fas fa-times"></i></button>
                            </div>
                        </div>

                        <div class="converter-controls">
                            <div class="converter-type-selection">
                                <label><input type="radio" name="cc-type" value="3" checked> 自动识别</label>
                                <label><input type="radio" name="cc-type" value="2"> 简体 → 繁体</label>
                                <label><input type="radio" name="cc-type" value="1"> 繁体 → 简体</label>
                            </div>
                            <button id="cc-convert-btn" class="action-btn ripple"><i class="fas fa-sync-alt"></i> 转换</button>
                        </div>

                        <div class="converter-text-area">
                            <textarea id="cc-output-textarea" placeholder="转换结果将显示在这里..." readonly></textarea>
                             <div class="textarea-actions">
                                <button id="cc-copy-btn" class="control-btn mini-btn ripple" title="复制结果"><i class="fas fa-copy"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    init() {
        this._log('工具已初始化');

        const backBtn = document.getElementById('back-to-toolbox-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => window.electronAPI.closeCurrentWindow());
        }

        // Cache DOM elements
        this.dom.inputTextArea = document.getElementById('cc-input-textarea');
        this.dom.outputTextArea = document.getElementById('cc-output-textarea');
        this.dom.pasteBtn = document.getElementById('cc-paste-btn');
        this.dom.clearInputBtn = document.getElementById('cc-clear-input-btn');
        this.dom.copyBtn = document.getElementById('cc-copy-btn');
        this.dom.convertBtn = document.getElementById('cc-convert-btn');
        this.dom.typeRadios = document.querySelectorAll('input[name="cc-type"]');

        // Bind events
        this.dom.pasteBtn.addEventListener('click', this._handlePaste.bind(this));
        this.dom.clearInputBtn.addEventListener('click', this._handleClearInput.bind(this));
        this.dom.copyBtn.addEventListener('click', this._handleCopyOutput.bind(this));
        this.dom.convertBtn.addEventListener('click', this._handleConvert.bind(this));
        // Allow Enter key in input textarea to trigger conversion
        this.dom.inputTextArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { // Enter triggers, Shift+Enter new line
                e.preventDefault();
                this._handleConvert();
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
        // Optionally clear output as well
        // this.dom.outputTextArea.value = '';
        this._log('输入内容已清空');
    }

    _handleCopyOutput() {
        const text = this.dom.outputTextArea.value;
        if (!text) {
            this._notify('提示', '没有结果可复制', 'info');
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            this._notify('成功', '转换结果已复制到剪贴板', 'success');
            this._log('结果已复制');
        }).catch(err => {
            this._notify('错误', '复制失败', 'error');
            this._log('复制失败: ' + err.message);
        });
    }

    async _handleConvert() {
        const textToConvert = this.dom.inputTextArea.value.trim();
        if (!textToConvert) {
            this._notify('提示', '请输入需要转换的内容', 'info');
            return;
        }

        let selectedType = '3'; // Default to auto
        this.dom.typeRadios.forEach(radio => {
            if (radio.checked) {
                selectedType = radio.value;
            }
        });

        // Abort previous request if any
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();

        const apiUrl = 'https://api.suyanw.cn/api/jfzh.php';
        const params = new URLSearchParams({
            text: textToConvert,
            type: selectedType,
            format: 'json'
        });

        this.dom.convertBtn.disabled = true;
        this.dom.convertBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 转换中...';
        this.dom.outputTextArea.value = ''; // Clear previous result

        try {
            const response = await fetch(`${apiUrl}?${params.toString()}`, {
                signal: this.abortController.signal
            });

            // Track traffic
            const blob = await response.blob();
            window.electronAPI.addTraffic(blob.size); // Count traffic
            const json = JSON.parse(await blob.text()); // Parse response

            if (!response.ok || json.code !== 1) {
                throw new Error(json.text || `API 请求失败，状态码: ${response.status}`);
            }

            if (json.data && json.data.after) {
                this.dom.outputTextArea.value = json.data.after;
                this._log(`文本转换成功: 类型 ${selectedType}`);
            } else {
                throw new Error('API 返回的数据格式无效');
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                this._log('转换请求被中止');
            } else {
                this._notify('转换失败', error.message, 'error');
                this._log(`转换失败: ${error.message}`);
                this.dom.outputTextArea.value = `错误: ${error.message}`;
            }
        } finally {
            this.dom.convertBtn.disabled = false;
            this.dom.convertBtn.innerHTML = '<i class="fas fa-sync-alt"></i> 转换';
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

export default ChineseConverterTool;