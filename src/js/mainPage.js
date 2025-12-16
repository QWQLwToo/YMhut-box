// src/js/mainPage.js
import configManager from './configManager.js';
import uiManager from './uiManager.js';
import i18n from './i18n.js';
import weatherWidget from './weatherWidget.js'; // [新增] 导入天气组件

// 简易 Markdown 解析器
function parseMarkdown(text) {
    if (!text) return '';
    let html = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code style="background:rgba(255,255,255,0.1); padding:2px 4px; border-radius:4px; font-family:monospace;">$1</code>')
        .replace(/^- (.*)$/gm, '<li>$1</li>')
        .replace(/\n/g, '<br>');
    if (html.includes('<li>')) {
        html = html.replace(/((<li>.*<\/li>)+)/s, '<ul style="padding-left:20px; margin:5px 0;">$1</ul>');
    }
    return html;
}

class MainPage {
    constructor() {
        this.keySequence = '';
        this.keyTimeout = null;
        this.isDownloadingUpdate = false;
        this.dbSettings = {};
        this.settingsInterval = null;
        this.dashboardInterval = null;
        this.activeChartInstance = null;
        this.settingsIntervalHeavy = null;
    }

    // [新增] 统一初始化入口，供 DOMContentLoaded 调用
    init() {
        this.initializeApp();
    }

    async initializeApp() {
        // 1. 加载语言
        await this.loadLanguage();

        // 2. 加载初始数据 (增加超时兜底，防止IPC通信阻塞导致白屏)
        const config = await new Promise(resolve => {
            const timeout = setTimeout(() => {
                console.warn('Initial data timeout, loading defaults...');
                resolve({ dbSettings: { theme: 'dark' }, isOffline: false });
            }, 3000);

            window.electronAPI.onInitialData((data) => {
                clearTimeout(timeout);
                resolve(data);
            });
        });

        if (config.isOffline) { 
            uiManager.renderOfflinePage(config.error); 
            return; 
        }

        this.dbSettings = config.dbSettings || {};
        configManager.setConfig(config);
        uiManager.init();
        
        // [新增] 初始化天气组件 (传入预加载数据)
        if (weatherWidget && weatherWidget.init) {
            weatherWidget.init(config.initWeatherData || {});
        }

        this.bindWindowControls();
        this.bindNavigationEvents();
        this.bindThemeToggle();
        this.addRippleEffectListener();
        this.bindGlobalKeyListener();

        // 全局点击监听器：处理所有自定义下拉菜单的关闭逻辑
        document.addEventListener('click', (e) => {
            document.querySelectorAll('.custom-select-options.dynamic-active').forEach(openDropdown => {
                const wrapperId = openDropdown.id.replace('dd-options-', 'dd-wrapper-');
                const trigger = document.getElementById(wrapperId);
                if (openDropdown && !openDropdown.contains(e.target) && (!trigger || !trigger.contains(e.target))) {
                    openDropdown.classList.remove('dynamic-active');
                }
            });
        });

        window.addEventListener('error', (event) => {
            const error = event.error || {};
            configManager.logAction(`渲染进程发生错误: ${error.message || 'Unknown'}\nStack: ${error.stack || ''}`, 'error');
            uiManager.showNotification('发生内部错误', '详情已记录到日志中', 'error');
        });
        
        // [关键修复] 使用 requestAnimationFrame 确保在下一帧（DOM完全就绪）后导航
        requestAnimationFrame(() => {
            this.navigateTo('home');
            
            const homeBtn = document.getElementById('home-btn');
            if (homeBtn) {
                homeBtn.classList.add('active');
                setTimeout(() => this.updateActiveNavButton(homeBtn), 100);
            }
        });
        
        this.listenForDownloadProgress();
        this.listenForGlobalNetworkSpeed();
        this.autoCheckUpdates();
        
        configManager.logAction('主窗口初始化完成', 'system');
    }

    async loadLanguage() {
        try {
            const langConfig = await window.electronAPI.getLanguageConfig();
            if(langConfig) i18n.init(langConfig.pack, langConfig.fallback);
        } catch (e) {
            console.error("无法加载语言配置:", e);
            i18n.init(null, {});
        }
    }

    async autoCheckUpdates() {
        const lastCheck = localStorage.getItem('last_auto_update_check');
        const now = Date.now();
        const threeDays = 3 * 24 * 60 * 60 * 1000;

        if (!lastCheck || (now - parseInt(lastCheck)) > threeDays) {
            console.log('[Update] 开始后台自动检查更新...');
            try {
                const result = await window.electronAPI.checkUpdates();
                localStorage.setItem('last_auto_update_check', now.toString());
                
                if (result.hasUpdate) {
                    configManager.logAction(`自动检测到新版本: ${result.remoteVersion}`, 'update');
                    uiManager.showActionableNotification(
                        '发现新版本',
                        `V${result.remoteVersion} 现已发布，包含多项优化。`,
                        '去更新',
                        () => {
                            this.navigateToSettingsForUpdate();
                        }
                    );
                }
            } catch (e) {
                console.warn('[Update] 自动检查更新失败:', e.message);
            }
        }
    }

    bindGlobalKeyListener() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            clearTimeout(this.keyTimeout);
            this.keySequence += e.key.toLowerCase();
            if (this.keySequence.length > 5) {
                this.keySequence = this.keySequence.slice(-5);
            }
            if (this.keySequence.includes('vv')) {
                const aboutPanel = document.getElementById('about-panel');
                if (aboutPanel && aboutPanel.classList.contains('active')) {
                    this.handleSecretTrigger(true);
                    this.keySequence = '';
                }
            }
            this.keyTimeout = setTimeout(() => {
                this.keySequence = '';
            }, 1500);
        });
    }

    async handleSecretTrigger(skipValidation = false) {
        const access = await window.electronAPI.checkSecretAccess();
        const showLockoutMessage = (until) => {
            const timeLeftMs = until - Date.now();
            const minutes = Math.ceil(timeLeftMs / 60000);
            const message = access.status === 'ip-banned'
                ? `由于安全策略，您的IP已被临时限制访问此功能，请在 ${minutes} 分钟后重试。`
                : `暗号尝试次数过多，该功能已锁定。请在 ${minutes} 分钟后重试。`;
            uiManager.showNotification('访问受限', message, 'error');
        };

        if (access.status === 'ip-banned' || access.status === 'locked') {
            showLockoutMessage(access.until);
            return;
        }

        const onValidationSuccess = () => {
            configManager.logAction('触发了神秘档案馆彩蛋', 'general');
            window.electronAPI.resetSecretAttempts();
            const currentTheme = document.body.getAttribute('data-theme') || 'dark';
            uiManager.showActionableNotification(
                '暗号正确!',
                '一个通往过去的入口已为你敞开。',
                '进入档案馆',
                () => { window.electronAPI.openSecretWindow(currentTheme); }
            );
        };

        if (skipValidation) {
            onValidationSuccess();
            return;
        }

        uiManager.showPrompt({
            title: '秘密入口',
            label: '请输入暗号以继续…',
            placeholder: '注意大小写哦~',
        }, async (inputValue) => {
            if (inputValue && inputValue.toLowerCase() === 'vv') {
                onValidationSuccess();
            } else if (inputValue !== null) {
                const result = await window.electronAPI.recordSecretFailure();
                configManager.logAction(`彩蛋暗号尝试失败，剩余次数: ${result.attemptsLeft}`, 'general');
                if (result.isLocked) {
                    showLockoutMessage(result.lockoutUntil);
                } else {
                    uiManager.showNotification('暗号错误', `访问被拒绝。你还有 ${result.attemptsLeft} 次机会。`, 'error');
                }
            }
        });
    }

    bindWindowControls() {
        document.getElementById('minimize-btn').addEventListener('click', () => window.electronAPI.minimizeWindow());
        document.getElementById('maximize-btn').addEventListener('click', () => window.electronAPI.maximizeWindow());
        document.getElementById('close-btn').addEventListener('click', () => window.electronAPI.closeWindow());
    }

    bindNavigationEvents() {
        document.getElementById('home-btn').title = i18n.t('nav.home');
        document.getElementById('toolbox-btn').title = i18n.t('nav.toolbox');
        document.getElementById('log-btn').title = i18n.t('nav.logs');
        document.getElementById('settings-btn').title = i18n.t('nav.settings');

        const navActions = {
            'home-btn': () => this.navigateTo('home'),
            'toolbox-btn': () => this.navigateTo('toolbox'),
            'log-btn': () => this.navigateTo('logs'),
            'settings-btn': () => this.navigateTo('settings'),
        };
        for (const [id, action] of Object.entries(navActions)) {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', (e) => {
                    action();
                    this.updateActiveNavButton(e.currentTarget);
                });
            }
        }
    }

    async navigateTo(page, subPage = null) {
        if (this.settingsInterval) { clearInterval(this.settingsInterval); this.settingsInterval = null; }
        if (this.settingsIntervalHeavy) { clearInterval(this.settingsIntervalHeavy); this.settingsIntervalHeavy = null; }
        if (this.dashboardInterval) { clearInterval(this.dashboardInterval); this.dashboardInterval = null; }
        if (this.activeChartInstance) { this.activeChartInstance.destroy(); this.activeChartInstance = null; }

        document.getElementById('update-slide-out-panel')?.remove();
        document.getElementById('announcement-modal')?.remove();
        document.getElementById('update-panel-overlay')?.remove();
        document.getElementById('dd-options-lang-select-wrapper')?.remove();
        document.getElementById('dd-options-font-select')?.remove(); 
        document.getElementById('font-download-modal')?.remove(); 

        uiManager.unloadActiveTool();
        configManager.logAction(`导航到: ${page}`, 'navigation');

        const contentArea = document.getElementById('content-area');

        if (contentArea.children.length > 0) {
            contentArea.classList.add('page-exit');
            await new Promise(r => setTimeout(r, 150)); 
            contentArea.classList.remove('page-exit');
        }

        switch (page) {
            case 'home':
                await this.renderWelcomePage();
                break;
            case 'toolbox':
                uiManager.renderToolboxPage();
                break;
            case 'logs':
                this.renderLogsPage(new Date().toISOString().split('T')[0]);
                break;
            case 'settings':
                await this.renderSettingsPage();
                if (subPage) {
                    setTimeout(() => {
                        const targetNavItem = document.querySelector(`.island-nav-item[data-panel="${subPage}"]`);
                        if (targetNavItem) targetNavItem.click();
                    }, 100); 
                }
                break;
        }

        contentArea.classList.add('page-enter');
        setTimeout(() => {
            contentArea.classList.remove('page-enter');
        }, 200);
    }

    updateActiveNavButton(activeButton) {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        
        if (activeButton) {
            activeButton.classList.add('active');
            const slider = document.getElementById('nav-active-slider');
            if (slider) {
                const targetTop = activeButton.offsetTop;
                const targetHeight = activeButton.offsetHeight;
                slider.style.top = `${targetTop}px`;
                slider.style.height = `${targetHeight}px`;
            }
        }
    }

    async renderWelcomePage() {
        const toolStatus = configManager.config?.tool_status || {};
        const searchToolStatus = toolStatus['smart-search'] || { enabled: true };
        const isSmartSearchEnabled = searchToolStatus.enabled;
        const searchDisabledMessage = isSmartSearchEnabled ? "" : (searchToolStatus.message || i18n.t('home.search.disabled'));

        const contentArea = document.getElementById('content-area');
        const appVersion = await window.electronAPI.getAppVersion();

        const fullAnnouncement = configManager.config?.home_notes || i18n.t('home.announcement.failed');
        const stripHtml = (html) => {
            let tmp = document.createElement("DIV");
            tmp.innerHTML = html;
            return tmp.textContent || tmp.innerText || "";
        };
        const plainText = stripHtml(fullAnnouncement);
        const truncatedText = plainText.length > 50 ? plainText.substring(0, 50) + '...' : plainText;

        const newNotes = configManager.config?.update_notes || {};

        const getGreeting = () => {
            const hour = new Date().getHours();
            if (hour < 6) return i18n.t('home.greeting.night');
            if (hour < 12) return i18n.t('home.greeting.morning');
            if (hour < 14) return i18n.t('home.greeting.noon');
            if (hour < 18) return i18n.t('home.greeting.afternoon');
            return i18n.t('home.greeting.evening');
        };

        const createNotesHtml = (notes) => {
            const entries = Object.entries(notes);
            if (entries.length === 0) return '<p class="empty-notes">暂无更新详情。</p>';
            return entries.map(([key, value]) => `
                <div class="changelog-item">
                    <span class="changelog-key">${key}</span>
                    <div class="changelog-value">${parseMarkdown(value)}</div>
                </div>`).join('');
        };

        contentArea.innerHTML = `
            <div class="page-container welcome-dashboard">
                <div class="welcome-header">
                    <div>
                        <h1 class="gradient-text">${getGreeting()}</h1>
                        <p>${i18n.t('home.welcome')}</p>
                    </div>
                    <button id="show-update-log-btn" class="control-btn ripple">
                        <i class="fas fa-box-open"></i> ${i18n.t('home.updates')}
                    </button>
                </div>
                
                <div id="compact-announcement-card" class="compact-announcement is-overflowing" style="cursor: pointer;">
                    <div class="icon"><i class="fas fa-bullhorn"></i></div>
                    <div style="flex:1; overflow:hidden;">
                        <p id="compact-announcement-text" style="margin:0; font-weight:500; color:var(--text-secondary);">${truncatedText}</p>
                    </div>
                    <div style="font-size:12px; color:var(--primary-color); white-space:nowrap;">${i18n.t('home.announcement.viewFull')} <i class="fas fa-chevron-right" style="font-size:10px;"></i></div>
                </div>

                <div class="welcome-search-bar" title="${searchDisabledMessage}">
                    <input type="text" id="welcome-search-input" placeholder="${isSmartSearchEnabled ? i18n.t('home.search.placeholder') : searchDisabledMessage}" ${!isSmartSearchEnabled ? 'disabled' : ''}>
                    <button id="welcome-search-btn" class="action-btn ripple" ${!isSmartSearchEnabled ? 'disabled' : ''}>
                        <i class="fas fa-search"></i> ${i18n.t('home.search.button')}
                    </button>
                </div>
                <div id="welcome-search-results-container" class="welcome-search-results-container">
                    ${!isSmartSearchEnabled ? `
                        <div class="empty-logs-placeholder" style="margin: auto;">
                            <i class="fas fa-lock"></i>
                            <p>${i18n.t('tool.smartSearch.name')} 已禁用</p>
                            <span>${searchDisabledMessage}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
            <div class="version-display">v${appVersion}</div>
        `;

        uiManager.fadeInContent('.welcome-header, .compact-announcement, .welcome-search-bar');

        // 更新日志面板
        if (!document.getElementById('update-slide-out-panel')) {
            const panelHtml = `
            <div id="update-slide-out-panel" class="update-slide-out-panel">
                <div class="update-panel-header">
                    <h2><i class="fas fa-box-open"></i> ${i18n.t('home.updates')}</h2>
                    <button id="close-update-panel-btn" title="${i18n.t('home.updates.close')}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="changelog-list">${createNotesHtml(newNotes)}</div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', panelHtml);
        }

        // 公告弹窗
        if (!document.getElementById('announcement-modal')) {
            const modalHtml = `
            <div id="announcement-modal" class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-bullhorn"></i> ${i18n.t('home.updates.modal.title')}</h3>
                        <button id="modal-close-btn" title="${i18n.t('home.updates.close')}">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body"><div id="modal-announcement-content" style="line-height: 1.8;"></div></div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        // 遮罩层
        if (!document.getElementById('update-panel-overlay')) {
            const overlayHtml = `<div id="update-panel-overlay" class="update-panel-overlay"></div>`;
            document.body.insertAdjacentHTML('beforeend', overlayHtml);
        }

        if (this.dashboardInterval) { clearInterval(this.dashboardInterval); this.dashboardInterval = null; }

        const searchInput = document.getElementById('welcome-search-input');
        const searchBtn = document.getElementById('welcome-search-btn');
        const updatePanel = document.getElementById('update-slide-out-panel');
        const showUpdateBtn = document.getElementById('show-update-log-btn');
        const closeUpdateBtn = document.getElementById('close-update-panel-btn');
        const announcementCard = document.getElementById('compact-announcement-card');
        const modalOverlay = document.getElementById('announcement-modal');
        const modalContent = document.getElementById('modal-announcement-content');
        const modalCloseBtn = document.getElementById('modal-close-btn');
        const updateOverlay = document.getElementById('update-panel-overlay');

        if (isSmartSearchEnabled) {
            const onSearch = () => {
                const query = searchInput.value.trim();
                if (query) { this._performWelcomeSearch(query); }
                else { uiManager.showNotification(i18n.t('common.notification.title.info'), i18n.t('home.search.placeholder'), 'info'); }
            };
            searchBtn?.addEventListener('click', onSearch);
            searchInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') onSearch(); });
        }

        const closeUpdatePanel = () => {
            updatePanel?.classList.remove('active');
            updateOverlay?.classList.remove('active');
        };
        const openUpdatePanel = () => {
            updatePanel?.classList.add('active');
            updateOverlay?.classList.add('active');
        };

        showUpdateBtn?.addEventListener('click', () => {
            if (updatePanel.classList.contains('active')) {
                closeUpdatePanel();
            } else {
                openUpdatePanel();
            }
        });
        closeUpdateBtn?.addEventListener('click', closeUpdatePanel);
        updateOverlay?.addEventListener('click', closeUpdatePanel);

        if (announcementCard && modalOverlay) {
            announcementCard.addEventListener('click', () => {
                modalContent.innerHTML = fullAnnouncement;
                modalOverlay.classList.add('active');
            });
            modalCloseBtn.addEventListener('click', () => { modalOverlay.classList.remove('active'); });
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) { modalOverlay.classList.remove('active'); }
            });
        }
    }

    async _performWelcomeSearch(query) {
        const resultsContainer = document.getElementById('welcome-search-results-container');
        if (!resultsContainer) return;

        resultsContainer.innerHTML = `
            <div class="loading-container" style="margin: auto;">
                <img src="./assets/loading.gif" alt="加载中..." class="loading-gif">
                <p class="loading-text">${i18n.t('common.loading')}...</p>
            </div>`;

        const apiKey = configManager.config?.api_keys?.uapipro || null;
        const requestBody = { query: query, timeout_ms: 10000, fetch_full: false };
        const requestHeaders = { 'Content-Type': 'application/json' };
        if (apiKey) { requestHeaders['Authorization'] = `Bearer ${apiKey}`; }

        try {
            const response = await fetch('https://uapis.cn/api/v1/search/aggregate', {
                method: 'POST',
                headers: requestHeaders,
                body: JSON.stringify(requestBody)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || `HTTP 错误 ${response.status}`);

            configManager.logAction(`[主页搜索] 成功: ${query}`, 'tool');
            this._renderWelcomeResults(data, query);

        } catch (error) {
            configManager.logAction(`[主页搜索] 失败: ${error.message}`, 'error');
            resultsContainer.innerHTML = `
                <div class="empty-logs-placeholder" style="margin: auto;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${i18n.t('home.search.failed.title')}</p>
                    <span>${error.message}</span>
                </div>`;
        }
    }

    _renderWelcomeResults(data, query) {
        const resultsContainer = document.getElementById('welcome-search-results-container');
        if (!resultsContainer) return;

        const results = data.results || [];

        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="empty-logs-placeholder" style="margin: auto;">
                    <i class="fas fa-box-open"></i>
                    <p>${i18n.t('home.search.results.empty.title', { query: query })}</p>
                    <span>${i18n.t('home.search.results.empty.sub')}</span>
                </div>`;
            return;
        }

        const formatTime = (isoString) => {
            if (!isoString) return '';
            try { return new Date(isoString).toLocaleDateString(); } catch (e) { return ''; }
        };

        const resultsHtml = results.map(item => `
            <div class="search-result-item">
                <h4><a href="#" class="hotboard-title-link" data-url="${item.url}">${item.title}</a></h4>
                <p>${item.snippet}</p>
                <div class="result-meta">
                    <span class="domain"><i class="fas fa-link"></i> ${item.domain}</span>
                    <span><i class="fas fa-user-edit"></i> ${item.author || '未知作者'}</span>
                    <span><i class="fas fa-clock"></i> ${formatTime(item.publish_time) || '未知时间'}</span>
                    <span><i class="fas fa-star"></i> AI得分: ${item.score.toFixed(3)}</span>
                </div>
            </div>
        `).join('');

        const statsHtml = `
            <div class="search-stats" style="font-size: 13px; color: var(--text-secondary); margin: 5px 15px 15px;">
                ${i18n.t('home.search.results.stats', { count: data.total_results || 0, time: data.process_time_ms })}
            </div>
        `;

        const detailsButtonHtml = `
            <button id="view-full-results-btn" class="control-btn ripple view-full-results-btn">
                ${i18n.t('home.search.results.viewFull')} <i class="fas fa-arrow-right"></i>
            </button>
        `;

        resultsContainer.innerHTML = statsHtml + resultsHtml + detailsButtonHtml;

        resultsContainer.querySelectorAll('a[data-url]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                window.electronAPI.openExternalLink(e.currentTarget.dataset.url);
            });
        });

        resultsContainer.querySelector('#view-full-results-btn')?.addEventListener('click', () => {
            configManager.logAction(`[主页搜索] 跳转到工具: ${query}`, 'navigation');
            this.navigateTo('toolbox');
            this.updateActiveNavButton(document.getElementById('toolbox-btn'));

            uiManager.launchModularTool('smart-search');

            setTimeout(() => {
                const toolInput = document.getElementById('ss-query-input');
                const toolSearchBtn = document.getElementById('ss-search-btn');
                if (toolInput && toolSearchBtn) {
                    toolInput.value = query;
                    toolSearchBtn.click();
                } else {
                    configManager.logAction('主页搜索无法传递查询到工具', 'error');
                }
            }, 100);
        });
    }

    renderLogsPage(filterDate = new Date().toISOString().split('T')[0]) {
        const contentArea = document.getElementById('content-area');
        const todayString = new Date().toISOString().split('T')[0];

        contentArea.innerHTML = `
            <div class="page-container logs-page-container">
                <div class="logs-header-island">
                    <div class="logs-title">
                        <i class="fas fa-layer-group" style="color:var(--primary-color);"></i>
                        <span>运行日志</span>
                    </div>
                    <div class="logs-controls">
                        <input type="date" id="log-date-picker" value="${filterDate === 'all' ? todayString : filterDate}">
                        <button id="show-today-logs" class="control-btn mini-btn ripple" title="回到今天"><i class="fas fa-calendar-day"></i> 今天</button>
                        <button id="show-all-logs" class="control-btn mini-btn ripple" title="查看所有"><i class="fas fa-list-ul"></i> 近期</button>
                        <button id="clear-logs" class="action-btn mini-btn error-btn ripple" title="清空记录"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>
                <div id="logs-content-container" class="logs-container">
                    <div class="loading-container" style="padding: 60px 0;">
                        <img src="./assets/loading.gif" alt="加载中..." class="loading-gif">
                        <p class="loading-text">${i18n.t('common.loading')}...</p>
                    </div>
                </div>
            </div>`;

        this.bindLogPageEvents();
        this._fetchAndRenderLogs(filterDate);
    }

    async _fetchAndRenderLogs(filterDate) {
        const dateQuery = filterDate === 'all' ? null : filterDate;
        let logs;
        const logsContainer = document.getElementById('logs-content-container');

        try {
            logs = await window.electronAPI.getLogs(dateQuery);
        } catch (error) {
            if (logsContainer) {
                logsContainer.innerHTML = `
                    <div class="empty-island-state">
                        <div class="empty-icon" style="color:var(--error-color);"><i class="fas fa-bug"></i></div>
                        <p>日志加载失败</p>
                        <span>${error.message}</span>
                    </div>`;
            }
            return;
        }

        const groupedLogs = logs.reduce((acc, log) => {
            const date = new Date(log.timestamp).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
            if (!acc[date]) acc[date] = [];
            acc[date].push(log);
            return acc;
        }, {});

        const renderLogEntries = (grouped) => {
            if (Object.keys(grouped).length === 0) {
                return `
                    <div class="empty-island-state">
                        <div class="empty-icon"><i class="fas fa-clipboard-check"></i></div>
                        <p>暂无日志记录</p>
                        <span>系统运行平稳，无事发生。</span>
                    </div>`;
            }

            let html = '';
            const categoryMap = {
                system:     { icon: 'fa-server',        class: 'log-tag-system' },
                navigation: { icon: 'fa-location-arrow',class: 'log-tag-nav' },
                ui:         { icon: 'fa-swatchbook',    class: 'log-tag-ui' },
                tool:       { icon: 'fa-microchip',     class: 'log-tag-tool' },
                update:     { icon: 'fa-rocket',        class: 'log-tag-update' },
                settings:   { icon: 'fa-sliders-h',     class: 'log-tag-settings' },
                error:      { icon: 'fa-bomb',          class: 'log-tag-error' },
                general:    { icon: 'fa-info-circle',   class: 'log-tag-general' }
            };

            for (const date in grouped) {
                const dayOfWeek = new Date(grouped[date][0].timestamp).toLocaleDateString('zh-CN', { weekday: 'long' });
                html += `<div class="log-day-group">`;
                html += `<div class="log-date-pill"><i class="far fa-calendar-alt"></i> ${date} · ${dayOfWeek}</div>`;
                
                html += grouped[date].map(log => {
                    const catInfo = categoryMap[log.category] || categoryMap.general;
                    const time = new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                    let mainAction = log.action;
                    let subTagHtml = '';
                    
                    const subCategoryMatch = log.action.match(/^\[(.*?)\]\s(.*)$/);
                    if (subCategoryMatch) {
                        const subCategoryName = subCategoryMatch[1];
                        mainAction = subCategoryMatch[2];
                        subTagHtml = `<span class="log-sub-tag">${subCategoryName}</span>`;
                    }

                    return `
                        <div class="log-card-island">
                            <div class="log-time">${time}</div>
                            <div class="log-icon-box ${catInfo.class}"><i class="fas ${catInfo.icon}"></i></div>
                            <div class="log-text">${subTagHtml}${mainAction}</div>
                            <button class="log-copy-btn ripple" onclick="navigator.clipboard.writeText('${mainAction.replace(/'/g, "\\'")}')" title="复制内容"><i class="far fa-copy"></i></button>
                        </div>
                    `;
                }).join('');
                html += `</div>`;
            }
            return html;
        };

        if (logsContainer) {
            logsContainer.innerHTML = renderLogEntries(groupedLogs);
            const cards = logsContainer.querySelectorAll('.log-card-island');
            cards.forEach((card, i) => {
                card.style.opacity = '0';
                card.style.transform = 'translateY(10px)';
                card.style.animation = `contentFadeIn 0.4s ease forwards ${i * 0.03}s`;
            });
        }
    }

    bindLogPageEvents() {
        const datePicker = document.getElementById('log-date-picker');
        const logsContainer = document.getElementById('logs-content-container');

        const loadLogs = (filterDate) => {
            if (logsContainer) {
                logsContainer.innerHTML = `<div class="loading-container" style="padding: 60px 0;"><img src="./assets/loading.gif" alt="加载中..." class="loading-gif"><p class="loading-text">${i18n.t('common.loading')}...</p></div>`;
            }
            this._fetchAndRenderLogs(filterDate);
        };

        datePicker.addEventListener('change', (e) => { loadLogs(e.target.value); });
        document.getElementById('show-today-logs').addEventListener('click', () => {
            const todayString = new Date().toISOString().split('T')[0];
            datePicker.value = todayString;
            loadLogs(todayString);
        });
        document.getElementById('show-all-logs').addEventListener('click', () => { loadLogs('all'); });
        document.getElementById('clear-logs')?.addEventListener('click', async () => {
            if (confirm('确定要清空所有日志记录吗？此操作不可逆！')) {
                await window.electronAPI.clearLogs();
                uiManager.showNotification(i18n.t('common.notification.title.success'), '所有日志已被清空。');
                loadLogs(datePicker.value || 'all');
            }
        });
    }

    async renderSettingsPage() {
        const contentArea = document.getElementById('content-area');
        const [appVersion, traffic, langConfig] = await Promise.all([
            window.electronAPI.getAppVersion(),
            window.electronAPI.getTrafficStats(),
            window.electronAPI.getLanguageConfig()
        ]);
        const configVersion = configManager.config?.config_version || 'N/A';

        const langOptions = [
            { key: 'auto', label: i18n.t('settings.appearance.language.auto') },
            { key: 'zh-CN', label: i18n.t('settings.appearance.language.zh-CN') },
            { key: 'en-US', label: i18n.t('settings.appearance.language.en-US') }
        ];

        const langSelectHtml = `
            <div class="custom-select-wrapper" id="dd-wrapper-lang-select-wrapper">
                <div class="custom-select-trigger">
                    <span class="custom-select-value">${langOptions.find(o => o.key === langConfig.current)?.label || 'N/A'}</span>
                    <i class="fas fa-chevron-down custom-select-arrow"></i>
                </div>
            </div>`;

        const langOptionsHtml = `
            <div class="custom-select-options" id="dd-options-lang-select-wrapper">
                ${langOptions.map(opt => `<div class="custom-select-option" data-value="${opt.key}">${opt.label}</div>`).join('')}
            </div>`;

        const availableFonts = [
            { name: 'Default', label: '系统默认 (Default)', url: '' },
            { name: 'MeiGanShouXieTi', label: '梅干手写体', url: 'https://update.ymhut.cn/fonts/MeiGanShouXieTi-2.ttf' },
            { name: 'QianTuBiFeng', label: '千图笔锋手写体', url: 'https://update.ymhut.cn/fonts/QianTuBiFengShouXieTi-2.ttf' },
            { name: 'YOzBS', label: 'YOz手写体', url: 'https://update.ymhut.cn/fonts/YOzBS-2.otf' }
        ];
        const currentFontName = this.dbSettings.customFontName || 'Default';

        const fontSelectHtml = `
            <div class="custom-select-wrapper" id="dd-wrapper-font-select">
                <div class="custom-select-trigger">
                    <span class="custom-select-value" id="font-select-value">${availableFonts.find(f => f.name === currentFontName)?.label || '系统默认'}</span>
                    <i class="fas fa-chevron-down custom-select-arrow"></i>
                </div>
            </div>`;

        const fontOptionsHtml = `
            <div class="custom-select-options" id="dd-options-font-select">
                ${availableFonts.map(f => `<div class="custom-select-option" data-value="${f.name}" data-url="${f.url}">${f.label}</div>`).join('')}
            </div>`;
        
        const fontModalHtml = `
            <div id="font-download-modal" class="font-download-modal">
                <div class="font-modal-card">
                    <div class="font-modal-icon"><i class="fas fa-cloud-download-alt fa-bounce"></i></div>
                    <h3 style="margin:0 0 10px 0;">正在配置字体</h3>
                    <p id="font-download-status" style="color:var(--text-secondary); font-size:13px;">准备下载...</p>
                    <div class="font-progress-bg">
                        <div id="font-download-bar" class="font-progress-bar"></div>
                    </div>
                    <p id="font-download-percent" style="font-size:12px; font-family:monospace;">0%</p>
                </div>
            </div>`;

        contentArea.innerHTML = `
            <div class="page-container settings-page-container">
                <nav class="settings-nav-island">
                    <div>
                        <div class="nav-group-title">控制中心</div>
                        <button class="island-nav-item active" data-panel="appearance">
                            <i class="fas fa-swatchbook icon-gradient icon-gradient-appearance" style="width:20px;"></i> 
                            <span class="nav-text">${i18n.t('settings.appearance')}</span>
                        </button>
                        <button class="island-nav-item" data-panel="update">
                            <i class="fas fa-cloud-upload-alt icon-gradient icon-gradient-update" style="width:20px;"></i> 
                            <span class="nav-text">${i18n.t('settings.updates')}</span>
                        </button>
                        <button class="island-nav-item" data-panel="about">
                            <i class="fas fa-id-card icon-gradient icon-gradient-about" style="width:20px;"></i> 
                            <span class="nav-text">${i18n.t('settings.about')}</span>
                        </button>
                    </div>
                    
                    <div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: flex-end; gap: 15px; padding-bottom: 20px;">
                        <div class="mini-status-item">
                            <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:5px; color:var(--text-secondary);"><span><i class="fas fa-microchip"></i> CPU</span><span id="cpu-usage-text">0%</span></div>
                            <div class="island-progress-track" style="height:6px;"><div id="cpu-usage-bar" class="island-progress-bar" style="width:0%; background:var(--primary-color);"></div></div>
                        </div>
                        <div class="mini-status-item">
                            <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:5px; color:var(--text-secondary);"><span><i class="fas fa-memory"></i> RAM</span><span id="mem-usage-text">0%</span></div>
                            <div class="island-progress-track" style="height:6px;"><div id="mem-usage-bar" class="island-progress-bar" style="width:0%; background:var(--secondary-color);"></div></div>
                        </div>
                    </div>

                    <div style="padding-top: 15px; border-top: 1px solid var(--border-color);">
                        <div class="status-label" style="margin-bottom:5px;"><i class="fas fa-clock"></i> <span id="app-uptime-text" style="font-family:monospace;">00:00:00</span></div>
                        <div style="font-size:11px; color:var(--text-secondary);">系统运行正常</div>
                    </div>
                </nav>

                <div class="settings-content-island">
                    <div id="appearance-panel" class="settings-panel active">
                        <div class="setting-island">
                            <h2><i class="fas fa-paint-roller"></i> 个性化</h2>
                            <div class="setting-row-island"><span>界面主题</span><label class="theme-switch"><input type="checkbox" id="theme-switch-input" ${this.dbSettings.theme === 'dark' ? 'checked' : ''}><span class="slider"></span></label></div>
                            <div class="setting-row-island"><span>界面语言</span>${langSelectHtml}</div>
                            <div class="setting-row-island"><span>UI 字体</span>${fontSelectHtml}</div>
                        </div>
                        <div class="setting-island">
                            <h2><i class="fas fa-network-wired"></i> 网络监控</h2>
                            <div id="traffic-chart-container" style="position: relative; height: 250px; width: 100%;">
                                <canvas id="traffic-chart"></canvas>
                            </div>
                            <div style="margin-top:15px; display:flex; justify-content:space-between; font-size:13px;">
                                <span style="color:var(--text-secondary);">累计消耗</span>
                                <span class="gradient-text" style="font-weight:700;">${configManager.formatBytes(traffic)}</span>
                            </div>
                        </div>
                    </div>

                    <div id="update-panel" class="settings-panel">
                        <div class="setting-island" id="update-state-container" style="min-height: 400px; display: flex; align-items: center; justify-content: center;">
                            </div>
                    </div>
                    
                    <div id="about-panel" class="settings-panel">
                        <div class="setting-island dev-profile-card">
                            <div class="dev-avatar"><img src="./assets/author_avatar.png" alt="Avatar" style="width:100%; height:100%; object-fit:cover; border-radius:50%;"></div>
                            <div style="flex-grow:1;"><h2 style="margin:0 0 5px 0;">YMHUT</h2><p style="margin:0; opacity:0.7; font-size:13px;">功不唐捐，玉汝于成</p></div>
                            <div style="display:flex; gap:10px;">
                                <button class="control-btn mini-btn ripple" id="author-website-btn"><i class="fas fa-globe"></i></button>
                                <button class="control-btn mini-btn ripple" id="feedback-btn"><i class="fas fa-envelope"></i></button>
                            </div>
                        </div>
                        <div class="setting-island">
                            <h2>软件信息</h2>
                            <div class="setting-row-island"><span>客户端版本</span><span style="font-family:monospace;">v${appVersion}</span></div>
                            <div class="setting-row-island"><span>配置版本</span><span style="font-family:monospace;">${configVersion}</span></div>
                            <button class="control-btn ripple" id="more-info-btn" style="width:100%; margin-top:20px;">查看详细环境参数</button>
                        </div>
                    </div>
                </div>
            </div>
            ${langOptionsHtml}
            ${fontOptionsHtml}
            `;

        const langOptionsEl = document.getElementById('dd-options-lang-select-wrapper');
        if (langOptionsEl) document.body.appendChild(langOptionsEl);
        const fontOptionsEl = document.getElementById('dd-options-font-select');
        if (fontOptionsEl) document.body.appendChild(fontOptionsEl);
        if (!document.getElementById('font-download-modal')) document.body.insertAdjacentHTML('beforeend', fontModalHtml);

        this.bindSettingsPageEvents();
        // [修复] 延时渲染，确保 DOM 插入完成
        setTimeout(() => {
            this.renderTrafficChart();
            this.renderUpdateUI('idle', { currentVersion: appVersion });
        }, 150);
    }

    renderUpdateUI(state, data = {}) {
        const container = document.getElementById('update-state-container');
        if (!container) return;

        let html = '';
        let containerClass = `update-status-container update-state-${state}`;

        switch (state) {
            case 'idle':
                html = `
                    <div class="${containerClass}">
                        <div class="update-icon-island"><i class="fas fa-cube"></i></div>
                        <div class="update-title">更新管理</div>
                        <div class="update-desc">当前版本: v${data.currentVersion}<br>点击下方按钮检查是否有新版本发布。</div>
                        <button id="update-check-btn" class="action-btn ripple" style="padding: 12px 40px;"><i class="fas fa-sync-alt"></i> 检查更新</button>
                    </div>`;
                break;
            
            case 'checking':
                html = `
                    <div class="${containerClass}">
                        <div class="update-icon-island"><i class="fas fa-circle-notch"></i></div>
                        <div class="update-title">正在检查...</div>
                        <div class="update-desc">正在连接服务器获取最新版本信息，请稍候。</div>
                    </div>`;
                break;

            case 'latest':
                html = `
                    <div class="${containerClass}">
                        <div class="update-icon-island"><i class="fas fa-check"></i></div>
                        <div class="update-title">已是最新版本</div>
                        <div class="update-desc">您当前运行的是 v${data.currentVersion}。<br>系统运行在最佳状态。</div>
                        <button id="update-recheck-btn" class="control-btn ripple">再次检查</button>
                    </div>`;
                break;

            case 'available':
                const notes = Object.entries(data.updateNotes || {}).map(([k, v]) => `<b>${k}</b><br>${parseMarkdown(v)}`).join('<br><br>');
                html = `
                    <div class="${containerClass}">
                        <div class="update-icon-island"><i class="fas fa-rocket"></i></div>
                        <div class="update-title">发现新版本 v${data.remoteVersion}</div>
                        <div class="update-desc" style="text-align: left; background: rgba(var(--bg-color-rgb), 0.5); padding: 15px; border-radius: 12px; width: 100%; max-height: 200px; overflow-y: auto;">
                            ${notes || '暂无更新日志'}
                        </div>
                        <div class="update-actions-island">
                            <button id="update-dl-pkg-btn" class="control-btn ripple">仅下载包</button>
                            <button id="update-install-btn" class="action-btn ripple">立即更新</button>
                        </div>
                    </div>`;
                break;

            case 'downloading':
                html = `
                    <div class="${containerClass}">
                        <div class="download-island-container">
                            <div class="download-header">
                                <span><i class="fas fa-cloud-download-alt"></i> 正在下载 v${data.remoteVersion}</span>
                                <span id="dl-percent-text">0%</span>
                            </div>
                            <div class="liquid-progress-track">
                                <div id="dl-progress-bar" class="liquid-progress-bar"></div>
                            </div>
                            <div class="download-meta">
                                <span id="dl-speed-text">0 KB/s</span>
                                <span id="dl-status-text">初始化连接...</span>
                            </div>
                            <button id="update-cancel-btn" class="control-btn mini-btn ripple error-btn" style="margin-top: 15px; width: 100%;">取消下载</button>
                        </div>
                    </div>`;
                break;
        }

        container.innerHTML = html;

        if (state === 'idle' || state === 'latest') {
            const btn = document.getElementById(state === 'idle' ? 'update-check-btn' : 'update-recheck-btn');
            btn?.addEventListener('click', () => this.performUpdateCheck());
        } else if (state === 'available') {
            document.getElementById('update-dl-pkg-btn').addEventListener('click', () => this.startUpdateDownload(data, false));
            document.getElementById('update-install-btn').addEventListener('click', () => this.startUpdateDownload(data, true));
        } else if (state === 'downloading') {
            document.getElementById('update-cancel-btn').addEventListener('click', () => window.electronAPI.cancelDownload());
        }
    }

    async performUpdateCheck() {
        if (this.isDownloadingUpdate) return;
        this.renderUpdateUI('checking');
        
        try {
            const result = await window.electronAPI.checkUpdates();
            setTimeout(() => {
                if (result.hasUpdate) {
                    this.renderUpdateUI('available', result);
                } else {
                    this.renderUpdateUI('latest', { currentVersion: result.currentVersion });
                }
            }, 800);
        } catch (error) {
            uiManager.showNotification('检查失败', error.message, 'error');
            this.renderUpdateUI('idle', { currentVersion: 'Unknown' });
        }
    }

    async startUpdateDownload(updateInfo, installAfter) {
        this.isDownloadingUpdate = true;
        this.renderUpdateUI('downloading', updateInfo);
        
        try {
            const result = await window.electronAPI.downloadUpdate(updateInfo.downloadUrl);
            if (result.success) {
                if (installAfter) {
                    document.getElementById('dl-status-text').textContent = '下载完成，正在启动安装...';
                    setTimeout(() => window.electronAPI.installUpdate(result.path), 1000);
                } else {
                    window.electronAPI.showItemInFolder(result.path);
                    this.renderUpdateUI('idle', { currentVersion: updateInfo.currentVersion }); 
                }
            }
        } catch (error) {
            uiManager.showNotification('下载失败', error.error, 'error');
            this.renderUpdateUI('available', updateInfo);
        } finally {
            this.isDownloadingUpdate = false;
        }
    }

    bindSettingsPageEvents() {
        if (this.settingsInterval) clearInterval(this.settingsInterval);
        if (this.settingsIntervalHeavy) clearInterval(this.settingsIntervalHeavy);

        const updateLightStats = async () => {
            try {
                const [stats, mem] = await Promise.all([
                    window.electronAPI.getRealtimeStats(),
                    window.electronAPI.getMemoryUpdate()
                ]);
                const cpuText = document.getElementById('cpu-usage-text');
                if (cpuText) cpuText.textContent = `${stats.cpu}%`;
                const cpuBar = document.getElementById('cpu-usage-bar');
                if (cpuBar) cpuBar.style.width = `${stats.cpu}%`;
                const memText = document.getElementById('mem-usage-text');
                if (memText) memText.textContent = `${mem.usagePercentage}%`;
                const memBar = document.getElementById('mem-usage-bar');
                if (memBar) memBar.style.width = `${mem.usagePercentage}%`;
                const uptimeText = document.getElementById('app-uptime-text');
                if (uptimeText) uptimeText.textContent = stats.uptime;
            } catch (error) {
                if (this.settingsInterval) clearInterval(this.settingsInterval);
            }
        };

        this.settingsInterval = setInterval(updateLightStats, 2000);
        updateLightStats();

        const navItems = document.querySelectorAll('.island-nav-item');
        
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const targetId = item.dataset.panel + '-panel';
                const targetPanel = document.getElementById(targetId);
                const currentPanel = document.querySelector('.settings-panel.active');

                if (currentPanel === targetPanel) return;

                navItems.forEach(n => n.classList.remove('active'));
                item.classList.add('active');

                if (currentPanel) {
                    currentPanel.classList.add('panel-exit');
                    currentPanel.classList.remove('active');
                    setTimeout(() => {
                        currentPanel.classList.remove('panel-exit');
                    }, 300);
                }

                if (targetPanel) {
                    void targetPanel.offsetWidth; 
                    targetPanel.classList.add('active');
                }
            });
        });

        uiManager.setupAdaptiveDropdown('dd-wrapper-lang-select-wrapper', 'dd-options-lang-select-wrapper',
            async (value) => {
                uiManager.showNotification(i18n.t('common.notification.title.info'), '正在保存语言设置并重启...', 'info');
                try { await window.electronAPI.saveLanguageConfig(value); } catch (err) { uiManager.showNotification(i18n.t('common.notification.title.error'), err.message, 'error'); }
            }
        );

        uiManager.setupAdaptiveDropdown('dd-wrapper-font-select', 'dd-options-font-select',
            async (value, text, dataset, triggerElement) => {
                const fontUrl = dataset.url;
                const modal = document.getElementById('font-download-modal');
                const statusText = document.getElementById('font-download-status');
                const progressBar = document.getElementById('font-download-bar');
                const percentText = document.getElementById('font-download-percent');

                if (value === 'Default') {
                    this.dbSettings.customFontName = '';
                    this.dbSettings.customFontPath = '';
                    configManager.applyAppSettings({ customFontFamily: false });
                    await window.electronAPI.saveMedia({ type: 'config_font', name: '', path: '' });
                    uiManager.showNotification('设置成功', '已恢复系统默认字体');
                    triggerElement.innerHTML = `<span class="custom-select-value">系统默认 (Default)</span><i class="fas fa-chevron-down custom-select-arrow"></i>`;
                    return;
                }

                triggerElement.innerHTML = `<span class="custom-select-value">${text}</span><i class="fas fa-chevron-down custom-select-arrow"></i>`;
                statusText.textContent = `正在准备下载 ${value}...`;
                progressBar.style.width = '0%';
                percentText.textContent = '0%';
                modal.classList.add('active');

                setTimeout(async () => {
                    window.electronAPI.onFontDownloadProgress((data) => {
                        const p = Math.round(data.percent);
                        progressBar.style.width = `${p}%`;
                        percentText.textContent = `${p}%`;
                        statusText.textContent = `下载中... ${configManager.formatBytes(data.received)} / ${configManager.formatBytes(data.total)}`;
                    });

                    try {
                        const result = await window.electronAPI.downloadFont({ fontName: value, fontUrl });
                        if (result.success) {
                            progressBar.style.width = '100%';
                            percentText.textContent = '100%';
                            statusText.textContent = result.cached ? '字体已存在，验证通过' : '下载完成，正在应用...';
                            this.dbSettings.customFontName = value;
                            this.dbSettings.customFontPath = result.path;
                            await window.electronAPI.saveMedia({ type: 'config_font', name: value, path: result.path });
                            setTimeout(() => {
                                modal.classList.remove('active');
                                uiManager.showNotification('设置成功', '即将重启软件以应用字体...');
                                setTimeout(() => window.electronAPI.relaunchApp(), 1000);
                            }, 800);
                        } else { throw new Error(result.error); }
                    } catch (err) {
                        modal.classList.remove('active');
                        uiManager.showNotification('字体设置失败', err.message, 'error');
                    } 
                }, 500);
            }
        );

        document.getElementById('theme-switch-input')?.addEventListener('change', () => this.toggleTheme());
        
        const aboutNavButton = document.querySelector('.island-nav-item[data-panel="about"]');
        if (aboutNavButton) aboutNavButton.addEventListener('contextmenu', (e) => { e.preventDefault(); this.handleSecretTrigger(false); });

        document.getElementById('more-info-btn')?.addEventListener('click', () => {
            const currentTheme = document.body.getAttribute('data-theme') || 'dark';
            const versions = configManager.config?.dbSettings?.versions || {};
            window.electronAPI.openAcknowledgementsWindow(currentTheme, versions);
        });

        document.getElementById('author-website-btn')?.addEventListener('click', () => window.electronAPI.openExternalLink('https://blog.ymhut.cn'));
        document.getElementById('feedback-btn')?.addEventListener('click', () => window.electronAPI.openExternalLink('mailto:admin@ymhut.cn'));

        this.renderTrafficChart();
    }

    listenForDownloadProgress() {
        window.electronAPI.onDownloadProgress(p => {
            const bar = document.getElementById('dl-progress-bar');
            const percent = document.getElementById('dl-percent-text');
            const speed = document.getElementById('dl-speed-text');
            if (bar && percent) {
                bar.style.width = `${p.percent}%`;
                percent.textContent = `${Math.round(p.percent)}%`;
                if(speed) speed.textContent = configManager.formatBytes(p.speed || 0) + '/s';
            }
        });
    }

    listenForGlobalNetworkSpeed() {
        const netSpeedEl = document.getElementById('network-speed');
        window.electronAPI.onNetworkSpeedUpdate(({ speed }) => {
            netSpeedEl.innerHTML = `<i class="fas fa-arrow-down"></i> ${configManager.formatBytes(speed)}/s`;
        });
    }

    navigateToSettingsForUpdate() {
        this.navigateTo('settings', 'update');
        this.updateActiveNavButton(document.getElementById('settings-btn'));
        setTimeout(() => {
            const container = document.getElementById('update-state-container');
            if (container && container.querySelector('.update-state-idle')) {
                const btn = document.getElementById('update-check-btn');
                if(btn) btn.click();
            }
        }, 500);
    }

    addRippleEffectListener() {
        document.addEventListener('click', function (e) {
            const target = e.target.closest('.ripple');
            if (target) {
                const rect = target.getBoundingClientRect();
                const ripple = document.createElement('span');
                const diameter = Math.max(target.clientWidth, target.clientHeight);
                ripple.style.width = ripple.style.height = `${diameter}px`;
                ripple.style.left = `${e.clientX - rect.left - diameter / 2}px`;
                ripple.style.top = `${e.clientY - rect.top - diameter / 2}px`;
                ripple.classList.add('ripple-effect');
                const existingRipple = target.querySelector('.ripple-effect');
                if (existingRipple) existingRipple.remove();
                target.appendChild(ripple);
                setTimeout(() => ripple.remove(), 600);
            }
        });
    }

    async renderTrafficChart() {
        if (this.activeChartInstance) { this.activeChartInstance.destroy(); this.activeChartInstance = null; }
        const history = await window.electronAPI.getTrafficHistory();
        const labels = [], dataPoints = [], today = new Date();

        for (let i = 13; i >= 0; i--) {
            const d = new Date(); d.setDate(today.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const record = history ? history.find(h => h.log_date === dateStr) : null;
            labels.push(dateStr.substring(5));
            dataPoints.push(((record ? record.bytes_used : 0) / (1024 * 1024)).toFixed(2));
        }

        const ctx = document.getElementById('traffic-chart')?.getContext('2d');
        if (!ctx) return;

        const style = getComputedStyle(document.documentElement); 
        const currentFontFamily = style.getPropertyValue('--font-family').trim() || "sans-serif";
        const primaryColorRGB = style.getPropertyValue('--primary-rgb').trim();
        const textColor = style.getPropertyValue('--text-color').trim();
        const borderColor = style.getPropertyValue('--border-color').trim();

        const gradient = ctx.createLinearGradient(0, 0, 0, 250);
        gradient.addColorStop(0, `rgba(${primaryColorRGB}, 0.5)`);
        gradient.addColorStop(1, `rgba(${primaryColorRGB}, 0.05)`);

        this.activeChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '每日流量 (MB)',
                    data: dataPoints,
                    borderColor: `rgba(${primaryColorRGB}, 1)`,
                    backgroundColor: gradient,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: `rgba(${primaryColorRGB}, 1)`,
                    pointRadius: 3,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        titleColor: '#fff',
                        titleFont: { family: currentFontFamily, weight: 'bold' },
                        bodyFont: { family: currentFontFamily },
                        callbacks: { label: (ctx) => ` ${ctx.parsed.y} MB` }
                    }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: borderColor, borderDash: [5, 5] }, ticks: { color: textColor, font: { size: 10, family: currentFontFamily } }, title: { display: true, text: '每日使用量 (MB)', color: textColor, font: { family: currentFontFamily } } },
                    x: { grid: { display: false }, ticks: { color: textColor, font: { size: 10, family: currentFontFamily } } }
                },
                interaction: { mode: 'nearest', axis: 'x', intersect: false }
            }
        });
    }

    toggleOpacityControls(enabled) {} 

    async toggleTheme() {
        const newTheme = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        configManager.logAction(`主题切换为: ${newTheme === 'dark' ? '黑夜模式' : '白天模式'}`, 'settings');
        document.body.setAttribute('data-theme', newTheme);
        this.dbSettings.theme = newTheme;
        document.querySelector('#theme-toggle i').className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        if (document.getElementById('theme-switch-input')) document.getElementById('theme-switch-input').checked = newTheme === 'dark';
        await window.electronAPI.setTheme(newTheme);
        if (document.getElementById('traffic-chart')) this.renderTrafficChart();
    }

    bindThemeToggle() {
        const themeToggle = document.getElementById('theme-toggle');
        themeToggle.querySelector('i').className = document.body.getAttribute('data-theme') === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        themeToggle.addEventListener('click', () => this.toggleTheme());
    }
}

const mainPageInstance = new MainPage();
window.mainPage = mainPageInstance;

// [修复] 确保 DOM 加载后再启动初始化，防止白屏
document.addEventListener('DOMContentLoaded', () => {
    mainPageInstance.init();
});