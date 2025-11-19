// [完整替换] src/js/tools/ipQueryTool.js
import BaseTool from '../baseTool.js';

// Worker 代码保持不变 (用于查询特定 IP)
const workerCode = `
'use strict';
function formatCountry(countryName, regionName) {
    const normalizedCountry = (countryName || '').toLowerCase().replace('special administrative region', '').trim();
    const normalizedRegion = (regionName || '').toLowerCase();
    const specialRegions = {
        'taiwan': '中国-台湾', 'tw': '中国-台湾', 'hong kong': '中国-香港', 'hk': '中国-香港',
        'macao': '中国-澳门', 'macau': '中国-澳门', 'mo': '中国-澳门'
    };
    for (const key in specialRegions) {
        if (normalizedCountry.includes(key) || normalizedRegion.includes(key)) {
            return specialRegions[key];
        }
    }
    if ((countryName && countryName.includes('台湾')) || (regionName && regionName.includes('台湾'))) return '中国-台湾';
    if ((countryName && countryName.includes('香港')) || (regionName && regionName.includes('香港'))) return '中国-香港';
    if ((countryName && countryName.includes('澳门')) || (regionName && regionName.includes('澳门'))) return '中国-澳门';
    if (countryName === 'CN') return '中国';
    return countryName || 'N/A';
}
async function getPublicIP() {
    const apis = ['https://api.ipify.org?format=json', 'https://ipinfo.io/json'];
    for (const apiUrl of apis) {
        try {
            const response = await fetch(apiUrl, { signal: AbortSignal.timeout(3000) });
            if (!response.ok) continue;
            const data = await response.json();
            if (data.ip) return data.ip;
        } catch (e) {
            console.warn('Failed to fetch public IP from ' + apiUrl, e);
        }
    }
    throw new Error('所有主要来源都无法获取公网 IP');
}
async function queryAllAPIs(ip) {
    const apiEndpoints = [
        {
            name: 'PCOnline',
            url: 'http://whois.pconline.com.cn/ipJson.jsp?ip=' + ip + '&json=true',
            parser: (data) => {
                if (!data.ip || data.err || data.proCode === '999999') return null;
                const addrParts = data.addr.split(' ').filter(Boolean);
                const country = formatCountry(data.pro);
                const region = data.pro.replace('省','').replace('市','');
                const city = data.city.replace('市','');
                const isp = addrParts.length > 2 ? addrParts[2] : (addrParts.length > 1 && region !== city ? addrParts[1] : 'N/A');
                return { ip: data.ip, country: country.startsWith('中国-') ? country : '中国', region: region, city: city, isp: isp, org: isp };
            }
        },
        {
            name: 'ip.taobao.com',
            url: 'http://ip.taobao.com/service/getIpInfo.php?ip=' + ip,
            parser: (data) => {
                if (data.code !== 0 || !data.data.ip) return null;
                const d = data.data;
                return { ip: d.ip, country: formatCountry(d.country), region: d.region, city: d.city, isp: d.isp, org: d.isp };
            }
        },
        { 
            name: 'ip-api.com', 
            url: 'https://ip-api.com/json/' + ip + '?lang=zh-CN&fields=status,country,countryCode,regionName,city,isp,org,query',
            parser: (data) => {
                if (data.status !== 'success') return null;
                return { ip: data.query, country: formatCountry(data.country, data.regionName), region: data.regionName, city: data.city, isp: data.isp, org: data.org };
            }
        },
        {
            name: 'ip.sb',
            url: 'https://api.ip.sb/geoip/' + ip,
            parser: (data) => {
                if (!data.ip) return null;
                return { ip: data.ip, country: formatCountry(data.country), region: data.region, city: data.city, isp: data.isp, org: data.organization };
            }
        },
        {
            name: 'freeipapi.com',
            url: 'https://freeipapi.com/api/json/' + ip,
            parser: (data) => {
                if (!data.ipAddress) return null;
                return { ip: data.ipAddress, country: formatCountry(data.countryName), region: data.regionName, city: data.cityName, isp: data.isp, org: data.isp };
            }
        },
        {
            name: 'ipinfo.io',
            url: 'https://ipinfo.io/' + ip + '/json',
            parser: (data) => {
                if (!data.ip) return null;
                return { ip: data.ip, country: formatCountry(data.country), region: data.region, city: data.city, isp: data.org?.split(' ').slice(1).join(' '), org: data.org };
            }
        }
    ];
    const promises = apiEndpoints.map(api => 
        fetch(api.url, { signal: AbortSignal.timeout(4000) })
            .then(response => {
                if (!response.ok) throw new Error(api.name + ' HTTP error ' + response.status);
                if (api.name === 'PCOnline') {
                    return response.arrayBuffer().then(buffer => {
                        try {
                            const decoder = new TextDecoder('gbk');
                            return JSON.parse(decoder.decode(buffer));
                        } catch { return null; }
                    });
                }
                return response.json();
            })
            .then(data => {
                try {
                    return { name: api.name, data: data ? api.parser(data) : null };
                } catch {
                    return { name: api.name, data: null, error: '解析失败' };
                }
            })
            .catch(error => ({ name: api.name, data: null, error: error.message }))
    );
    const results = await Promise.all(promises);
    return processAndCompareResults(results.filter(r => r && r.data));
}
function processAndCompareResults(validResults) {
    if (validResults.length === 0) {
        return { consolidated: null, sources: [] };
    }
    const preferredSource = validResults.find(r => r.name === 'PCOnline' || r.name === 'ip.taobao.com' || r.name === 'ip-api.com') || validResults[0];
    const consolidated = { ...preferredSource.data };
    for(const key in consolidated) { if(!consolidated[key]) delete consolidated[key]; }
    const sources = validResults.map(source => {
        const isConsistent = {
            country: source.data.country === consolidated.country,
            region: source.data.region === consolidated.region,
            city: source.data.city === consolidated.city,
            isp: source.data.isp === consolidated.isp
        };
        return { ...source, isConsistent };
    });
    return { consolidated, sources };
}
self.onmessage = async (event) => {
    const { type, ip } = event.data;
    try {
        if (type !== 'query') throw new Error('Invalid worker command');
        const targetIp = ip;
        
        if (!targetIp) { throw new Error("无法确定要查询的IP地址。"); }
        if (targetIp === '127.0.0.1' || targetIp.startsWith('192.168.') || targetIp.startsWith('10.')) {
            const result = { 
                consolidated: { ip: targetIp, country: '局域网地址', region: '内部网络', city: '', isp: '' },
                sources: []
            };
            postMessage({ type: 'success', payload: result });
            return;
        }
        const results = await queryAllAPIs(targetIp);
        if (!results.consolidated) {
            throw new Error("所有数据源均未能返回有效信息。");
        }
        postMessage({ type: 'success', payload: results });
    } catch (error) {
        postMessage({ type: 'error', payload: error.message });
    }
};
`;

class IPQueryTool extends BaseTool {
    constructor() {
        super('ip-query', 'IP属地查询', { workerCode });
        this.dom = {};
        this.abortController = null;
    }

    render() {
        return `
            <div class="page-container" style="display: flex; flex-direction: column; height: 100%;">
                <div class="section-header">
                    <button id="back-to-toolbox-btn" class="back-btn ripple"><i class="fas fa-arrow-left"></i> 返回工具箱</button>
                    <h1 style="flex-grow: 1; text-align: center;">IP属地查询</h1>
                </div>
                <div class="ip-input-group" style="margin-bottom: 20px; flex-shrink: 0;">
                    <input type="text" id="ip-input" placeholder="输入IP地址进行多源查询">
                    <button id="query-ip-btn" class="action-btn ripple"><i class="fas fa-search"></i> 查询</button>
                    <button id="query-myip-btn" class="control-btn ripple"><i class="fas fa-user-check"></i> 查询本机IP (详细)</button>
                </div>
                <div id="ip-results-container" class="content-area" style="padding: 10px 20px 10px 10px; flex-grow: 1; overflow-y: auto;">
                    <div class="loading-container">
                        <p class="loading-text">输入 IP 地址或点击“查询本机IP”</p>
                    </div>
                </div>
            </div>`;
    }

    init() {
        this.dom.input = document.getElementById('ip-input');
        this.dom.queryBtn = document.getElementById('query-ip-btn');
        this.dom.queryMyIpBtn = document.getElementById('query-myip-btn'); // [修改]
        this.dom.resultsContainer = document.getElementById('ip-results-container');
        
        document.getElementById('back-to-toolbox-btn')?.addEventListener('click', () => {
             window.mainPage.navigateTo('toolbox');
             window.mainPage.updateActiveNavButton(document.getElementById('toolbox-btn'));
        });

        this.dom.queryBtn.addEventListener('click', this._handleQueryOthers.bind(this)); // [修改]
        this.dom.queryMyIpBtn.addEventListener('click', this._handleQuerySelf.bind(this)); // [修改]
        this.dom.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._handleQueryOthers(); });
        
        this._log('工具已初始化');
    }

    // Worker 消息处理器 (用于多源查询)
    _onWorkerMessage(data) {
        if (data.type === 'success') {
            this._renderMultiSourceResults(data.payload); 
            this._log('多源查询成功: ' + (data.payload.consolidated?.ip || 'N/A'));
        } else {
            this._showError(data.payload);
            this._log('多源查询失败: ' + data.payload);
        }
    }

    // [修改] 查询指定 IP (多源)
    _handleQueryOthers() {
        if (this.abortController) this.abortController.abort();
        this.abortController = new AbortController();
        
        const ip = this.dom.input.value.trim();
        if (!ip) {
            this._notify('提示', '请输入一个IP地址进行查询', 'info');
            return;
        }

        this._showLoading();
        this._log('开始查询IP (多源): ' + ip);
        this._postMessageToWorker({ type: 'query', ip });
    }

    // [修改] 查询本机 IP (商业级)
    _handleQuerySelf() {
        if (this.abortController) this.abortController.abort();
        this.abortController = new AbortController();
        
        this._showLoading();
        this._log('开始查询本机公网IP (商业级)');
        this._queryMyIpInfo();
    }
    
    // [新增] 查询本机 IP (商业级 API)
    async _queryMyIpInfo() {
        const apiUrl = 'https://uapis.cn/api/v1/network/myip?source=commercial';
        try {
            const response = await fetch(apiUrl, { signal: this.abortController.signal });

            const blob = await response.blob();
            window.electronAPI.addTraffic(blob.size);
            const data = JSON.parse(await blob.text());

            if (!response.ok || data.code !== 200) {
                throw new Error(data.message || `API 请求失败: ${response.status}`);
            }

            this.dom.input.value = data.ip; // 将查询到的 IP 填入输入框
            this._renderMyIpResults(data); // 使用新的渲染函数
            this._log(`本机IP查询成功: ${data.ip}`);

        } catch (error) {
             if (error.name === 'AbortError') {
                this._log('本机IP查询被中止');
                this._showError('查询已取消');
                return;
            }
            this._showError(error.message);
            this._log(`本机IP查询失败: ${error.message}`);
        }
    }

    _showLoading() { 
        this.dom.resultsContainer.innerHTML = `<div class="loading-container"><img src="./assets/loading.gif" alt="查询中..." class="loading-gif"><p class="loading-text">正在查询, 请稍候...</p></div>`; 
    }

    _showError(message) { 
        this.dom.resultsContainer.innerHTML = `<div class="loading-container"><p class="error-message"><i class="fas fa-exclamation-triangle"></i> 查询失败: ${message}</p></div>`; 
    }

    // [新增] 渲染本机 IP (商业级) 结果
    _renderMyIpResults(data) {
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
                <h2 style="text-align: center; margin-bottom: 15px;">本机IP (商业级) 详细信息</h2>
                <div class="ip-result-grid" style="grid-template-columns: 1fr 1fr;">
                    
                    <div class="ip-result-category">
                        <h3><i class="fas fa-network-wired"></i> 网络信息</h3>
                        ${renderItem('IP 地址', data.ip)}
                        ${renderItem('运营商', data.isp)}
                        ${renderItem('归属', data.llc)}
                        ${renderItem('ASN', data.asn)}
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

    // 渲染多源查询 (指定 IP) 结果
    _renderMultiSourceResults(data) {
        const { consolidated, sources } = data;
        if (!consolidated || !consolidated.ip) {
            this._showError('未能从任何来源获取到有效的IP信息。');
            return;
        }

        const renderConsolidatedItem = (key, value) => value ? `
            <div class="ip-result-item">
                <span class="ip-result-key">${key}</span>
                <span class="ip-result-value">${value}</span>
            </div>` : '';

        const consolidatedHtml = `
            <div class="ip-results-wrapper">
                <div class="ip-result-grid">
                    <div class="ip-result-category">
                        <h3><i class="fas fa-map-marked-alt"></i> 综合查询结果 (多源)</h3>
                        ${renderConsolidatedItem('IP 地址', consolidated.ip)}
                        ${renderConsolidatedItem('国家/地区', consolidated.country)}
                        ${renderConsolidatedItem('省份', consolidated.region)}
                        ${renderConsolidatedItem('城市', consolidated.city)}
                        ${renderConsolidatedItem('运营商', consolidated.isp)}
                    </div>
                </div>
            </div>`;

        const comparisonHtml = sources && sources.length > 0 ? `
            <div class="ip-comparison-container">
                <h3><i class="fas fa-balance-scale"></i> 各数据源比对详情</h3>
                <table class="ip-comparison-table">
                    <thead>
                        <tr>
                            <th>数据源</th>
                            <th>国家/地区</th>
                            <th>省份/地区</th>
                            <th>城市</th>
                            <th>运营商</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sources.map(source => `
                            <tr>
                                <td>${source.name}</td>
                                <td class="${source.isConsistent.country ? 'consistent' : 'inconsistent'}">${source.data.country || 'N/A'}</td>
                                <td class="${source.isConsistent.region ? 'consistent' : 'inconsistent'}">${source.data.region || 'N/A'}</td>
                                <td class="${source.isConsistent.city ? 'consistent' : 'inconsistent'}">${source.data.city || 'N/A'}</td>
                                <td class="${source.isConsistent.isp ? 'consistent' : 'inconsistent'}">${source.data.isp || 'N/A'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                 <p class="comparison-note">
                    <i class="fas fa-info-circle"></i> 提示：标红字段表示与综合结果不一致。
                 </p>
            </div>` : '';

        this.dom.resultsContainer.innerHTML = `<div style="animation: contentFadeIn 0.5s;">${consolidatedHtml}${comparisonHtml}</div>`;
    }
    
    destroy() {
        if (this.abortController) {
            this.abortController.abort();
        }
        this._log('工具已销毁');
        super.destroy(); // 确保 Worker 也被终止
    }
}
export default IPQueryTool;