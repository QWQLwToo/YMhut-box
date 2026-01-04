import configManager from './configManager.js';
import uiManager from './uiManager.js';

class MainPage {
    constructor() {
        this.keySequence = '';
        this.keyTimeout = null;
        window.electronAPI.onInitialData((config) => this.initializeApp(config));
        this.isDownloadingUpdate = false;
        this.dbSettings = {};
        this.settingsInterval = null;
        this.dashboardInterval = null;
        this.activeChartInstance = null;
        this.settingsIntervalHeavy = null; // [新增]
    }

    initializeApp(config) {
        if (config.isOffline) { uiManager.renderOfflinePage(config.error); return; }
        this.dbSettings = config.dbSettings;
        configManager.setConfig(config);
        uiManager.init();
        this.bindWindowControls();
        this.bindNavigationEvents();
        this.bindThemeToggle();
        this.addRippleEffectListener();
        this.bindGlobalKeyListener();
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
        // 步骤 1: 调用主进程进行统一的安全检查 (IP + 锁定)
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

        // 步骤 2: 定义验证成功后的操作
        const onValidationSuccess = () => {
            configManager.logAction('触发了神秘档案馆彩蛋', 'general');
            window.electronAPI.resetSecretAttempts(); // 成功后重置计数器
            const currentTheme = document.body.getAttribute('data-theme') || 'dark';
            uiManager.showActionableNotification(
                '暗号正确!',
                '一个通往过去的入口已为你敞开。',
                '进入档案馆',
                () => {
                    window.electronAPI.openSecretWindow(currentTheme);
                }
            );
        };

        if (skipValidation) {
            onValidationSuccess();
            return;
        }

        // 步骤 3: 显示输入提示框
        uiManager.showPrompt({
            title: '秘密入口',
            label: '请输入暗号以继续…',
            placeholder: '注意大小写哦~',
        }, async (inputValue) => {
            if (inputValue && inputValue.toLowerCase() === 'vv') {
                onValidationSuccess();
            } else if (inputValue !== null) { // 用户输入了错误内容
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
        if (this.settingsInterval) {
            clearInterval(this.settingsInterval);
            this.settingsInterval = null;
        }
        // [修改] 清理重量级定时器
        if (this.settingsIntervalHeavy) {
            clearInterval(this.settingsIntervalHeavy);
            this.settingsIntervalHeavy = null;
        }
        if (this.dashboardInterval) {
            clearInterval(this.dashboardInterval);
            this.dashboardInterval = null;
        }
        // [修改] 清理图表实例
        if (this.activeChartInstance) {
            this.activeChartInstance.destroy();
            this.activeChartInstance = null;
        }

        uiManager.unloadActiveTool();
        configManager.logAction(`导航到: ${page}`, 'navigation');
        
        // [修改] 移除全局加载动画，加载逻辑下放到各个 render 函数
        
        setTimeout(() => {
            switch (page) {
                case 'home': 
                    this.renderWelcomePage(); 
                    break;
                case 'toolbox': 
                    uiManager.renderToolboxPage(); // <-- 修正函数名
                    break;
                case 'logs': 
                    // [修改] 调用同步渲染函数
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
        const contentArea = document.getElementById('content-area');
        const appVersion = await window.electronAPI.getAppVersion();
        const remoteVersion = configManager.config?.app_version;
        const hasUpdate = remoteVersion > appVersion;
        const announcement = configManager.config?.home_notes;
        const newNotes = configManager.config?.update_notes || {};

        const getGreeting = () => {
            const hour = new Date().getHours();
            if (hour < 6) return "凌晨了, 注意休息哦"; if (hour < 12) return "早上好, 新的一天元气满满"; if (hour < 14) return "中午好, 午休时间到了"; if (hour < 18) return "下午好, 继续努力吧"; return "晚上好, 放松一下吧";
        };

        const createNotesHtml = (notes) => {
            const entries = Object.entries(notes);
            if (entries.length === 0) return '<p class="empty-notes">暂无更新详情。</p>';
            return entries.map(([key, value]) => `<div class="changelog-item"><span class="changelog-key">${key}</span><div class="changelog-value">${value.replace(/<br>/g, '<br/>')}</div></div>`).join('');
        };

        contentArea.innerHTML = `
            <div class="page-container welcome-dashboard">
                <div class="welcome-header">
                    <div>
                        <h1 class="gradient-text">${getGreeting()}</h1>
                        <p>欢迎使用 YMhut Box, 愿你拥有美好的一天。</p>
                    </div>
                </div>
                <div class="dashboard-card announcement-card">
                    <div class="welcome-card-header"><h3><i class="fas fa-bullhorn"></i> 公告</h3></div>
                    <div class="card-content announcement-content">
                        <p>${announcement || '公告配置出差了，无法正常显示 ┗|｀O′|┛ 嗷~~'}</p>
                    </div>
                </div>
                <div class="dashboard-grid">
                    <div class="dashboard-card system-overview-card">
                        <div class="welcome-card-header"><h3><i class="fas fa-tachometer-alt"></i> 系统概览</h3></div>
                        <div class="card-content">
                            <div class="status-item">
                                <div class="status-label"><span>CPU</span><span id="dash-cpu-usage">0.00%</span></div>
                                <div class="status-bar-container"><div class="status-bar" id="dash-cpu-bar" style="width: 0%;"></div></div>
                            </div>
                            <div class="status-item">
                                <div class="status-label"><span>内存</span><span id="dash-mem-usage">0.00%</span></div>
                                <div class="status-bar-container"><div class="status-bar" id="dash-mem-bar" style="width: 0%;"></div></div>
                            </div>
                            <div class="info-row compact">
                                <span>运行时长:</span><span id="dash-app-uptime">00:00:00</span>
                            </div>
                        </div>
                    </div>
                    <div class="dashboard-card quick-launch-card">
                        <div class="welcome-card-header"><h3><i class="fas fa-rocket"></i> 快捷启动</h3></div>
                        <div class="card-content">
                            <div class="quick-launch-grid">
                                <button class="quick-launch-btn ripple" data-tool="ip-query">
                                    <i class="fas fa-network-wired"></i><span>IP查询</span>
                                </button>
                                <button class="quick-launch-btn ripple" data-tool="system-info">
                                    <i class="fas fa-desktop"></i><span>系统信息</span>
                                </button>
                                <button class="quick-launch-btn ripple" data-tool="calc">
                                    <i class="fas fa-calculator"></i><span>计算器</span>
                                </button>
                                <button class="quick-launch-btn ripple" data-tool="all-tools">
                                    <i class="fas fa-ellipsis-h"></i><span>全部工具</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="dashboard-card changelog-card">
                        <div class="welcome-card-header">
                            <h2><i class="fas fa-box-open"></i> ${hasUpdate ? `发现新版 v${remoteVersion}` : `当前版本 v${appVersion}`}</h2>
                            ${hasUpdate ? `<button id="update-now-btn" class="action-btn mini-btn ripple"><i class="fas fa-arrow-circle-down"></i> 更新</button>` : `<span class="latest-tag">已是最新</span>`}
                        </div>
                        <div class="changelog-list">${createNotesHtml(newNotes)}</div>
                    </div>
                </div>
            </div>
            <div class="version-display">v${appVersion}</div>`;

        this._initDashboardWidgets();
        uiManager.fadeInContent('.welcome-header, .dashboard-card');
    }

    _initDashboardWidgets() {
        const updateDashboardStats = async () => {
            try {
                const [stats, mem] = await Promise.all([
                    window.electronAPI.getRealtimeStats(),
                    window.electronAPI.getMemoryUpdate()
                ]);
                document.getElementById('dash-cpu-usage').textContent = `${stats.cpu}%`;
                document.getElementById('dash-cpu-bar').style.width = `${stats.cpu}%`;
                document.getElementById('dash-mem-usage').textContent = `${mem.usagePercentage}%`;
                document.getElementById('dash-mem-bar').style.width = `${mem.usagePercentage}%`;
                document.getElementById('dash-app-uptime').textContent = stats.uptime;
            } catch (error) {
                console.error("无法更新仪表盘状态:", error);
                if (this.dashboardInterval) clearInterval(this.dashboardInterval);
            }
        };

        if (this.dashboardInterval) clearInterval(this.dashboardInterval);
        this.dashboardInterval = setInterval(updateDashboardStats, 2000);
        updateDashboardStats();

        document.querySelectorAll('.quick-launch-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const toolId = btn.dataset.tool;
                switch (toolId) {
                    case 'ip-query':
                    case 'system-info':
                        uiManager.launchModularTool(toolId);
                        break;
                    case 'calc':
                        window.electronAPI.launchSystemTool('calc');
                        break;
                    case 'all-tools':
                        this.navigateTo('toolbox');
                        this.updateActiveNavButton(document.getElementById('toolbox-btn'));
                        break;
                }
            });
        });

        const updateBtn = document.getElementById('update-now-btn');
        if (updateBtn) {
            updateBtn.addEventListener('click', () => this.navigateToSettingsForUpdate());
        }
    }

    renderLogsPage(filterDate = new Date().toISOString().split('T')[0]) {
        const contentArea = document.getElementById('content-area');
        const todayString = new Date().toISOString().split('T')[0];

        // [修改] 不再 await 数据，而是立即渲染页面外壳
        // [修改] 日志容器的 ID 更改为 'logs-content-container'
        contentArea.innerHTML = `
            <div class="page-container">
                <div class="section-header logs-header">
                    <h1><i class="fas fa-history"></i> 操作日志</h1>
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
                        <p class="loading-text">正在加载日志...</p>
                    </div>
                </div>
            </div>`;
        
        this.bindLogPageEvents();
        
        // [修改] 异步调用新函数来获取数据
        this._fetchAndRenderLogs(filterDate);
    }
    // [新增] 此函数到 mainPage.js 的 MainPage 类中
    async _fetchAndRenderLogs(filterDate) {
        const dateQuery = filterDate === 'all' ? null : filterDate;
        let logs;
        const logsContainer = document.getElementById('logs-content-container');

        try {
            // 1. Await data
            logs = await window.electronAPI.getLogs(dateQuery);
        } catch (error) {
            // Handle fetch error
            if(logsContainer) {
                logsContainer.innerHTML = `<div class="empty-logs-placeholder"><i class="fas fa-exclamation-triangle"></i><p>加载日志失败</p><span>${error.message}</span></div>`;
            }
            return;
        }

        // 2. Process data
        const groupedLogs = logs.reduce((acc, log) => {
            const date = new Date(log.timestamp).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
            if (!acc[date]) acc[date] = [];
            acc[date].push(log);
            return acc;
        }, {});

        // 3. Create render helper (这段代码是从旧的 renderLogsPage 移过来的)
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

        // 4. Inject final HTML
        if (logsContainer) {
            logsContainer.innerHTML = renderLogEntries(groupedLogs);
        }
    }

    bindLogPageEvents() {
        const datePicker = document.getElementById('log-date-picker');
        const logsContainer = document.getElementById('logs-content-container');

        // [修改] 封装一个显示加载动画并获取数据的函数
        const loadLogs = (filterDate) => {
            if(logsContainer) {
                logsContainer.innerHTML = `<div class="loading-container" style="padding: 60px 0;"><img src="./assets/loading.gif" alt="加载中..." class="loading-gif"><p class="loading-text">正在加载日志...</p></div>`;
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
                uiManager.showNotification('操作成功', '所有日志已被清空。');
                // [修改] 刷新当前视图
                loadLogs(datePicker.value || 'all');
            }
        });
    }

    async renderSettingsPage() {
        const contentArea = document.getElementById('content-area');
        const [appVersion, traffic] = await Promise.all([
            window.electronAPI.getAppVersion(),
            window.electronAPI.getTrafficStats()
        ]);

        const hasBgImage = this.dbSettings.backgroundImage && this.dbSettings.backgroundImage.length > 0;
        const expandedClass = hasBgImage ? 'expanded' : '';
        const opacityControlsDisabled = hasBgImage ? '' : 'disabled';
        const renderInfoItem = (label, value) => `<div class="info-row"><span>${label}:</span><span>${value || 'N/A'}</span></div>`;

        contentArea.innerHTML = `
            <div class="page-container settings-page-container">
                <div class="settings-nav">
                    <div>
                        <button class="settings-nav-item active" data-panel="appearance"><i class="fas fa-palette"></i> 外观</button>
                        <button class="settings-nav-item" data-panel="update"><i class="fas fa-sync-alt"></i> 更新管理</button>
                        <button class="settings-nav-item" data-panel="about"><i class="fas fa-info-circle"></i> 关于</button>
                    </div>
                    <div id="settings-status-panel">
                         <div class="status-panel-title">状态监控</div>
                         <div class="status-item">
                            <div class="status-label"><span>CPU</span><span id="cpu-usage-text">0.00%</span></div>
                            <div class="status-bar-container"><div class="status-bar" id="cpu-usage-bar" style="width: 0%;"></div></div>
                        </div>
                        <div class="status-item">
                            <div class="status-label"><span>内存</span><span id="mem-usage-text">0.00%</span></div>
                            <div class="status-bar-container"><div class="status-bar" id="mem-usage-bar" style="width: 0%;"></div></div>
                        </div>
                        <div id="gpu-stats-container"></div>
                        <div class="status-item">
                            <div class="status-label"><span>运行时长</span><span id="app-uptime-text">00:00:00</span></div>
                        </div>
                    </div>
                </div>

                <div class="settings-content">
                    <div id="appearance-panel" class="settings-panel active">
                        <div class="settings-section">
                            <h2><i class="fas fa-palette"></i> 外观设置</h2>
                            <div class="settings-row"><span>界面主题</span><label class="theme-switch"><input type="checkbox" id="theme-switch-input" ${this.dbSettings.theme === 'dark' ? 'checked' : ''}><span class="slider"></span></label></div>
                            <div class="settings-row collapsible-trigger ${expandedClass}" id="custom-bg-trigger"><span>自定义背景</span><div class="background-controls"><button id="select-bg-btn" class="control-btn mini-btn ripple"><i class="fas fa-image"></i> 选择</button><button id="clear-bg-btn" class="control-btn mini-btn ripple"><i class="fas fa-times"></i> 清除</button><span class="icon-toggle"></span></div></div>
                            <div class="collapsible-content ${expandedClass}">
                                <div class="settings-row"><span>背景透明度</span><div class="opacity-control"><input type="range" id="opacity-slider" min="0.1" max="1" step="0.05" value="${this.dbSettings.backgroundOpacity}" ${opacityControlsDisabled}><span id="opacity-value">${Math.round(this.dbSettings.backgroundOpacity * 100)}%</span></div></div>
                                <div class="settings-row"><span>卡片透明度</span><div class="opacity-control"><input type="range" id="card-opacity-slider" min="0.1" max="1" step="0.05" value="${this.dbSettings.cardOpacity}" ${opacityControlsDisabled}><span id="card-opacity-value">${Math.round(this.dbSettings.cardOpacity * 100)}%</span></div></div>
                            </div>
                        </div>
                        <div class="settings-section">
                            <h2><i class="fas fa-chart-bar"></i> 流量统计</h2>
                            <div class="info-grid horizontal">
                                <div class="info-item">
                                    <span class="info-label">累计使用流量</span>
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
                            <h2><i class="fas fa-sync-alt"></i> 更新管理</h2>
                            <div id="update-check-wrapper"><button id="update-button" class="update-button ripple"><span class="text">检查更新</span><span class="scan-bar"></span></button></div>
                            <div id="update-info-container"><p style="text-align:center; color: var(--text-secondary);">点击按钮检查新版本</p></div>
                        </div>
                    </div>
                    <div id="about-panel" class="settings-panel">
                         <div class="settings-section">
                            <h2><i class="fas fa-info-circle"></i> 关于与软件环境</h2>
                            ${renderInfoItem('当前版本', `v${appVersion}`)}
                            ${renderInfoItem('开发者', 'YMHUT')}
                            ${renderInfoItem('Electron', configManager.config?.dbSettings?.electronVersion || 'N/A')}
                            ${renderInfoItem('Node.js', configManager.config?.dbSettings?.nodeVersion || 'N/A')}
                            ${renderInfoItem('Chromium', configManager.config?.dbSettings?.chromeVersion || 'N/A')}
                            <div class="about-buttons">
                                <button class="control-btn ripple" id="more-info-btn"><i class="fas fa-book-open"></i> 更多信息与鸣谢</button>
                            </div>
                        </div>
                        <div class="settings-section">
                            <h2><i class="fas fa-tools"></i> 已安装的开发环境</h2>
                            <div id="additional-env-info">
                                <p style="color: var(--text-secondary);">正在检测...</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        this.bindSettingsPageEvents();
    }

    bindSettingsPageEvents() {
        
        // [修改] 清理两个 interval
        if (this.settingsInterval) clearInterval(this.settingsInterval);
        if (this.settingsIntervalHeavy) clearInterval(this.settingsIntervalHeavy);

        // [修改] 1. 创建轻量级更新 (CPU + Mem + Uptime)
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
                console.error("无法更新轻量级状态:", error);
                if (this.settingsInterval) clearInterval(this.settingsInterval);
            }
        };

        // [新增] 2. 创建重量级更新 (GPU)
        const updateHeavyStats = async () => {
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
                                    <span>GPU ${index} (${gpu.vendor || 'N/A'})</span>
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
                    else {
                        gpuContainer.innerHTML = '';
                    }
                }
            } catch (error) {
                console.error("无法更新重量级(GPU)状态:", error);
                if (this.settingsIntervalHeavy) clearInterval(this.settingsIntervalHeavy);
            }
        };


        // [修改] 3. 启动两个不同频率的定时器
        this.settingsInterval = setInterval(updateLightStats, 2000); // 2秒
        this.settingsIntervalHeavy = setInterval(updateHeavyStats, 10000); // 10秒 (将 PowerShell 启动频率降低80%)

        // [修改] 4. 立即执行一次所有更新
        updateLightStats();
        updateHeavyStats();

        // --- (以下所有事件绑定保持不变) ---
        const navItems = document.querySelectorAll('.settings-nav-item');
        const panels = document.querySelectorAll('.settings-panel');
        navItems.forEach(item => {
            // ... (nav item click logic) ...
            item.addEventListener('click', () => {
                navItems.forEach(nav => nav.classList.remove('active'));
                panels.forEach(panel => panel.classList.remove('active'));
                item.classList.add('active');
                const panelId = item.dataset.panel + '-panel';
                document.getElementById(panelId)?.classList.add('active');
            });
        });
        document.getElementById('theme-switch-input')?.addEventListener('change', () => this.toggleTheme());
        const aboutNavButton = document.querySelector('.settings-nav-item[data-panel="about"]');
        if (aboutNavButton) {
            aboutNavButton.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.handleSecretTrigger(false);
            });
        }
        document.getElementById('more-info-btn')?.addEventListener('click', () => {
            const currentTheme = document.body.getAttribute('data-theme') || 'dark';
            window.electronAPI.openAcknowledgementsWindow(currentTheme);
        });
        document.getElementById('select-bg-btn')?.addEventListener('click', async (e) => {
            // ... (select-bg-btn logic) ...
            e.stopPropagation();
            const result = await window.electronAPI.selectBackgroundImage();
            if (result.success) {
                configManager.logAction('设置新的自定义背景图片', 'settings');
                this.dbSettings.backgroundImage = result.path;
                document.getElementById('background-layer').style.backgroundImage = `url('${result.path}')`;
                this.toggleOpacityControls(true);
                document.getElementById('custom-bg-trigger')?.classList.add('expanded');
                document.querySelector('.collapsible-content')?.classList.add('expanded');
                uiManager.showNotification('成功', '背景图片已设置');
            }
        });
        document.getElementById('clear-bg-btn')?.addEventListener('click', async (e) => {
            // ... (clear-bg-btn logic) ...
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
            uiManager.showNotification('成功', '背景图片已清除');
        });
        const bgTrigger = document.getElementById('custom-bg-trigger');
        bgTrigger?.addEventListener('click', () => {
            // ... (bgTrigger logic) ...
            const content = bgTrigger.nextElementSibling;
            bgTrigger.classList.toggle('expanded');
            content?.classList.toggle('expanded');
        });
        const bgOpacitySlider = document.getElementById('opacity-slider');
        bgOpacitySlider?.addEventListener('input', (e) => {
            // ... (bgOpacitySlider input logic) ...
            const opacity = e.target.value;
            document.documentElement.style.setProperty('--background-opacity', opacity);
            document.documentElement.style.setProperty('--navbar-opacity', 1 - (1 - opacity) / 2);
            document.getElementById('opacity-value').textContent = `${Math.round(opacity * 100)}%`;
        });
        bgOpacitySlider?.addEventListener('change', (e) => {
            // ... (bgOpacitySlider change logic) ...
            const opacity = parseFloat(e.target.value);
            configManager.logAction(`背景透明度调整为: ${Math.round(opacity * 100)}%`, 'settings');
            window.electronAPI.setBackgroundOpacity(opacity);
        });
        const cardOpacitySlider = document.getElementById('card-opacity-slider');
        cardOpacitySlider?.addEventListener('input', (e) => {
            // ... (cardOpacitySlider input logic) ...
            document.documentElement.style.setProperty('--card-opacity', e.target.value);
            document.getElementById('card-opacity-value').textContent = `${Math.round(e.target.value * 100)}%`;
        });
        cardOpacitySlider?.addEventListener('change', (e) => {
            // ... (cardOpacitySlider change logic) ...
            const opacity = parseFloat(e.target.value);
            configManager.logAction(`卡片透明度调整为: ${Math.round(opacity * 100)}%`, 'settings');
            window.electronAPI.setCardOpacity(opacity);
        });

        this.bindUpdateCheck();
        
        this.renderTrafficChart(); 
        
        const renderAdditionalEnvInfo = () => {
            // ... (renderAdditionalEnvInfo logic) ...
            const renderInfoItem = (label, value) => `<div class="info-row"><span>${label}:</span><span>${value || 'N/A'}</span></div>`;
            const container = document.getElementById('additional-env-info');
            if (!container) return;
            const versions = configManager.config?.dbSettings?.versions || {};
            const coreVersions = ['node', 'npm'];
            let html = '';
            for (const [key, value] of Object.entries(versions)) {
                if (value && !coreVersions.includes(key)) {
                    html += renderInfoItem(key.charAt(0).toUpperCase() + key.slice(1), value);
                }
            }
            if (html) {
                container.innerHTML = html;
            } else {
                container.innerHTML = `<p style="color: var(--text-secondary);">未检测到其他受支持的开发环境。</p>`;
            }
        };
        renderAdditionalEnvInfo();
    }
    // [新增] 将 renderTrafficChart 提取为类方法
    async renderTrafficChart() {
        // [BUG 修复] 销毁上一个图表实例，防止内存泄漏和重叠
        if (this.activeChartInstance) {
            this.activeChartInstance.destroy();
            this.activeChartInstance = null;
        }

        const history = await window.electronAPI.getTrafficHistory();
        if (!history || history.length === 0) {
            const container = document.getElementById('traffic-chart-container');
            if (container) container.innerHTML = `<div class="empty-logs-placeholder" style="padding: 40px 0;"><i class="fas fa-chart-line"></i><p>暂无历史流量数据</p><span>数据将从今天开始记录</span></div>`;
            return;
        };

        const ctx = document.getElementById('traffic-chart')?.getContext('2d');
        if (!ctx) return;

        // [BUG 修复] 重新获取最新的 CSS 变量
        const style = getComputedStyle(document.body);
        const textColor = style.getPropertyValue('--text-color').trim();
        const textSecondaryColor = style.getPropertyValue('--text-secondary').trim();
        const borderColor = style.getPropertyValue('--border-color').trim();
        const accentColorRGB = style.getPropertyValue('--accent-color-rgb').trim();
        const primaryColorRGB = style.getPropertyValue('--primary-rgb').trim();
        // [UI 升级] 获取 --success-color 的 RGB 值
        const successColor = style.getPropertyValue('--success-color').trim() || '#34c759'; // #34c759
        
        const gradient = ctx.createLinearGradient(0, 0, 0, 250);
        gradient.addColorStop(0, `rgba(${accentColorRGB}, 0.4)`);
        gradient.addColorStop(1, `rgba(${accentColorRGB}, 0)`);

        const labels = history.map(item => item.log_date);
        const dataPoints = history.map(item => (item.bytes_used / (1024 * 1024)).toFixed(2));

        const allData = dataPoints;
        const data14Days = labels.length > 14 ? [...new Array(labels.length - 14).fill(null), ...dataPoints.slice(-14)] : dataPoints;
        const data7Days = labels.length > 7 ? [...new Array(labels.length - 7).fill(null), ...dataPoints.slice(-7)] : dataPoints;

        // [修改] 将图表实例存到 this.activeChartInstance
        this.activeChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    // [UI 升级] 1. 全部流量 (主线，填充)
                    {
                        label: '全部流量 (MB)', data: allData, 
                        borderColor: `rgba(${accentColorRGB}, 0.8)`, 
                        backgroundColor: gradient,
                        borderWidth: 2.5, // 加粗主线
                        tension: 0.4, 
                        fill: true, // 只有主线填充
                        pointBackgroundColor: `rgba(${accentColorRGB}, 1)`,
                        pointStyle: 'circle', pointRadius: 0, pointHoverRadius: 6,
                    },
                    // [UI 升级] 2. 近14天 (虚线，不填充)
                    {
                        label: '近14天 (MB)', data: data14Days, 
                        borderColor: `rgba(${primaryColorRGB}, 0.8)`,
                        borderWidth: 2, 
                        tension: 0.4,
                        fill: false, // 不填充
                        borderDash: [5, 5], // 虚线
                        pointBackgroundColor: `rgba(${primaryColorRGB}, 1)`,
                        pointRadius: 0, pointHoverRadius: 6,
                    },
                    // [UI 升级] 3. 近7天 (点线，不填充)
                    {
                        label: '近7天 (MB)', data: data7Days, 
                        borderColor: successColor, // 使用绿色
                        borderWidth: 2, 
                        tension: 0.4,
                        fill: false, // 不填充
                        borderDash: [3, 3], // 点线
                        pointBackgroundColor: successColor,
                        pointRadius: 0, pointHoverRadius: 6,
                    }
                ]
            },
            options: {
                // ... (options 内部的所有配置保持不变) ...
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

        // [BUG 修复]
        // 检查图表是否在 DOM 中，如果是，则调用 renderTrafficChart 重新绘制它
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
            checkBtn.disabled = true; checkBtn.classList.add('checking'); checkBtn.querySelector('.text').textContent = '正在检查...';
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
                checkBtn.disabled = false; checkBtn.classList.remove('checking'); checkBtn.querySelector('.text').textContent = '检查更新';
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