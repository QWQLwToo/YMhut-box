// src/js/tools/smartSearchTool.js
import BaseTool from '../baseTool.js';
import configManager from '../configManager.js';

class SmartSearchTool extends BaseTool {
    constructor() {
        super('smart-search', '智能搜索');
        this.abortController = null;
        // 正常加载 API Key，如果不存在，this.apiKey 将为 null
        this.apiKey = configManager.config?.api_keys?.uapipro || null;
    }

    render() {
        return `
            <div class="page-container" style="display: flex; flex-direction: column; height: 100%;">
                <div class="section-header">
                    <button id="back-to-toolbox-btn" class="back-btn ripple"><i class="fas fa-arrow-left"></i> 返回工具箱</button>
                    <h1 style="flex-grow: 1; text-align: center;">
                        <i class="fas fa-search-plus"></i> ${this.name}
                    </h1>
                </div>

                <div class="content-area" style="padding: 0 20px 20px 20px; display: flex; flex-direction: column; flex-grow: 1; min-height: 0;">
                    
                    <div class="ip-input-group" style="margin-bottom: 15px; flex-shrink: 0;">
                        <input type="text" id="ss-query-input" placeholder="输入搜索内容，AI 将为您聚合高质量结果..." style="flex-grow: 1;">
                        <button id="ss-search-btn" class="action-btn ripple" style="min-width: 80px;">
                            <i class="fas fa-search"></i> 搜索
                        </button>
                    </div>

                    <div class="settings-section" style="padding: 15px 20px; margin-bottom: 15px; flex-shrink: 0;">
                        <div class="settings-row collapsible-trigger" id="ss-options-trigger">
                            <span>高级选项</span>
                            <span class="icon-toggle"></span>
                        </div>
                        <div class="collapsible-content" id="ss-options-content">
                            <div class="settings-row" style="padding-top: 15px;">
                                <span style="font-weight: 500;">限制网站 (e.g., github.com)</span>
                                <input type="text" id="ss-site-input" class="settings-input-text" placeholder="可选">
                            </div>
                            <div class="settings-row">
                                <span style="font-weight: 500;">文件类型 (e.g., pdf)</span>
                                <input type="text" id="ss-filetype-input" class="settings-input-text" placeholder="可选">
                            </div>
                        </div>
                    </div>

                    <div id="ss-results-container" class="settings-section" style="flex-grow: 1; min-height: 0; display: flex; flex-direction: column; padding: 20px;">
                        <div class="empty-logs-placeholder" style="margin: auto;">
                            <i class="fas fa-search-location"></i>
                            <p>等待搜索</p>
                            <span>结果将在此处显示</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    init() {
        this._log('工具已初始化');

        // 缓存 DOM
        this.dom = {
            backBtn: document.getElementById('back-to-toolbox-btn'),
            queryInput: document.getElementById('ss-query-input'),
            searchBtn: document.getElementById('ss-search-btn'),
            siteInput: document.getElementById('ss-site-input'),
            filetypeInput: document.getElementById('ss-filetype-input'),
            optionsTrigger: document.getElementById('ss-options-trigger'),
            optionsContent: document.getElementById('ss-options-content'),
            resultsContainer: document.getElementById('ss-results-container')
        };

        // --- [修改] ---
        // 根据你的要求，移除 API Key 检查
        // 无论 Key 是否存在，工具都应保持可用。
        
        // 绑定事件
        this.dom.backBtn?.addEventListener('click', () => {
            window.mainPage.navigateTo('toolbox');
            window.mainPage.updateActiveNavButton(document.getElementById('toolbox-btn'));
        });

        this.dom.searchBtn.addEventListener('click', this._performSearch.bind(this));
        this.dom.queryInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._performSearch();
        });

        this.dom.optionsTrigger.addEventListener('click', () => {
            this.dom.optionsTrigger.classList.toggle('expanded');
            this.dom.optionsContent.classList.toggle('expanded');
        });
    }

    async _performSearch() {
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();
        
        const query = this.dom.queryInput.value.trim();
        if (!query) {
            this._notify('提示', '请输入搜索关键词', 'info');
            return;
        }

        // ... (省略加载动画代码) ...
        this.dom.resultsContainer.innerHTML = `
            <div class="loading-container" style="margin: auto;">
                <img src="./assets/loading.gif" alt="加载中..." class="loading-gif">
                <p class="loading-text">正在搜索，请稍候...</p>
            </div>`;

        const requestBody = {
            query: query,
            timeout_ms: 10000, 
            fetch_full: false 
        };
        
        const site = this.dom.siteInput.value.trim();
        if (site) requestBody.site = site; 

        const filetype = this.dom.filetypeInput.value.trim();
        if (filetype) requestBody.filetype = filetype; 

        this._log(`开始搜索: ${query}`);

        // --- [修改] ---
        // 动态构建请求头
        const requestHeaders = {
            'Content-Type': 'application/json'
        };
        
        // 只有当 API Key 存在时，才添加 Authorization 头
        if (this.apiKey) {
            requestHeaders['Authorization'] = `Bearer ${this.apiKey}`;
            this._log('正在使用 API Key 进行请求');
        } else {
            this._log('正在进行免 Key 请求');
        }
        
        try {
            const response = await fetch('https://uapis.cn/api/v1/search/aggregate', {
                method: 'POST',
                signal: this.abortController.signal,
                headers: requestHeaders, // 使用动态构建的请求头
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (!response.ok) {
                //
                throw new Error(data.message || `HTTP 错误 ${response.status}`);
            }

            this._log(`搜索成功，返回 ${data.results?.length || 0} 条结果`);
            this._renderResults(data); 

        } catch (error) {
            if (error.name === 'AbortError') {
                this._log('搜索被用户取消');
                return;
            }
            this._log(`搜索失败: ${error.message}`);
            this.dom.resultsContainer.innerHTML = `
                <div class="empty-logs-placeholder" style="margin: auto;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>搜索失败</p>
                    <span>${error.message}</span>
                </div>`;
        }
    }

    _renderResults(data) {
        const results = data.results || []; 
        
        if (results.length === 0) {
            this.dom.resultsContainer.innerHTML = `
                <div class="empty-logs-placeholder" style="margin: auto;">
                    <i class="fas fa-box-open"></i>
                    <p>未找到相关结果</p>
                    <span>请尝试更换关键词。</span>
                </div>`;
            return;
        }

        // 格式化时间
        const formatTime = (isoString) => {
            if (!isoString) return '';
            try {
                return new Date(isoString).toLocaleDateString();
            } catch (e) {
                return '';
            }
        };

        // [修改] 更新 HTML 以使用新的专用 CSS 类
        const resultsHtml = results.map(item => `
            <div class="search-result-item">
                <h4>
                    <a href="#" class="hotboard-title-link" data-url="${item.url}">${item.title}</a>
                </h4>
                <p>${item.snippet}</p>
                <div class="result-meta">
                    <span class="domain">
                        <i class="fas fa-link"></i> ${item.domain}
                    </span>
                    <span><i class="fas fa-user-edit"></i> ${item.author || '未知作者'}</span>
                    <span><i class="fas fa-clock"></i> ${formatTime(item.publish_time) || '未知时间'}</span>
                    <span><i class="fas fa-star"></i> AI得分: ${item.score.toFixed(3)}</span>
                </div>
            </div>
        `).join('');

        const statsHtml = `
            <div class="search-stats" style="font-size: 13px; color: var(--text-secondary); margin-bottom: 15px; flex-shrink: 0;">
                找到约 ${data.total_results || 0} 条结果 (耗时 ${data.process_time_ms}ms)
            </div>
        `;

        this.dom.resultsContainer.innerHTML = `
            ${statsHtml}
            <div class="results-list" style="overflow-y: auto; flex-grow: 1; min-height: 0; padding-right: 10px;">
                ${resultsHtml}
            </div>
        `;

        // 绑定所有结果链接的点击事件
        this.dom.resultsContainer.querySelectorAll('a[data-url]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                window.electronAPI.openExternalLink(e.currentTarget.dataset.url);
            });
        });
    }

    destroy() {
        if (this.abortController) {
            this.abortController.abort();
        }
        this._log('工具已销毁');
        super.destroy();
    }
}

export default SmartSearchTool;