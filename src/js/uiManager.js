// src/js/uiManager.js
import configManager from './configManager.js';
import { toolRegistry } from './tool-registry.js';

// 定义图标基础路径 (使用 npmmirror 镜像的 FontAwesome SVG)
const ICON_BASE = "https://registry.npmmirror.com/@fortawesome/fontawesome-free/6.4.0/files/svgs/solid";
const BRAND_BASE = "https://registry.npmmirror.com/@fortawesome/fontawesome-free/6.4.0/files/svgs/brands";

class UIManager {
    constructor() {
        // [配置] 模块化工具列表
        this.modularTools = {
            // --- 网络类 ---
            'ip-query': {
                name: 'IP属地查询',
                iconUrl: `${ICON_BASE}/map-location-dot.svg`,
                description: '查询IP归属地信息 (多源对比)',
                classId: 'ip-query',
                launchType: 'inline'
            },
            'smart-search': {
                name: '智能搜索',
                iconUrl: `${ICON_BASE}/magnifying-glass-plus.svg`,
                description: 'AI 聚合搜索，获取高质量结果',
                classId: 'smart-search',
                launchType: 'inline'
            },
            'hotboard': {
                name: '多平台热榜',
                iconUrl: `${ICON_BASE}/fire.svg`,
                description: '聚合全网热搜榜单 (知乎/微博/抖音等)',
                classId: 'hotboard',
                launchType: 'window',
                view: 'view-tool'
            },
            'wx-domain-check': {
                name: '微信域名检测',
                iconUrl: `${BRAND_BASE}/weixin.svg`,
                description: '检测域名在微信中的访问状态',
                classId: 'wx-domain-check',
                launchType: 'window',
                view: 'view-tool'
            },
            'pc-benchmark': {
                name: 'PC 性能基准',
                iconUrl: `${ICON_BASE}/chart-simple.svg`,
                description: '本地环境硬件、网络与IO基准测试',
                classId: 'pc-benchmark',
                launchType: 'window', 
                view: 'view-tool'
            },
            'ip-info': {
                name: 'IP/域名详情',
                iconUrl: `${ICON_BASE}/globe.svg`,
                description: '查询IP/域名的详细地理与网络信息',
                classId: 'ip-info',
                launchType: 'window',
                view: 'view-tool'
            },
            'dns-query': {
                name: 'DNS 解析',
                iconUrl: `${ICON_BASE}/network-wired.svg`,
                description: '查询 A, MX, TXT 等 DNS 记录',
                classId: 'dns-query',
                launchType: 'window',
                view: 'view-tool'
            },
            'bili-hot-ranking': {
                name: 'B站热搜',
                iconUrl: `${BRAND_BASE}/bilibili.svg`,
                description: 'B站实时热搜排行',
                classId: 'bili-hot-ranking'
            },
            'media-player': {
                name: '媒体播放器',
                iconUrl: `${ICON_BASE}/circle-play.svg`,
                description: '沉浸式本地影音播放与幻灯片',
                classId: 'media-player',
                launchType: 'window',
                view: 'view-tool'
            },
            'baidu-hot': {
                name: '百度热搜',
                iconUrl: `${ICON_BASE}/fire-flame-curved.svg`,
                description: '百度实时热搜、热梗榜单',
                classId: 'baidu-hot'
            },
            'secure-browser': {
                name: '安全浏览器',
                iconUrl: `${ICON_BASE}/compass.svg`,
                description: '隔离环境的安全浏览器',
                classId: null,
                launchType: 'window',
                view: 'view-browser'
            },

            // --- 工具类 ---
            'qq-avatar': {
                name: 'QQ 信息',
                iconUrl: `${BRAND_BASE}/qq.svg`,
                description: '查询QQ昵称、头像与等级',
                classId: 'qq-avatar'
            },
            'system-info': {
                name: '硬件信息',
                iconUrl: `${ICON_BASE}/microchip.svg`,
                description: '查看CPU、内存等硬件详情',
                classId: 'system-info'
            },
            'system-tool': {
                name: '系统工具箱',
                iconUrl: `${ICON_BASE}/screwdriver-wrench.svg`,
                description: '快速调用系统内置管理工具',
                classId: 'system-tool'
            },

            // --- 处理/转换类 ---
            'ai-translation': {
                name: 'AI 智能翻译',
                iconUrl: `${ICON_BASE}/language.svg`,
                description: '多语言风格化 AI 翻译',
                classId: 'ai-translation',
                launchType: 'window',
                view: 'view-tool'
            },
            'base64-converter': {
                name: 'Base64 转换',
                iconUrl: `${ICON_BASE}/file-code.svg`,
                description: 'Base64 编码与解码工具',
                classId: 'base64-converter',
                launchType: 'window',
                view: 'view-tool'
            },
            'chinese-converter': {
                name: '简繁转换',
                iconUrl: `${ICON_BASE}/font.svg`,
                description: '简繁体中文互转',
                classId: 'chinese-converter',
                launchType: 'window',
                view: 'view-tool'
            },
            'qr-code-generator': {
                name: '二维码生成',
                iconUrl: `${ICON_BASE}/qrcode.svg`,
                description: '快速生成自定义二维码',
                classId: 'qr-code-generator',
                launchType: 'inline'
            },
            'image-processor': {
                name: '图片工坊',
                iconUrl: `${ICON_BASE}/wand-magic-sparkles.svg`,
                description: '图片裁剪、滤镜与格式转换',
                classId: 'image-processor',
                launchType: 'window',
                view: 'view-tool'
            },
            'profanity-check': {
                name: '敏感词检测',
                iconUrl: `${ICON_BASE}/user-shield.svg`,
                description: '文本违禁词检测与过滤',
                classId: 'profanity-check',
                launchType: 'window',
                view: 'view-tool'
            },
            'archive-tool': {
                name: '加密 & 压缩',
                iconUrl: `${ICON_BASE}/file-zipper.svg`,
                description: '安全加密打包与解密工具',
                classId: 'archive-tool',
                launchType: 'inline'
            },
            // [新增] 鸭梨天气工具
            'weather-details': {
                name: '全国详细天气',
                iconUrl: `${ICON_BASE}/cloud-sun-rain.svg`,
                description: '精确到小时的实时气象数据',
                classId: 'weather-details',
                launchType: 'window',
                view: 'view-tool'
            }
        };

        this.hardcodedTools = {
            'screening-room': {
                name: '随机放映室',
                iconUrl: `${ICON_BASE}/film.svg`,
                description: '浏览随机图片和视频',
                launch: () => this.renderCategoryNavigation()
            },
        };

        this.allTools = {};
        this.currentCategory = null;
        this.currentSubcategory = null;
        this.currentMediaBlob = null;
        this.abortController = null;
        this.activeModularTool = null;
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

    /**
     * [通用功能] 自适应下拉菜单
     */
    setupAdaptiveDropdown(wrapperId, optionsId, onSelectCallback) {
        const wrapper = document.getElementById(wrapperId);
        let optionsEl = document.getElementById(optionsId);

        if (!wrapper || !optionsEl) return;

        // 1. 移动到 body
        if (optionsEl.parentNode !== document.body) {
            document.body.appendChild(optionsEl);
        }

        // 2. 克隆选项节点 (解决引用问题和事件重复)
        const newOptionsEl = optionsEl.cloneNode(true);
        if (optionsEl.parentNode) {
            optionsEl.parentNode.replaceChild(newOptionsEl, optionsEl);
        }
        optionsEl = newOptionsEl;

        // 3. 获取触发器
        const trigger = wrapper.querySelector('.custom-select-trigger');
        const valueEl = wrapper.querySelector('.custom-select-value');

        // 4. 克隆触发器
        const newTrigger = trigger.cloneNode(true);
        trigger.parentNode.replaceChild(newTrigger, trigger);

        // 5. 绑定触发器事件
        newTrigger.addEventListener('click', (e) => {
            e.stopPropagation();

            // 关闭其他菜单
            document.querySelectorAll('.custom-select-options.dynamic-active').forEach(el => {
                if (el !== optionsEl) el.classList.remove('dynamic-active');
            });

            // 计算位置
            const rect = newTrigger.getBoundingClientRect();
            const optionsHeight = optionsEl.offsetHeight || 200;
            const windowHeight = window.innerHeight;
            const spaceBelow = windowHeight - rect.bottom;
            const spaceAbove = rect.top;

            // 自适应判断
            if (spaceBelow < optionsHeight + 20 && spaceAbove > optionsHeight + 20) {
                optionsEl.classList.remove('drop-down');
                optionsEl.classList.add('drop-up');
                optionsEl.style.top = 'auto';
                optionsEl.style.bottom = `${windowHeight - rect.top + 5}px`;
                optionsEl.style.transformOrigin = 'bottom center';
            } else {
                optionsEl.classList.remove('drop-up');
                optionsEl.classList.add('drop-down');
                optionsEl.style.bottom = 'auto';
                optionsEl.style.top = `${rect.bottom + 5}px`;
                optionsEl.style.transformOrigin = 'top center';
            }

            optionsEl.style.left = `${rect.left}px`;
            optionsEl.style.width = `${rect.width}px`;

            optionsEl.classList.toggle('dynamic-active');
        });

        // 6. 绑定选项事件
        optionsEl.querySelectorAll('.custom-select-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = opt.dataset.value;
                const text = opt.textContent;
                const extraData = opt.dataset;

                if (valueEl) valueEl.textContent = text;
                newTrigger.dataset.value = val;

                optionsEl.classList.remove('dynamic-active');

                if (onSelectCallback) {
                    onSelectCallback(val, text, extraData, newTrigger);
                }
            });
        });
    }

    // --- 页面渲染逻辑 ---

    renderToolboxPage() {
        this.unloadActiveTool();
        const contentArea = document.getElementById('content-area');
        const categories = { 'all': '全部', ...(configManager.config?.tool_categories || {}) };

        contentArea.innerHTML = `
            <div class="page-container toolbox-page-container">
                
                <nav class="toolbox-sidebar-island">
                    <div class="sidebar-header">
                        <i class="fas fa-layer-group"></i> 分类
                    </div>
                    <div id="toolbox-categories-list" class="sidebar-scroll-area">
                        ${Object.entries(categories).map(([id, name]) => `
                            <button class="island-nav-item ripple" data-category-id="${id}">
                                <span class="nav-indicator"></span>
                                <span class="nav-text">${name}</span>
                            </button>
                        `).join('')}
                    </div>
                </nav>

                <div class="toolbox-main-content">
                    <div class="toolbox-header-island">
                        <div class="header-title">
                            <i class="fas fa-toolbox"></i>
                            <span class="gradient-text">工具箱</span>
                        </div>
                        <div class="island-search-wrapper">
                            <i class="fas fa-search search-icon"></i>
                            <input type="text" id="toolbox-search" placeholder="搜索功能..." autocomplete="off">
                        </div>
                    </div>

                    <div id="toolbox-grid" class="toolbox-bento-grid">
                        </div>
                    
                    <div id="toolbox-pagination" class="pagination-container" style="flex-shrink: 0; margin-top: 20px;"></div>
                </div>
            </div>`;

        this._bindToolboxPageEvents();
    }

    _bindToolboxPageEvents() {
        const searchInput = document.getElementById('toolbox-search');
        const categoryBtns = document.querySelectorAll('#toolbox-categories-list .island-nav-item');

        const defaultTab = categoryBtns[0];
        if (defaultTab) defaultTab.classList.add('active');

        this._filterAndRenderTools();

        categoryBtns.forEach(tab => {
            tab.addEventListener('click', () => {
                categoryBtns.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                tab.style.transform = 'scale(0.95)';
                setTimeout(() => tab.style.transform = '', 150);

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
        }, 200));
    }

    _filterAndRenderTools() {
        const grid = document.getElementById('toolbox-grid');
        if (!grid) return;

        const existingCards = grid.querySelectorAll('.tool-card');
        const animationDuration = 200;

        const renderNewContent = () => {
            const searchInput = document.getElementById('toolbox-search');
            const activeTab = document.querySelector('#toolbox-categories-list .island-nav-item.active');
            const filterCategory = activeTab?.dataset.categoryId || 'all';
            const searchTerm = searchInput?.value || '';
            const toolMetadata = configManager.config?.tool_metadata || {};
            const lowerCaseSearchTerm = searchTerm.toLowerCase();

            this.filteredTools = Object.entries(this.allTools).filter(([id, tool]) => {
                const toolCategory = toolMetadata[id]?.category || 'other';
                const categoryMatch = filterCategory === 'all' || toolCategory === filterCategory;
                
                const searchMatch = (tool.keywords || []).some(keyword => keyword.toLowerCase().includes(lowerCaseSearchTerm)) ||
                    tool.description.toLowerCase().includes(lowerCaseSearchTerm) ||
                    tool.name.toLowerCase().includes(lowerCaseSearchTerm);

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

        const activeTab = document.querySelector('#toolbox-categories-list .island-nav-item.active');
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

    async _renderCurrentPage() {
        const grid = document.getElementById('toolbox-grid');
        if (!grid) return;

        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const pageTools = this.filteredTools.slice(startIndex, endIndex);

        if (this.filteredTools.length === 0) {
            grid.innerHTML = `
                <div class="empty-island-state">
                    <div class="empty-icon"><i class="fas fa-search"></i></div>
                    <p>没有找到相关工具</p>
                </div>`;
            return;
        }

        const statusConfig = configManager.config.tool_status || {};

        const newCardsHtml = pageTools.map(([id, tool], index) => {
            const toolStatus = statusConfig[id];
            const isDisabled = toolStatus && toolStatus.enabled === false;
            const message = isDisabled ? (toolStatus.message || '维护中') : tool.description;
            const delay = index * 0.05;

            return `
                <div class="island-card ${isDisabled ? 'disabled' : ''} ripple" 
                     data-tool-id="${id}" 
                     data-message="${isDisabled ? message : ''}"
                     style="animation-delay: ${delay}s">
                    
                    <div class="island-glow"></div>
                    
                    <div class="island-icon-box">
                        <img id="icon-${id}" src="./assets/loading.gif" class="island-icon-img" alt="icon">
                    </div>
                    
                    <div class="island-content">
                        <h3 class="island-title">${tool.name}</h3>
                        <p class="island-desc" title="${message}">${message}</p>
                    </div>

                    <div class="island-action">
                        ${isDisabled ? '<i class="fas fa-lock lock-icon"></i>' : '<i class="fas fa-chevron-right arrow-icon"></i>'}
                    </div>
                </div>
            `;
        }).join('');

        grid.innerHTML = newCardsHtml;

        pageTools.forEach(async ([id, tool]) => {
            if (tool.iconUrl) {
                try {
                    const cachedPath = await window.electronAPI.getCachedIcon(id, tool.iconUrl);
                    const imgEl = document.getElementById(`icon-${id}`);
                    if (imgEl) {
                        imgEl.src = cachedPath || tool.iconUrl;
                        imgEl.removeAttribute('style');
                    }
                } catch (e) {
                    console.error(`Icon load failed for ${id}`, e);
                }
            }
        });

        grid.querySelectorAll('.island-card').forEach(card => {
            card.addEventListener('click', (e) => {
                card.style.transform = 'scale(0.95)';
                setTimeout(() => card.style.transform = '', 150);

                if (card.classList.contains('disabled')) {
                    const message = card.dataset.message;
                    this.showNotification('工具维护中', message, 'info');
                    return;
                }

                setTimeout(() => {
                    const toolId = card.dataset.toolId;
                    if (this.allTools[toolId] && this.allTools[toolId].launch) {
                        this.allTools[toolId].launch();
                    }
                }, 100);
            });
        });
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

    renderCategoryNavigation() {
        this.unloadActiveTool();
        configManager.logAction('[随机放映室] 进入工具', 'tool');
        const contentArea = document.getElementById('content-area');
        const categories = configManager.config?.categories || [];

        contentArea.innerHTML = `
            <div class="page-container" style="padding: 20px; display: flex; flex-direction: column; gap: 20px;">
                <div class="section-header">
                    <button id="back-to-toolbox" class="back-btn ripple"><i class="fas fa-arrow-left"></i> 返回工具箱</button>
                    <h1>选择媒体类型</h1>
                </div>
                
                <div class="toolbox-bento-grid">
                    ${categories.map((cat, i) => cat.enabled ? `
                        <div class="island-card ripple select-category-btn" 
                             data-category-id="${cat.id}" 
                             style="animation-delay: ${i * 0.05}s">
                            
                            <div class="island-glow"></div>
                            
                            <div class="island-icon-box" style="background: rgba(var(--primary-rgb), 0.15); color: var(--primary-color);">
                                <i class="${cat.icon}" style="font-size: 24px;"></i>
                            </div>
                            
                            <div class="island-content">
                                <h3 class="island-title">${cat.name}</h3>
                                <p class="island-desc">浏览 ${cat.name} 资源库</p>
                            </div>
                            
                            <div class="island-action">
                                <i class="fas fa-chevron-right arrow-icon"></i>
                            </div>
                        </div>
                    ` : '').join('')}
                </div>
            </div>`;

        this.fadeInContent('.island-card');
        document.getElementById('back-to-toolbox').addEventListener('click', () => {
            window.mainPage.navigateTo('toolbox');
            window.mainPage.updateActiveNavButton(document.getElementById('toolbox-btn'));
        });

        contentArea.querySelectorAll('.select-category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const card = e.currentTarget;
                card.style.transform = 'scale(0.95)';
                setTimeout(() => card.style.transform = '', 150);

                setTimeout(() => {
                    this.renderSubcategories(card.dataset.categoryId, 1);
                }, 100);
            });
        });
    }

    renderSubcategories(categoryId, page = 1) {
        this.currentCategory = categoryId;
        const category = configManager.config.categories.find(c => c.id === categoryId);
        if (!category) return;
        configManager.logAction(`[随机放映室] 浏览分类: ${category.name}`, 'tool');

        const statusConfig = configManager.config.tool_status || {};
        const itemsPerPage = 8;
        const allSubcategories = category.subcategories;
        const totalPages = Math.ceil(allSubcategories.length / itemsPerPage);
        const pageItems = allSubcategories.slice((page - 1) * itemsPerPage, page * itemsPerPage);
        const contentArea = document.getElementById('content-area');

        contentArea.innerHTML = `
            <div class="page-container subcategory-page-container" style="padding: 20px; display: flex; flex-direction: column; gap: 20px;">
                <div class="section-header">
                    <button id="back-to-categories" class="back-btn ripple"><i class="fas fa-arrow-left"></i> 返回分类</button>
                    <h1>${category.name}</h1>
                </div>
                
                <div class="toolbox-bento-grid">
                    ${pageItems.map((sub, i) => {
            const statusId = `${categoryId}.${sub.id}`;
            const toolStatus = statusConfig[statusId];
            const isDisabled = toolStatus && toolStatus.enabled === false;
            const message = isDisabled ? (toolStatus.message || '维护中') : sub.description;

            let thumbnailHtml = '';
            if (isDisabled) {
                thumbnailHtml = `<div class="island-thumbnail-placeholder"><i class="fas fa-eye-slash"></i></div>`;
            } else {
                thumbnailHtml = `
                            <img data-src="${sub.thumbnail_url}" class="lazy-load-thumbnail island-thumbnail-img" alt="${sub.name}">
                            <div class="loading-spinner-overlay island-thumbnail-loading"><img src="./assets/loading.gif" class="loading-gif" style="width:20px;"></div>
                            `;
            }

            return `
                        <div class="island-media-card ${isDisabled ? 'disabled' : ''} ripple view-subcategory-btn" 
                             data-subcategory-id="${sub.id}" 
                             data-message="${isDisabled ? message : ''}" 
                             style="animation-delay: ${i * 0.05}s">
                            
                            <div class="island-glow"></div>
                            
                            <div class="island-thumbnail-box">
                                ${thumbnailHtml}
                            </div>
                            
                            <div class="island-content">
                                <h3 class="island-title">${sub.name}</h3>
                                <p class="island-desc" title="${message}">${message}</p>
                            </div>
                            
                            <div class="island-action">
                                ${isDisabled ? '<i class="fas fa-lock lock-icon"></i>' : '<i class="fas fa-play-circle play-icon"></i>'}
                            </div>
                        </div>
                    `}).join('')}
                </div>
                ${this.getPaginationHTML(page, totalPages)}
            </div>`;

        this.fadeInContent('.island-media-card');
        document.getElementById('back-to-categories').addEventListener('click', () => this.renderCategoryNavigation());

        contentArea.querySelectorAll('.view-subcategory-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const card = e.currentTarget;
                card.style.transform = 'scale(0.95)';
                setTimeout(() => card.style.transform = '', 150);

                if (card.classList.contains('disabled')) {
                    const message = card.dataset.message || '此分类当前不可用';
                    this.showNotification('分类维护中', message, 'info');
                    return;
                }
                setTimeout(() => {
                    this.currentSubcategory = card.dataset.subcategoryId;
                    this.renderMediaViewer();
                }, 100);
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

    // [核心优化] 加载媒体内容，支持 JSON/Text 自动解析
    async loadMediaContent() {
        if (this.abortController) this.abortController.abort();
        this.abortController = new AbortController();

        const subcategory = configManager.config.categories.find(c => c.id === this.currentCategory)?.subcategories.find(s => s.id === this.currentSubcategory);
        if (!subcategory) return;

        const mediaLoading = document.querySelector('.media-loading');
        const mediaContent = document.querySelector('.media-content');
        const downloadBtn = document.getElementById('download-media');
        const statusEl = document.getElementById('media-status');
        const progressBar = document.getElementById('media-progress-bar');
        const loadingText = mediaLoading.querySelector('p');

        mediaLoading.classList.remove('hidden');
        mediaContent.style.display = 'none';
        mediaContent.innerHTML = '';
        downloadBtn.disabled = true;
        statusEl.textContent = '准备加载';
        loadingText.textContent = '正在解析源...';
        if (progressBar) progressBar.style.width = '0%';
        
        this.currentMediaBlob = null;

        try {
            let targetUrl = subcategory.api_url;
            
            // 1. 发起初始请求
            let response = await fetch(targetUrl, { signal: this.abortController.signal });
            if (!response.ok) throw new Error(`服务器响应错误: ${response.status}`);

            // 2. 检查 Content-Type
            const contentType = response.headers.get('content-type') || '';
            
            // 如果是 JSON 或 纯文本，说明返回的不是媒体流，而是地址
            if (contentType.includes('application/json') || contentType.includes('text/plain') || contentType.includes('text/html')) {
                loadingText.textContent = '解析真实地址...';
                const textData = await response.text();
                let realUrl = null;

                try {
                    // 尝试解析 JSON
                    const json = JSON.parse(textData);
                    realUrl = this._findUrlInJson(json);
                } catch (e) {
                    // 不是 JSON，检查是否是纯文本 URL (http 开头)
                    if (textData.trim().startsWith('http')) {
                        realUrl = textData.trim();
                    }
                }

                if (realUrl) {
                    console.log(`[随机放映室] 解析到真实地址: ${realUrl}`);
                    // 3. 发起二次请求 (获取真实媒体)
                    targetUrl = realUrl;
                    response = await fetch(targetUrl, { signal: this.abortController.signal });
                    if (!response.ok) throw new Error(`媒体文件请求失败: ${response.status}`);
                } else {
                    // 无法解析，可能源有问题
                    if (contentType.includes('json')) throw new Error('无法从 JSON 中提取媒体链接');
                    // 如果是 HTML 可能是被拦截或错误页
                    if (contentType.includes('html')) throw new Error('源返回了网页而非媒体');
                }
            }

            // 4. 读取媒体流 (无论是直接返回的还是二次请求的)
            const contentLength = +response.headers.get('Content-Length');
            let receivedLength = 0;
            const chunks = [];
            const reader = response.body.getReader();
            
            loadingText.textContent = '正在缓冲...';
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                window.electronAPI.reportTraffic(value.length);
                chunks.push(value);
                receivedLength += value.length;
                
                if (contentLength && progressBar) {
                    progressBar.style.width = `${(receivedLength / contentLength) * 100}%`;
                }
            }

            await window.electronAPI.addTraffic(receivedLength);
            
            // 5. 构建 Blob 并显示
            // 尝试从 URL 或 Content-Type 推断类型
            let mimeType = response.headers.get('content-type');
            if (!mimeType || mimeType === 'application/octet-stream') {
                // 简单的 MIME 推断
                if (this.currentCategory === 'video') mimeType = 'video/mp4';
                else mimeType = 'image/jpeg';
            }

            const blob = new Blob(chunks, { type: mimeType });
            this.currentMediaBlob = blob;
            const url = URL.createObjectURL(blob);

            // 渲染
            if (this.currentCategory === 'image') {
                mediaContent.innerHTML = `<img src="${url}" alt="${subcategory.name}" style="animation: contentFadeIn 0.5s;">`;
            } else if (this.currentCategory === 'video') {
                mediaContent.innerHTML = `<video src="${url}" controls autoplay loop style="animation: contentFadeIn 0.5s;"></video>`;
                const videoElement = mediaContent.querySelector('video');
                // 音量控制
                videoElement.addEventListener('loadedmetadata', () => { 
                    videoElement.volume = configManager.globalVolume; 
                });
                videoElement.addEventListener('volumechange', () => configManager.setVolume(videoElement.volume));
            }

            mediaLoading.classList.add('hidden');
            mediaContent.style.display = 'flex';
            downloadBtn.disabled = false;
            statusEl.textContent = '播放中';
            configManager.logAction(`[随机放映室] 加载成功: ${subcategory.name}`, 'tool');

        } catch (error) {
            if (error.name === 'AbortError') { 
                configManager.logAction('[随机放映室] 加载被中断', 'tool'); 
                return; 
            }
            statusEl.textContent = `加载失败: ${error.message}`;
            loadingText.textContent = `加载失败`;
            if (progressBar) progressBar.style.width = '0%';
            configManager.logAction(`[随机放映室] 加载失败: ${subcategory.name} - ${error.message}`, 'tool');
        } finally {
            this.abortController = null;
        }
    }

    // [新增] 辅助方法：从 JSON 对象中递归查找 URL
    _findUrlInJson(obj) {
        if (!obj) return null;
        
        // 1. 常见 Key 优先匹配
        const keys = ['url', 'img', 'video', 'src', 'link', 'mp4', 'data', 'imgurl', 'videourl'];
        for (const key of keys) {
            if (obj[key] && typeof obj[key] === 'string' && obj[key].startsWith('http')) {
                return obj[key];
            }
        }

        // 2. 遍历所有属性查找 http 开头的字符串
        for (const key in obj) {
            const val = obj[key];
            if (typeof val === 'string' && val.startsWith('http')) {
                // 排除一些显然不是媒体的 URL (如 code=200, msg=success)
                return val;
            }
            // 3. 递归查找 (例如 data: { url: ... })
            if (typeof val === 'object' && val !== null) {
                const found = this._findUrlInJson(val);
                if (found) return found;
            }
        }
        return null;
    }

    async downloadCurrentMedia() {
        if (!this.currentMediaBlob) return;
        const downloadBtn = document.getElementById('download-media');
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 准备中...';
        try {
            const arrayBuffer = await this.currentMediaBlob.arrayBuffer();
            // 智能识别后缀
            let extension = 'dat';
            const mime = this.currentMediaBlob.type;
            if (mime.includes('image')) {
                if (mime.includes('gif')) extension = 'gif';
                else if (mime.includes('webp')) extension = 'webp';
                else if (mime.includes('png')) extension = 'png';
                else extension = 'jpg';
            } else if (mime.includes('video')) {
                if (mime.includes('webm')) extension = 'webm';
                else extension = 'mp4';
            }
            
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