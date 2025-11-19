// src/js/tools/ipInfoTool.js
import BaseTool from '../baseTool.js';

class IpInfoTool extends BaseTool {
    constructor() {
        super('ip-info', 'IP/域名归属查询');
        this.dom = {};
        this.abortController = null;
    }

    render() {
        return `
            <div class="page-container" style="display: flex; flex-direction: column; height: 100%;">
                <div class="content-area" style="padding: 20px; flex-grow: 1; display: flex; flex-direction: column; gap: 20px; overflow-y: auto;">
                    <div class="settings-section" style="padding: 20px;">
                        <h2><i class="fas fa-search-location"></i> IP/域名归属查询</h2>
                        <p class="setting-item-description" style="margin-bottom: 20px;">查询指定公网IP或域名的详细地理和网络信息。</p>
                        
                        <div class="ip-input-group" style="margin-bottom: 20px;">
                            <input type="text" id="ipi-input" placeholder="输入IP地址或域名 (例如: 8.8.8.8 或 google.com)">
                            <button id="ipi-query-btn" class="action-btn ripple"><i class="fas fa-search"></i> 查询</button>
                        </div>

                        <div class="settings-row" style="border-bottom: 1px solid var(--border-color); padding: 10px 0;">
                            <span>使用商业级数据源</span>
                            <label class="option-toggle">
                                <input type="checkbox" id="ipi-source-commercial">
                                <span class="slider-round"></span>
                            </label>
                        </div>
                        <p class="setting-item-description" style="font-size: 12px; margin-top: 5px;">商业级数据源返回更详细的信息（如行政区、邮编），但响应可能稍慢。</p>
                        
                        <div id="ipi-results-container" style="margin-top: 20px; min-height: 100px;">
                            <p class="loading-text" style="text-align: center;">请输入要查询的 IP 或域名</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    init() {
        this._log('工具已初始化');

        this.dom.input = document.getElementById('ipi-input');
        this.dom.queryBtn = document.getElementById('ipi-query-btn');
        this.dom.commercialToggle = document.getElementById('ipi-source-commercial');
        this.dom.resultsContainer = document.getElementById('ipi-results-container');

        this.dom.queryBtn.addEventListener('click', this._handleQuery.bind(this));
        this.dom.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._handleQuery();
        });
    }

    async _handleQuery() {
        const queryTarget = this.dom.input.value.trim();
        if (!queryTarget) {
            this._notify('输入错误', '请输入要查询的IP或域名', 'error');
            return;
        }

        const useCommercial = this.dom.commercialToggle.checked;
        const source = useCommercial ? 'commercial' : '';

        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();

        this.dom.queryBtn.disabled = true;
        this.dom.queryBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        this.dom.resultsContainer.innerHTML = `
            <div class="loading-container">
                <img src="./assets/loading.gif" alt="查询中..." class="loading-gif">
                <p class="loading-text">正在查询: ${queryTarget}...</p>
            </div>`;

        try {
            const apiUrl = `https://uapis.cn/api/v1/network/ipinfo?ip=${encodeURIComponent(queryTarget)}&source=${source}`;
            const response = await fetch(apiUrl, { signal: this.abortController.signal });

            const blob = await response.blob();
            window.electronAPI.addTraffic(blob.size);
            const data = JSON.parse(await blob.text());

            if (!response.ok || data.code !== 200) {
                throw new Error(data.message || `API 请求失败: ${response.status}`);
            }

            this._renderResults(data);
            this._log(`IP/域名查询成功: ${queryTarget}`);

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

    _renderResults(data) {
        const renderItem = (label, value) => (value || value === 0) ? `
            <div class="ip-result-item">
                <span class="ip-result-key">${label}</span>
                <span class="ip-result-value">${value}</span>
            </div>` : '';

        // [新增] 检查是否存在任何“区域详情”数据
        const hasRegionalDetails = data.area_code || data.city_code || data.zip_code || data.time_zone || data.weather_station;

        let regionalHtml = '';
        if (hasRegionalDetails) {
            regionalHtml = `
            <div class="ip-result-category">
                <h3><i class="fas fa-info-circle"></i> 区域详情</h3>
                ${renderItem('行政区划代码', data.area_code)}
                ${renderItem('城市区号', data.city_code)}
                ${renderItem('邮政编码', data.zip_code)}
                ${renderItem('时区', data.time_zone)}
                ${renderItem('气象站代码', data.weather_station)}
            </div>
            `;
        }

        const html = `
            <div class="ip-results-wrapper" style="animation: contentFadeIn 0.5s;">
                <div class="ip-result-grid" style="grid-template-columns: 1fr 1fr;">
                    
                    <div class="ip-result-category">
                        <h3><i class="fas fa-network-wired"></i> 网络信息</h3>
                        ${renderItem('查询 IP', data.ip)}
                        ${renderItem('运营商', data.isp)}
                        ${renderItem('归属', data.llc)}
                        ${renderItem('ASN', data.asn)}
                        ${renderItem('IP段 (起)', data.beginip)}
                        ${renderItem('IP段 (止)', data.endip)}
                        ${renderItem('应用场景', data.scenes)}
                    </div>
                    
                    <div class="ip-result-category">
                        <h3><i class="fas fa-map-marked-alt"></i> 地理位置</h3>
                        ${renderItem('位置', data.region)}
                        ${renderItem('行政区', data.district)}
                        ${renderItem('纬度', data.latitude)}
                        ${renderItem('经度', data.longitude)}
                        ${renderItem('海拔 (米)', data.elevation)}
                    </div>

                    ${regionalHtml} </div>
            </div>`;
        this.dom.resultsContainer.innerHTML = html;
    }

    destroy() {
        if (this.abortController) {
            this.abortController.abort();
        }
        this._log('工具已销毁');
        super.destroy();
    }
}

export default IpInfoTool;