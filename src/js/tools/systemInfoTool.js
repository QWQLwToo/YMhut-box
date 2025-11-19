// src/js/tools/systemTool.js
import BaseTool from '../baseTool.js';

class SystemTool extends BaseTool {
    constructor() {
        super('system-tool', '系统工具');
        this.isAdmin = false; // 保存管理员权限状态
        
        // 扩充后的工具列表
        this.tools = [
            // 常用工具
            { id: 'calc', name: '计算器', icon: 'fa-calculator', command: 'calc' },
            { id: 'notepad', name: '记事本', icon: 'fa-file-alt', command: 'notepad' },
            { id: 'mspaint', name: '画图', icon: 'fa-paint-brush', command: 'mspaint' },
            { id: 'snippingtool', name: '截图工具', icon: 'fa-cut', command: 'snippingtool' },
            { id: 'osk', name: '屏幕键盘', icon: 'fa-keyboard', command: 'osk' },
            { id: 'charmap', name: '字符映射表', icon: 'fa-font', command: 'charmap' },
            // 音频与多媒体
            { id: 'soundrecorder', name: '录音机', icon: 'fa-microphone', command: 'ms-winsoundrecorder:' },
            { id: 'sound', name: '声音设置', icon: 'fa-volume-up', command: 'mmsys.cpl' },
            // 系统与诊断
            { id: 'clock', name: '时钟', icon: 'fa-clock', command: 'ms-clock:' },
            { id: 'control', name: '控制面板', icon: 'fa-sliders-h', command: 'control' },
            { id: 'dxdiag', name: 'DirectX诊断', icon: 'fa-gamepad', command: 'dxdiag' },
            { id: 'mstsc', name: '远程桌面', icon: 'fa-headset', command: 'mstsc' },
            // 需要管理员权限的工具
            { id: 'taskmgr', name: '任务管理器', icon: 'fa-tasks', command: 'taskmgr', requiresAdmin: true },
            { id: 'power', name: '电源选项', icon: 'fa-battery-full', command: 'powercfg.cpl', requiresAdmin: true },
            { id: 'display', name: '桌面/分辨率', icon: 'fa-desktop', command: 'desk.cpl', requiresAdmin: true },
            { id: 'system', name: '系统属性', icon: 'fa-cogs', command: 'sysdm.cpl', requiresAdmin: true },
            { id: 'regedit', name: '注册表编辑器', icon: 'fa-list-alt', command: 'regedit', requiresAdmin: true },
            { id: 'services', name: '服务', icon: 'fa-running', command: 'services.msc', requiresAdmin: true },
            { id: 'devmgmt', name: '设备管理器', icon: 'fa-microchip', command: 'devmgmt.msc', requiresAdmin: true },
            { id: 'diskmgmt', name: '磁盘管理', icon: 'fa-hdd', command: 'diskmgmt.msc', requiresAdmin: true },
            { id: 'perfmon', name: '性能监视器', icon: 'fa-tachometer-alt', command: 'perfmon.msc', requiresAdmin: true },
            { id: 'msconfig', name: '系统配置', icon: 'fa-cog', command: 'msconfig', requiresAdmin: true },
            { id: 'eventvwr', name: '事件查看器', icon: 'fa-clipboard-list', command: 'eventvwr.msc', requiresAdmin: true },
            { id: 'gpedit', name: '组策略编辑器', icon: 'fa-list-ul', command: 'gpedit.msc', requiresAdmin: true },
            { id: 'compmgmt', name: '计算机管理', icon: 'fa-laptop-medical', command: 'compmgmt.msc', requiresAdmin: true },
            { id: 'cleanmgr', name: '磁盘清理', icon: 'fa-broom', command: 'cleanmgr', requiresAdmin: true },
            { id: 'ncpa', name: '网络连接', icon: 'fa-network-wired', command: 'ncpa.cpl', requiresAdmin: true },
        ];
    }

    // 渲染静态框架
    render() {
        // [修改] 确保 id="system-tool-content" 存在且样式正确
        return `
            <div class="page-container" style="display: flex; flex-direction: column; height: 100%;">
                <div class="section-header" style="flex-shrink: 0;">
                    <button id="back-to-toolbox-btn" class="back-btn ripple"><i class="fas fa-arrow-left"></i> 返回工具箱</button>
                    <h1 style="flex-grow: 1; text-align: center;">${this.name}</h1>
                </div>
                <div id="system-tool-content" class="content-area" style="padding-top: 20px; flex-grow: 1; overflow-y: auto;">
                    <div class="loading-container">
                        <img src="./assets/loading.gif" alt="检查权限..." class="loading-gif">
                        <p class="loading-text">正在检查权限...</p>
                    </div>
                </div>
            </div>`;
    }

    // 初始化时检查权限，然后渲染网格
    async init() {
        this._log('工具已初始化，正在检查管理员权限...');
        document.getElementById('back-to-toolbox-btn')?.addEventListener('click', () => {
             window.mainPage.navigateTo('toolbox');
             window.mainPage.updateActiveNavButton(document.getElementById('toolbox-btn'));
        });
        
        const permResult = await window.electronAPI.checkAndRelaunchAsAdmin();
        if (permResult.relaunching) {
            const contentContainer = document.getElementById('system-tool-content');
            if(contentContainer) {
                contentContainer.innerHTML = `<div class="loading-container"><p class="loading-text">正在以管理员身份重启应用...</p></div>`;
            }
            return; 
        }

        this.isAdmin = permResult.isAdmin;
        this._log(`当前管理员状态: ${this.isAdmin}`);
        this._renderGridView();
    }
    
    // 渲染工具网格
    _renderGridView() {
        const contentContainer = document.getElementById('system-tool-content');
        if (!contentContainer) return;

        // 对工具列表进行排序，便于查找
        const sortedTools = [...this.tools].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));

        contentContainer.innerHTML = `
            <div class="toolbox-grid">
                ${sortedTools.map(tool => {
                    const isDisabled = tool.requiresAdmin && !this.isAdmin;
                    return `
                        <div class="tool-card ${isDisabled ? 'disabled' : ''}" data-tool-id="${tool.id}">
                            <div class="tool-icon">
                                <i class="fas ${tool.icon}"></i>
                            </div>
                            <h2>${tool.name}</h2>
                            <p>${isDisabled ? '需要管理员权限' : `启动 ${tool.command}`}</p>
                            ${isDisabled ? '<div style="position: absolute; top: 12px; right: 12px;"><i class="fas fa-lock" style="color: var(--error-color);"></i></div>' : ''}
                        </div>
                    `;
                }).join('')}
            </div>`;
        
        this._bindGridEvents();
        this._fadeInContent('.tool-card');
    }

    // 绑定网格点击事件
    _bindGridEvents() {
        document.querySelectorAll('#system-tool-content .tool-card').forEach(card => {
            const toolId = card.dataset.toolId;
            const tool = this.tools.find(t => t.id === toolId);
            if (!tool) return;

            if (card.classList.contains('disabled')) {
                card.addEventListener('click', () => {
                    this._notify('权限不足', '此工具需要以管理员身份运行本软件才能打开。', 'error');
                });
            } else {
                card.addEventListener('click', () => {
                    // 对于非管理员也可启动的工具，不再弹出确认框，直接启动
                    if (!tool.requiresAdmin) {
                        this._log(`用户启动: ${tool.name} (${tool.command})`);
                        window.electronAPI.launchSystemTool(tool.command);
                    } else {
                        // 对于需要管理员权限的工具，保留确认框
                        this._handleExternalTool(tool.command, tool.name);
                    }
                });
            }
        });
    }

    // 外部工具处理器
    async _handleExternalTool(command, toolName) {
        const result = await window.electronAPI.showConfirmationDialog({
            title: '操作确认',
            message: `您确定要启动系统工具“${toolName}”吗？`,
            detail: `即将执行命令: ${command}`
        });

        if (result.response === 0) { // 0 代表 "确定"
            this._log(`用户授权启动: ${toolName} (${command})`);
            window.electronAPI.launchSystemTool(command);
        } else {
            this._log(`用户取消启动: ${toolName}`);
        }
    }
    
    // 动画触发辅助函数
    _fadeInContent(selector) {
        document.querySelectorAll(selector).forEach((el, i) => {
            el.style.animation = 'none';
            el.offsetHeight; // 强制浏览器重绘
            el.style.animation = `contentFadeIn 0.5s cubic-bezier(0.25, 0.8, 0.25, 1) forwards ${i * 0.05}s`;
        });
    }

    // 重写 destroy 方法
    destroy() {
        this._log('工具已销毁');
        super.destroy(); // 调用父类的 destroy 方法
    }
}

export default SystemTool;