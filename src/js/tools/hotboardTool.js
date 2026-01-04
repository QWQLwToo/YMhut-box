// src/js/tools/hotboardTool.js
import BaseTool from '../baseTool.js';

class HotboardTool extends BaseTool {
    constructor() {
        super('hotboard', '多平台实时热榜');
        this.abortController = null;
        
        // [新增] 定义所有平台及其分类
        this.platformCategories = [
            {
                name: '视频/社区',
                platforms: [
                    { id: 'bilibili', name: '哔哩哔哩' }, { id: 'acfun', name: 'A站' },
                    { id: 'weibo', name: '新浪微博' }, { id: 'zhihu', name: '知乎热榜' },
                    { id: 'zhihu-daily', name: '知乎日报' }, { id: 'douyin', name: '抖音热榜' },
                    { id: 'kuaishou', name: '快手热榜' }, { id: 'douban-movie', name: '豆瓣电影' },
                    { id: 'douban-group', name: '豆瓣小组' }, { id: 'tieba', name: '百度贴吧' },
                    { id: 'hupu', name: '虎扑热帖' }, { id: 'miyoushe', name: '米游社' },
                    { id: 'ngabbs', name: 'NGA论坛' }, { id: 'v2ex', name: 'V2EX' },
                    { id: '52pojie', name: '吾爱破解' }, { id: 'hostloc', name: '全球主机论坛' },
                    { id: 'coolapk', name: '酷安热榜' }
                ]
            },
            {
                name: '新闻/资讯',
                platforms: [
                    { id: 'baidu', name: '百度热搜' }, { id: 'thepaper', name: '澎湃新闻' },
                    { id: 'toutiao', name: '今日头条' }, { id: 'qq-news', name: '腾讯新闻' },
                    { id: 'sina', name: '新浪热搜' }, { id: 'sina-news', name: '新浪新闻' },
                    { id: 'netease-news', name: '网易新闻' }, { id: 'huxiu', name: '虎嗅网' },
                    { id: 'ifanr', name: '爱范儿' }
                ]
            },
            {
                name: '技术/IT',
                platforms: [
                    { id: 'sspai', name: '少数派' }, { id: 'ithome', name: 'IT之家' },
                    { id: 'ithome-xijiayi', name: 'IT之家·喜加一' }, { id: 'juejin', name: '掘金' },
                    { id: 'jianshu', name: '简书' }, { id: 'guokr', name: '果壳' },
                    { id: '36kr', name: '36氪' }, { id: '51cto', name: '51CTO' },
                    { id: 'csdn', name: 'CSDN' }, { id: 'nodeseek', name: 'NodeSeek' },
                    { id: 'hellogithub', name: 'HelloGitHub' }
                ]
            },
            {
                name: '游戏',
                platforms: [
                    { id: 'lol', name: '英雄联盟' }, { id: 'genshin', name: '原神' },
                    { id: 'honkai', name: '崩坏3' }, { id: 'starrail', name: '星穹铁道' }
                ]
            },
            {
                name: '其他',
                platforms: [
                    { id: 'weread', name: '微信读书' }, { id: 'weatheralarm', name: '天气预警' },
                    { id: 'earthquake', name: '地震速报' }, { id: 'history', name: '历史上的今天' }
                ]
            }
        ];
    }

    render() {
        return `
            <div class="page-container" style="display: flex; flex-direction: column; height: 100%;">
                <div class="content-area" style="padding: 20px; flex-grow: 1; display: flex; flex-direction: column; gap: 20px; overflow-y: hidden;">
                    <div class="settings-section" style="padding: 20px; display: flex; flex-direction: column; height: 100%; min-height: 0;">
                        <h2><i class="fas fa-fire-alt"></i> 多平台实时热榜</h2>
                        
                        <div class="ip-input-group" style="margin-bottom: 20px; flex-shrink: 0;">
                            
                            <div id="hotboard-select-wrapper" class="custom-select-wrapper" style="flex-grow: 3;">
                                <div id="hotboard-select-trigger" class="custom-select-trigger" data-value="bilibili">
                                    <span>哔哩哔哩</span>
                                    <i class="fas fa-chevron-down custom-select-arrow"></i>
                                </div>
                                <div id="hotboard-select-options" class="custom-select-options" style="max-height: 400px;">
                                    ${this.platformCategories.map(category => `
                                        <div class="custom-select-group">
                                            <div class="custom-select-group-title">${category.name}</div>
                                            ${category.platforms.map(p => `<div class="custom-select-option" data-value="${p.id}">${p.name}</div>`).join('')}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>

                            <button id="hotboard-query-btn" class="action-btn ripple" style="flex-grow: 1;"><i class="fas fa-sync-alt"></i> 刷新</button>
                        </div>
                        
                        <div id="hotboard-results-container" style="flex-grow: 1; min-height: 0; overflow-y: auto;">
                            <div class="loading-container">
                                <p class="loading-text">请选择平台后点击刷新</p>
                            </div>
                        </div>
                        <p id="hotboard-update-time" class="comparison-note" style="text-align: right; margin-top: 10px; flex-shrink: 0;"></p>
                    </div>
                </div>
            </div>
        `;
    }

    init() {
        this._log('工具已初始化');

        this.dom = {
            queryBtn: document.getElementById('hotboard-query-btn'),
            resultsContainer: document.getElementById('hotboard-results-container'),
            updateTimeEl: document.getElementById('hotboard-update-time'),
            selectWrapper: document.getElementById('hotboard-select-wrapper'),
            selectTrigger: document.getElementById('hotboard-select-trigger'),
            selectOptionsContainer: document.getElementById('hotboard-select-options'),
            selectOptions: document.querySelectorAll('.custom-select-option')
        };

        this.dom.queryBtn.addEventListener('click', this._handleQuery.bind(this));

        // 自定义下拉菜单 JS 逻辑
        this.dom.selectTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this.dom.selectWrapper.classList.toggle('active');
        });

        this.dom.selectOptions.forEach(option => {
            option.addEventListener('click', () => {
                this.dom.selectTrigger.querySelector('span').textContent = option.textContent;
                this.dom.selectTrigger.dataset.value = option.dataset.value;
                
                // [BUG 修复]
                // 新增下面这行代码来关闭下拉菜单
                this.dom.selectWrapper.classList.remove('active');
                
                this._handleQuery(); // 选择后立即查询
            });
        });

        document.addEventListener('click', (e) => {
            if (this.dom.selectWrapper && !this.dom.selectWrapper.contains(e.target)) {
                this.dom.selectWrapper.classList.remove('active');
            }
        });

        // 默认加载一次 B站
        this._handleQuery();
    }

    async _handleQuery() {
        const type = this.dom.selectTrigger.dataset.value;
        if (!type) {
            this._notify('错误', '未选择任何热榜平台', 'error');
            return;
        }

        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();

        this.dom.queryBtn.disabled = true;
        this.dom.queryBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        // [修改]
        // 将 <img ...> 替换为自定义的 .pacman-loader HTML
        this.dom.resultsContainer.innerHTML = `
            <div class="loading-container">
                <div class="pacman-loader">
                    <div></div><div></div><div></div><div></div><div></div>
                </div>
                <p class="loading-text">正在获取 ${this.dom.selectTrigger.querySelector('span').textContent}...</p>
            </div>`;
        
        this.dom.updateTimeEl.textContent = '';

        try {
            const apiUrl = `https://uapis.cn/api/v1/misc/hotboard?type=${type}`;
            const response = await fetch(apiUrl, { signal: this.abortController.signal });

            const blob = await response.blob();
            window.electronAPI.addTraffic(blob.size);
            const json = JSON.parse(await blob.text());

            if (!response.ok) {
                throw new Error(json.message || `API 请求失败: ${response.status}`);
            }

            this._renderResults(json);
            this.dom.updateTimeEl.textContent = `数据更新于: ${json.update_time || 'N/A'}`;
            this._log(`热榜查询成功: ${type}`);

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
            this.dom.queryBtn.innerHTML = '<i class="fas fa-sync-alt"></i> 刷新';
            this.abortController = null;
        }
    }

    _renderResults(data) {
        if (!data.list || data.list.length === 0) {
            this.dom.resultsContainer.innerHTML = `<p class="error-message" style="text-align: center;">未查询到 ${data.type} 的热榜记录。</p>`;
            return;
        }

        const tableRows = data.list.map(item => {
            const rank = item.index;
            const title = item.title;
            const searchUrl = item.url;
            const hotValue = item.hot_value ? parseFloat(item.hot_value) : 0;
            
            // 格式化热度值
            let formattedHotValue = hotValue;
            if (hotValue > 1000000) { // 大于 100 万
                formattedHotValue = (hotValue / 10000).toFixed(1) + 'w';
            } else if (hotValue > 1000) { // 大于 1000
                formattedHotValue = (hotValue / 1000).toFixed(1) + 'k';
            }

            let rankClass = '';
            if (rank <= 3) {
                rankClass = `rank-top-3 rank-${rank}`;
            }

            // 处理 extra 标签 (如 '新', '爆')
            let extraTag = '';
            let tagText = item.extra?.tag || (typeof item.extra === 'string' ? item.extra : null);
            if (tagText) {
                 // API 返回的标签可能包含“热”、“新”等，样式化
                 const tagClass = (tagText === '爆' || tagText === '热') ? 'hotboard-tag tag-hot' : 'hotboard-tag tag-new';
                 extraTag = `<span class="${tagClass}">${tagText}</span>`;
            }

            // [UI 重构] 使用新的三栏布局
            return `
                <tr>
                    <td style="width: 50px; text-align: center;">
                        <span class="bili-hot-rank ${rankClass}">${rank}</span>
                    </td>
                    <td>
                        <a href="#" data-link="${searchUrl}" class="hotboard-title-link">${title}</a>
                        ${extraTag}
                    </td>
                    <td style="width: 100px; text-align: right;">
                        <span class="hotboard-value">${formattedHotValue}</span>
                    </td>
                </tr>
            `;
        }).join('');

        // [UI 重构] 使用 ip-comparison-table 样式（带边框），并添加 thead
        this.dom.resultsContainer.innerHTML = `
            <table class="ip-comparison-table hotboard-table" style="animation: contentFadeIn 0.5s;">
                <thead>
                    <tr>
                        <th style="width: 50px; text-align: center;">排名</th>
                        <th>标题</th>
                        <th style="width: 100px; text-align: right;">热度</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>`;
            
        this.dom.resultsContainer.querySelectorAll('a[data-link]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                window.electronAPI.openExternalLink(e.currentTarget.dataset.link);
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

export default HotboardTool;