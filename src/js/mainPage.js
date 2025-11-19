// src/js/mainPage.js
import configManager from './configManager.js';
import uiManager from './uiManager.js';
import i18n from './i18n.js'; // [Req 1] 导入 i18n

class MainPage {
    constructor() {
        this.keySequence = '';
        this.keyTimeout = null;
        // [修改] 不再使用 onInitialData，改为在 initializeApp 中异步获取
        this.initializeApp();
        this.isDownloadingUpdate = false;
        this.dbSettings = {};
        this.settingsInterval = null;
        this.dashboardInterval = null;
        this.activeChartInstance = null;
        this.settingsIntervalHeavy = null; 
    }

    async initializeApp() {
        // [Req 1] 1. 加载语言
        await this.loadLanguage();

        // [修改] 2. 加载旧的 initial-data (仍然需要)
        const config = await new Promise(resolve => {
            window.electronAPI.onInitialData(resolve);
        });
        
        // [核心修改 1/3]：移除了 configManager.initializeGlobalFetchMonitor();
        if (config.isOffline) { uiManager.renderOfflinePage(config.error); return; }
        
        this.dbSettings = config.dbSettings;
        configManager.setConfig(config);
        uiManager.init();
        this.bindWindowControls();
        this.bindNavigationEvents(); // [修改] 现在会翻译
        this.bindThemeToggle();
        this.addRippleEffectListener();
        this.bindGlobalKeyListener();
        
        // [问题 2 修复] 添加统一的全局点击监听器，用于关闭所有动态下拉菜单
        document.addEventListener('click', (e) => {
            document.querySelectorAll('.custom-select-options.dynamic-active').forEach(openDropdown => {
                // 检查点击是否在下拉菜单 *或* 其关联的触发器之外
                const wrapperId = openDropdown.id.replace('dd-options-', 'dd-wrapper-');
                const trigger = document.getElementById(wrapperId);
                
                if (openDropdown && !openDropdown.contains(e.target) && trigger && !trigger.contains(e.target)) {
                    openDropdown.classList.remove('dynamic-active');
                }
            });
        }, true);
        
        window.addEventListener('error', (event) => {
            const error = event.error;
            configManager.logAction(`渲染进程发生错误: ${error.message}\nStack: ${error.stack}`, 'error');
            uiManager.showNotification('发生内部错误', '详情已记录到日志中', 'error');
        });
        this.navigateTo('home');
        document.getElementById('home-btn').classList.add('active');
        this.listenForDownloadProgress();
        this.listenForGlobalNetworkSpeed();
        configManager.logAction('主窗口初始化完成', 'system');
    }
    
    // [新增] 异步加载语言配置
    async loadLanguage() {
        try {
            const langConfig = await window.electronAPI.getLanguageConfig();
            i18n.init(langConfig.pack, langConfig.fallback);
        } catch (e) {
            console.error("无法加载语言配置:", e);
            i18n.init(null, {}); // 至少初始化
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
        // [Req 1] 为 title 属性添加翻译
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
            document.getElementById(id).addEventListener('click', (e) => {
                action();
                this.updateActiveNavButton(e.currentTarget);
            });
        }
    }

    navigateTo(page, subPage = null) {
        if (this.settingsInterval) { clearInterval(this.settingsInterval); this.settingsInterval = null; }
        if (this.settingsIntervalHeavy) { clearInterval(this.settingsIntervalHeavy); this.settingsIntervalHeavy = null; }
        if (this.dashboardInterval) { clearInterval(this.dashboardInterval); this.dashboardInterval = null; }
        if (this.activeChartInstance) { this.activeChartInstance.destroy(); this.activeChartInstance = null; }

        if (page !== 'home') {
            document.getElementById('update-slide-out-panel')?.remove();
            document.getElementById('announcement-modal')?.remove();
            document.getElementById('update-panel-overlay')?.remove();
        }
        
        // [问题 2 修复] 导航时，移除可能已“传送”的下拉菜单
        document.getElementById('dd-options-lang-select-wrapper')?.remove();

        uiManager.unloadActiveTool();
        configManager.logAction(`导航到: ${page}`, 'navigation');
        
        setTimeout(() => {
            switch (page) {
                case 'home': 
                    this.renderWelcomePage(); 
                    break;
                case 'toolbox': 
                    uiManager.renderToolboxPage();
                    break;
                case 'logs': 
                    this.renderLogsPage(new Date().toISOString().split('T')[0]); 
                    break;
                case 'settings':
                    this.renderSettingsPage();
                    if (subPage) {
                        const targetNavItem = document.querySelector(`.settings-nav-item[data-panel="${subPage}"]`);
                        const targetPanel = document.getElementById(`${subPage}-panel`);
                        if (targetNavItem && targetPanel) {
                            document.querySelector('.settings-nav-item.active')?.classList.remove('active');
                            document.querySelector('.settings-panel.active')?.classList.remove('active');
                            targetNavItem.classList.add('active');
                            targetPanel.classList.add('active');
                        }
                    }
                    break;
            }
        }, 20);
    }

    updateActiveNavButton(activeButton) {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        if (activeButton) activeButton.classList.add('active');
    }

    async renderWelcomePage() {
        const toolStatus = configManager.config?.tool_status || {};
        const searchToolStatus = toolStatus['smart-search'] || { enabled: true };
        const isSmartSearchEnabled = searchToolStatus.enabled;
        const searchDisabledMessage = isSmartSearchEnabled 
            ? "" 
            : (searchToolStatus.message || i18n.t('home.search.disabled'));

        const contentArea = document.getElementById('content-area');
        const appVersion = await window.electronAPI.getAppVersion();
        const announcement = configManager.config?.home_notes;
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
            return entries.map(([key, value]) => `<div class="changelog-item"><span class="changelog-key">${key}</span><div class="changelog-value">${value.replace(/<br>/g, '<br/>')}</div></div>`).join('');
        };

        // [Req 1] 翻译 UI
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
                <div id="compact-announcement-card" class="compact-announcement">
                    <div class="icon"><i class="fas fa-bullhorn"></i></div>
                    <p id="compact-announcement-text">${announcement || i18n.t('home.announcement.failed')}</p>
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
        
        // [修复] 确保这三个元素总是一起被创建
        if (!document.getElementById('update-slide-out-panel')) {
            const panelHtml = `
            <div id="update-slide-out-panel" class="update-slide-out-panel">
                <div class="update-panel-header">
                    <h2><i class="fas fa-box-open"></i> ${i18n.t('home.updates')}</h2>
                    <button id="close-update-panel-btn" class="window-control-btn" title="${i18n.t('home.updates.close')}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="changelog-list">${createNotesHtml(newNotes)}</div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', panelHtml);
        }
        if (!document.getElementById('announcement-modal')) {
            const modalHtml = `
            <div id="announcement-modal" class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-bullhorn"></i> ${i18n.t('home.updates.modal.title')}</h3>
                        <button id="modal-close-btn" class="window-control-btn" title="${i18n.t('home.updates.close')}">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body"><p id="modal-announcement-content"></p></div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }
        
        if (!document.getElementById('update-panel-overlay')) {
            const overlayHtml = `<div id="update-panel-overlay" class="update-panel-overlay"></div>`;
            document.body.insertAdjacentHTML('beforeend', overlayHtml);
        }
        // [修复] 结束

        if (this.dashboardInterval) { clearInterval(this.dashboardInterval); this.dashboardInterval = null; }

        // [修复] 确保所有元素都被正确获取
        const searchInput = document.getElementById('welcome-search-input');
        const searchBtn = document.getElementById('welcome-search-btn');
        const updatePanel = document.getElementById('update-slide-out-panel');
        const showUpdateBtn = document.getElementById('show-update-log-btn');
        const closeUpdateBtn = document.getElementById('close-update-panel-btn');
        const announcementCard = document.getElementById('compact-announcement-card');
        const announcementText = document.getElementById('compact-announcement-text');
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

        // [修复] 确保 updatePanel 和 updateOverlay 存在
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
        // [修复] 结束

        if (announcementCard && announcementText && modalOverlay) {
            if (announcementText.scrollWidth > announcementText.clientWidth) {
                announcementCard.classList.add('is-overflowing');
                announcementCard.addEventListener('click', () => {
                    const fullAnnouncementHTML = configManager.config?.home_notes || i18n.t('home.announcement.failed');
                    modalContent.innerHTML = fullAnnouncementHTML;
                    modalOverlay.classList.add('active');
                });
            }
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
                    <p>${i18n.t('home.search.results.empty.title', {query: query})}</p>
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
                ${i18n.t('home.search.results.stats', {count: data.total_results || 0, time: data.process_time_ms})}
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

        // [滚动条修复] 为 .page-container 添加 flex 布局样式
        contentArea.innerHTML = `
            <div class="page-container" style="display: flex; flex-direction: column; height: 100%;">
                <div class="section-header logs-header">
                    <h1><i class="fas fa-history"></i> ${i18n.t('nav.logs')}</h1>
                    <div class="logs-controls">
                        <input type="date" id="log-date-picker" value="${filterDate === 'all' ? todayString : filterDate}">
                        <button id="show-today-logs" class="control-btn ripple">今天</button>
                        <button id="show-all-logs" class="control-btn ripple">近期历史</button>
                        <button id="clear-logs" class="action-btn error-btn ripple"><i class="fas fa-trash"></i> 清空日志</button>
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
            if(logsContainer) {
                logsContainer.innerHTML = `<div class="empty-logs-placeholder"><i class="fas fa-exclamation-triangle"></i><p>加载日志失败</p><span>${error.message}</span></div>`;
            }
            return;
        }

        const groupedLogs = logs.reduce((acc, log) => {
            const date = new Date(log.timestamp).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
            if (!acc[date]) acc[date] = [];
            acc[date].push(log);
            return acc;
        }, {});

        const renderLogEntries = (grouped) => {
            if (Object.keys(grouped).length === 0) {
                return '<div class="empty-logs-placeholder"><i class="fas fa-box-open"></i><p>当日暂无日志记录</p><span>尝试选择其他日期或查看近期历史。</span></div>';
            }
            let html = '';
            const categoryMap = { system: { icon: 'fa-desktop', name: '系统' }, navigation: { icon: 'fa-route', name: '导航' }, ui: { icon: 'fa-palette', name: '界面' }, tool: { icon: 'fa-wrench', name: '工具' }, update: { icon: 'fa-arrow-alt-circle-up', name: '更新' }, settings: { icon: 'fa-cog', name: '设置' }, error: { icon: 'fa-exclamation-triangle', name: '错误' }, general: { icon: 'fa-info-circle', name: '通用' } };
            for (const date in grouped) {
                const dayOfWeek = new Date(grouped[date][0].timestamp).toLocaleDateString('zh-CN', { weekday: 'long' });
                html += `<div class="log-day-group">`;
                html += `<div class="log-date-header">${date}，${dayOfWeek}</div>`;
                html += grouped[date].map(log => {
                    const categoryInfo = categoryMap[log.category] || categoryMap.general;
                    const time = new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                    let mainAction = log.action;
                    let subCategoryTag = '';
                    const subCategoryMatch = log.action.match(/^\[(.*?)\]\s(.*)$/);
                    if (log.category === 'tool' && subCategoryMatch) {
                        const subCategoryName = subCategoryMatch[1];
                        mainAction = subCategoryMatch[2];
                        subCategoryTag = `<span class="log-tag log-category-sub">${subCategoryName}</span>`;
                    }
                    return `<div class="log-entry">
                                <span class="log-timestamp">${time}</span>
                                <span class="log-tag log-category-${log.category}"><i class="fas ${categoryInfo.icon}"></i> ${categoryInfo.name}</span>
                                ${subCategoryTag}
                                <span class="log-action">${mainAction}</span>
                            </div>`;
                }).join('');
                html += `</div>`;
            }
            return html;
        };

        if (logsContainer) {
            logsContainer.innerHTML = renderLogEntries(groupedLogs);
        }
    }

    bindLogPageEvents() {
        const datePicker = document.getElementById('log-date-picker');
        const logsContainer = document.getElementById('logs-content-container');

        const loadLogs = (filterDate) => {
            if(logsContainer) {
                logsContainer.innerHTML = `<div class="loading-container" style="padding: 60px 0;"><img src="./assets/loading.gif" alt="加载中..." class="loading-gif"><p class="loading-text">${i18n.t('common.loading')}...</p></div>`;
            }
            this._fetchAndRenderLogs(filterDate);
        };
        
        datePicker.addEventListener('change', (e) => {
            loadLogs(e.target.value);
        });
        
        document.getElementById('show-today-logs').addEventListener('click', () => {
            const todayString = new Date().toISOString().split('T')[0];
            datePicker.value = todayString;
            loadLogs(todayString);
        });
        
        document.getElementById('show-all-logs').addEventListener('click', () => {
            loadLogs('all');
        });

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
        
        // [新增] 获取配置版本
        const configVersion = configManager.config?.config_version || 'N/A';

        const hasBgImage = this.dbSettings.backgroundImage && this.dbSettings.backgroundImage.length > 0;
        const expandedClass = hasBgImage ? 'expanded' : '';
        const opacityControlsDisabled = hasBgImage ? '' : 'disabled';
        
        // [Req 1] 创建语言选项
        const langOptions = [
            { key: 'auto', label: i18n.t('settings.appearance.language.auto') },
            { key: 'zh-CN', label: i18n.t('settings.appearance.language.zh-CN') },
            { key: 'en-US', label: i18n.t('settings.appearance.language.en-US') }
        ];
        
        // [问题 2 修复] 修改语言下拉菜单的 HTML，使其与 aiTranslationTool 类似
        const langSelectHtml = `
            <div class="custom-select-wrapper" id="dd-wrapper-lang-select-wrapper">
                <div class="custom-select-trigger">
                    <span id="lang-select-value">${langOptions.find(o => o.key === langConfig.current)?.label || 'N/A'}</span>
                    <i class="fas fa-chevron-down custom-select-arrow"></i>
                </div>
            </div>
            `;
        
        // [修改] 单独定义 options HTML，以便 teleport
        const langOptionsHtml = `
            <div class="custom-select-options" id="dd-options-lang-select-wrapper">
                ${langOptions.map(opt => `<div class="custom-select-option" data-value="${opt.key}">${opt.label}</div>`).join('')}
            </div>
        `;


        // [Req 1] 翻译 UI
        contentArea.innerHTML = `
            <div class="page-container settings-page-container">
                <div class="settings-nav">
                    <div>
                        <button class="settings-nav-item active" data-panel="appearance"><i class="fas fa-palette"></i> ${i18n.t('settings.appearance')}</button>
                        <button class="settings-nav-item" data-panel="update"><i class="fas fa-sync-alt"></i> ${i18n.t('settings.updates')}</button>
                        <button class="settings-nav-item" data-panel="about"><i class="fas fa-info-circle"></i> ${i18n.t('settings.about')}</button>
                    </div>
                    <div id="settings-status-panel">
                         <div class="status-panel-title">${i18n.t('settings.status.monitor')}</div>
                         <div class="status-item">
                            <div class="status-label"><span>${i18n.t('settings.status.cpu')}</span><span id="cpu-usage-text">0.00%</span></div>
                            <div class="status-bar-container"><div class="status-bar" id="cpu-usage-bar" style="width: 0%;"></div></div>
                        </div>
                        <div class="status-item">
                            <div class="status-label"><span>${i18n.t('settings.status.mem')}</span><span id="mem-usage-text">0.00%</span></div>
                            <div class="status-bar-container"><div class="status-bar" id="mem-usage-bar" style="width: 0%;"></div></div>
                        </div>
                        <div id="gpu-stats-container"></div>
                        <div class="status-item">
                            <div class="status-label"><span>${i18n.t('settings.status.uptime')}</span><span id="app-uptime-text">00:00:00</span></div>
                        </div>
                    </div>
                </div>

                <div class="settings-content">
                    <div id="appearance-panel" class="settings-panel active">
                        <div class="settings-section">
                            <h2><i class="fas fa-palette"></i> ${i18n.t('settings.appearance.title')}</h2>
                            <div class="settings-row"><span>${i18n.t('settings.appearance.theme')}</span><label class="theme-switch"><input type="checkbox" id="theme-switch-input" ${this.dbSettings.theme === 'dark' ? 'checked' : ''}><span class="slider"></span></label></div>
                            <div class="settings-row">
                                <span>${i18n.t('settings.appearance.language')}</span>
                                ${langSelectHtml}
                            </div>
                            <div class="settings-row collapsible-trigger ${expandedClass}" id="custom-bg-trigger"><span>${i18n.t('settings.appearance.bg')}</span><div class="background-controls"><button id="select-bg-btn" class="control-btn mini-btn ripple"><i class="fas fa-image"></i> ${i18n.t('settings.appearance.bg.select')}</button><button id="clear-bg-btn" class="control-btn mini-btn ripple"><i class="fas fa-times"></i> ${i18n.t('settings.appearance.bg.clear')}</button><span class="icon-toggle"></span></div></div>
                            <div class="collapsible-content ${expandedClass}">
                                <div class="settings-row"><span>${i18n.t('settings.appearance.bg.opacity')}</span><div class="opacity-control"><input type="range" id="opacity-slider" min="0.1" max="1" step="0.05" value="${this.dbSettings.backgroundOpacity}" ${opacityControlsDisabled}><span id="opacity-value">${Math.round(this.dbSettings.backgroundOpacity * 100)}%</span></div></div>
                                <div class="settings-row"><span>${i18n.t('settings.appearance.card.opacity')}</span><div class="opacity-control"><input type="range" id="card-opacity-slider" min="0.1" max="1" step="0.05" value="${this.dbSettings.cardOpacity}" ${opacityControlsDisabled}><span id="card-opacity-value">${Math.round(this.dbSettings.cardOpacity * 100)}%</span></div></div>
                            </div>
                        </div>
                        <div class="settings-section">
                            <h2><i class="fas fa-chart-bar"></i> ${i18n.t('settings.traffic.title')}</h2>
                            <div class="info-grid horizontal">
                                <div class="info-item">
                                    <span class="info-label">${i18n.t('settings.traffic.total')}</span>
                                    <span class="info-value gradient-text">${configManager.formatBytes(traffic)}</span>
                                </div>
                            </div>
                            <div id="traffic-chart-container" style="margin-top: 20px; height: 250px;">
                                <canvas id="traffic-chart"></canvas>
                            </div>
                        </div>
                    </div>
                    <div id="update-panel" class="settings-panel">
                        <div class="settings-section">
                            <h2><i class="fas fa-sync-alt"></i> ${i18n.t('settings.updates')}</h2>
                            <div id="update-check-wrapper"><button id="update-button" class="update-button ripple"><span class="text">${i18n.t('settings.update.checkBtn')}</span><span class="scan-bar"></span></button></div>
                            <div id="update-info-container"><p style="text-align:center; color: var(--text-secondary);">${i18n.t('settings.update.checkDefault')}</p></div>
                        </div>
                    </div>
                    
                    <div id="about-panel" class="settings-panel">
                        <div class="settings-grid">
                        
                            <div class="author-card" style="margin: 0;">
                                <div class="author-avatar">
                                    <i class="fas fa-user-astronaut"></i>
                                </div>
                                <h2 class="author-name">YMHUT</h2>
                                <p class="author-desc">开发者 & 设计者</p>
                                <div class="author-links">
                                    <button class="link-btn ripple" id="author-website-btn"><i class="fas fa-globe"></i> 官网</button>
                                    <button class="link-btn ripple" id="feedback-btn"><i class="fas fa-envelope"></i> 反馈</button>
                                </div>
                            </div>
                            
                            <div class="settings-section" style="margin: 0; display: flex; flex-direction: column; justify-content: space-between;">
                                <div>
                                    <h2><i class="fas fa-info-circle"></i> ${i18n.t('settings.about.title')}</h2>
                                    
                                    <div class="info-row">
                                        <span>${i18n.t('settings.about.version')}</span>
                                        <span>v${appVersion}</span>
                                    </div>
                                    <div class="info-row">
                                        <span>配置版本</span>
                                        <span>${configVersion}</span>
                                    </div>
                                </div>
                                
                                <div class="about-buttons" style="margin-top: 20px;">
                                    <button class="control-btn ripple" id="more-info-btn" style="width: 100%;">
                                        <i class="fas fa-book-open"></i> ${i18n.t('settings.about.moreInfo')}
                                    </button>
                                </div>
                            </div>
                            
                        </div> </div> </div>
            </div>
            ${langOptionsHtml} `;
        
        // [问题 2 修复] 将 options 元素移动到 body
        const langOptionsEl = document.getElementById('dd-options-lang-select-wrapper');
        if (langOptionsEl) {
            document.body.appendChild(langOptionsEl);
        }
            
        this.bindSettingsPageEvents();
    }

    bindSettingsPageEvents() {
        if (this.settingsInterval) clearInterval(this.settingsInterval);
        if (this.settingsIntervalHeavy) clearInterval(this.settingsIntervalHeavy);

        const updateLightStats = async () => {
            // ... (此函数内容保持不变) ...
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
                console.error("无法更新轻量级状态:", error);
                if (this.settingsInterval) clearInterval(this.settingsInterval);
            }
        };

        const updateHeavyStats = async () => {
            // ... (此函数内容保持不变) ...
            try {
                const gpuStats = await window.electronAPI.getGpuStats();
                const gpuContainer = document.getElementById('gpu-stats-container');
                if (gpuContainer) {
                    if (gpuStats && gpuStats.length > 0) {
                        if (gpuContainer.children.length !== gpuStats.length) {
                            let gpuHtml = '';
                            gpuStats.forEach((gpu, index) => {
                                gpuHtml += `
                            <div class="status-item" data-gpu-index="${index}">
                                <div class="status-label">
                                    <span>${i18n.t('settings.status.gpu')} ${index} (${gpu.vendor || 'N/A'})</span>
                                    <span class="gpu-temp">${gpu.temperature ?? 'N/A'}${gpu.temperature ? '°C' : ''}</span>
                                </div>
                                <div class="status-label">
                                    <span style="font-size: 11px; color: var(--text-secondary);">${gpu.model}</span>
                                    <span class="gpu-load">${(gpu.load ?? 0).toFixed(1)}%</span>
                                </div>
                                <div class="status-bar-container"><div class="status-bar gpu-bar" style="width: ${gpu.load ?? 0}%;"></div></div>
                            </div>
                        `;
                            });
                            gpuContainer.innerHTML = gpuHtml;
                        }
                        else {
                            gpuStats.forEach((gpu, index) => {
                                const gpuItem = gpuContainer.querySelector(`[data-gpu-index="${index}"]`);
                                if (gpuItem) {
                                    const tempEl = gpuItem.querySelector('.gpu-temp');
                                    const loadEl = gpuItem.querySelector('.gpu-load');
                                    const barEl = gpuItem.querySelector('.gpu-bar');
                                    if (tempEl) tempEl.textContent = `${gpu.temperature ?? 'N/A'}${gpu.temperature ? '°C' : ''}`;
                                    if (loadEl) loadEl.textContent = `${(gpu.load ?? 0).toFixed(1)}%`;
                                    if (barEl) barEl.style.width = `${gpu.load ?? 0}%`;
                                }
                            });
                        }
                    }
                    else { gpuContainer.innerHTML = ''; }
                }
            } catch (error) {
                console.error("无法更新重量级(GPU)状态:", error);
                if (this.settingsIntervalHeavy) clearInterval(this.settingsIntervalHeavy);
            }
        };

        this.settingsInterval = setInterval(updateLightStats, 2000);
        this.settingsIntervalHeavy = setInterval(updateHeavyStats, 10000);
        updateLightStats();
        updateHeavyStats();

        const navItems = document.querySelectorAll('.settings-nav-item');
        const panels = document.querySelectorAll('.settings-panel');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                navItems.forEach(nav => nav.classList.remove('active'));
                panels.forEach(panel => panel.classList.remove('active'));
                item.classList.add('active');
                const panelId = item.dataset.panel + '-panel';
                document.getElementById(panelId)?.classList.add('active');
            });
        });
        
        // --- [问题 2 修复] 绑定语言下拉菜单事件 (新逻辑) ---
        const langWrapper = document.getElementById('dd-wrapper-lang-select-wrapper');
        const langOptionsEl = document.getElementById('dd-options-lang-select-wrapper');
        
        if (langWrapper && langOptionsEl) {
            const langTrigger = langWrapper.querySelector('.custom-select-trigger');
            const langValueEl = langWrapper.querySelector('.custom-select-value');

            langTrigger.addEventListener('click', (e) => {
                e.stopPropagation();

                // 关闭所有其他打开的下拉菜单
                document.querySelectorAll('.custom-select-options.dynamic-active').forEach(openDropdown => {
                    if (openDropdown !== langOptionsEl) {
                        openDropdown.classList.remove('dynamic-active');
                    }
                });
                
                // 计算位置
                const rect = langTrigger.getBoundingClientRect();
                const optionsHeight = langOptionsEl.offsetHeight;
                const windowHeight = window.innerHeight;

                // 检查是否在底部溢出 (上拉)
                if (rect.bottom + optionsHeight + 5 > windowHeight && rect.top > optionsHeight + 5) {
                    langOptionsEl.style.top = `${rect.top - optionsHeight - 5}px`;
                    langOptionsEl.style.bottom = 'auto';
                    langOptionsEl.style.transformOrigin = 'bottom center'; // [新增 修复动画]
                } else {
                // 默认向下
                    langOptionsEl.style.top = `${rect.bottom + 5}px`;
                    langOptionsEl.style.bottom = 'auto';
                    langOptionsEl.style.transformOrigin = 'top center'; // [新增 修复动画]
                }
                
                langOptionsEl.style.left = `${rect.left}px`;
                langOptionsEl.style.width = `${rect.width}px`;
                
                langOptionsEl.classList.toggle('dynamic-active');
            });

            langOptionsEl.querySelectorAll('.custom-select-option').forEach(option => {
                option.addEventListener('click', async () => {
                    const newValue = option.dataset.value;
                    const newLabel = option.textContent;
                    
                    langValueEl.textContent = newLabel;
                    langOptionsEl.classList.remove('dynamic-active');
                    
                    // 异步保存并触发重启
                    try {
                        await window.electronAPI.saveLanguageConfig(newValue);
                        uiManager.showNotification(i18n.t('common.notification.title.success'), i18n.t('settings.appearance.language.restartMsg'), 'success');
                    } catch (err) {
                        uiManager.showNotification(i18n.t('common.notification.title.error'), err.message, 'error');
                    }
                });
            });
        }
        
        // --- [修复结束] ---

        document.getElementById('theme-switch-input')?.addEventListener('change', () => this.toggleTheme());
        
        const aboutNavButton = document.querySelector('.settings-nav-item[data-panel="about"]');
        if (aboutNavButton) {
            aboutNavButton.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.handleSecretTrigger(false);
            });
        }
        
        // [核心修改 2/3]：更新 'more-info-btn' 的点击事件
        document.getElementById('more-info-btn')?.addEventListener('click', () => {
            const currentTheme = document.body.getAttribute('data-theme') || 'dark';
            // 从 configManager 获取缓存的版本信息并传递
            const versions = configManager.config?.dbSettings?.versions || {};
            window.electronAPI.openAcknowledgementsWindow(currentTheme, versions);
        });

        // [修改] 更新作者链接
        document.getElementById('author-website-btn')?.addEventListener('click', () => window.electronAPI.openExternalLink('https://blog.ymhut.cn'));
        document.getElementById('feedback-btn')?.addEventListener('click', () => window.electronAPI.openExternalLink('mailto:admin@ymhut.cn'));
        
        // [修改] 移除了 'suyan-api-link' 和 'uapipro-link' 的事件监听器
        
        document.getElementById('select-bg-btn')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const result = await window.electronAPI.selectBackgroundImage();
            if (result.success) {
                configManager.logAction('设置新的自定义背景图片', 'settings');
                this.dbSettings.backgroundImage = result.path;
                document.getElementById('background-layer').style.backgroundImage = `url('${result.path}')`;
                this.toggleOpacityControls(true);
                document.getElementById('custom-bg-trigger')?.classList.add('expanded');
                document.querySelector('.collapsible-content')?.classList.add('expanded');
                uiManager.showNotification(i18n.t('common.notification.title.success'), '背景图片已设置');
            }
        });
        
        document.getElementById('clear-bg-btn')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            configManager.logAction('清除了自定义背景图片', 'settings');
            await window.electronAPI.clearBackgroundImage();
            this.dbSettings.backgroundImage = '';
            document.getElementById('background-layer').style.backgroundImage = 'none';
            const root = document.documentElement;
            const bgOpacitySlider = document.getElementById('opacity-slider');
            const cardOpacitySlider = document.getElementById('card-opacity-slider');
            root.style.setProperty('--background-opacity', '1.0');
            root.style.setProperty('--navbar-opacity', '1.0');
            root.style.setProperty('--card-opacity', '1.0');
            window.electronAPI.setBackgroundOpacity(1.0);
            window.electronAPI.setCardOpacity(1.0);
            if (bgOpacitySlider) {
                bgOpacitySlider.value = '1';
                document.getElementById('opacity-value').textContent = '100%';
            }
            if (cardOpacitySlider) {
                cardOpacitySlider.value = '1';
                document.getElementById('card-opacity-value').textContent = '100%';
            }
            this.toggleOpacityControls(false);
            document.getElementById('custom-bg-trigger')?.classList.remove('expanded');
            document.querySelector('.collapsible-content')?.classList.remove('expanded');
            uiManager.showNotification(i18n.t('common.notification.title.success'), '背景图片已清除');
        });
        
        const bgTrigger = document.getElementById('custom-bg-trigger');
        bgTrigger?.addEventListener('click', () => {
            const content = bgTrigger.nextElementSibling;
            bgTrigger.classList.toggle('expanded');
            content?.classList.toggle('expanded');
        });
        
        const bgOpacitySlider = document.getElementById('opacity-slider');
        bgOpacitySlider?.addEventListener('input', (e) => {
            const opacity = e.target.value;
            document.documentElement.style.setProperty('--background-opacity', opacity);
            document.documentElement.style.setProperty('--navbar-opacity', 1 - (1 - opacity) / 2);
            document.getElementById('opacity-value').textContent = `${Math.round(opacity * 100)}%`;
        });
        bgOpacitySlider?.addEventListener('change', (e) => {
            const opacity = parseFloat(e.target.value);
            configManager.logAction(`背景透明度调整为: ${Math.round(opacity * 100)}%`, 'settings');
            window.electronAPI.setBackgroundOpacity(opacity);
        });
        
        const cardOpacitySlider = document.getElementById('card-opacity-slider');
        cardOpacitySlider?.addEventListener('input', (e) => {
            document.documentElement.style.setProperty('--card-opacity', e.target.value);
            document.getElementById('card-opacity-value').textContent = `${Math.round(e.target.value * 100)}%`;
        });
        cardOpacitySlider?.addEventListener('change', (e) => {
            const opacity = parseFloat(e.target.value);
            configManager.logAction(`卡片透明度调整为: ${Math.round(opacity * 100)}%`, 'settings');
            window.electronAPI.setCardOpacity(opacity);
        });

        this.bindUpdateCheck();
        
        this.renderTrafficChart(); 
        
        // [核心修改 2/3]：移除了 renderAdditionalEnvInfo() 的调用
    }
    
    async renderTrafficChart() {
        if (this.activeChartInstance) {
            this.activeChartInstance.destroy();
            this.activeChartInstance = null;
        }

        const history = await window.electronAPI.getTrafficHistory();
        if (!history || history.length === 0) {
            const container = document.getElementById('traffic-chart-container');
            if (container) container.innerHTML = `<div class="empty-logs-placeholder" style="padding: 40px 0;"><i class="fas fa-chart-line"></i><p>${i18n.t('settings.traffic.chart.empty.title')}</p><span>${i18n.t('settings.traffic.chart.empty.sub')}</span></div>`;
            return;
        };

        const ctx = document.getElementById('traffic-chart')?.getContext('2d');
        if (!ctx) return;

        const style = getComputedStyle(document.body);
        const textColor = style.getPropertyValue('--text-color').trim();
        const textSecondaryColor = style.getPropertyValue('--text-secondary').trim();
        const borderColor = style.getPropertyValue('--border-color').trim();
        const accentColorRGB = style.getPropertyValue('--accent-color-rgb').trim();
        const primaryColorRGB = style.getPropertyValue('--primary-rgb').trim();
        const successColor = style.getPropertyValue('--success-color').trim() || '#34c759';
        
        const gradient = ctx.createLinearGradient(0, 0, 0, 250);
        gradient.addColorStop(0, `rgba(${accentColorRGB}, 0.4)`);
        gradient.addColorStop(1, `rgba(${accentColorRGB}, 0)`);

        const labels = history.map(item => item.log_date);
        const dataPoints = history.map(item => (item.bytes_used / (1024 * 1024)).toFixed(2));

        const allData = dataPoints;
        const data14Days = labels.length > 14 ? [...new Array(labels.length - 14).fill(null), ...dataPoints.slice(-14)] : dataPoints;
        const data7Days = labels.length > 7 ? [...new Array(labels.length - 7).fill(null), ...dataPoints.slice(-7)] : dataPoints;

        this.activeChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '全部流量 (MB)', data: allData, 
                        borderColor: `rgba(${accentColorRGB}, 0.8)`, 
                        backgroundColor: gradient,
                        borderWidth: 2.5, tension: 0.4, fill: true,
                        pointBackgroundColor: `rgba(${accentColorRGB}, 1)`,
                        pointStyle: 'circle', pointRadius: 0, pointHoverRadius: 6,
                    },
                    {
                        label: '近14天 (MB)', data: data14Days, 
                        borderColor: `rgba(${primaryColorRGB}, 0.8)`,
                        borderWidth: 2, tension: 0.4, fill: false,
                        borderDash: [5, 5],
                        pointBackgroundColor: `rgba(${primaryColorRGB}, 1)`,
                        pointRadius: 0, pointHoverRadius: 6,
                    },
                    {
                        label: '近7天 (MB)', data: data7Days, 
                        borderColor: successColor,
                        borderWidth: 2, tension: 0.4, fill: false,
                        borderDash: [3, 3],
                        pointBackgroundColor: successColor,
                        pointRadius: 0, pointHoverRadius: 6,
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                layout: { padding: { left: 10, right: 15 } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: textSecondaryColor, font: { family: "var(--font-family)" } },
                        grid: { color: borderColor, drawBorder: false }
                    },
                    x: {
                        ticks: { color: textSecondaryColor, font: { family: "var(--font-family)" } },
                        grid: { display: false, drawBorder: false }
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: textColor, font: { family: "var(--font-family)", size: 13 }, usePointStyle: true, boxWidth: 8, }
                    },
                    tooltip: {
                        enabled: true, backgroundColor: 'rgba(var(--card-background-rgb), 0.9)', titleColor: textColor,
                        bodyColor: textSecondaryColor, borderColor: borderColor, borderWidth: 1, cornerRadius: 8,
                        padding: 10, displayColors: true, boxPadding: 4,
                        titleFont: { family: "var(--font-family)", weight: 'bold' },
                        bodyFont: { family: "var(--font-family)" }
                    }
                },
                interaction: { intersect: false, mode: 'index' },
            }
        });
    }

    toggleOpacityControls(enabled) {
        const slider1 = document.getElementById('opacity-slider');
        const slider2 = document.getElementById('card-opacity-slider');
        if (slider1) slider1.disabled = !enabled;
        if (slider2) slider2.disabled = !enabled;
    }

    async toggleTheme() {
        const newTheme = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        configManager.logAction(`主题切换为: ${newTheme === 'dark' ? '黑夜模式' : '白天模式'}`, 'settings');
        document.body.setAttribute('data-theme', newTheme);
        this.dbSettings.theme = newTheme;
        document.querySelector('#theme-toggle i').className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        if (document.getElementById('theme-switch-input')) document.getElementById('theme-switch-input').checked = newTheme === 'dark';
        await window.electronAPI.setTheme(newTheme);

        if (document.getElementById('traffic-chart')) {
            this.renderTrafficChart();
        }
    }

    bindThemeToggle() {
        const themeToggle = document.getElementById('theme-toggle');
        themeToggle.querySelector('i').className = document.body.getAttribute('data-theme') === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        themeToggle.addEventListener('click', () => this.toggleTheme());
    }

    bindUpdateCheck() {
        const checkBtn = document.getElementById('update-button');
        const updateInfoEl = document.getElementById('update-info-container');
        if (!checkBtn) return;
        checkBtn.addEventListener('click', async () => {
            if (this.isDownloadingUpdate) return;
            checkBtn.disabled = true; checkBtn.classList.add('checking'); checkBtn.querySelector('.text').textContent = i18n.t('settings.update.checking');
            updateInfoEl.innerHTML = '';
            try {
                const result = await window.electronAPI.checkUpdates();
                if (result.hasUpdate) {
                    updateInfoEl.innerHTML = this.getUpdateAvailableHTML(result);
                    document.getElementById('download-only-btn').addEventListener('click', () => this.startUpdateDownload(result, false));
                    document.getElementById('download-and-install-btn').addEventListener('click', () => this.startUpdateDownload(result, true));
                } else {
                    updateInfoEl.innerHTML = `<p class="success">当前已是最新版本 (${result.currentVersion})</p>`;
                }
            } catch (error) {
                updateInfoEl.innerHTML = `<p class="error">检查更新失败: ${error.message}</p>`;
            } finally {
                checkBtn.disabled = false; checkBtn.classList.remove('checking'); checkBtn.querySelector('.text').textContent = i18n.t('settings.update.checkBtn');
            }
        });
    }

    getUpdateAvailableHTML(result) {
        const notesHtml = Object.entries(result.updateNotes).map(([key, value]) => `<div class="update-note-item"><span class="note-key">${key}:</span><span class="note-value">${value.replace(/<br>/g, '<br/>')}</div>`).join('');
        return `<p class="accent" style="text-align:center;">发现新版本: ${result.remoteVersion}</p><div class="update-notes-container"><div class="update-notes-list">${notesHtml}</div></div><div class="update-actions"><button id="download-only-btn" class="control-btn ripple"><i class="fas fa-download"></i> 下载安装包</button><button id="download-and-install-btn" class="action-btn ripple"><i class="fas fa-bolt"></i> 下载并安装</button></div>`;
    }

    getUpdateDownloadHTML(version) {
        return `<div class="update-download-ui"><div class="version-tag">正在下载 v${version}</div><div class="status-text"><span id="download-status-text">正在初始化...</span><span id="download-speed-text">0 KB/s</span></div><div class="download-progress-bar-container"><div id="download-progress-bar" class="download-progress-bar" style="width: 0%;"></div></div><div class="download-controls"><button id="cancel-download-btn" class="action-btn error-btn ripple"><i class="fas fa-stop-circle"></i> 取消下载</button></div></div>`;
    }

    async startUpdateDownload(updateInfo, installAfterDownload) {
        this.isDownloadingUpdate = true;
        document.getElementById('update-info-container').innerHTML = this.getUpdateDownloadHTML(updateInfo.remoteVersion);
        document.getElementById('cancel-download-btn').addEventListener('click', () => window.electronAPI.cancelDownload());
        try {
            const result = await window.electronAPI.downloadUpdate(updateInfo.downloadUrl);
            if (result.success) {
                if (installAfterDownload) {
                    window.electronAPI.openFile(result.path);
                } else {
                    const controls = document.querySelector('.download-controls');
                    controls.innerHTML = `<button id="open-folder-btn" class="action-btn ripple"><i class="fas fa-folder-open"></i> 打开位置</button>`;
                    document.getElementById('open-folder-btn').addEventListener('click', () => window.electronAPI.showItemInFolder(result.path));
                }
            }
        } catch (error) {
            document.getElementById('download-status-text').textContent = `下载失败: ${error.error}`;
        } finally {
            this.isDownloadingUpdate = false;
        }
    }

    listenForDownloadProgress() {
        window.electronAPI.onDownloadProgress(progress => {
            const bar = document.getElementById('download-progress-bar');
            if (bar) bar.style.width = `${progress.percent}%`;
            const status = document.getElementById('download-status-text');
            if (status) status.textContent = `正在下载... (${Math.round(progress.percent)}%)`;
            const speed = document.getElementById('download-speed-text');
            if (speed) speed.textContent = configManager.formatBytes(progress.speed || 0) + '/s';
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
            const updateButton = document.getElementById('update-button');
            if (updateButton) {
                if (!updateButton.classList.contains('checking')) {
                    updateButton.click();
                }
            }
        }, 300);
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
}

const mainPageInstance = new MainPage();
window.mainPage = mainPageInstance;