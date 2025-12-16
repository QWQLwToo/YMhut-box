// src/js/tools/biliHotTool.js
import BaseTool from '../baseTool.js';

class BiliHotTool extends BaseTool {
    constructor() {
        super('bili-hot-ranking', 'B站热搜排行榜');
        this.abortController = null;
    }

    render() {
        return `
            <div class="page-container" style="display: flex; flex-direction: column; height: 100%;">
                <div class="section-header">
                    <button id="back-to-toolbox-btn" class="back-btn ripple"><i class="fas fa-arrow-left"></i> 返回工具箱</button>
                    <h1 style="flex-grow: 1; text-align: center;">${this.name}</h1>
                    <button id="refresh-bili-hot" class="control-btn ripple"><i class="fas fa-sync-alt"></i> 刷新</button>
                </div>
                <div id="bili-hot-results-container" class="content-area" style="padding: 0 20px 10px 10px; flex-grow: 1; overflow-y: auto;">
                    <div class="loading-container">
                        <img src="./assets/loading.gif" alt="加载中..." class="loading-gif">
                        <p class="loading-text">正在获取B站热搜...</p>
                    </div>
                </div>
            </div>`;
    }

    init() {
        this._log('工具已初始化');
        document.getElementById('back-to-toolbox-btn')?.addEventListener('click', () => {
             window.mainPage.navigateTo('toolbox');
             window.mainPage.updateActiveNavButton(document.getElementById('toolbox-btn'));
        });
        document.getElementById('refresh-bili-hot')?.addEventListener('click', () => this._fetchAndRenderData());

        this._fetchAndRenderData();
    }

    async _fetchAndRenderData() {
        if (this.abortController) this.abortController.abort();
        this.abortController = new AbortController();

        const resultsContainer = document.getElementById('bili-hot-results-container');
        if (!resultsContainer) return;
        
        resultsContainer.innerHTML = `
            <div class="loading-container">
                <img src="./assets/loading.gif" alt="加载中..." class="loading-gif">
                <p class="loading-text">正在获取B站热搜...</p>
            </div>`;

        try {
            const response = await fetch('https://api.suyanw.cn/api/bl.php?hh=%0A', { signal: this.abortController.signal });
            if (!response.ok) throw new Error(`网络请求失败: ${response.status}`);

            const reader = response.body.getReader();
            const chunks = [];
            let receivedLength = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                receivedLength += value.length;
                window.electronAPI.reportTraffic(value.length);
            }

            await window.electronAPI.addTraffic(receivedLength);

            const blob = new Blob(chunks);
            const data = await blob.text();
            
            this._log('成功获取B站热搜数据');
            this._renderTable(data);
        } catch (error) {
            if (error.name === 'AbortError') return;
            this._log(`获取B站热搜失败: ${error.message}`);
            resultsContainer.innerHTML = `<div class="loading-container"><p class="error-message"><i class="fas fa-exclamation-triangle"></i> 获取失败: ${error.message}</p></div>`;
        }
    }

    _renderTable(data) {
        const resultsContainer = document.getElementById('bili-hot-results-container');
        const items = data.split('\n').filter(Boolean);

        if (items.length === 0) {
            resultsContainer.innerHTML = `<div class="loading-container"><p>未能解析到任何热搜条目。</p></div>`;
            return;
        }

        const tableRows = items.map(item => {
            const parts = item.split('±img=');
            const titlePart = parts[0];
            // 图片暂不显示，保持布局整洁
            // const imageUrl = parts[1] ? parts[1].trim() : null;

            const rankMatch = titlePart.match(/^(\d+)：/);
            const rank = rankMatch ? rankMatch[1] : '';
            const title = rankMatch ? titlePart.substring(rankMatch[0].length).trim() : titlePart.trim();
            const searchUrl = `https://search.bilibili.com/all?keyword=${encodeURIComponent(title)}`;
            
            let rankClass = '';
            if (rank <= 3) {
                rankClass = `rank-top-3 rank-${rank}`;
            }

            // [UI 修复] 使用 hotboard-rank 和 hotboard-title-link 统一类名
            // [逻辑修复] 将 data-link 放在 tr 上
            return `
                <tr data-link="${searchUrl}">
                    <td style="width: 50px; text-align: center;">
                        <span class="hotboard-rank ${rankClass}">${rank}</span>
                    </td>
                    <td>
                        <span class="hotboard-title-link">${title}</span>
                    </td>
                </tr>
            `;
        }).join('');

        resultsContainer.innerHTML = `
            <table class="bili-hot-table">
                <thead>
                    <tr>
                        <th>排名</th>
                        <th>标题</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>`;
            
        // [核心修复] 绑定行点击事件 + URL 安全校验
        resultsContainer.querySelectorAll('tr[data-link]').forEach(row => {
            row.addEventListener('click', (e) => {
                e.preventDefault();
                const url = row.dataset.link;
                
                // 只有合法的 HTTP/HTTPS 链接才打开
                if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
                    window.electronAPI.openExternalLink(url);
                } else {
                    this._notify('无法打开', '该条目没有有效的跳转链接', 'info');
                }
            });
        });
    }

    destroy() {
        if (this.abortController) this.abortController.abort();
        this._log('工具已销毁');
        super.destroy();
    }
}

export default BiliHotTool;