// src/js/tools/archiveTool.js
import BaseTool from '../baseTool.js';

class ArchiveTool extends BaseTool {
    constructor() {
        super('archive-tool', '极限压缩 & 解密');
        this.mode = 'compress';
        this.fileList = [];
    }

    render() {
        return `
            <div class="page-container archive-tool-container" style="display: flex; flex-direction: column; height: 100%;">
                <div class="section-header" style="justify-content: center;">
                    <h1 style="text-align: center; text-shadow: 0 0 10px rgba(233,69,96,0.5); margin: 0;"><i class="fas fa-microchip"></i> ${this.name}</h1>
                </div>

                <div class="sys-info-tabs" id="archive-tabs" style="border-bottom-color: #0f3460;">
                    <button class="sys-info-tab active" data-mode="compress" style="color: #fff;">压缩</button>
                    <button class="sys-info-tab" data-mode="decompress" style="color: #fff;">解压</button>
                </div>

                <div class="content-area" style="padding: 20px; flex-grow: 1; overflow-y: auto;">
                    
                    <div id="panel-compress" class="archive-panel" style="padding: 20px;">
                        <div class="drag-area" id="compress-drag-area" style="border-color: #e94560; color: #fff;">
                            <i class="fas fa-cloud-upload-alt" style="font-size: 40px; color: #e94560; margin-bottom: 10px;"></i>
                            <p>拖入文件或点击选择 (支持任意格式)</p>
                            <span style="opacity: 0.7; font-size: 12px;">多线程流式处理，不卡顿</span>
                            <input type="file" id="compress-input-hidden" multiple style="display: none;">
                        </div>
                        <div id="compress-file-list" class="file-list"></div>

                        <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; margin-top: 15px; border: 1px solid #0f3460;">
                            <div style="display: flex; gap: 10px; margin-bottom: 5px;">
                                <input type="password" id="compress-pwd" class="settings-input-text" placeholder="基础密码 (可选)" style="flex: 1; background: #16213e; color: #fff; border-color: #0f3460;">
                                <input type="text" id="compress-salt" class="settings-input-text" placeholder="加密盐值 (Salt)" style="flex: 1; background: #16213e; color: #fff; border-color: #e94560;">
                            </div>
                             <div style="margin-top: 10px;">
                                <select id="compress-format" class="settings-input-text" style="width: 100%; background: #16213e; color: #fff;">
                                    <option value="zip">ZIP (推荐)</option>
                                    <option value="tar">TAR</option>
                                </select>
                            </div>
                        </div>

                        <button id="btn-start-compress" class="action-btn ripple" style="width: 100%; margin-top: 20px; background: #e94560; border: none;">
                            <i class="fas fa-power-off"></i> 启动压缩引擎
                        </button>
                    </div>

                    <div id="panel-decompress" class="archive-panel" style="padding: 20px; display: none;">
                         <div class="drag-area" id="decompress-drag-area" style="border-color: #00ff00; color: #fff;">
                            <i class="fas fa-box-open" style="font-size: 40px; color: #00ff00; margin-bottom: 10px;"></i>
                            <p>点击选择压缩包 (ZIP, TAR 等)</p>
                            <input type="file" id="decompress-input-hidden" accept=".zip,.tar,.gz,.rar,.7z" style="display: none;">
                        </div>
                        <div id="decompress-file-info" class="file-list" style="display: none; text-align: center; padding: 10px; color: #fff;"></div>

                        <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; margin-top: 15px; border: 1px solid #0f3460;">
                            <div style="display: flex; gap: 10px;">
                                <input type="password" id="decompress-pwd" class="settings-input-text" placeholder="基础密码" style="flex: 1; background: #16213e; color: #fff;">
                                <input type="text" id="decompress-salt" class="settings-input-text" placeholder="加密盐值 (Salt)" style="flex: 1; background: #16213e; color: #fff; border-color: #00ff00;">
                            </div>
                        </div>

                        <button id="btn-start-decompress" class="action-btn ripple" style="width: 100%; margin-top: 20px; background: #0f3460; border: 1px solid #00ff00; color: #00ff00;">
                            <i class="fas fa-unlock"></i> 启动解密引擎
                        </button>
                    </div>
                    
                    <div id="archive-status-area" style="display: none; margin-top: 20px;">
                        <div style="display: flex; justify-content: space-between; color: #fff; font-size: 12px; margin-bottom: 5px;">
                            <span id="progress-status-text">正在处理...</span>
                            <span id="progress-percent-text">0%</span>
                        </div>
                        <div class="archive-progress-bar-container">
                            <div id="archive-progress-bar" class="archive-progress-bar"></div>
                        </div>
                        <div id="archive-console" class="archive-log-console"></div>
                    </div>

                </div>
            </div>
        `;
    }

    init() {
        this._log('压缩工具(Worker版)初始化');

        // Tab 切换
        const tabs = document.querySelectorAll('#archive-tabs .sys-info-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.mode = tab.dataset.mode;
                document.getElementById('panel-compress').style.display = this.mode === 'compress' ? 'block' : 'none';
                document.getElementById('panel-decompress').style.display = this.mode === 'decompress' ? 'block' : 'none';
            });
        });

        // ---------------- 压缩逻辑 ----------------
        const compressDrag = document.getElementById('compress-drag-area');
        const compressInput = document.getElementById('compress-input-hidden');
        
        compressDrag.addEventListener('click', (e) => {
             e.stopPropagation();
             compressInput.click();
        });
        
        compressInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this._addFilesToCompress(Array.from(e.target.files));
                compressInput.value = ''; // reset
            }
        });

        compressDrag.addEventListener('dragover', (e) => e.preventDefault());
        compressDrag.addEventListener('drop', (e) => { 
            e.preventDefault(); 
            this._addFilesToCompress(Array.from(e.dataTransfer.files)); 
        });

        document.getElementById('btn-start-compress').addEventListener('click', () => this._startCompression());


        // ---------------- 解压逻辑 ----------------
        const decompressDrag = document.getElementById('decompress-drag-area');
        const decompressInput = document.getElementById('decompress-input-hidden');
        this.decompressFile = null;
        
        decompressDrag.addEventListener('click', (e) => {
            e.stopPropagation();
            decompressInput.click();
        });

        decompressInput.addEventListener('change', (e) => {
            if(e.target.files[0]) {
                this._setDecompressFile(e.target.files[0]);
                decompressInput.value = '';
            }
        });
        
        decompressDrag.addEventListener('dragover', (e) => e.preventDefault());
        decompressDrag.addEventListener('drop', (e) => { 
            e.preventDefault(); 
            if(e.dataTransfer.files[0]) this._setDecompressFile(e.dataTransfer.files[0]);
        });
        
        document.getElementById('btn-start-decompress').addEventListener('click', () => this._startDecompression());

        // 监听进度
        if (window.electronAPI.onArchiveProgress) {
            window.electronAPI.onArchiveProgress(this._onProgress.bind(this));
            window.electronAPI.onArchiveLog((msg) => this._logToConsole(msg));
        }
    }
    
    _onProgress(data) {
        document.getElementById('archive-progress-bar').style.width = `${data.percent}%`;
        document.getElementById('progress-percent-text').textContent = `${data.percent}%`;
        document.getElementById('progress-status-text').textContent = data.detail;
    }

    _addFilesToCompress(files) {
        this.fileList = [...this.fileList, ...files];
        const container = document.getElementById('compress-file-list');
        container.innerHTML = this.fileList.map((f, i) => `
            <div class="file-item" style="background: rgba(255,255,255,0.1); color: #fff;">
                <span><i class="fas fa-file"></i> ${f.name}</span>
                <i class="fas fa-times" style="cursor: pointer; color: #e94560;" onclick="this.parentElement.remove(); window.toolInstance._removeFile(${i})"></i>
            </div>`).join('');
        window.toolInstance = this;
    }

    _removeFile(index) {
        this.fileList.splice(index, 1);
        // Don't re-render entire list to avoid index shifting issues in simple remove, just let DOM remove
        // In robust app, update state properly.
    }
    
    _setDecompressFile(file) {
        this.decompressFile = file;
        document.getElementById('decompress-file-info').innerHTML = `<i class="fas fa-file-archive"></i> ${file.name}`;
        document.getElementById('decompress-file-info').style.display = 'block';
    }

    _resetUI() {
        document.getElementById('archive-status-area').style.display = 'block';
        document.getElementById('archive-progress-bar').style.width = '0%';
        document.getElementById('archive-console').innerHTML = '';
        document.getElementById('progress-percent-text').textContent = '0%';
    }

    _logToConsole(msg) {
        const consoleEl = document.getElementById('archive-console');
        const p = document.createElement('div');
        p.textContent = `> ${msg}`;
        consoleEl.appendChild(p);
        consoleEl.scrollTop = consoleEl.scrollHeight;
    }

    async _startCompression() {
        if (this.fileList.length === 0) return this._notify('提示', '请添加文件', 'info');
        this._resetUI();
        this._logToConsole('任务已提交至线程池...');

        const pwd = document.getElementById('compress-pwd').value;
        const salt = document.getElementById('compress-salt').value;
        const format = document.getElementById('compress-format').value;
        const filePaths = this.fileList.map(f => f.path);

        const result = await window.electronAPI.compressFiles({ files: filePaths, password: pwd, salt: salt, format: format });
        
        if (result.success) {
            this._logToConsole(`[完成] 文件已保存: ${result.path}`);
            this._notify('成功', '压缩完成', 'success');
        } else {
            this._logToConsole(`[错误] ${result.error}`);
            this._notify('失败', result.error, 'error');
        }
    }

    async _startDecompression() {
        if (!this.decompressFile) return;
        this._resetUI();
        this._logToConsole('任务已提交至线程池...');
        
        const pwd = document.getElementById('decompress-pwd').value;
        const salt = document.getElementById('decompress-salt').value;

        const result = await window.electronAPI.decompressFile({ filePath: this.decompressFile.path, password: pwd, salt: salt });
        
        if (result.success) {
             this._logToConsole('[完成] 解压成功，已打开目录');
             this._notify('成功', '解压完成', 'success');
        } else {
             this._logToConsole(`[错误] ${result.error}`);
             this._notify('失败', result.error, 'error');
        }
    }
}
export default ArchiveTool;