// src/js/tools/archiveTool.js
import BaseTool from '../baseTool.js';

class EncryptionCompressionTool extends BaseTool {
    constructor() {
        super('archive-tool', '加密&压缩');
        this.mode = 'encrypt';
        this.fileList = [];
        this.decryptTargetFile = null;
        this.decryptKeyFile = null;
    }

    render() {
        return `
            <div class="page-container archive-tool-container" style="display: flex; flex-direction: column; height: 100%;">
                <div class="section-header">
                    <button id="back-to-toolbox-btn" class="back-btn ripple"><i class="fas fa-arrow-left"></i> 返回工具箱</button>
                    <h1 style="flex-grow: 1; text-align: center;"><i class="fas fa-shield-alt"></i> ${this.name}</h1>
                </div>

                <div class="content-area" style="padding: 20px; flex-grow: 1; display: flex; flex-direction: column; overflow: hidden;">
                    <div class="settings-section" style="padding: 20px; height: 100%; display: flex; flex-direction: column; gap: 15px;">
                        
                        <div class="sys-info-tabs" id="archive-tabs" style="margin-bottom: 10px; justify-content: center; flex-shrink: 0;">
                            <button class="sys-info-tab active" data-mode="encrypt"><i class="fas fa-lock"></i> 加密打包</button>
                            <button class="sys-info-tab" data-mode="decrypt"><i class="fas fa-key"></i> 解密还原</button>
                        </div>
                        
                        <div class="archive-workspace" style="flex-grow: 1; overflow-y: auto; padding-right: 5px; display: flex; flex-direction: column;">
                            
                            <div id="panel-encrypt" class="archive-panel" style="display: flex; flex-direction: column; gap: 15px;">
                                <div class="drag-area" id="encrypt-drag-area" style="border: 2px dashed var(--primary-color); border-radius: 12px; padding: 25px; text-align: center; transition: all 0.2s ease; background: rgba(var(--primary-rgb), 0.05);">
                                    <i class="fas fa-cloud-upload-alt" style="font-size: 40px; color: var(--primary-color); margin-bottom: 10px;"></i>
                                    <p style="margin-bottom: 15px; font-weight: 500;">将文件或文件夹拖入此处</p>
                                    <div style="display: flex; gap: 15px; justify-content: center;">
                                        <button id="btn-add-files" class="control-btn mini-btn ripple"><i class="fas fa-file"></i> 添加文件</button>
                                        <button id="btn-add-folder" class="control-btn mini-btn ripple"><i class="fas fa-folder"></i> 添加文件夹</button>
                                    </div>
                                    <input type="file" id="encrypt-input-files" multiple style="display: none;">
                                    <input type="file" id="encrypt-input-folder" webkitdirectory style="display: none;">
                                </div>
                                
                                <div class="file-list-container" style="border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
                                    <div style="background: var(--tag-bg-color); padding: 8px 12px; font-size: 12px; font-weight: 600; border-bottom: 1px solid var(--border-color);">待处理列表</div>
                                    <div id="encrypt-file-list" class="file-list" style="height: 120px; overflow-y: auto; padding: 5px; background: rgba(var(--card-background-rgb), 0.3);">
                                        <div class="empty-state" style="height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); font-size: 12px;">
                                            <i class="fas fa-box-open" style="margin-right: 5px;"></i> 暂无文件
                                        </div>
                                    </div>
                                </div>

                                <div class="info-box" style="background: rgba(var(--primary-rgb), 0.1); padding: 12px; border-radius: 8px; font-size: 13px; border: 1px solid rgba(var(--primary-rgb), 0.2);">
                                    <i class="fas fa-shield-virus"></i> <strong>安全机制：</strong>
                                    采用 AES-256-CBC 强加密算法。操作完成后将生成 <code style="background: rgba(0,0,0,0.2); padding: 2px 4px; border-radius: 4px;">.ymenc</code> 数据包和 <code style="background: rgba(0,0,0,0.2); padding: 2px 4px; border-radius: 4px;">.ymkey</code> 密钥文件。
                                </div>

                                <button id="btn-start-encrypt" class="action-btn ripple" style="width: 100%; padding: 12px;">
                                    <i class="fas fa-lock"></i> 开始加密并生成密钥
                                </button>
                            </div>

                            <div id="panel-decrypt" class="archive-panel" style="display: none; flex-direction: column; gap: 15px;">
                                <div class="decrypt-step-card" style="display: flex; gap: 15px; align-items: center; border: 1px solid var(--border-color); padding: 15px; border-radius: 12px; background: rgba(var(--card-background-rgb), 0.5);">
                                    <div class="drag-area-small" id="decrypt-drag-area" style="flex: 1; border: 2px dashed var(--success-color); border-radius: 8px; padding: 20px; text-align: center; cursor: pointer; background: rgba(var(--success-color-rgb), 0.05);">
                                        <i class="fas fa-file-archive" style="font-size: 24px; color: var(--success-color); margin-bottom: 8px;"></i>
                                        <div style="font-size: 13px; font-weight: 600;">步骤 1: 加密包</div>
                                        <div style="font-size: 11px; color: var(--text-secondary);">拖入 .ymenc 文件</div>
                                        <div id="decrypt-target-status" style="margin-top: 5px; font-size: 12px; color: var(--text-color);">未选择</div>
                                        <input type="file" id="decrypt-input-enc" accept=".ymenc" style="display: none;">
                                    </div>
                                    
                                    <div style="color: var(--text-secondary);"><i class="fas fa-plus"></i></div>

                                    <div class="drag-area-small" id="key-drag-area" style="flex: 1; border: 2px dashed var(--accent-color); border-radius: 8px; padding: 20px; text-align: center; cursor: pointer; background: rgba(var(--accent-color-rgb), 0.05);">
                                        <i class="fas fa-key" style="font-size: 24px; color: var(--accent-color); margin-bottom: 8px;"></i>
                                        <div style="font-size: 13px; font-weight: 600;">步骤 2: 密钥文件</div>
                                        <div style="font-size: 11px; color: var(--text-secondary);">拖入 .ymkey 文件</div>
                                        <div id="decrypt-key-status" style="margin-top: 5px; font-size: 12px; color: var(--text-color);">未选择</div>
                                        <input type="file" id="decrypt-input-key" accept=".ymkey" style="display: none;">
                                    </div>
                                </div>

                                <button id="btn-start-decrypt" class="action-btn ripple" style="width: 100%; padding: 12px; background-color: var(--success-color);" disabled>
                                    <i class="fas fa-unlock-alt"></i> 验证密钥并解密
                                </button>
                            </div>
                        </div>

                        <div id="archive-status-area" style="display: none; flex-shrink: 0; margin-top: 10px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                            <div class="status-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <span style="font-size: 12px; font-weight: 600;"><i class="fas fa-terminal"></i> 处理日志</span>
                                <span id="progress-percent" style="font-size: 12px; font-family: monospace;">0%</span>
                            </div>
                            <div class="status-bar-container" style="height: 6px; background: #333; border-radius: 3px; overflow: hidden; margin-bottom: 10px;">
                                <div id="archive-progress-bar" class="status-bar" style="width: 0%; background: var(--primary-color); height: 100%; transition: width 0.1s linear;"></div>
                            </div>
                            <div id="archive-console" class="terminal-output" style="
                                height: 120px; 
                                background: #1e1e1e; 
                                color: #4af626; 
                                font-family: 'Consolas', 'Monaco', monospace; 
                                padding: 10px; 
                                overflow-y: auto; 
                                font-size: 12px; 
                                border-radius: 6px; 
                                border: 1px solid #333;
                                box-shadow: inset 0 2px 5px rgba(0,0,0,0.5);
                                white-space: pre-wrap;
                                word-break: break-all;
                            "></div>
                        </div>
                    
                    </div>
                </div>
            </div>
        `;
    }

    init() {
        this._log('加密&压缩工具初始化');
        
        document.getElementById('back-to-toolbox-btn')?.addEventListener('click', () => {
             window.mainPage.navigateTo('toolbox');
             window.mainPage.updateActiveNavButton(document.getElementById('toolbox-btn'));
        });

        // Tab 切换逻辑
        const tabs = document.querySelectorAll('#archive-tabs .sys-info-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.mode = tab.dataset.mode;
                document.getElementById('panel-encrypt').style.display = this.mode === 'encrypt' ? 'flex' : 'none';
                document.getElementById('panel-decrypt').style.display = this.mode === 'decrypt' ? 'flex' : 'none';
                this._resetUI();
            });
        });

        // --- 加密逻辑 ---
        const encryptDrag = document.getElementById('encrypt-drag-area');
        const btnAddFiles = document.getElementById('btn-add-files');
        const btnAddFolder = document.getElementById('btn-add-folder');
        const inputFiles = document.getElementById('encrypt-input-files');
        const inputFolder = document.getElementById('encrypt-input-folder');
        
        // 按钮触发
        btnAddFiles.addEventListener('click', (e) => { e.stopPropagation(); inputFiles.click(); });
        btnAddFolder.addEventListener('click', (e) => { e.stopPropagation(); inputFolder.click(); });
        
        // 区域点击触发 (默认加文件)
        encryptDrag.addEventListener('click', (e) => {
            if(e.target === encryptDrag || e.target.tagName === 'P' || e.target.tagName === 'I') {
                inputFiles.click();
            }
        });

        // 文件变动监听
        inputFiles.addEventListener('change', (e) => { if (e.target.files.length) this._addFiles(Array.from(e.target.files)); inputFiles.value = ''; });
        inputFolder.addEventListener('change', (e) => { if (e.target.files.length) this._addFiles(Array.from(e.target.files)); inputFolder.value = ''; });

        // 拖拽监听
        encryptDrag.addEventListener('dragover', (e) => { e.preventDefault(); encryptDrag.style.borderColor = 'var(--accent-color)'; });
        encryptDrag.addEventListener('dragleave', (e) => { e.preventDefault(); encryptDrag.style.borderColor = 'var(--primary-color)'; });
        encryptDrag.addEventListener('drop', (e) => { 
            e.preventDefault(); 
            encryptDrag.style.borderColor = 'var(--primary-color)';
            if (e.dataTransfer.files.length) this._addFiles(Array.from(e.dataTransfer.files)); 
        });

        document.getElementById('btn-start-encrypt').addEventListener('click', () => this._startEncryption());

        // --- 解密逻辑 ---
        const decryptDrag = document.getElementById('decrypt-drag-area');
        const decryptInput = document.getElementById('decrypt-input-enc');
        const keyDrag = document.getElementById('key-drag-area');
        const keyInput = document.getElementById('decrypt-input-key');

        // 加密包交互
        decryptDrag.addEventListener('click', (e) => { e.stopPropagation(); decryptInput.click(); });
        decryptInput.addEventListener('change', (e) => this._setDecryptTarget(e.target.files[0]));
        decryptDrag.addEventListener('dragover', (e) => e.preventDefault());
        decryptDrag.addEventListener('drop', (e) => { e.preventDefault(); this._setDecryptTarget(e.dataTransfer.files[0]); });

        // 密钥文件交互
        keyDrag.addEventListener('click', (e) => { e.stopPropagation(); keyInput.click(); });
        keyInput.addEventListener('change', (e) => this._setDecryptKey(e.target.files[0]));
        keyDrag.addEventListener('dragover', (e) => e.preventDefault());
        keyDrag.addEventListener('drop', (e) => { e.preventDefault(); this._setDecryptKey(e.dataTransfer.files[0]); });

        document.getElementById('btn-start-decrypt').addEventListener('click', () => this._startDecryption());

        // Worker 消息监听
        if (window.electronAPI.onArchiveProgress) {
            window.electronAPI.onArchiveProgress(this._onProgress.bind(this));
            window.electronAPI.onArchiveLog((msg) => this._logToConsole(msg));
        }
        window.toolInstance = this;
    }

    _addFiles(files) {
        const newFiles = files.filter(f => !this.fileList.some(existing => existing.path === f.path));
        this.fileList = [...this.fileList, ...newFiles];
        this._renderFileList();
    }

    _renderFileList() {
        const container = document.getElementById('encrypt-file-list');
        if (this.fileList.length === 0) {
            container.innerHTML = '<div class="empty-state" style="height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); font-size: 12px;"><i class="fas fa-box-open" style="margin-right: 5px;"></i> 暂无文件</div>';
            return;
        }
        container.innerHTML = this.fileList.map((f, i) => `
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; padding: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); hover:background: rgba(255,255,255,0.05);">
                <div style="display: flex; align-items: center; overflow: hidden;">
                    <i class="fas ${f.path.indexOf('.') === -1 ? 'fa-folder' : 'fa-file'}" style="margin-right: 8px; color: var(--text-secondary);"></i>
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${f.path}">${f.name}</span>
                </div>
                <i class="fas fa-times" style="cursor: pointer; color: var(--error-color); padding: 4px;" onclick="window.toolInstance._removeFile(${i})"></i>
            </div>`).join('');
    }

    _removeFile(index) {
        this.fileList.splice(index, 1);
        this._renderFileList();
    }

    _setDecryptTarget(file) {
        if(!file || !file.name.endsWith('.ymenc')) return this._notify('错误', '请选择 .ymenc 格式的加密包', 'error');
        this.decryptTargetFile = file;
        const statusEl = document.getElementById('decrypt-target-status');
        statusEl.innerHTML = `<i class="fas fa-file-archive" style="color: var(--success-color);"></i> ${file.name}`;
        statusEl.style.fontWeight = "bold";
        this._checkDecryptReady();
    }

    _setDecryptKey(file) {
        if(!file || !file.name.endsWith('.ymkey')) return this._notify('错误', '请选择 .ymkey 格式的密钥文件', 'error');
        this.decryptKeyFile = file;
        const statusEl = document.getElementById('decrypt-key-status');
        statusEl.innerHTML = `<i class="fas fa-key" style="color: var(--accent-color);"></i> ${file.name}`;
        statusEl.style.fontWeight = "bold";
        this._checkDecryptReady();
    }

    _checkDecryptReady() {
        document.getElementById('btn-start-decrypt').disabled = !(this.decryptTargetFile && this.decryptKeyFile);
    }

    _resetUI() {
        document.getElementById('archive-status-area').style.display = 'none';
        document.getElementById('archive-progress-bar').style.width = '0%';
        document.getElementById('archive-console').innerHTML = '';
        document.getElementById('progress-percent').textContent = '0%';
    }

    _onProgress(data) {
        const area = document.getElementById('archive-status-area');
        if (area.style.display === 'none') area.style.display = 'block';
        
        document.getElementById('archive-progress-bar').style.width = `${data.percent}%`;
        document.getElementById('progress-percent').textContent = `${data.percent}%`;
    }

    _logToConsole(msg) {
        const el = document.getElementById('archive-console');
        const div = document.createElement('div');
        const time = new Date().toLocaleTimeString([], {hour12: false});
        div.innerHTML = `<span style="color: #666;">[${time}]</span> ${msg}`;
        div.style.marginBottom = '4px';
        el.appendChild(div);
        el.scrollTop = el.scrollHeight;
    }

    async _startEncryption() {
        if (this.fileList.length === 0) return this._notify('提示', '请添加要加密的文件', 'info');
        
        this._resetUI();
        document.getElementById('archive-status-area').style.display = 'block';
        this._logToConsole('正在初始化安全环境...');

        const filePaths = this.fileList.map(f => f.path);
        
        const result = await window.electronAPI.compressFiles({ 
            files: filePaths, 
            format: 'ymenc'
        });

        if (result.success) {
            this._logToConsole(`[成功] 加密完成！`);
            this._logToConsole(`加密包: ${result.path}`);
            if (result.keyPath) {
                this._logToConsole(`密钥文件: ${result.keyPath}`);
            }
            this._notify('成功', '加密完成，请妥善保管密钥文件！', 'success');
            this.fileList = [];
            this._renderFileList();
        } else {
            this._logToConsole(`[错误] ${result.error}`);
            this._notify('失败', result.error, 'error');
        }
    }

    async _startDecryption() {
        if (!this.decryptTargetFile || !this.decryptKeyFile) return;

        this._resetUI();
        document.getElementById('archive-status-area').style.display = 'block';
        this._logToConsole('正在验证密钥与加密包...');

        const result = await window.electronAPI.decompressFile({ 
            filePath: this.decryptTargetFile.path, 
            keyPath: this.decryptKeyFile.path 
        });

        if (result.success) {
            this._logToConsole(`[成功] 文件已解密并解压至: ${result.path}`);
            this._notify('成功', '解密还原完成', 'success');
        } else {
            this._logToConsole(`[错误] ${result.error}`);
            this._notify('解密失败', result.error, 'error');
        }
    }
}

export default EncryptionCompressionTool;