// src/js/tools/wxDomainCheckTool.js
import BaseTool from '../baseTool.js';

class WxDomainCheckTool extends BaseTool {
    constructor() {
        super('wx-domain-check', '微信域名检测');
        this.dom = {};
        this.abortController = null;
    }

    render() {
        return `
            <div class="page-container" style="display: flex; flex-direction: column; height: 100%;">
                <div class="content-area" style="padding: 20px; flex-grow: 1; display: flex; flex-direction: column; gap: 20px; overflow-y: auto;">
                    <div class="settings-section" style="padding: 20px;">
                        <h2><i class="fab fa-weixin"></i> 微信域名访问状态</h2>
                        <p class="setting-item-description" style="margin-bottom: 20px;">检测指定域名是否可以在微信内置浏览器中正常访问。</p>
                        
                        <div class="ip-input-group" style="margin-bottom: 20px;">
                            <input type="text" id="wxd-input" placeholder="输入域名 (例如: qq.com)">
                            <button id="wxd-query-btn" class="action-btn ripple"><i class="fas fa-search"></i> 检测</button>
                        </div>
                        
                        <div id="wxd-results-container" class="ip-results-container" style="min-height: 100px;">
                            <p class="loading-text">请输入域名后点击检测</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    init() {
        this._log('工具已初始化');

        // Cache DOM elements
        this.dom.input = document.getElementById('wxd-input');
        this.dom.queryBtn = document.getElementById('wxd-query-btn');
        this.dom.resultsContainer = document.getElementById('wxd-results-container');

        // Bind events
        this.dom.queryBtn.addEventListener('click', this._handleQuery.bind(this));
        this.dom.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._handleQuery();
        });
    }

    async _handleQuery() {
        const domain = this.dom.input.value.trim();
        if (!domain) {
            this._notify('输入错误', '请输入要检测的域名', 'error');
            return;
        }

        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();

        this.dom.queryBtn.disabled = true;
        this.dom.queryBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        this.dom.resultsContainer.innerHTML = `
            <div class="loading-container">
                <img src="./assets/loading.gif" alt="检测中..." class="loading-gif">
                <p class="loading-text">正在检测域名: ${domain}...</p>
            </div>`;

        try {
            const apiUrl = `https://uapis.cn/api/v1/network/wxdomain?domain=${encodeURIComponent(domain)}`;
            const response = await fetch(apiUrl, { signal: this.abortController.signal });

            const blob = await response.blob();
            window.electronAPI.addTraffic(blob.size);
            const json = JSON.parse(await blob.text());

            if (!response.ok) {
                throw new Error(json.message || `API 请求失败: ${response.status}`);
            }

            // 根据 type 决定样式
            let statusColor = 'var(--text-color)';
            let statusIcon = 'fa-check-circle';
            
            if (json.type !== '1') { // 1 以外都是某种形式的 "非正常"
                statusColor = 'var(--error-color)';
                statusIcon = 'fa-times-circle';
            } else {
                // 如果 type === "1"，则使用绿色和“对勾”
                statusColor = 'var(--success-color)';
                statusIcon = 'fa-check-circle';
            }

            this.dom.resultsContainer.innerHTML = `
                <div class="ip-result-grid" style="animation: contentFadeIn 0.3s;">
                    <div class="ip-result-category">
                        <h3 style="color: ${statusColor}; font-size: 20px;"><i class="fas ${statusIcon}"></i> ${json.title || '未知状态'}</h3>
                        <div class="ip-result-item">
                            <span class="ip-result-key">检测域名</span>
                            <span class="ip-result-value">${json.domain}</span>
                        </div>
                        <div class="ip-result-item">
                            <span class="ip-result-key">状态码</span>
                            <span class="ip-result-value">${json.type}</span>
                        </div>
                    </div>
                </div>
            `;
            this._log(`微信域名检测成功: ${domain} - ${json.title}`);

        } catch (error) {
            if (error.name === 'AbortError') {
                this._log('检测请求被中止');
                this.dom.resultsContainer.innerHTML = `<p class="loading-text">检测已取消</p>`;
            } else {
                this._notify('检测失败', error.message, 'error');
                this._log(`检测失败: ${error.message}`);
                this.dom.resultsContainer.innerHTML = `<p class="error-message"><i class="fas fa-exclamation-triangle"></i> ${error.message}</p>`;
            }
        } finally {
            this.dom.queryBtn.disabled = false;
            this.dom.queryBtn.innerHTML = '<i class="fas fa-search"></i> 检测';
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

export default WxDomainCheckTool;