//src/js/tools/dnsQueryTool.js
import BaseTool from '../baseTool.js';

class DnsQueryTool extends BaseTool {
    constructor() {
        super('dns-query', 'DNS 解析查询');
        this.dom = {};
        this.abortController = null;
        this.recordTypes = ['A', 'AAAA', 'MX', 'CNAME', 'TXT', 'NS', 'SOA', 'CAA', 'SRV'];
    }

    render() {
        return `
            <div class="page-container" style="display: flex; flex-direction: column; height: 100%;">
                <div class="content-area" style="padding: 20px; flex-grow: 1; display: flex; flex-direction: column; gap: 20px; overflow-y: auto;">
                    <div class="settings-section" style="padding: 20px; display: flex; flex-direction: column; min-height: 0;">
                        <h2><i class="fas fa-map-signs"></i> DNS 解析查询</h2>
                        <p class="setting-item-description" style="margin-bottom: 20px;">查询指定域名的 DNS 记录。</p>
                        
                        <div class="ip-input-group" style="margin-bottom: 20px; flex-shrink: 0;">
                            <input type="text" id="dns-input" placeholder="输入域名 (例如: google.com)" style="flex-grow: 3;">
                            
                            <div id="dns-select-wrapper" class="custom-select-wrapper" style="flex-grow: 1;">
                                <div id="dns-select-trigger" class="custom-select-trigger" data-value="A">
                                    <span>A 记录</span>
                                    <i class="fas fa-chevron-down custom-select-arrow"></i>
                                </div>
                                <div id="dns-select-options" class="custom-select-options">
                                    ${this.recordTypes.map(t => `<div class="custom-select-option" data-value="${t}">${t} 记录</div>`).join('')}
                                </div>
                            </div>

                            <button id="dns-query-btn" class="action-btn ripple" style="flex-grow: 1;"><i class="fas fa-search"></i> 查询</button>
                        </div>
                        
                        <div id="dns-results-container" style="flex-grow: 1; min-height: 150px; overflow-y: auto;">
                            <p class="loading-text" style="text-align: center;">请输入域名并选择类型后点击查询</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    init() {
        this._log('工具已初始化');

        // [修改] 缓存新的 DOM 元素
        this.dom.input = document.getElementById('dns-input');
        this.dom.queryBtn = document.getElementById('dns-query-btn');
        this.dom.resultsContainer = document.getElementById('dns-results-container');
        
        this.dom.selectWrapper = document.getElementById('dns-select-wrapper');
        this.dom.selectTrigger = document.getElementById('dns-select-trigger');
        this.dom.selectOptionsContainer = document.getElementById('dns-select-options');
        this.dom.selectOptions = document.querySelectorAll('.custom-select-option');

        // [修改] 绑定新事件
        this.dom.queryBtn.addEventListener('click', this._handleQuery.bind(this));
        this.dom.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._handleQuery();
        });

        // [新增] 自定义下拉菜单的 JS 逻辑
        this.dom.selectTrigger.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止触发 document 的点击事件
            this.dom.selectWrapper.classList.toggle('active');
        });

        this.dom.selectOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                this.dom.selectTrigger.querySelector('span').textContent = option.textContent;
                this.dom.selectTrigger.dataset.value = option.dataset.value;
                // this.dom.selectWrapper.classList.remove('active'); // 选择后自动关闭 (已由 document click 统一处理)
            });
        });

        // [新增] 点击页面其他地方关闭下拉菜单
        document.addEventListener('click', (e) => {
            if (!this.dom.selectWrapper.contains(e.target)) {
                this.dom.selectWrapper.classList.remove('active');
            }
        });
    }

    async _handleQuery() {
        const domain = this.dom.input.value.trim();
        // [修改] 从 data-value 获取值
        const type = this.dom.selectTrigger.dataset.value;
        
        if (!domain) {
            this._notify('输入错误', '请输入要查询的域名', 'error');
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
                <img src="./assets/loading.gif" alt="查询中..." class="loading-gif">
                <p class="loading-text">正在查询 ${domain} 的 ${type} 记录...</p>
            </div>`;

        try {
            const apiUrl = `https://uapis.cn/api/v1/network/dns?domain=${encodeURIComponent(domain)}&type=${type}`;
            const response = await fetch(apiUrl, { signal: this.abortController.signal });

            const blob = await response.blob();
            window.electronAPI.addTraffic(blob.size);
            const json = JSON.parse(await blob.text());

            if (!response.ok || json.code !== 200) {
                throw new Error(json.message || `API 请求失败: ${response.status}`);
            }
            
            if (json.error) {
                 throw new Error(json.error);
            }

            this._renderResults(json);
            this._log(`DNS 查询成功: ${domain} (${type})`);

        } catch (error) {
            if (error.name === 'AbortError') {
                this._log('查询请求被中止');
                this.dom.resultsContainer.innerHTML = `<p class="loading-text" style="text-align: center;">查询已取消</p>`;
            } else {
                this._notify('查询失败', error.message, 'error');
                this._log(`查询失败: ${error.message}`);
                this.dom.resultsContainer.innerHTML = `<p class="error-message" style="text-align: center;"><i class="fas fa-exclamation-triangle"></i> ${error.message}</p>`;
            }
        } finally {
            this.dom.queryBtn.disabled = false;
            this.dom.queryBtn.innerHTML = '<i class="fas fa-search"></i> 查询';
            this.abortController = null;
        }
    }

    // ... (_renderResults 和 destroy 函数保持不变) ...
    _renderResults(data) {
        if (!data.records || data.records.length === 0) {
            this.dom.resultsContainer.innerHTML = `<p class="error-message" style="text-align: center;">未找到 ${data.domain} 的 ${data.type} 记录。</p>`;
            return;
        }

        const html = `
            <table class="ip-comparison-table" style="animation: contentFadeIn 0.5s;">
                <thead>
                    <tr>
                        <th>类型</th>
                        <th>内容 / 目标</th>
                        <th>Pri</th>
                        <th>Weight</th>
                        <th>Port</th>
                        <th>Tag</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.records.map(record => `
                        <tr>
                            <td>${data.type}</td>
                            <td style="word-break: break-all;">${record.content || record.target || 'N/A'}</td>
                            <td>${record.pri || 'N/A'}</td>
                            <td>${record.weight || 'N/A'}</td>
                            <td>${record.port || 'N/A'}</td>
                            <td>${record.tag || 'N/A'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;
        this.dom.resultsContainer.innerHTML = html;
    }

    destroy() {
        if (this.abortController) {
            this.abortController.abort();
        }
        this._log('工具已销毁');
        // [移除] document 的 click 监听器 (如果需要更严格的清理)
        // (在工具窗口关闭时, 整个 document 会被销毁, 所以这一步不是必须的)
        super.destroy();
    }
}

export default DnsQueryTool;