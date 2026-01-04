import BaseTool from '../baseTool.js';

class SystemInfoTool extends BaseTool {
    constructor() {
        super('system-info', '系统信息');
        this.sysData = null;
        this.memoryInterval = null;
    }

    render() {
        return `
            <div class="page-container" style="display: flex; flex-direction: column; height: 100%;">
                <div class="section-header">
                    <button id="back-to-toolbox-btn" class="back-btn ripple"><i class="fas fa-arrow-left"></i> 返回工具箱</button>
                    <h1 style="flex-grow: 1; text-align: center;">${this.name}</h1>
                </div>
                <div id="sys-info-content-wrapper" style="flex-grow: 1; overflow-y: auto;">
                    <div class="loading-container">
                        <img src="./assets/loading.gif" alt="加载中..." class="loading-gif">
                        <p class="loading-text">正在获取系统信息...</p>
                    </div>
                </div>
            </div>
        `;
    }

    async init() {
        this._log('工具已初始化');
        document.getElementById('back-to-toolbox-btn')?.addEventListener('click', () => {
             window.mainPage.navigateTo('toolbox');
             window.mainPage.updateActiveNavButton(document.getElementById('toolbox-btn'));
        });

        try {
            this.sysData = await window.electronAPI.getSystemInfo();
            this._log('成功获取系统信息');
            const contentWrapper = document.getElementById('sys-info-content-wrapper');
            if (contentWrapper) {
                contentWrapper.innerHTML = this._buildHtml();
                this._bindTabEvents();
                this._startMemoryUpdates();
            }
        } catch (error) {
            this._log(`获取系统信息失败: ${error.message}`);
            this._notify('错误', '无法获取系统信息', 'error');
            const contentWrapper = document.getElementById('sys-info-content-wrapper');
            if (contentWrapper) {
                contentWrapper.innerHTML = `<div class="loading-container"><p class="error-message">获取详细系统信息时出错。</p></div>`;
            }
        }
    }

    destroy() {
        if (this.memoryInterval) {
            clearInterval(this.memoryInterval);
        }
        this._log('工具已销毁，动态更新已停止');
    }

    _startMemoryUpdates() {
        this.memoryInterval = setInterval(async () => {
            try {
                const memUpdate = await window.electronAPI.getMemoryUpdate();
                document.getElementById('mem-available-value').textContent = `${memUpdate.free} GB`;
                document.getElementById('mem-virtual-available-value').textContent = `${(parseFloat(memUpdate.free) + parseFloat(memUpdate.swapfree)).toFixed(2)} GB`;
                
                const memUsageText = document.getElementById('mem-usage-text');
                const memUsageBar = document.getElementById('mem-usage-bar-inner');
                if(memUsageText) memUsageText.textContent = `${memUpdate.usagePercentage}%`;
                if(memUsageBar) memUsageBar.style.width = `${memUpdate.usagePercentage}%`;

            } catch (error) {
                console.error("无法更新内存信息:", error);
                if (this.memoryInterval) clearInterval(this.memoryInterval);
            }
        }, 2000);
    }

    _bindTabEvents() {
        const tabs = document.querySelectorAll('.sys-info-tab');
        const contents = document.querySelectorAll('.sys-info-content');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetId = tab.dataset.tab;
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                contents.forEach(content => {
                    if (content.id === targetId) content.classList.add('active');
                    else content.classList.remove('active');
                });
            });
        });
    }
    
    _buildHtml() {
        const data = this.sysData;
        if (!data) return '<p class="error-message">未能加载系统信息。</p>';
        
        const formatUptime = (seconds) => {
            const days = Math.floor(seconds / 86400); seconds %= 86400;
            const hours = Math.floor(seconds / 3600); seconds %= 3600;
            const minutes = Math.floor(seconds / 60);
            return `${days} 天 ${hours} 小时 ${minutes} 分钟`;
        };

        const formatBytes = (bytes, targetUnit = 'GB') => {
            if (bytes === 0 || !bytes) return '0 ' + targetUnit;
            const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const power = units.indexOf(targetUnit);
            if (power === -1) return (bytes / (1024 ** 2)).toFixed(2) + ' MB';
            return (bytes / (1024 ** power)).toFixed(2) + ' ' + targetUnit;
        }
        
        const renderInfoItem = (label, value) => `<div class="info-item"><span class="info-label">${label}</span><span class="info-value">${value || 'N/A'}</span></div>`;

        const versionItems = Object.entries(data.versions)
            .filter(([key, value]) => value && !['app', 'electron', 'node', 'v8', 'chrome'].includes(key))
            .map(([key, value]) => `<div class="info-grid compact">${renderInfoItem(key, value)}</div>`)
            .join('');

        return `
            <div class="sys-info-tabs">
                <button class="sys-info-tab active" data-tab="tab-summary"><i class="fas fa-clipboard-list"></i> 系统摘要</button>
                <button class="sys-info-tab" data-tab="tab-hardware"><i class="fas fa-hdd"></i> 硬件资源</button>
                <button class="sys-info-tab" data-tab="tab-network"><i class="fas fa-network-wired"></i> 网络接口</button>
                <button class="sys-info-tab" data-tab="tab-versions"><i class="fas fa-code-branch"></i> 软件环境</button>
                <button class="sys-info-tab" data-tab="tab-processes"><i class="fas fa-tasks"></i> 运行进程</button>
            </div>
            <div class="sys-info-content-container">
                <div id="tab-summary" class="sys-info-content active">
                    <div class="info-grid">${renderInfoItem('操作系统名称', data.osInfo.distro)}</div>
                    <div class="info-grid">${renderInfoItem('版本', data.osInfo.release)}</div>
                    <div class="info-grid">${renderInfoItem('系统名称', data.osInfo.hostname)}</div>
                    <div class="info-grid">${renderInfoItem('系统制造商', data.system.manufacturer)}</div>
                    <div class="info-grid">${renderInfoItem('系统型号', data.system.model)}</div>
                    <div class="info-grid">${renderInfoItem('系统类型', `${data.osInfo.arch} PC`)}</div>
                    <div class="info-grid">${renderInfoItem('处理器', `${data.cpu.brand}, ${data.cpu.physicalCores} 核, ${data.cpu.cores} 逻辑处理器`)}</div>
                    <div class="info-grid">${renderInfoItem('BIOS 版本/日期', `${data.bios.vendor} ${data.bios.version}, ${data.bios.releaseDate}`)}</div>
                    <div class="info-grid">${renderInfoItem('SMBIOS 版本', data.bios.smbiosVersion)}</div>
                    <div class="info-grid">${renderInfoItem('BIOS 模式', data.osInfo.uefi ? 'UEFI' : 'Legacy')}</div>
                    <div class="info-grid">${renderInfoItem('主板产品', `${data.baseboard.manufacturer} ${data.baseboard.model}`)}</div>
                    <div class="info-grid">${renderInfoItem('平台角色', data.system.platformRole)}</div>
                    <div class="info-grid">${renderInfoItem('Windows 目录', data.osInfo.windowsDir)}</div>
                    <div class="info-grid">${renderInfoItem('区域设置', data.time.locale)}</div>
                    <div class="info-grid">${renderInfoItem('时区', data.time.timezoneName)}</div>
                    <div class="info-grid">${renderInfoItem('已安装的物理内存(RAM)', formatBytes(data.mem.total))}</div>
                    <div class="info-grid">${renderInfoItem('总的物理内存', formatBytes(data.mem.total))}</div>
                    <div class="info-grid">${renderInfoItem('可用物理内存', `<span id="mem-available-value">${formatBytes(data.mem.available)}</span>`)}</div>
                    <div class="info-grid">${renderInfoItem('总的虚拟内存', formatBytes(data.mem.totalVirtual))}</div>
                    <div class="info-grid">${renderInfoItem('可用虚拟内存', `<span id="mem-virtual-available-value">${formatBytes(data.mem.freeVirtual)}</span>`)}</div>
                    <div class="info-grid">${renderInfoItem('页面文件空间', formatBytes(data.mem.swaptotal))}</div>
                </div>
                
                <div id="tab-hardware" class="sys-info-content">
                    <h3>内存条信息</h3>
                    ${data.mem.layout.map((stick, index) => `
                        <div class="network-card">
                            <h4>内存插槽 ${index + 1}</h4>
                            <div class="info-grid compact">${renderInfoItem('容量', formatBytes(stick.size))}</div>
                            <div class="info-grid compact">${renderInfoItem('类型', stick.type)}</div>
                            <div class="info-grid compact">${renderInfoItem('频率', stick.clockSpeed ? stick.clockSpeed + ' MHz' : 'N/A')}</div>
                            <div class="info-grid compact">${renderInfoItem('制造商', stick.manufacturer)}</div>
                        </div>
                    `).join('')}
                    <h3>磁盘驱动器</h3>
                    ${data.diskLayout.map(disk => `
                        <div class="network-card">
                            <h4>${disk.name || disk.device} (${disk.type})</h4>
                             <div class="info-grid compact">${renderInfoItem('厂商', disk.vendor)}</div>
                             <div class="info-grid compact">${renderInfoItem('容量', formatBytes(disk.size))}</div>
                        </div>
                    `).join('')}
                    <h3>显示控制器</h3>
                     ${data.graphics.controllers.map((controller, index) => `
                        <div class="network-card">
                            <h4>显卡 ${index + 1}</h4>
                            <div class="info-grid compact">${renderInfoItem('型号', controller.model)}</div>
                            <div class="info-grid compact">${renderInfoItem('制造商', controller.vendor)}</div>
                            <div class="info-grid compact">${renderInfoItem('显存', formatBytes(controller.vram, 'MB'))}</div>
                        </div>
                    `).join('')}
                    <h3>显示器</h3>
                     ${data.displays.map((display, index) => `
                        <div class="network-card">
                            <h3>显示器 ${index + 1} ${display.isPrimary ? '(主显示器)' : ''}</h3>
                            <div class="info-grid compact">${renderInfoItem('分辨率', display.resolution)}</div>
                            <div class="info-grid compact">${renderInfoItem('缩放因子', display.scaleFactor)}</div>
                            <div class="info-grid compact">${renderInfoItem('色深', display.colorDepth)}</div>
                        </div>
                    `).join('')}
                </div>
                <div id="tab-network" class="sys-info-content">
                    ${data.networkInterfaces.map(net => `
                        <div class="network-card">
                            <h3>${net.ifaceName} ${net.default ? '(默认)' : ''}</h3>
                            <div class="info-grid compact">${renderInfoItem('IPv4 地址', net.ip4)}</div>
                            <div class="info-grid compact">${renderInfoItem('IPv6 地址', net.ip6)}</div>
                            <div class="info-grid compact">${renderInfoItem('MAC 地址', net.mac)}</div>
                            <div class="info-grid compact">${renderInfoItem('速度', (net.speed || 0) + ' Mbps')}</div>
                        </div>
                    `).join('')}
                </div>
                 <div id="tab-versions" class="sys-info-content">
                    <div class="network-card">
                        <h3>核心环境</h3>
                         <div class="info-grid compact">${renderInfoItem('YMhut Box', data.versions.app)}</div>
                         <div class="info-grid compact">${renderInfoItem('Electron', data.versions.electron)}</div>
                         <div class="info-grid compact">${renderInfoItem('Node.js', data.versions.node)}</div>
                         <div class="info-grid compact">${renderInfoItem('Chromium', data.versions.chrome)}</div>
                         <div class="info-grid compact">${renderInfoItem('V8 Engine', data.versions.v8)}</div>
                    </div>
                     <div class="network-card">
                        <h3>其他软件 (已检测到)</h3>
                        ${versionItems || '<p style="padding: 10px;">未检测到其他相关软件。</p>'}
                    </div>
                </div>
                <div id="tab-processes" class="sys-info-content">
                    <div class="info-grid" style="grid-template-columns: repeat(4, 1fr); gap: 10px;">
                        <div>总进程: <b>${data.processes.all}</b></div>
                        <div>运行中: <b>${data.processes.running}</b></div>
                        <div>阻塞: <b>${data.processes.blocked}</b></div>
                        <div>休眠: <b>${data.processes.sleeping}</b></div>
                    </div>
                    <table class="ip-comparison-table" style="margin-top: 20px;">
                        <thead>
                            <tr>
                                <th>PID</th>
                                <th>进程名</th>
                                <th>CPU (%)</th>
                                <th>内存 (%)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.processes.list.slice(0, 100).map(p => `
                                <tr>
                                    <td>${p.pid}</td>
                                    <td style="word-break: break-all;">${p.name}</td>
                                    <td>${p.cpu}</td>
                                    <td>${p.mem}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <p class="comparison-note">仅显示CPU占用率最高的100个进程。</p>
                </div>
            </div>
        `;
    }
}

export default SystemInfoTool;