// src/js/uiManager.js
import configManager from './configManager.js';
import { toolRegistry } from './tool-registry.js';

class UIManager {
    constructor() {
        this.modularTools = {
            'ip-query': { name: 'IP属地查询', icon: 'fas fa-network-wired', description: '查询IP归属地信息', classId: 'ip-query', launchType: 'inline' },
            'smart-search': { name: '智能搜索', icon: 'fas fa-search-plus', description: 'AI 聚合搜索，获取高质量结果', classId: 'smart-search', launchType: 'inline' },
            'ai-translation': { name: 'AI 智能翻译', icon: 'fas fa-language', description: '多语言 AI 翻译，支持风格和场景选择', classId: 'ai-translation', launchType: 'window', view: 'view-tool' },
            'hotboard': { name: '多平台实时热榜', icon: 'fas fa-fire-alt', description: '聚合 B站、微博、知乎等全平台热榜', classId: 'hotboard', launchType: 'window', view: 'view-tool' },
            'qq-avatar': { name: 'QQ 信息查询', icon: 'fab fa-qq', description: '查询QQ昵称、头像、等级等信息', classId: 'qq-avatar' },
            'system-info': { name: '系统信息', icon: 'fas fa-desktop', description: '查看系统、硬件及软件信息', classId: 'system-info' },
            'system-tool': { name: '系统工具', icon: 'fas fa-toolbox', description: '调用计算器、截图等系统常用工具', classId: 'system-tool' },
            'base64-converter': { name: 'Base64 转换', icon: 'fas fa-exchange-alt', description: '文本或图片与Base64互转', classId: 'base64-converter', launchType: 'window', view: 'view-tool' },
            'chinese-converter': { name: '简繁转换', icon: 'fas fa-language', description: '简体字与繁体字互相转换', classId: 'chinese-converter', launchType: 'window', view: 'view-tool' },
            'qr-code-generator': { name: '二维码生成', icon: 'fas fa-qrcode', description: '生成文本或网址的二维码', classId: 'qr-code-generator', launchType: 'inline' },
            'profanity-check': { name: '敏感词检测', icon: 'fas fa-shield-alt', description: '检测文本中的敏感词和违禁词', classId: 'profanity-check', launchType: 'window', view: 'view-tool' },
            'wx-domain-check': { name: '微信域名检测', icon: 'fab fa-weixin', description: '检测域名在微信中的访问状态', classId: 'wx-domain-check', launchType: 'window', view: 'view-tool' },
            'bili-hot-ranking': { name: 'B站热搜榜', icon: 'fab fa-bilibili', description: '查看B站实时热搜排行', classId: 'bili-hot-ranking' },
            'baidu-hot': { name: '百度热搜', icon: 'fas fa-fire', description: '查看百度实时热搜、热梗等榜单', classId: 'baidu-hot' },
            'ip-info': { name: 'IP/域名查询', icon: 'fas fa-search-location', description: '查询指定IP或域名的归属信息', classId: 'ip-info', launchType: 'window', view: 'view-tool' },
            'dns-query': { name: 'DNS 解析查询', icon: 'fas fa-map-signs', description: '查询域名的DNS A, MX, TXT等记录', classId: 'dns-query', launchType: 'window', view: 'view-tool' },
            'secure-browser': { name: '安全浏览器', icon: 'fas fa-shield-alt', description: '打开一个带地址栏的隔离浏览器', classId: null, launchType: 'window', view: 'view-browser' },
            
            // [修复 1] 注册 UI
            'image-processor': {
                name: '图片处理工坊',
                icon: 'fas fa-magic',
                description: '图片裁剪、旋转、滤镜调整及格式转换',
                classId: 'image-processor',
                launchType: 'window',
                view: 'view-tool'
            },
            'archive-tool': {
                name: '极限压缩 & 解密',
                icon: 'fas fa-file-archive',
                description: '多线程压缩与解密，支持加盐加密',
                classId: 'archive-tool',
                launchType: 'inline' 
            }
        };
        this.hardcodedTools = {
            'screening-room': { name: '随机放映室', icon: 'fas fa-film', description: '浏览随机图片和视频', launch: () => this.renderCategoryNavigation() },
        };
        this.allTools = {};
        this.currentCategory = null; this.currentSubcategory = null; this.currentMediaBlob = null; this.abortController = null; this.activeModularTool = null;
        this.currentPage = 1;
        this.itemsPerPage = 1;
        this.filteredTools = [];
    }

    init() {
        this.allTools = { ...this.hardcodedTools };
        Object.entries(this.modularTools).forEach(([id, tool]) => {
            this.allTools[id] = { ...tool, launch: () => this.launchModularTool(id) };
        });

        const toolMetadata = configManager.config?.tool_metadata || {};
        Object.entries(this.allTools).forEach(([id, tool]) => {
            tool.keywords = (toolMetadata[id]?.keywords || []).concat([id, tool.name]);
        });

        configManager.logAction('UI管理器初始化完成', 'system');
    }

    // ... (renderToolboxPage, _bindToolboxPageEvents, _filterAndRenderTools 等方法保持不变)
    renderToolboxPage() {
        this.unloadActiveTool();
        const contentArea = document.getElementById('content-area');
        const categories = { 'all': '全部工具', ...(configManager.config?.tool_categories || {}) };

        contentArea.innerHTML = `
            <div class="page-container toolbox-page-container" style="display: flex; height: 100%; gap: 20px; padding-top: 20px;">
                
                <nav class="toolbox-sidebar settings-nav" style="position: relative;">
                    <div id="toolbox-active-slider" class="toolbox-active-slider"></div>
                    
                    <div id="toolbox-categories-list">
                        ${Object.entries(categories).map(([id, name]) => `
                            <button class="settings-nav-item toolbox-category-btn" data-category-id="${id}">
                                <i class="fas ${id === 'all' ? 'fa-box-open' : 'fa-folder'}"></i>
                                <span>${name}</span>
                            </button>
                        `).join('')}
                    </div>
                </nav>

                <div class="toolbox-main-content" style="flex-grow: 1; display: flex; flex-direction: column; min-width: 0;">
                    <div class="section-header" style="justify-content: flex-start; gap: 20px; margin-bottom: 20px; flex-shrink: 0;">
                        <h1 class="gradient-text"><i class="fas fa-box-open"></i> 工具箱</h1>
                        <div class="ip-input-group" style="max-width: 300px; flex-grow: 1;">
                            <input type="text" id="toolbox-search" placeholder="搜索工具 (e.g., IP, 系统)...">
                        </div>
                    </div>
                    <div id="toolbox-grid" class="toolbox-grid content-area" style="padding: 0; flex-grow: 1; min-height: 0;">
                    </div>
                    <div id="toolbox-pagination" class="pagination-container" style="flex-shrink: 0; margin-top: 20px;"></div>
                </div>
            </div>`;

        this._bindToolboxPageEvents();
    }
    
    _bindToolboxPageEvents() {
        const searchInput = document.getElementById('toolbox-search');
        const categoryBtns = document.querySelectorAll('#toolbox-categories-list .toolbox-category-btn');
        const slider = document.getElementById('toolbox-active-slider');

        const moveSlider = (targetButton) => {
            if (targetButton && slider) {
                slider.style.transform = `translateY(${targetButton.offsetTop}px)`;
                slider.style.height = `${targetButton.offsetHeight}px`;
            }
        };

        const defaultTab = categoryBtns[0];
        if (defaultTab) {
            defaultTab.classList.add('active');
            moveSlider(defaultTab);
        }

        this._filterAndRenderTools();

        categoryBtns.forEach(tab => {
            tab.addEventListener('click', () => {
                categoryBtns.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                moveSlider(tab);
                this.currentPage = 1;
                this._filterAndRenderTools();
            });
        });

        searchInput.addEventListener('input', () => {
            this.currentPage = 1;
            this._filterAndRenderTools();
        });

        window.addEventListener('resize', this._debounce(() => {
            this._filterAndRenderTools();
            const activeTab = document.querySelector('#toolbox-categories-list .toolbox-category-btn.active');
            moveSlider(activeTab);
        }, 200));
    }

    _filterAndRenderTools() {
        const grid = document.getElementById('toolbox-grid');
        if (!grid) return;

        const existingCards = grid.querySelectorAll('.tool-card');
        const animationDuration = 200;

        const renderNewContent = () => {
            const searchInput = document.getElementById('toolbox-search');
            const activeTab = document.querySelector('#toolbox-categories-list .toolbox-category-btn.active');
            const filterCategory = activeTab?.dataset.categoryId || 'all';
            const searchTerm = searchInput?.value || '';
            const toolMetadata = configManager.config?.tool_metadata || {};
            const lowerCaseSearchTerm = searchTerm.toLowerCase();

            this.filteredTools = Object.entries(this.allTools).filter(([id, tool]) => {
                const toolCategory = toolMetadata[id]?.category;
                const categoryMatch = filterCategory === 'all' || toolCategory === filterCategory;
                const searchMatch = tool.keywords.some(keyword => keyword.toLowerCase().includes(lowerCaseSearchTerm)) ||
                    tool.description.toLowerCase().includes(lowerCaseSearchTerm);
                return categoryMatch && searchMatch;
            });

            this._calculatePaginationAndRender();
        };

        if (existingCards.length > 0) {
            existingCards.forEach(card => card.classList.add('fade-out'));
            setTimeout(() => {
                grid.innerHTML = '';
                renderNewContent();
            }, animationDuration);
        } else {
            renderNewContent();
        }
    }

    _calculatePaginationAndRender() {
        const grid = document.getElementById('toolbox-grid');
        if (!grid) return;

        const activeTab = document.querySelector('#toolbox-categories-list .toolbox-category-btn.active');
        const filterCategory = activeTab?.dataset.categoryId || 'all';

        if (filterCategory === 'all') {
            this.itemsPerPage = this.filteredTools.length > 0 ? this.filteredTools.length : 1;
            this.totalPages = 1;
        } else {
            const cardWidth = 274;
            const cardHeight = 150;
            const gridWidth = grid.offsetWidth;
            const gridHeight = grid.offsetHeight;
            const cols = Math.max(1, Math.floor(gridWidth / cardWidth));
            const rows = Math.max(1, Math.floor(gridHeight / cardHeight));
            this.itemsPerPage = cols * rows;
            this.totalPages = this.itemsPerPage > 0 ? Math.ceil(this.filteredTools.length / this.itemsPerPage) : 1;
        }

        if (this.currentPage > this.totalPages) {
            this.currentPage = this.totalPages || 1;
        }

        this._renderCurrentPage();
        this._renderPaginationControls();
    }

    _renderCurrentPage() {
        const grid = document.getElementById('toolbox-grid');
        if (!grid) return;

        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const pageTools = this.filteredTools.slice(startIndex, endIndex);

        if (this.filteredTools.length === 0) {
            grid.innerHTML = '<div class="empty-logs-placeholder"><i class="fas fa-search"></i><p>未找到匹配的工具</p><span>请尝试更改分类或搜索词。</span></div>';
            return;
        }

        const statusConfig = configManager.config.tool_status || {};

        const newCardsHtml = pageTools.map(([id, tool]) => {
            const toolStatus = statusConfig[id];
            const isDisabled = toolStatus && toolStatus.enabled === false;
            const message = isDisabled ? (toolStatus.message || '此工具正在维护中') : tool.description;
            
            return `
                <div class="tool-card ${isDisabled ? 'disabled' : ''}" data-tool-id="${id}" data-message="${isDisabled ? message : ''}">
                    <div class="tool-icon"><i class="${tool.icon}"></i></div>
                    <h2>${tool.name} ${isDisabled ? '<i class="fas fa-lock" style="font-size: 0.8em; color: var(--error-color);"></i>' : ''}</h2>
                    <p>${message}</p>
                </div>
            `;
        }).join('');

        grid.innerHTML = newCardsHtml;

        grid.querySelectorAll('.tool-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (card.classList.contains('disabled')) {
                    const message = card.dataset.message || '此工具当前不可用，请稍后重试。';
                    this.showNotification('工具维护中', message, 'info');
                    return;
                }
                const toolId = card.dataset.toolId;
                if (this.allTools[toolId] && this.allTools[toolId].launch) {
                    this.allTools[toolId].launch();
                }
            });
        });

        this.fadeInContent('.tool-card');
    }

    _renderPaginationControls() {
        const paginationContainer = document.getElementById('toolbox-pagination');
        if (!paginationContainer) return;
        paginationContainer.innerHTML = this.getPaginationHTML(this.currentPage, this.totalPages);

        paginationContainer.querySelectorAll('.page-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetPage = parseInt(e.currentTarget.dataset.page, 10);
                if (targetPage && targetPage !== this.currentPage) {
                    this.currentPage = targetPage;
                    this._renderCurrentPage();
                    this._renderPaginationControls();
                }
            });
        });
    }
    
    _debounce(func, delay) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    launchModularTool(toolId) {
        const toolInfo = this.modularTools[toolId]; if (!toolInfo) return;
        configManager.logAction(`[${toolInfo.name}] 进入工具`, 'tool');

        this.unloadActiveTool();

        if (toolInfo.launchType === 'window') {
            const currentTheme = document.body.getAttribute('data-theme') || 'dark';
            window.electronAPI.openToolWindow(toolInfo.view, toolId, currentTheme);
        } else {
            const ToolClass = toolRegistry[toolInfo.classId];
            if (!ToolClass) {
                this.showNotification('启动失败', `未找到工具类: ${toolInfo.classId}`, 'error');
                return;
            }

            this.activeModularTool = new ToolClass();
            const contentArea = document.getElementById('content-area');
            contentArea.innerHTML = `<div class="loading-container"><img src="./assets/loading.gif" alt="加载中..." class="loading-gif"><p class="loading-text">正在启动工具...</p></div>`;
            setTimeout(() => {
                const toolContentArea = document.getElementById('content-area');
                if (toolContentArea) {
                    toolContentArea.innerHTML = this.activeModularTool.render();
                    this.activeModularTool.init();
                }
            }, 50);
        }
    }
    
    unloadActiveTool() {
        if (this.abortController) { this.abortController.abort(); this.abortController = null; }
        if (this.activeModularTool) { this.activeModularTool.destroy(); this.activeModularTool = null; }
    }
    
    // ... (其余方法 renderCategoryNavigation, renderSubcategories, renderMediaViewer 等保持不变)
    renderCategoryNavigation() {
        this.unloadActiveTool();
        configManager.logAction('[随机放映室] 进入工具', 'tool');
        const contentArea = document.getElementById('content-area');
        const categories = configManager.config?.categories || [];
        contentArea.innerHTML = `
            <div class="page-container">
                <div class="section-header">
                    <button id="back-to-toolbox" class="back-btn ripple"><i class="fas fa-arrow-left"></i> 返回工具箱</button>
                    <h1>选择媒体类型</h1>
                </div>
                <div class="category-grid">
                    ${categories.map((cat, i) => cat.enabled ? `
                        <div class="category-card" data-category="${cat.id}" style="animation-delay: ${i * 0.05}s">
                            <div class="category-icon"><i class="${cat.icon}"></i></div>
                            <h2 class="gradient-text">${cat.name}</h2>
                            <button class="action-btn select-category-btn ripple" data-category-id="${cat.id}">
                                浏览 <i class="fas fa-arrow-right"></i>
                            </button>
                        </div>
                    ` : '').join('')}
                </div>
            </div>`;
        this.fadeInContent('.category-card');
        document.getElementById('back-to-toolbox').addEventListener('click', () => {
            window.mainPage.navigateTo('toolbox');
            window.mainPage.updateActiveNavButton(document.getElementById('toolbox-btn'));
        });
        contentArea.querySelectorAll('.select-category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.renderSubcategories(e.currentTarget.dataset.categoryId, 1);
            });
        });
    }
    
    renderSubcategories(categoryId, page = 1) {
        this.currentCategory = categoryId;
        const category = configManager.config.categories.find(c => c.id === categoryId);
        if (!category) return;
        configManager.logAction(`[随机放映室] 浏览分类: ${category.name}`, 'tool');
        
        const statusConfig = configManager.config.tool_status || {};

        const itemsPerPage = 6;
        const allSubcategories = category.subcategories;
        const totalPages = Math.ceil(allSubcategories.length / itemsPerPage);
        const pageItems = allSubcategories.slice((page - 1) * itemsPerPage, page * itemsPerPage);
        const contentArea = document.getElementById('content-area');
        contentArea.innerHTML = `
            <div class="page-container subcategory-page-container">
                <div class="section-header">
                    <button id="back-to-categories" class="back-btn ripple"><i class="fas fa-arrow-left"></i> 返回分类</button>
                    <h1>${category.name}</h1>
                </div>
                <div class="subcategory-grid">
                    ${pageItems.map((sub, i) => {
                        const statusId = `${categoryId}.${sub.id}`;
                        const toolStatus = statusConfig[statusId];
                        const isDisabled = toolStatus && toolStatus.enabled === false;
                        const message = isDisabled ? (toolStatus.message || '此分类正在维护中') : sub.description;
                        const buttonText = isDisabled ? '暂不可用' : '<i class="fas fa-eye"></i> 查看';

                        let thumbnailHtml = '';
                        if (isDisabled) {
                            thumbnailHtml = `
                            <div class="subcategory-thumbnail-placeholder">
                                <i class="fas fa-image-slash"></i>
                            </div>
                            `;
                        } else {
                            thumbnailHtml = `
                            <img data-src="${sub.thumbnail_url}" class="lazy-load-thumbnail" alt="${sub.name}">
                            <div class="loading-spinner-overlay" style="display: flex;"><img src="./assets/loading.gif" alt="加载中..." class="loading-gif"></div>
                            `;
                        }

                        return `
                        <div class="subcategory-card ${isDisabled ? 'disabled' : ''}" style="animation-delay: ${i * 0.05}s">
                            <div class="subcategory-thumbnail">
                                ${thumbnailHtml} </div>
                            <div class="subcategory-content">
                                <h3>${sub.name} ${isDisabled ? '<i class="fas fa-lock" style="font-size: 0.8em; color: var(--error-color);"></i>' : ''}</h3>
                                <p>${message}</p>
                            </div>
                            <button class="view-subcategory-btn ripple" data-subcategory-id="${sub.id}" data-message="${isDisabled ? message : ''}" ${isDisabled ? 'disabled' : ''}>
                                ${buttonText}
                            </button>
                        </div>
                    `}).join('')}
                </div>
                ${this.getPaginationHTML(page, totalPages)}
            </div>`;
        this.fadeInContent('.subcategory-card');
        document.getElementById('back-to-categories').addEventListener('click', () => this.renderCategoryNavigation());
        
        contentArea.querySelectorAll('.view-subcategory-btn').forEach(btn => {
            btn.addEventListener('click', (e) => { 
                if (btn.disabled || e.currentTarget.disabled) {
                    const message = e.currentTarget.dataset.message || '此分类当前不可用，请稍后重试。';
                    this.showNotification('分类维护中', message, 'info');
                    return;
                }
                this.currentSubcategory = e.currentTarget.dataset.subcategoryId; 
                this.renderMediaViewer(); 
            });
        });

        contentArea.querySelectorAll('.page-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetPage = parseInt(e.currentTarget.dataset.page, 10);
                if (targetPage) this.renderSubcategories(categoryId, targetPage);
            });
        });
        
        this._loadAndCountThumbnails();
    }
    
    _loadAndCountThumbnails() {
        const images = document.querySelectorAll('img.lazy-load-thumbnail');
        images.forEach(img => {
            const spinnerOverlay = img.nextElementSibling;
            fetch(img.dataset.src)
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    const contentLength = response.headers.get('content-length');
                    if (contentLength) {
                        window.electronAPI.addTraffic(parseInt(contentLength, 10));
                    }
                    return response.blob();
                })
                .then(blob => {
                    if (!img.dataset.counted && blob.size > 0) {
                        window.electronAPI.addTraffic(blob.size);
                        img.dataset.counted = 'true';
                    }
                    const objectURL = URL.createObjectURL(blob);
                    img.src = objectURL;
                    img.onload = () => {
                        if (spinnerOverlay) {
                            spinnerOverlay.style.opacity = '0';
                            setTimeout(() => {
                                if (spinnerOverlay) spinnerOverlay.style.display = 'none';
                            }, 300);
                        }
                    };
                })
                .catch(error => {
                    console.error(`无法加载缩略图: ${img.dataset.src}`, error);
                    if (spinnerOverlay) {
                        spinnerOverlay.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
                    }
                    img.alt = "图片加载失败";
                });
        });
    }

    renderMediaViewer() {
        const category = configManager.config.categories.find(c => c.id === this.currentCategory);
        const subcategory = category?.subcategories.find(s => s.id === this.currentSubcategory);
        if (!category || !subcategory) return;
        configManager.logAction(`[随机放映室] 查看媒体: ${subcategory.name}`, 'tool');
        const isVideo = this.currentCategory === 'video';
        const volume = configManager.globalVolume;
        const volumeControlHtml = isVideo ? `<div class="volume-control"><i class="fas fa-volume-down"></i><input type="range" id="volume-slider" min="0" max="1" step="0.01" value="${volume}"><i class="fas fa-volume-up"></i></div>` : '';
        const contentArea = document.getElementById('content-area');
        contentArea.innerHTML = `
            <div class="media-viewer">
                <div class="section-header">
                    <button id="back-to-subcategories" class="back-btn ripple"><i class="fas fa-arrow-left"></i> 返回列表</button>
                    <div><h1>${subcategory.name}</h1></div>
                </div>
                <div class="media-container">
                    <div class="media-loading">
                        <img src="./assets/loading.gif" alt="加载中..." class="loading-gif" style="width: 80px; height: 80px; min-width: auto;"><p>正在连接...</p>
                        <div class="media-progress-container"><div class="media-progress-bar" id="media-progress-bar"></div></div>
                    </div>
                    <div class="media-content" style="display: none;"></div>
                </div>
                <div class="media-controls">
                    <button id="refresh-media" class="control-btn ripple"><i class="fas fa-sync-alt"></i> 刷新</button>
                    <button id="download-media" class="control-btn ripple" disabled><i class="fas fa-download"></i> 下载</button>
                    ${volumeControlHtml}
                    <span id="media-status" class="media-status-text">准备就绪</span>
                </div>
            </div>`;
        document.getElementById('back-to-subcategories').addEventListener('click', () => this.renderSubcategories(this.currentCategory, 1));
        document.getElementById('refresh-media').addEventListener('click', () => this.loadMediaContent());
        document.getElementById('download-media').addEventListener('click', () => this.downloadCurrentMedia());
        if (isVideo) {
            const volumeSlider = document.getElementById('volume-slider');
            volumeSlider.addEventListener('input', (e) => {
                const videoElement = document.querySelector('.media-content video');
                if (videoElement) videoElement.volume = e.target.value;
            });
            volumeSlider.addEventListener('change', (e) => configManager.setVolume(parseFloat(e.target.value)));
        }
        this.loadMediaContent();
    }

    async loadMediaContent() {
        if (this.abortController) this.abortController.abort();
        this.abortController = new AbortController();
        const subcategory = configManager.config.categories.find(c => c.id === this.currentCategory)?.subcategories.find(s => s.id === this.currentSubcategory);
        if (!subcategory) return;
        const mediaLoading = document.querySelector('.media-loading'), mediaContent = document.querySelector('.media-content'), downloadBtn = document.getElementById('download-media'), statusEl = document.getElementById('media-status'), progressBar = document.getElementById('media-progress-bar'), loadingText = mediaLoading.querySelector('p');
        mediaLoading.classList.remove('hidden');
        mediaContent.style.display = 'none';
        mediaContent.innerHTML = '';
        downloadBtn.disabled = true;
        statusEl.textContent = '准备加载';
        loadingText.textContent = '正在连接...';
        if (progressBar) progressBar.style.width = '0%';
        this.currentMediaBlob = null;
        try {
            const response = await fetch(subcategory.api_url, { signal: this.abortController.signal });
            if (!response.ok) throw new Error(`服务器响应错误: ${response.status}`);
            const contentLength = +response.headers.get('Content-Length');
            let receivedLength = 0;
            const chunks = [];
            const reader = response.body.getReader();
            loadingText.textContent = '加载中...';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                window.electronAPI.reportTraffic(value.length);
                chunks.push(value);
                receivedLength += value.length;
                if (contentLength && progressBar) progressBar.style.width = `${(receivedLength / contentLength) * 100}%`;
            }
            await window.electronAPI.addTraffic(receivedLength);
            const blob = new Blob(chunks);
            this.currentMediaBlob = blob;
            const url = URL.createObjectURL(blob);
            if (this.currentCategory === 'image') {
                mediaContent.innerHTML = `<img src="${url}" alt="${subcategory.name}">`;
            } else if (this.currentCategory === 'video') {
                mediaContent.innerHTML = `<video src="${url}" controls autoplay loop></video>`;
                const videoElement = mediaContent.querySelector('video');
                videoElement.addEventListener('loadedmetadata', () => { videoElement.volume = configManager.globalVolume; });
                videoElement.addEventListener('volumechange', () => configManager.setVolume(videoElement.volume));
            }
            mediaLoading.classList.add('hidden');
            mediaContent.style.display = 'flex';
            downloadBtn.disabled = false;
            statusEl.textContent = '加载完成';
            configManager.logAction(`[随机放映室] 加载成功: ${subcategory.name}`, 'tool');
        } catch (error) {
            if (error.name === 'AbortError') { configManager.logAction('[随机放映室] 加载被中断', 'tool'); return; }
            statusEl.textContent = `加载失败: ${error.message}`;
            loadingText.textContent = `加载失败`;
            configManager.logAction(`[随机放映室] 加载失败: ${subcategory.name} - ${error.message}`, 'tool');
        } finally {
            this.abortController = null;
        }
    }

    async downloadCurrentMedia() {
        if (!this.currentMediaBlob) return;
        const downloadBtn = document.getElementById('download-media');
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 准备中...';
        try {
            const arrayBuffer = await this.currentMediaBlob.arrayBuffer();
            const extension = this.currentMediaBlob.type.split('/')[1] || (this.currentCategory === 'image' ? 'jpg' : 'mp4');
            const defaultPath = `${this.currentSubcategory}-${Date.now()}.${extension}`;
            const result = await window.electronAPI.saveMedia({ buffer: arrayBuffer, defaultPath });
            if (result.success) this.showNotification('下载成功', `文件已保存`);
        } catch (error) {
            this.showNotification('下载失败', error.message, 'error');
        } finally {
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = '<i class="fas fa-download"></i> 下载';
        }
    }

    fadeInContent(selector) {
        document.querySelectorAll(selector).forEach((el, i) => {
            el.style.animation = 'none';
            el.offsetHeight;
            el.style.animation = `contentFadeIn 0.5s cubic-bezier(0.25, 0.8, 0.25, 1) forwards ${i * 0.1}s`;
        });
    }

    showNotification(title, message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        let iconClass = 'fa-check-circle';
        if (type === 'error') iconClass = 'fa-exclamation-circle';
        if (type === 'info') iconClass = 'fa-info-circle';
        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        toast.innerHTML = `<div class="icon"><i class="fas ${iconClass}"></i></div><div class="content"><h4>${title}</h4><p>${message}</p></div>`;
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => { this._dismissToast(toast); }, 5000);
    }

    showActionableNotification(title, message, buttonText, actionCallback) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toastId = `toast-${Date.now()}`;
        const toast = document.createElement('div');
        toast.className = 'toast-notification info';
        toast.id = toastId;

        const fullMessage = `${message} <button id="action-${toastId}" class="action-btn mini-btn ripple" style="margin-top: 8px;">${buttonText}</button>`;

        toast.innerHTML = `<div class="icon"><i class="fas fa-info-circle"></i></div><div class="content"><h4>${title}</h4><div style="font-size: 13px; color: var(--text-secondary); line-height: 1.3;">${fullMessage}</div></div>`;
        container.appendChild(toast);

        document.getElementById(`action-${toastId}`).addEventListener('click', (e) => {
            e.stopPropagation();
            if (actionCallback) actionCallback();
            this._dismissToast(toast);
        });

        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => this._dismissToast(toast), 8000);
    }

    showPrompt(options, callback) {
        const existingPrompt = document.getElementById('custom-prompt-overlay');
        if (existingPrompt) return;

        const overlay = document.createElement('div');
        overlay.id = 'custom-prompt-overlay';
        overlay.innerHTML = `
            <div class="custom-prompt-box">
                <h4>${options.title}</h4>
                <p>${options.label}</p>
                <input type="password" id="prompt-input" placeholder="${options.placeholder || ''}" />
                <div class="prompt-buttons">
                    <button id="prompt-cancel" class="control-btn mini-btn ripple">取消</button>
                    <button id="prompt-ok" class="action-btn mini-btn ripple">确认</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const input = document.getElementById('prompt-input');
        input.focus();

        const cleanup = () => {
            overlay.classList.add('fade-out');
            overlay.addEventListener('animationend', () => overlay.remove());
        };

        const onOk = () => {
            if (callback) callback(input.value);
            cleanup();
        };

        const onCancel = () => {
            if (callback) callback(null); 
            cleanup();
        }

        document.getElementById('prompt-ok').addEventListener('click', onOk);
        document.getElementById('prompt-cancel').addEventListener('click', onCancel);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) onCancel(); });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') onOk();
            if (e.key === 'Escape') onCancel();
        });
    }

    _dismissToast(toastElement) {
        if (!toastElement) return;
        toastElement.classList.remove('show');
        toastElement.addEventListener('transitionend', () => toastElement.remove());
    }

    getPaginationHTML(currentPage, totalPages) {
        if (totalPages <= 1) return '';
        let html = `<div class="pagination-container">`;
        html += `<button class="page-btn ripple" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;
        for (let i = 1; i <= totalPages; i++) {
            html += `<button class="page-btn ripple ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }
        html += `<button class="page-btn ripple" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
        html += `</div>`;
        return html;
    }

    renderOfflinePage(error) {
        document.body.innerHTML = `
            <div id="app-wrapper">
                <div class="offline-container">
                    <div class="background-shapes"><div class="shape shape1"></div><div class="shape shape2"></div><div class="shape shape3"></div></div>
                    <div class="title-bar-offline"><div class="window-controls"><button id="close-btn-offline" class="window-control-btn" title="关闭"><i class="fas fa-times"></i></button></div></div>
                    <div class="offline-content">
                        <div class="offline-icon"><i class="fas fa-cloud-slash"></i></div>
                        <h1>您已进入离线模式</h1>
                        <p>本软件的核心功能依赖网络连接，请检查您的网络后重试。</p>
                        <p class="error-message">错误详情: ${error}</p>
                        <button id="relaunch-btn" class="action-btn ripple"><i class="fas fa-redo"></i> 重启软件</button>
                    </div>
                </div>
            </div>`;
        document.getElementById('close-btn-offline').addEventListener('click', () => window.electronAPI.closeWindow());
        document.getElementById('relaunch-btn').addEventListener('click', () => window.electronAPI.relaunchApp());
    }
}

export default new UIManager();
