// src/js/tools/baiduHotTool.js

import BaseTool from '../baseTool.js';

class BaiduHotTool extends BaseTool {
    constructor() {
        super('baidu-hot', '百度热搜');
        this.abortController = null;
        // 定义分榜信息
        this.boards = [
            { id: 'hot-search', name: '热搜榜' },
            { id: 'hot-meme', name: '热梗榜' },
            { id: 'finance', name: '财经榜' },
            { id: 'livelihood', name: '民生榜' },
        ];
    }

    render() {
        return `
            <div class="page-container" style="display: flex; flex-direction: column; height: 100%;">
                <div class="section-header">
                    <button id="back-to-toolbox-btn" class="back-btn ripple"><i class="fas fa-arrow-left"></i> 返回工具箱</button>
                    <h1 style="flex-grow: 1; text-align: center;">${this.name}</h1>
                </div>
                <div class="sys-info-tabs baidu-hot-tabs" id="baidu-hot-tabs">
                    ${this.boards.map(board => `
                        <button class="sys-info-tab" data-board-name="${board.name}">${board.name}</button>
                    `).join('')}
                </div>
                <div id="baidu-hot-results-container" class="content-area" style="padding: 0 20px 10px 10px; flex-grow: 1; overflow-y: auto;">
                    <div class="loading-container">
                        <img src="./assets/loading.gif" alt="加载中..." class="loading-gif">
                        <p class="loading-text">正在加载热搜...</p>
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

        const tabs = document.querySelectorAll('#baidu-hot-tabs .sys-info-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                tabs.forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');
                const boardName = e.currentTarget.dataset.boardName;
                this._fetchAndRenderData(boardName);
            });
        });

        // 默认加载第一个榜单
        if (tabs.length > 0) {
            tabs[0].click();
        }
    }

    async _fetchAndRenderData(boardName) {
        if (this.abortController) this.abortController.abort();
        this.abortController = new AbortController();

        const resultsContainer = document.getElementById('baidu-hot-results-container');
        if (!resultsContainer) return;
        
        resultsContainer.innerHTML = `
            <div class="loading-container">
                <img src="./assets/loading.gif" alt="加载中..." class="loading-gif">
                <p class="loading-text">正在加载 ${boardName}...</p>
            </div>`;

        try {
            // 移除 type=json 参数，直接请求默认的文本格式
            const apiUrl = `https://api.suyanw.cn/api/bdrs.php?msg=${encodeURIComponent(boardName)}`;
            const response = await fetch(apiUrl, { signal: this.abortController.signal });
            if (!response.ok) throw new Error(`网络请求失败: ${response.status}`);
            
            // 流量统计
            const blob = await response.blob();
            await window.electronAPI.addTraffic(blob.size);

            // 直接将文本内容传递给渲染方法
            const textData = await blob.text();
            
            this._log(`成功获取 ${boardName} 数据`);
            this._renderList(textData);
        } catch (error) {
            if (error.name === 'AbortError') return;
            // 修正报错信息，使其更符合当前遇到的问题
            const errorMessage = error.message.includes('API') ? error.message : `解析数据失败或网络异常`;
            this._log(`获取 ${boardName} 失败: ${errorMessage}`);
            resultsContainer.innerHTML = `<div class="loading-container"><p class="error-message"><i class="fas fa-exclamation-triangle"></i> 获取失败: ${errorMessage}</p></div>`;
        }
    }

    _renderList(textData) {
        const resultsContainer = document.getElementById('baidu-hot-results-container');
        
        const lines = textData.split('\n').filter(line => line.trim() !== '' && !line.startsWith('----'));

        if (lines.length === 0) {
            throw new Error('API返回数据为空或格式无法解析');
        }

        const tableRows = lines.map(line => {
            // 使用正则表达式解析 "数字：标题" 格式
            const match = line.match(/^(\d+)：(.*)/);
            if (!match) return ''; // 如果某一行格式不符，则跳过

            const rank = match[1];
            const title = match[2].trim();
            // 手动构建百度搜索链接
            const searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(title)}`;
            
            let rankClass = '';
            if (rank <= 3) {
                rankClass = `rank-top-3 rank-${rank}`;
            }

            return `
                <tr>
                    <td>
                        <div class="bili-hot-item">
                            <span class="bili-hot-rank ${rankClass}">${rank}</span>
                            <a href="#" data-link="${searchUrl}" class="bili-hot-title">${title}</a>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        resultsContainer.innerHTML = `
            <table class="bili-hot-table">
                <tbody>
                    ${tableRows}
                </tbody>
            </table>`;
            
        resultsContainer.querySelectorAll('a[data-link]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                window.electronAPI.openExternalLink(e.currentTarget.dataset.link);
            });
        });
    }

    destroy() {
        if (this.abortController) this.abortController.abort();
        this._log('工具已销毁');
        super.destroy();
    }
}

export default BaiduHotTool;