// src/js/tools/weatherDetailsTool.js
import BaseTool from '../baseTool.js';
import configManager from '../configManager.js';

class WeatherDetailsTool extends BaseTool {
    constructor() {
        super('weather-details', '全国详细天气');
        this.dom = {};
        this.abortController = null;
        this.apiKey = configManager.config?.api_keys?.nsuuu || '';
    }

    render() {
        return `
            <div class="page-container" style="display: flex; flex-direction: column; height: 100%;">
                
                <div class="content-area" style="padding: 20px; flex-grow: 1; display: flex; flex-direction: column; gap: 20px; overflow-y: auto;">
                    
                    <div class="ip-input-group" style="flex-shrink: 0; background: rgba(var(--card-background-rgb), 0.5); padding: 15px; border-radius: 16px;">
                        <input type="text" id="weather-city-input" placeholder="输入城市名称 (例如: 烟台、北京)" style="flex-grow: 1; background: rgba(var(--bg-color-rgb), 0.5);">
                        <button id="weather-query-btn" class="action-btn ripple" style="min-width: 100px;">
                            <i class="fas fa-search"></i> 查询
                        </button>
                    </div>

                    <div id="weather-results-container" style="flex-grow: 1; min-height: 200px;">
                        <div class="empty-island-state">
                            <div class="empty-icon"><i class="fas fa-city"></i></div>
                            <p>请输入城市名称查询详细天气</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    init() {
        this._log('天气工具初始化');

        this.dom = {
            input: document.getElementById('weather-city-input'),
            btn: document.getElementById('weather-query-btn'),
            container: document.getElementById('weather-results-container')
        };

        this.dom.btn.addEventListener('click', () => this._fetchWeather());
        this.dom.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._fetchWeather();
        });
    }

    async _fetchWeather() {
        const city = this.dom.input.value.trim();
        if (!city) return this._notify('提示', '请输入城市名称', 'info');
        
        if (this.abortController) this.abortController.abort();
        this.abortController = new AbortController();

        this.dom.btn.disabled = true;
        this.dom.btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 查询中...';
        this.dom.container.innerHTML = `
            <div class="loading-container">
                <img src="./assets/loading.gif" class="loading-gif" style="width: 60px;">
                <p class="loading-text">正在聚合多源气象数据...</p>
            </div>`;

        try {
            // [新增] 引入源4 (Weather_2) 以获取准确温度，同源1 (Weather PHP) 并行请求
            const [source1Res, source4Res] = await Promise.allSettled([
                fetch(`https://api.suyanw.cn/api/weather.php?city=${encodeURIComponent(city)}&type=json`, { signal: this.abortController.signal }),
                fetch(`https://api.suyanw.cn/api/weather_2.php?msg=${encodeURIComponent(city)}&type=json`, { signal: this.abortController.signal })
            ]);

            // 解析源1 (基础信息 + 生活指数)
            let data1 = null;
            if (source1Res.status === 'fulfilled') {
                const blob = await source1Res.value.blob();
                window.electronAPI.addTraffic(blob.size);
                try {
                    const text = await blob.text();
                    const json = JSON.parse(text.trim().replace(/^\ufeff/, ''));
                    // 检查状态码
                    if (json.code === 1 || json.code === 200 || json.data) {
                        data1 = json.data || json;
                    }
                } catch (e) { console.warn('源1解析失败', e); }
            }

            // 解析源4 (高精度实时温度)
            let data4 = null;
            if (source4Res.status === 'fulfilled') {
                const blob = await source4Res.value.blob();
                try {
                    const text = await blob.text();
                    data4 = this._parseSource4(text);
                } catch (e) { console.warn('源4解析失败', e); }
            }

            if (!data1 && !data4) {
                throw new Error('未获取到有效数据，请检查城市名称');
            }

            // [数据融合] 使用源4的温度覆盖源1 (如果源4存在且有效)
            const finalData = this._fuseData(data1, data4, city);

            this._renderData(finalData);
            this._log(`查询成功: ${city}`);

        } catch (error) {
            if (error.name === 'AbortError') return;
            this.dom.container.innerHTML = `
                <div class="empty-island-state">
                    <div class="empty-icon" style="color: var(--error-color);"><i class="fas fa-cloud-showers-heavy"></i></div>
                    <p>查询失败</p>
                    <span>${error.message}</span>
                </div>`;
            this._notify('查询失败', error.message, 'error');
        } finally {
            this.dom.btn.disabled = false;
            this.dom.btn.innerHTML = '<i class="fas fa-search"></i> 查询';
            this.abortController = null;
        }
    }

    _parseSource4(raw) {
        let d = {};
        try { const json = JSON.parse(raw); if(json.data) return json.data; } catch {}
        if (typeof raw === 'string') {
            const lines = raw.split('\n');
            lines.forEach(line => {
                const [k, v] = line.split(/[:：]/);
                if (!v) return;
                const val = v.trim();
                if (k.includes('温度')) d.temp = val.replace('℃', '');
                if (k.includes('湿度')) d.humidity = val;
                if (k.includes('气压')) d.pressure = val;
            });
        }
        return d;
    }

    // 数据融合逻辑
    _fuseData(d1, d4, searchCity) {
        // 基础结构
        let data = {
            city: searchCity,
            temp: '--',
            low: '--',
            high: '--',
            weather: '未知',
            wind: '',
            humidity: '',
            air: '',
            visibility: '',
            pressure: '',
            date: new Date().toLocaleDateString(),
            forecast: [],
            living: []
        };

        // 填充源1数据
        if (d1) {
            const c = d1.current || {};
            data.city = c.city || d1.city || searchCity;
            data.weather = c.weather || d1.weather || '未知';
            data.wind = `${c.wind || ''} ${c.windSpeed || ''}`.trim();
            data.humidity = c.humidity || '';
            data.air = c.air || '';
            data.visibility = c.visibility || '';
            data.date = c.date || d1.date || data.date;
            
            // 预报/生活指数
            if (d1.data && Array.isArray(d1.data)) data.forecast = d1.data; // 源1有时候直接返回 forecast 数组
            if (d1.living) data.living = d1.living;

            // 原始温度 (备用)
            if (c.temp) data.temp = c.temp;
            if (d1.tempn) data.low = d1.tempn;
            if (d1.temp) data.high = d1.temp; // 源1根temp通常是高温
        }

        // [核心] 用源4覆盖温度、湿度、气压
        if (d4) {
            if (d4.temp && !isNaN(parseFloat(d4.temp))) data.temp = d4.temp;
            if (d4.humidity) data.humidity = d4.humidity.includes('%') ? d4.humidity : d4.humidity + '%';
            if (d4.pressure) data.pressure = d4.pressure;
        }

        return data;
    }

    _renderData(data) {
        const html = `
            <div style="animation: contentFadeIn 0.5s;">
                <div class="island-card weather-main-card" style="background: rgba(var(--primary-rgb), 0.1); border: 1px solid var(--primary-color); padding: 25px; margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <h2 style="margin: 0 0 5px 0; display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-map-marker-alt"></i> ${data.city}
                            </h2>
                            <p style="margin: 0; opacity: 0.7; font-size: 13px;">${data.date}</p>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 36px; font-weight: 700; color: var(--primary-color); line-height: 1;">${data.temp}°C</div>
                            <div style="font-size: 14px; margin-top: 5px; opacity: 0.8;">${data.low} ~ ${data.high}°C</div>
                        </div>
                    </div>
                    
                    <div style="margin-top: 20px; display: flex; align-items: center; gap: 15px;">
                        <div style="font-size: 40px; color: var(--text-color);">
                            <i class="fas ${this._getWeatherIcon(data.weather)}"></i>
                        </div>
                        <div>
                            <div style="font-size: 18px; font-weight: 600;">${data.weather}</div>
                            <div style="font-size: 14px; opacity: 0.8;">${data.wind}</div>
                        </div>
                    </div>
                    
                    <div class="weather-grid-stats">
                        ${data.humidity ? `<div class="weather-stat-pill"><i class="fas fa-tint"></i> 湿度 ${data.humidity}</div>` : ''}
                        ${data.air ? `<div class="weather-stat-pill"><i class="fas fa-leaf"></i> 空气 ${data.air}</div>` : ''}
                        ${data.visibility ? `<div class="weather-stat-pill"><i class="fas fa-eye"></i> 能见度 ${data.visibility}</div>` : ''}
                        ${data.pressure ? `<div class="weather-stat-pill"><i class="fas fa-tachometer-alt"></i> ${data.pressure}</div>` : ''}
                    </div>
                </div>

                ${(data.forecast && data.forecast.length > 0) ? this._renderForecastList(data.forecast) : ''}
                
                ${(data.living && data.living.length > 0) ? `
                <h3 style="font-size: 14px; margin-bottom: 12px; opacity: 0.8; padding-left: 5px; font-weight: 700;">
                    <i class="fas fa-coffee"></i> 生活指数
                </h3>
                <div class="toolbox-bento-grid" style="grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; padding: 0;">
                    ${data.living.map(item => `
                        <div class="island-card ripple" style="height: auto; min-height: 100px; padding: 15px; flex-direction: column; align-items: flex-start; gap: 8px; background: rgba(var(--card-background-rgb), 0.6);">
                            <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                                <span style="font-size: 12px; opacity: 0.7;">${item.name}</span>
                                <span style="font-size: 13px; font-weight: 700; color: var(--primary-color);">${item.index}</span>
                            </div>
                            <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;" title="${item.tips}">
                                ${item.tips}
                            </div>
                        </div>
                    `).join('')}
                </div>
                ` : ''}
            </div>
            
            <style>
                /* 复用 CSS (确保卡片样式一致) */
                .weather-main-card { box-shadow: 0 10px 30px -10px rgba(0,0,0,0.15); position: relative; overflow: hidden; }
                .weather-grid-stats { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 25px; }
                .weather-stat-pill { background: rgba(255,255,255,0.15); padding: 6px 12px; border-radius: 12px; font-size: 12px; font-weight: 500; display: flex; align-items: center; gap: 6px; backdrop-filter: blur(5px); }
                body[data-theme="dark"] .weather-stat-pill { background: rgba(0,0,0,0.2); }
            </style>
        `;

        this.dom.container.innerHTML = html;
    }

    _renderForecastList(list) {
        // 源1的 forecast 格式通常是数组，第一天是今天
        const future = list.slice(1);
        if (future.length === 0) return '';

        return `
            <h3 style="font-size: 14px; margin: 20px 0 10px 0; opacity: 0.8; padding-left: 5px;">未来预报</h3>
            <div style="display: flex; gap: 10px; overflow-x: auto; padding-bottom: 10px;">
                ${future.map(item => `
                    <div style="min-width: 100px; background: rgba(var(--card-background-rgb), 0.6); border: 1px solid var(--border-color); border-radius: 12px; padding: 15px; text-align: center; flex-shrink: 0;">
                        <div style="font-size: 12px; opacity: 0.7; margin-bottom: 5px;">${item.day || item.week || item.date}</div>
                        <div style="font-size: 24px; color: var(--primary-color); margin: 10px 0;"><i class="fas ${this._getWeatherIcon(item.wea || item.weather)}"></i></div>
                        <div style="font-weight: 600; font-size: 14px; margin-bottom: 5px;">${item.wea || item.weather}</div>
                        <div style="font-size: 12px;">${item.tem2 || item.low} ~ ${item.tem1 || item.high}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    _getWeatherIcon(text) {
        if (!text) return 'fa-cloud';
        const t = text.toString();
        if (t.includes('晴')) return 'fa-sun';
        if (t.includes('多云') || t.includes('阴')) return 'fa-cloud';
        if (t.includes('雨')) return 'fa-cloud-rain';
        if (t.includes('雪')) return 'fa-snowflake';
        if (t.includes('雷')) return 'fa-bolt';
        if (t.includes('雾') || t.includes('霾')) return 'fa-smog';
        if (t.includes('风')) return 'fa-wind';
        return 'fa-cloud-sun';
    }

    destroy() {
        if (this.abortController) this.abortController.abort();
        super.destroy();
    }
}

export default WeatherDetailsTool;