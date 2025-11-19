// src/js/tools/qqAvatarTool.js
import BaseTool from '../baseTool.js';
import configManager from '../configManager.js';

class QQAvatarTool extends BaseTool {
    constructor() {
        super('qq-avatar', 'QQ 信息查询'); // 名字已更新
        this.currentAvatarUrl = null;
        this.abortController = null;
    }

    render() {
        return `
            <div class="page-container" style="display: flex; flex-direction: column; height: 100%;">
                <div class="section-header">
                    <button id="back-to-toolbox-btn" class="back-btn ripple"><i class="fas fa-arrow-left"></i> 返回工具箱</button>
                    <h1 style="flex-grow: 1; text-align: center;">${this.name}</h1>
                </div>
                 <div class="ip-input-group" style="margin: 0 20px 20px 20px; flex-shrink: 0;">
                    <input type="text" id="qq-input" placeholder="输入 QQ 号 (纯数字)">
                    <button id="query-qq-btn" class="action-btn ripple"><i class="fas fa-search"></i> 查询</button>
                </div>
                
                <div class="content-area" style="padding: 0 20px 20px 20px; flex-grow: 1; overflow-y: auto;">
                    <div id="qq-results-container" class="settings-section" style="padding: 20px; display: none;">
                        
                        <div style="display: flex; gap: 20px; align-items: center; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--border-color);">
                            <div class="media-container" style="width: 100px; height: 100px; flex-grow: 0; flex-shrink: 0; border-radius: 50%;">
                                <div class="media-loading" style="display:none; border-radius: 50%;">
                                    <img src="./assets/loading.gif" alt="加载中..." class="loading-gif" style="width: 40px; height: 40px; min-width: auto;">
                                </div>
                                <div id="qq-avatar-content" class="media-content">
                                    <i class="fab fa-qq" style="font-size: 50px; color: var(--text-secondary);"></i>
                                </div>
                            </div>
                            
                            <div style="flex-grow: 1;">
                                <h2 id="qq-nickname" style="margin-bottom: 5px;">---</h2>
                                <p id="qq-long-nick" style="color: var(--text-secondary); font-size: 14px; margin-bottom: 10px;">---</p>
                                <button id="download-avatar" class="control-btn mini-btn ripple" disabled><i class="fas fa-download"></i> 下载头像</button>
                            </div>
                        </div>

                        <div class="info-grid horizontal">
                            <div class="info-item">
                                <span class="info-label">QQ 号</span>
                                <span id="qq-qq" class="info-value">---</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">性别</span>
                                <span id="qq-sex" class="info-value">---</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">年龄</span>
                                <span id="qq-age" class="info-value">---</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">QQ 等级</span>
                                <span id="qq-level" class="info-value">---</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">地理位置</span>
                                <span id="qq-location" class="info-value">---</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">QQ 邮箱</span>
                                <span id="qq-email" class="info-value">---</span>
                            </div>
                        </div>
                    </div>
                    
                    <div id="qq-placeholder" class="loading-container" style="display: flex;">
                         <p class="loading-text">请输入 QQ 号进行查询</p>
                    </div>
                </div>
            </div>`;
    }

    init() {
        this._log('工具已初始化');
        // 缓存 DOM
        this.dom = {
            input: document.getElementById('qq-input'),
            queryBtn: document.getElementById('query-qq-btn'),
            resultsContainer: document.getElementById('qq-results-container'),
            placeholder: document.getElementById('qq-placeholder'),
            avatarLoading: document.querySelector('.media-container .media-loading'),
            avatarContent: document.getElementById('qq-avatar-content'),
            downloadBtn: document.getElementById('download-avatar'),
            
            nickname: document.getElementById('qq-nickname'),
            longNick: document.getElementById('qq-long-nick'),
            qq: document.getElementById('qq-qq'),
            sex: document.getElementById('qq-sex'),
            age: document.getElementById('qq-age'),
            level: document.getElementById('qq-level'),
            location: document.getElementById('qq-location'),
            email: document.getElementById('qq-email'),
        };

        document.getElementById('back-to-toolbox-btn')?.addEventListener('click', () => {
             window.mainPage.navigateTo('toolbox');
             window.mainPage.updateActiveNavButton(document.getElementById('toolbox-btn'));
        });
        
        this.dom.queryBtn.addEventListener('click', () => this._handleQuery());
        this.dom.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._handleQuery();
        });
        this.dom.downloadBtn.addEventListener('click', () => this.downloadCurrentMedia());
    }
    
    _handleQuery() {
        const qq = this.dom.input.value.trim();
        if (!/^[1-9][0-9]{4,10}$/.test(qq)) {
            this._notify('输入错误', '请输入有效的QQ号 (纯数字)', 'error');
            return;
        }
        this._loadUserInfo(qq);
    }

    async _loadUserInfo(qq) {
        if (this.abortController) this.abortController.abort();
        this.abortController = new AbortController();

        this.dom.queryBtn.disabled = true;
        this.dom.queryBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        this.dom.placeholder.style.display = 'none';
        this.dom.resultsContainer.style.display = 'block';
        this._resetFields();
        
        this.currentAvatarUrl = null;
        this.dom.downloadBtn.disabled = true;
        this.dom.avatarLoading.style.display = 'flex';
        this.dom.avatarContent.style.display = 'none';
        
        this._log(`开始获取QQ[${qq}]的信息`);

        // [新增] 性别映射函数
        const mapSex = (apiSex) => {
            const sexStr = String(apiSex).toLowerCase();
            switch (sexStr) {
                case '男':
                case 'male':
                    return '男性';
                case '女':
                case 'female':
                    return '女性';
                default:
                    return '保密';
            }
        };

        try {
            const apiUrl = `https://uapis.cn/api/v1/social/qq/userinfo?qq=${qq}`;
            const response = await fetch(apiUrl, { signal: this.abortController.signal });
            
            const blob = await response.blob();
            window.electronAPI.addTraffic(blob.size);
            const json = JSON.parse(await blob.text());
            
            if (!response.ok) {
                throw new Error(json.message || `API 请求失败: ${response.status}`);
            }

            // 填充数据
            this.currentAvatarUrl = json.avatar_url;
            this.dom.avatarContent.innerHTML = `<img src="${json.avatar_url}" alt="QQ头像 ${json.qq}" style="width: 100%; height: 100%; object-fit: cover;">`;
            this.dom.downloadBtn.disabled = false;
            
            this.dom.nickname.textContent = json.nickname || 'N/A';
            this.dom.longNick.textContent = json.long_nick || 'N/A';
            this.dom.qq.textContent = json.qq || 'N/A';
            this.dom.sex.textContent = mapSex(json.sex); // [修改] 使用映射函数
            this.dom.age.textContent = json.age || 'N/A';
            this.dom.level.textContent = json.qq_level ? `Lv. ${json.qq_level}` : 'N/A';
            this.dom.location.textContent = json.location || 'N/A';
            this.dom.email.textContent = json.email || 'N/A';

            this._log(`成功获取QQ[${qq}]的信息`);

        } catch (error) {
            if (error.name === 'AbortError') { 
                this._log('QQ信息加载被中断');
                this.dom.placeholder.style.display = 'flex';
                this.dom.resultsContainer.style.display = 'none';
                return; 
            }
            this.dom.avatarContent.innerHTML = `<i class="fas fa-exclamation-triangle" style="font-size: 50px; color: var(--error-color);"></i>`;
            this._notify('获取失败', error.message, 'error');
            this._log(`获取QQ信息失败: ${error.message}`);
        } finally {
            this.dom.queryBtn.disabled = false;
            this.dom.queryBtn.innerHTML = '<i class="fas fa-search"></i> 查询';
            this.dom.avatarLoading.style.display = 'none';
            this.dom.avatarContent.style.display = 'flex';
        }
    }

    _resetFields() {
        this.dom.nickname.textContent = '---';
        this.dom.longNick.textContent = '---';
        this.dom.qq.textContent = '---';
        this.dom.sex.textContent = '---';
        this.dom.age.textContent = '---';
        this.dom.level.textContent = '---';
        this.dom.location.textContent = '---';
        this.dom.email.textContent = '---';
        this.dom.avatarContent.innerHTML = `<i class="fab fa-qq" style="font-size: 50px; color: var(--text-secondary);"></i>`;
    }

    async downloadCurrentMedia() {
        if (!this.currentAvatarUrl) {
            this._notify('下载失败', '没有可下载的头像 URL', 'error');
            return;
        }
        
        const qq = this.dom.input.value.trim();
        const downloadBtn = this.dom.downloadBtn;
        
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        try {
            // 1. Fetch the image URL
            const response = await fetch(this.currentAvatarUrl);
            if (!response.ok) throw new Error('无法下载头像文件');
            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();

            // 2. Determine extension
            const extension = blob.type.split('/')[1] || 'png';
            const defaultPath = `qq-avatar-${qq}-${Date.now()}.${extension}`;
            
            // 3. Save
            const result = await window.electronAPI.saveMedia({ buffer: arrayBuffer, defaultPath });
            if (result.success) {
                this._notify('下载成功', `头像已保存`);
            }
        } catch (error) {
            this._notify('下载失败', error.message, 'error');
        } finally {
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = '<i class="fas fa-download"></i> 下载头像';
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

export default QQAvatarTool;