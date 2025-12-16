// src/js/weatherWidget.js
import configManager from './configManager.js';
import uiManager from './uiManager.js';

class WeatherWidget {
    constructor() {
        this.dom = {};
        this.adcodeMap = []; // 内存中缓存行政区划库
        this.isAdcodeLoaded = false;
        
        // 缓存池 (用于数据拼接)
        this.cache = {
            location: null,    // 商业级定位数据
            details: null,     // 源1：生活指数、湿度、空气
            realtime: null,    // 源3：实时温度、天气现象、风力
            forecast: null     // 源1：未来预报(温度范围)
        };
    }

    async init(initialData) {
        this.dom = {
            widget: document.getElementById('title-weather-widget'),
            icon: document.getElementById('tw-icon'),
            location: document.getElementById('tw-location'),
            temp: document.getElementById('tw-temp'),
            
            // 下拉卡片
            cardCity: document.getElementById('tw-card-city'),
            date: document.getElementById('tw-date'),
            bigTemp: document.getElementById('tw-big-temp'),
            weather: document.getElementById('tw-weather'),
            wind: document.getElementById('tw-wind'),
            gridContainer: document.querySelector('#title-weather-widget .wd-grid'),
            
            modal: document.getElementById('weather-widget-modal')
        };

        if (!this.dom.widget) return;
        this.dom.widget.style.display = 'flex';

        // 绑定事件
        this.dom.widget.addEventListener('click', (e) => {
            e.stopPropagation();
            // 如果数据不全，点击重试；否则显示模态框
            if (!this.cache.realtime || this.dom.temp.textContent === '--°') {
                this.refreshAllData();
            } else {
                this.showModal();
            }
        });

        if (this.dom.modal) {
            this.dom.modal.addEventListener('click', (e) => {
                if (e.target === this.dom.modal || e.target.closest('#weather-modal-close')) {
                    this.dom.modal.classList.remove('active');
                }
            });
        }

        // 1. 先加载行政区划库
        await this.loadAdcodeLibrary();

        // 2. 启动数据获取流程
        this.refreshAllData();
    }

    /**
     * [步骤 0] 加载并解析本地行政区划 CSV
     * 文件路径: src/assets/AMap_adcode_citycode.csv
     */
    async loadAdcodeLibrary() {
        if (this.isAdcodeLoaded) return;
        try {
            const response = await fetch('./assets/AMap_adcode_citycode.csv');
            const text = await response.text();
            // 解析 CSV (假设格式: name, adcode, citycode)
            // 根据实际CSV结构调整，这里假设是用逗号或制表符分隔
            // 简单解析器：忽略表头，按行读取
            const lines = text.split('\n');
            this.adcodeMap = lines.map(line => {
                const parts = line.split(','); 
                // 假设 CSV 列顺序: 中文名(0), adcode(1), citycode(2)
                // 您需要根据实际 CSV 内容调整索引
                if (parts.length >= 2) {
                    return {
                        name: parts[0].trim(),
                        adcode: parts[1].trim()
                    };
                }
                return null;
            }).filter(Boolean);
            
            this.isAdcodeLoaded = true;
            console.log(`[Weather] 行政区划库加载完成，共 ${this.adcodeMap.length} 条数据`);
        } catch (e) {
            console.error('[Weather] 行政区划库加载失败:', e);
            // 失败不阻断，后续逻辑会降级使用城市名查询
        }
    }

    /**
     * [主流程] 刷新所有数据
     */
    async refreshAllData() {
        this._renderLoadingState();
        
        try {
            // [步骤 3] 获取定位 (商业级)
            await this._fetchLocation();

            // [步骤 4 & 5] 并行获取天气数据
            // 源1需要城市名，源3优先用Adcode
            const loc = this.cache.location;
            const cityQuery = encodeURIComponent(loc.district || loc.city || '北京'); // 用于源1
            
            await Promise.allSettled([
                this._fetchSource1_Details(cityQuery), // 获取生活指数、详情 (不含温度)
                this._fetchSource3_RealTime(loc)       // 获取实时温度、天气 (含 Adcode 逻辑)
            ]);

            // [步骤 6] 渲染
            this.render();
            configManager.logAction(`[标题栏] 天气更新完成: ${loc.district || loc.city}`, 'system');

        } catch (e) {
            console.error('[Weather] 刷新流程异常:', e);
            this._renderErrorState();
        }
    }

    /**
     * [步骤 3] 获取公网IP及归属 (商业级)
     */
    async _fetchLocation() {
        try {
            // 强制使用 commercial 源
            const res = await fetch('https://uapis.cn/api/v1/network/myip?source=commercial', { signal: AbortSignal.timeout(5000) });
            const data = await res.json();
            
            if (data.code === 200) {
                // 清洗数据：解析 region 字段 (例如 "中国 湖南 长沙")
                let city = '';
                if (data.region) {
                    const parts = data.region.split(' ');
                    // 取最后一个非空部分作为城市，或者使用 district
                    city = parts[parts.length - 1]; 
                }

                this.cache.location = {
                    region: data.region,
                    city: city.replace(/市$/, ''), // 去除后缀用于显示
                    district: data.district ? data.district.replace(/区|县$/, '') : null,
                    full_district: data.district, // 保留完整用于匹配
                    area_code: data.area_code
                };
            } else {
                throw new Error('IP API Error');
            }
        } catch (e) {
            console.warn('[Weather] 定位失败，使用兜底:', e);
            this.cache.location = { city: '北京', district: '东城' };
        }
    }

    /**
     * [步骤 4] 获取源3：商业级实时天气 (Real-time)
     * 策略：优先 Adcode -> 其次 District -> 最后 City
     */
    async _fetchSource3_RealTime(loc) {
        let queryParam = '';
        
        // 1. 尝试匹配 Adcode
        let targetAdcode = null;
        
        // 策略 A: 直接使用 IP 接口返回的 area_code
        if (loc.area_code) {
            targetAdcode = loc.area_code;
        } 
        // 策略 B: 使用 CSV 库反查 (名称匹配)
        else if (this.isAdcodeLoaded && loc.full_district) {
            const match = this.adcodeMap.find(item => item.name === loc.full_district);
            if (match) targetAdcode = match.adcode;
        }

        if (targetAdcode) {
            queryParam = `adcode=${targetAdcode}`;
            console.log(`[Weather] 使用 Adcode 查询: ${targetAdcode}`);
        } else {
            // 降级：使用名称
            const name = loc.full_district || loc.city || '北京市';
            queryParam = `city=${encodeURIComponent(name)}`;
            console.log(`[Weather] 使用名称查询: ${name}`);
        }

        try {
            const res = await fetch(`https://uapis.cn/api/v1/misc/weather?${queryParam}`, { signal: AbortSignal.timeout(6000) });
            const data = await res.json();
            
            // 校验返回 (注意：不同接口返回结构可能不同，需根据示例调整)
            // 示例响应: { adcode, city, humidity, province, temperature, weather, wind_direction, wind_power }
            if (data.weather) {
                this.cache.realtime = {
                    temp: data.temperature,
                    weather: data.weather,
                    windDir: data.wind_direction,
                    windLevel: data.wind_power,
                    humidity: data.humidity, // 源3也提供湿度，作为源1的备选
                    updateTime: data.report_time
                };
            }
        } catch (e) {
            console.warn('[Weather] 源3 (实时) 获取失败:', e);
        }
    }

    /**
     * [步骤 1 & 2] 获取源1：生活指数与详情 (Details)
     * 策略：只保留非温度数据，如果有温度数据则丢弃
     */
    async _fetchSource1_Details(cityQuery) {
        try {
            const res = await fetch(`https://api.suyanw.cn/api/weather.php?city=${cityQuery}&type=json`, { signal: AbortSignal.timeout(6000) });
            const json = await res.json();
            
            if (json.code === 1 && json.data) {
                const d = json.data;
                const c = d.current;
                
                // 提取详情 (非温度)
                this.cache.details = {
                    humidity: c.humidity, // 湿度
                    air: c.air,           // 空气质量
                    pm25: c.air_pm25,     // PM2.5
                    visibility: c.visibility, // 能见度
                    living: d.living || []    // 生活指数
                };
                
                // 提取预报中的温度范围 (源1的范围数据通常在 data.temp/tempn)
                // 也可以结合源3，但这里先用源1的范围
                this.cache.forecast = {
                    low: d.tempn,
                    high: d.temp // 注意：源1根节点的 temp 通常指最高温
                };
                
                // [关键] 绝对不读取 c.temp (实时温度)，避免覆盖源3
            }
        } catch (e) {
            console.warn('[Weather] 源1 (详情) 获取失败:', e);
        }
    }

    // --- 渲染逻辑 ---

    _renderLoadingState() {
        this.dom.location.textContent = '定位中';
        this.dom.temp.textContent = '--';
        this.dom.icon.innerHTML = '<div class="css-icon-cloud" style="opacity:0.5; animation:pulse 1s infinite;"></div>';
    }

    _renderErrorState() {
        this.dom.location.textContent = '离线';
        this.dom.temp.textContent = '--';
        this.dom.icon.innerHTML = '<div class="css-icon-cloud" style="filter:grayscale(1);"></div>';
        this.dom.weather.textContent = '加载失败';
    }

    render() {
        // 数据合并 (Merge)
        const loc = this.cache.location || { city: '未知', district: '' };
        const rt = this.cache.realtime || { temp: '--', weather: '未知', windDir: '', windLevel: '' };
        const det = this.cache.details || { humidity: '', air: '', visibility: '', living: [] };
        const fc = this.cache.forecast || { low: '--', high: '--' };

        // 1. 胶囊显示
        // 优先显示 区/县，没有则显示 市
        const displayName = loc.district || loc.city;
        this.dom.location.textContent = displayName;
        this.dom.temp.innerHTML = `${rt.temp}<span class="weather-unit-small">°C</span>`;
        this._setCssIcon(rt.weather);

        // 2. 下拉卡片
        this.dom.cardCity.textContent = `${loc.city} ${loc.district || ''}`;
        
        // 格式化时间
        const dateObj = new Date();
        const dateStr = `${dateObj.getMonth()+1}月${dateObj.getDate()}日`;
        this.dom.date.textContent = dateStr;

        this.dom.bigTemp.innerHTML = `${rt.temp}<span class="weather-unit-small">°C</span>`;
        this.dom.weather.textContent = rt.weather;
        this.dom.wind.textContent = `${rt.windDir} ${rt.windLevel}`;

        // 3. 详情网格 (优先源1，源3补漏)
        const gridItems = [];
        // 湿度: 源1 > 源3
        const humidity = det.humidity || (rt.humidity ? rt.humidity + '%' : '');
        if (humidity) gridItems.push({ i: 'fa-tint', val: humidity, label: '湿度' });
        
        if (det.air) gridItems.push({ i: 'fa-leaf', val: det.air, label: '空气' });
        if (det.visibility) gridItems.push({ i: 'fa-eye', val: det.visibility, label: '能见度' });
        
        // 温度范围
        if (fc.low !== '--' && fc.high !== '--') {
            gridItems.push({ i: 'fa-temperature-high', val: `${fc.low}~${fc.high}°C`, label: '今日' });
        }

        if (this.dom.gridContainer) {
            this.dom.gridContainer.innerHTML = gridItems.length ? gridItems.map(it => `
                <div class="wd-grid-item" title="${it.label}">
                    <i class="fas ${it.i}"></i> <span>${it.val}</span>
                </div>
            `).join('') : '<div class="wd-hint">暂无详细数据</div>';
        }
    }

    showModal() {
        // 复用 cache 数据渲染模态框
        const loc = this.cache.location || {};
        const rt = this.cache.realtime || {};
        const det = this.cache.details || {};
        const fc = this.cache.forecast || {};

        let bgGradient = 'linear-gradient(135deg, rgba(52, 199, 89, 0.1), rgba(0, 122, 255, 0.1))';
        if ((rt.weather || '').includes('雨')) bgGradient = 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2))';

        // 构造生活指数 HTML (Bento Grid)
        let livingHtml = '';
        if (det.living && det.living.length > 0) {
            livingHtml = `
                <h3 style="font-size: 14px; margin: 20px 0 12px 0; opacity: 0.8; padding-left: 5px;">生活建议</h3>
                <div class="toolbox-bento-grid" style="grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; padding: 0;">
                    ${det.living.map(item => `
                        <div style="background: rgba(var(--bg-color-rgb), 0.5); border: 1px solid var(--border-color); border-radius: 12px; padding: 12px; display: flex; flex-direction: column;">
                            <span style="font-size: 12px; opacity: 0.7; margin-bottom: 4px;">${item.name}</span>
                            <span style="font-size: 13px; font-weight: 600; color: var(--primary-color);">${item.index}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        const modalHtml = `
            <div class="modal-content" style="max-width: 600px; background: rgba(var(--card-background-rgb), 0.95);">
                <div class="modal-header" style="background: transparent; border-bottom: none;">
                    <h3 style="font-size: 16px;"><i class="fas fa-satellite-dish"></i> 实时气象站</h3>
                    <button id="weather-modal-close" style="background:rgba(128,128,128,0.1); border:none; width:28px; height:28px; border-radius:50%; cursor:pointer;"><i class="fas fa-times"></i></button>
                </div>
                
                <div class="modal-body" style="padding-top: 0;">
                    <div class="island-card" style="background: ${bgGradient}; border-color: rgba(var(--primary-rgb), 0.2); height: auto; display: block; padding: 25px; margin-bottom: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <div style="font-size: 24px; font-weight: 800; margin-bottom: 4px;">${loc.city} ${loc.district || ''}</div>
                                <div style="font-size: 12px; opacity: 0.6; font-family: monospace;">商业级数据源校准</div>
                            </div>
                            <div style="font-size: 48px; opacity: 0.9;"><i class="fas ${this._getIconClass(rt.weather)}"></i></div>
                        </div>

                        <div style="display: flex; align-items: baseline; margin-top: 15px;">
                            <span style="font-size: 64px; font-weight: 700; line-height: 1;">${rt.temp}</span>
                            <span style="font-size: 24px; font-weight: 600; margin-left: 5px;">°C</span>
                            <div style="margin-left: 20px;">
                                <div style="font-size: 20px; font-weight: 600;">${rt.weather}</div>
                                <div style="font-size: 13px; opacity: 0.8; margin-top: 4px;">${fc.low} ~ ${fc.high}°C</div>
                            </div>
                        </div>

                        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 25px;">
                            <div class="weather-stat-pill"><i class="fas fa-wind"></i> ${rt.windDir} ${rt.windLevel}</div>
                            ${det.humidity ? `<div class="weather-stat-pill"><i class="fas fa-tint"></i> 湿度 ${det.humidity}</div>` : ''}
                            ${det.air ? `<div class="weather-stat-pill"><i class="fas fa-leaf"></i> 空气 ${det.air}</div>` : ''}
                            ${det.visibility ? `<div class="weather-stat-pill"><i class="fas fa-eye"></i> 能见度 ${det.visibility}</div>` : ''}
                        </div>
                    </div>
                    
                    ${livingHtml}
                </div>
            </div>
        `;
        
        this.dom.modal.innerHTML = modalHtml;
        this.dom.modal.classList.add('active');
    }

    _setCssIcon(weatherText) {
        const w = (weatherText || '').toString();
        let iconHtml = '<div class="css-icon-cloud"></div>';
        if (w.includes('晴')) iconHtml = '<div class="css-icon-sun"></div>';
        else if (w.includes('雨')) iconHtml = '<div class="css-icon-rain"></div>';
        else if (w.includes('雪')) iconHtml = '<div class="css-icon-cloud" style="filter: brightness(1.5);"></div>';
        this.dom.icon.innerHTML = iconHtml;
    }

    _getIconClass(text) {
        if (!text) return 'fa-cloud';
        const t = text.toString();
        if (t.includes('晴')) return 'fa-sun';
        if (t.includes('多云') || t.includes('阴')) return 'fa-cloud-sun';
        if (t.includes('雨')) return 'fa-cloud-showers-heavy';
        if (t.includes('雪')) return 'fa-snowflake';
        if (t.includes('雷')) return 'fa-bolt';
        return 'fa-cloud';
    }
}

export default new WeatherWidget();