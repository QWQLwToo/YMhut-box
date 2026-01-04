// main.js
const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, screen, session } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { pipeline } = require('stream');
const os = require('os');
const { exec } = require('child_process');
const iconv = require('iconv-lite');
const AppDatabase = require('./config/database');
const si = require('systeminformation');
const sudo = require('sudo-prompt');

// --- [最终版] 数据库路径管理和迁移逻辑 ---

// 全局数据库实例
let db;

function determineDataPath() {
    // 开发环境下，数据仍在项目 config 目录中
    if (!app.isPackaged) {
        const devDbDir = path.join(__dirname, 'config');
        if (!fs.existsSync(devDbDir)) fs.mkdirSync(devDbDir, { recursive: true });
        return path.join(devDbDir, 'app.db');
    }

    // 生产环境下，数据在安装目录的 data 文件夹中
    const installDir = path.join(path.dirname(process.execPath), '..');
    const dataDir = path.join(installDir, 'data');
    if (!fs.existsSync(dataDir)) {
        try {
            fs.mkdirSync(dataDir, { recursive: true });
        } catch (error) {
            dialog.showErrorBox('严重错误', `无法创建数据目录: ${dataDir}\n请检查权限或以管理员身份运行。`);
            app.quit();
        }
    }
    
    return path.join(dataDir, 'app.db');
}

async function migrateAndInitializeDatabase() { // <-- [修改] 声明为 async
    // 1. 始终使用新的、正确的路径 (userData) 初始化主数据库实例
    const newDataPath = determineDataPath();
    db = new AppDatabase(newDataPath);

    // 2. 仅在生产环境中执行一次性的迁移检测
    if (app.isPackaged) {
        // [旧路径] 指向之前错误的安装目录相对路径
        const oldInstallDir = path.join(path.dirname(process.execPath), '..');
        const oldDataPath = path.join(oldInstallDir, 'data', 'app.db');
        const migratedMarker = `${oldDataPath}.migrated_to_userdata`;

        let oldDbConnection;

        // 3. 如果旧数据库存在，且【没有】被标记为已迁移
        if (fs.existsSync(oldDataPath) && !fs.existsSync(migratedMarker)) {
            console.log(`发现旧的安装目录数据库: ${oldDataPath}，开始迁移到 userData...`);
            
            try {
                // 4. Open old DB
                oldDbConnection = require('better-sqlite3')(oldDataPath);
                
                // 5. Run transaction (Data Copy)
                db.db.transaction(() => {
                    const configs = oldDbConnection.prepare('SELECT * FROM app_config').all();
                    const configStmt = db.db.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)');
                    for (const config of configs) { configStmt.run(config.key, config.value); }
                    console.log(`- 合并了 ${configs.length} 条配置项。`);

                    const logs = oldDbConnection.prepare('SELECT * FROM logs').all();
                    const logStmt = db.db.prepare('INSERT OR IGNORE INTO logs (id, timestamp, action, category) VALUES (?, ?, ?, ?)');
                    for (const log of logs) { logStmt.run(log.id, log.timestamp, log.action, log.category); }
                    console.log(`- 合并了 ${logs.length} 条日志记录。`);

                    const traffics = oldDbConnection.prepare('SELECT * FROM traffic_log').all();
                    const trafficStmt = db.db.prepare('INSERT OR REPLACE INTO traffic_log (log_date, bytes_used) VALUES (?, ?)');
                    for (const traffic of traffics) { trafficStmt.run(traffic.log_date, traffic.bytes_used); }
                    console.log(`- 合并了 ${traffics.length} 条流量日志。`);
                })();
                console.log('数据合并成功！');

                // 6. Close old DB
                oldDbConnection.close();
                oldDbConnection = null;
                console.log('旧数据库连接已关闭。');

                // 7. [新增] 等待 Windows 释放文件锁
                await new Promise(resolve => setTimeout(resolve, 500)); // 500ms 延迟

                // 8. Rename (Mark as migrated)
                fs.renameSync(oldDataPath, migratedMarker);
                console.log(`旧数据库已标记为: ${migratedMarker}`);

            } catch (error) {
                console.error('数据库迁移过程中发生错误:', error);
                
                // [修改] 关键修复：处理 EBUSY 错误并打破循环
                if (error.code === 'EBUSY') {
                    console.warn('Rename 失败 (EBUSY)，但数据已复制。');
                    try {
                        // 手动创建标记文件以防止下次启动时再次迁移
                        fs.writeFileSync(migratedMarker, `Rename failed on ${new Date().toISOString()} due to EBUSY, but data copy was successful.`);
                        console.log('已手动创建迁移标记文件以打破循环。');
                    } catch (markerError) {
                        console.error('致命错误：无法创建迁移标记文件:', markerError);
                    }
                }
                
                // 无论如何，都向用户显示错误（这次是最后一次）
                dialog.showErrorBox('数据迁移失败', `合并旧数据时发生错误: ${error.message}\n应用将使用新的数据库，旧数据可能丢失。`);
            
            } finally {
                // 确保连接在任何情况下都被关闭
                if (oldDbConnection && oldDbConnection.open) {
                    oldDbConnection.close();
                }
            }
        }
    }
}

// --- [修改结束] ---

let networkMonitor = { currentBytes: 0, lastTimestamp: Date.now() };
let networkSpeedInterval = null;
let userPublicIp = null;
let cpuUsage = {
    prev: process.cpuUsage(),
    prevTime: process.hrtime()
};

async function getPublicIP() {
    if (userPublicIp) return userPublicIp;
    const apis = ['https://api.ipify.org?format=json', 'https://ipinfo.io/json'];
    for (const apiUrl of apis) {
        try {
            const response = await new Promise((resolve, reject) => {
                https.get(apiUrl, { timeout: 3000 }, res => resolve(res)).on('error', reject);
            });
            if (response.statusCode === 200) {
                let data = '';
                for await (const chunk of response) { data += chunk; }
                const jsonData = JSON.parse(data);
                if (jsonData.ip) {
                    userPublicIp = jsonData.ip;
                    return userPublicIp;
                }
            }
        } catch (e) {
            console.warn('从 ' + apiUrl + ' 获取公网IP失败', e.message);
        }
    }
    return null;
}

async function fetchIpBanList() {
    return new Promise((resolve, reject) => {
        https.get(`https://update.ymhut.cn/ip-ban-list.json?r=${Date.now()}`, { timeout: 4000 }, (res) => {
            if (res.statusCode !== 200) return resolve([]);
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(Array.isArray(parsed.banned_ips) ? parsed.banned_ips : []);
                } catch (e) {
                    resolve([]);
                }
            });
        }).on('error', () => resolve([]));
    });
}

process.on('uncaughtException', (error, origin) => {
    console.error(`Caught exception: ${error}\n` + `Exception origin: ${origin}`);
    try {
        db.logAction({
            timestamp: new Date().toISOString(),
            action: `主进程发生未捕获的错误: ${error.message}`,
            category: 'error'
        });
    } catch (dbError) {
        console.error('无法将严重错误写入数据库:', dbError);
    }
});

const APP_VERSION = app.getVersion();
let mainWindow;
let splashWindow;
let downloadController = null;
let windowStateChangeTimer = null;
let acknowledgementsWindow = null;
let toolWindows = new Map();

app.commandLine.appendSwitch('force-gpu-rasterization');
app.commandLine.appendSwitch('enable-features', 'WebView2');

function createSplashWindow() {
    const themeFromConfig = db ? db.getConfig('theme') : 'dark';
    const savedTheme = themeFromConfig || 'dark';
    
    splashWindow = new BrowserWindow({
        width: 450,
        height: 320,
        frame: false,
        resizable: false,
        center: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
        },
        backgroundColor: savedTheme === 'dark' ? '#161618' : '#f7f7f9',
        show: false,
        skipTaskbar: true,
    });
    splashWindow.loadFile(path.join(__dirname, 'src/splash.html'), { query: { "theme": savedTheme } });
    splashWindow.on('ready-to-show', () => splashWindow.show());
    splashWindow.on('closed', () => { splashWindow = null; });
}

function isWindowVisible(bounds) {
    const displays = screen.getAllDisplays();
    return displays.some(display => {
        const dBounds = display.workArea;
        return (
            bounds.x >= dBounds.x &&
            bounds.y >= dBounds.y &&
            bounds.x + bounds.width <= dBounds.x + dBounds.width &&
            bounds.y + bounds.height <= dBounds.y + dBounds.height
        );
    });
}

async function createMainWindow(initialConfig) {
    const theme = db.getConfig('theme') || 'dark';
    const volume = db.getConfig('global_volume');
    const background_image = db.getConfig('background_image') || null;
    const background_opacity = db.getConfig('background_opacity');
    const card_opacity = db.getConfig('card_opacity');
    const savedWidth = parseInt(db.getConfig('window_width'), 10);
    const savedHeight = parseInt(db.getConfig('window_height'), 10);
    const savedX = parseInt(db.getConfig('window_x'), 10);
    const savedY = parseInt(db.getConfig('window_y'), 10);
    const minWidth = 1200;
    const minHeight = 768;

    let windowOptions = {
        width: savedWidth || 1500,
        height: savedHeight || 940,
        minWidth: minWidth,
        minHeight: minHeight,
        frame: false,
        titleBarStyle: 'hidden',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            webviewTag: true
        },
        show: false,
        icon: path.join(__dirname, 'src/assets/icon.ico'),
        transparent: true,
        hasShadow: false
    };

    if (!isNaN(savedX) && !isNaN(savedY)) {
        if (isWindowVisible({ x: savedX, y: savedY, width: windowOptions.width, height: windowOptions.height })) {
            windowOptions.x = savedX;
            windowOptions.y = savedY;
        }
    }

    const versions = await si.versions('node, npm, git, docker, python, gcc, java, perl, go');
    const finalConfig = {
        ...initialConfig,
        dbSettings: {
            theme,
            globalVolume: volume ? parseFloat(volume) : 0.5,
            backgroundImage: background_image,
            backgroundOpacity: background_opacity ? parseFloat(background_opacity) : 1.0,
            cardOpacity: card_opacity ? parseFloat(card_opacity) : 0.7,
            versions: versions,
            electronVersion: process.versions.electron,
            nodeVersion: process.versions.node,
            chromeVersion: process.versions.chrome
        }
    };

    mainWindow = new BrowserWindow(windowOptions);

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const policy = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
            "worker-src 'self' blob:",
            "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
            "font-src 'self' https://cdnjs.cloudflare.com",
            "img-src 'self' data: blob: http: https:", // 允许加载 http 和 https 图片
            "connect-src 'self' http: https:",       // 允许连接 http 和 https
            "media-src 'self' blob: http: https:",     // 允许加载 http 和 https 媒体
            // "webview-src https:", // <-- **移除这一行**
            "upgrade-insecure-requests"
        ].join('; ');
        
        callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [policy] } });
    });

    if (networkSpeedInterval) clearInterval(networkSpeedInterval);
    networkSpeedInterval = setInterval(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            const now = Date.now();
            const timeDiff = (now - networkMonitor.lastTimestamp) / 1000;
            if (timeDiff > 0) {
                const speed = networkMonitor.currentBytes / timeDiff;
                mainWindow.webContents.send('network-speed-update', { speed });
                networkMonitor.currentBytes = 0;
                networkMonitor.lastTimestamp = now;
            }
        }
    }, 1000);

    const saveWindowState = () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        const bounds = mainWindow.getBounds();
        db.setConfig('window_width', bounds.width.toString());
        db.setConfig('window_height', bounds.height.toString());
        db.setConfig('window_x', bounds.x.toString());
        db.setConfig('window_y', bounds.y.toString());
    };
    const debouncedSave = () => { clearTimeout(windowStateChangeTimer); windowStateChangeTimer = setTimeout(saveWindowState, 500); };
    mainWindow.on('resize', debouncedSave);
    mainWindow.on('move', debouncedSave);
    nativeTheme.themeSource = theme;
    mainWindow.loadFile(path.join(__dirname, 'src/index.html'));
    mainWindow.once('ready-to-show', () => {
        mainWindow.webContents.send('initial-data', finalConfig);
        mainWindow.show();
        mainWindow.focus();
        if (splashWindow) splashWindow.close();
    });
    mainWindow.on('closed', () => { mainWindow = null; });
}

app.on('ready', async () => {
    migrateAndInitializeDatabase();
    createSplashWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') { if (networkSpeedInterval) clearInterval(networkSpeedInterval); db.close(); app.quit(); } });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createSplashWindow(); });

ipcMain.on('initialization-complete', (event, result) => {
    if (result.isOffline) {
        createMainWindow({ isOffline: true, error: result.error });
    } else {
        createMainWindow(result.config);
    }
});

ipcMain.handle('run-initialization', async () => {
    let totalProgress = 0;
    const sendProgress = (status, increment) => {
        totalProgress += increment;
        if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.webContents.send('init-progress', { status, progress: Math.min(totalProgress, 100) });
        }
    };
    
    let combinedConfig = {};
    let isOffline = false;
    let offlineError = '';

    sendProgress('启动核心服务...', 10);
    await new Promise(r => setTimeout(r, 200));
    sendProgress('检查本地数据...', 15);
    await new Promise(r => setTimeout(r, 500));
    
    try {
        sendProgress('检查网络连接...', 15);
        await checkNetworkStatus();
        sendProgress('网络连接正常', 5);
        sendProgress('获取远程配置...', 25);
        combinedConfig = await loadRemoteConfigs();
        sendProgress('远程配置加载完毕', 10);
    } catch (error) {
        console.warn('进入离线模式:', error.message);
        isOffline = true;
        offlineError = error.message;
        sendProgress('网络不可用，进入离线模式...', 40);
    }
    
    sendProgress('准备就绪...', 20);
    await new Promise(r => setTimeout(r, 200));
    
    return {
        success: true,
        config: combinedConfig,
        isOffline: isOffline,
        error: offlineError
    };
});


async function checkNetworkStatus() {
    return new Promise((resolve, reject) => {
        https.get('https://www.baidu.com', { timeout: 3000 }, (res) => { res.resume(); resolve(true); }).on('error', (err) => reject(new Error('网络连接不可用')));
    });
}

async function loadRemoteConfigs() {
    const mediaTypesUrl = 'https://update.ymhut.cn/media-types.json';
    const updateInfoUrl = `https://update.ymhut.cn/update-info.json?r=${Date.now()}`;
    // [新增] 工具状态配置文件的 URL
    const toolStatusUrl = `https://update.ymhut.cn/tool-status.json?r=${Date.now()}`;

    const fetchJsonAndCountTraffic = (url) => new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) return reject(new Error(`请求失败，状态码: ${res.statusCode}`));
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const trafficBytes = Buffer.byteLength(data, 'utf8');
                    db.addTraffic(trafficBytes);
                    db.logAction({ timestamp: new Date().toISOString(), action: `加载远程配置 ${path.basename(url)}，计入流量: ${trafficBytes} Bytes`, category: 'system' });
                    resolve(JSON.parse(data));
                } catch (e) { reject(new Error('解析JSON配置失败')); }
            });
        }).on('error', (err) => reject(err));
    });
    
    try {
        // [修改] 使用 Promise.all 并行获取三个文件
        const [mediaTypes, updateInfo, toolStatus] = await Promise.all([
            fetchJsonAndCountTraffic(mediaTypesUrl), 
            fetchJsonAndCountTraffic(updateInfoUrl),
            fetchJsonAndCountTraffic(toolStatusUrl) // [新增]
        ]);
        
        // [修改] 将 toolStatus 合并到最终配置中，键为 "tool_status"
        return { ...mediaTypes, ...updateInfo, tool_status: toolStatus };
    } catch (error) { 
        throw new Error(`获取远程配置失败: ${error.message}`); 
    }
}

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => { if (mainWindow?.isMaximized()) mainWindow.unmaximize(); else mainWindow?.maximize(); });
ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.on('relaunch-app', () => { app.relaunch(); app.quit(); });
ipcMain.on('report-traffic', (event, bytes) => { if (typeof bytes === 'number' && bytes > 0) networkMonitor.currentBytes += bytes; });
ipcMain.handle('log-action', (event, logData) => db.logAction(logData));
ipcMain.handle('get-logs', (event, filterDate) => db.getLogs(filterDate));
ipcMain.handle('clear-logs', () => db.clearLogs());
ipcMain.handle('get-traffic-stats', () => db.getTrafficStats());
ipcMain.handle('get-traffic-history', () => db.getTrafficHistory());
ipcMain.handle('add-traffic', (event, bytes) => db.addTraffic(bytes));
ipcMain.handle('get-app-version', () => APP_VERSION);
ipcMain.handle('check-updates', async () => {
    const updateURL = `https://update.ymhut.cn/update-info.json?r=${Date.now()}`;
    return new Promise((resolve, reject) => {
        https.get(updateURL, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const info = JSON.parse(data);
                    const hasUpdate = info.app_version > APP_VERSION;
                    resolve({ hasUpdate, currentVersion: APP_VERSION, remoteVersion: info.app_version, updateNotes: info.update_notes, downloadUrl: info.download_url });
                } catch (e) { reject(new Error('解析更新信息失败')); }
            });
        }).on('error', (e) => reject(new Error('获取更新信息失败: ' + e.message)));
    });
});
ipcMain.handle('download-update', async (event, url) => {
    const filename = path.basename(new URL(url).pathname);
    const downloadPath = path.join(app.getPath('downloads'), filename);
    const writer = require('fs').createWriteStream(downloadPath);
    return new Promise((resolve, reject) => {
        const request = https.get(url, (response) => {
            if (response.statusCode !== 200) return reject({ success: false, error: `服务器文件错误: 状态码 ${response.statusCode}` });
            const totalBytes = parseInt(response.headers['content-length'], 10);
            if (totalBytes < 1024 * 1024) { request.abort(); return reject({ success: false, error: '服务器文件错误 (文件过小)' }); }
            let receivedBytes = 0; let lastTime = Date.now(); let lastReceivedBytes = 0;
            downloadController = { abort: () => request.abort() };
            response.on('data', (chunk) => {
                networkMonitor.currentBytes += chunk.length;
                receivedBytes += chunk.length;
                const now = Date.now();
                if (now - lastTime > 500) {
                    const speed = (receivedBytes - lastReceivedBytes) / ((now - lastTime) / 1000);
                    mainWindow.webContents.send('download-progress', { total: totalBytes, received: receivedBytes, percent: (receivedBytes / totalBytes) * 100, speed: speed });
                    lastTime = now; lastReceivedBytes = receivedBytes;
                }
            });
            response.on('aborted', () => { downloadController = null; reject({ success: false, error: '已停止' }); });
            pipeline(response, writer, async (err) => {
                downloadController = null;
                if (err) reject({ success: false, error: err.message });
                else { await db.addTraffic(totalBytes); resolve({ success: true, path: downloadPath }); }
            });
        }).on('error', (err) => { downloadController = null; reject({ success: false, error: '网络状态异常' }); });
    });
});
ipcMain.handle('cancel-download', () => { if (downloadController) { downloadController.abort(); downloadController = null; return { success: true }; } return { success: false }; });
ipcMain.handle('open-file', (event, filePath) => shell.openPath(filePath));
ipcMain.handle('open-external-link', (event, url) => shell.openExternal(url));
ipcMain.handle('show-item-in-folder', (event, filePath) => shell.showItemInFolder(filePath));
ipcMain.handle('set-theme', async (event, theme) => { nativeTheme.themeSource = theme; return await db.setConfig('theme', theme); });
ipcMain.handle('set-global-volume', async (event, volume) => await db.setConfig('global_volume', volume.toString()));
ipcMain.handle('select-background-image', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { title: '选择背景图片', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'png', 'webp'] }] });
    if (!canceled && filePaths.length > 0) {
        try {
            const filePath = filePaths[0];
            const dataUrl = `data:image/${path.extname(filePath).substring(1)};base64,${await fs.promises.readFile(filePath, 'base64')}`;
            await db.setConfig('background_image', dataUrl);
            return { success: true, path: dataUrl };
        } catch (error) { return { success: false, error: error.message }; }
    }
    return { success: false, error: '用户取消选择' };
});
ipcMain.handle('clear-background-image', async () => await db.setConfig('background_image', ''));
ipcMain.handle('set-background-opacity', async (event, opacity) => await db.setConfig('background_opacity', opacity.toString()));
ipcMain.handle('set-card-opacity', async (event, opacity) => await db.setConfig('card_opacity', opacity.toString()));
ipcMain.handle('save-media', async (event, { buffer, defaultPath }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, { title: '保存媒体文件', defaultPath });
    if (!canceled && filePath) {
        try {
            const dataBuffer = Buffer.from(buffer);
            await fs.promises.writeFile(filePath, dataBuffer);
            await db.addTraffic(dataBuffer.length);
            return { success: true, path: filePath };
        } catch (error) { return { success: false, error: error.message }; }
    }
    return { success: false, error: '用户取消保存' };
});
ipcMain.on('launch-system-tool', (event, command) => {
    if (command.startsWith('ms-')) {
        shell.openExternal(command);
    } else {
        const commandToExecute = process.platform === 'win32' ? `start "" "${command}"` : command;
        exec(commandToExecute, (error) => {
            if (error) {
                console.error(`执行命令失败: ${command}`, error);
                dialog.showErrorBox('操作失败', `无法启动系统工具: ${command}\n\n错误信息: ${error.message}`);
            }
        });
    }
});
ipcMain.handle('show-confirmation-dialog', async (event, options) => {
    const result = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['确定', '取消'],
        defaultId: 0,
        cancelId: 1,
        title: options.title || '确认',
        message: options.message || '您确定要执行此操作吗？',
        detail: options.detail || ''
    });
    return result;
});

function checkIsAdmin() {
    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            exec('net session', (err) => {
                resolve(err === null);
            });
        } else {
            resolve(process.getuid && process.getuid() === 0);
        }
    });
}
ipcMain.handle('check-and-relaunch-as-admin', async () => {
    const isAdmin = await checkIsAdmin();
    if (isAdmin) {
        return { isAdmin: true };
    }
    const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        buttons: ['以管理员身份重启', '取消'],
        title: '需要管理员权限',
        message: '“系统工具”中的部分功能需要管理员权限才能正常运行。',
        detail: '为了使用所有功能，建议您授权应用以管理员身份重启。'
    });
    if (response === 0) {
        const sudoOptions = { name: 'YMhut Box' };
        let commandToExec;
        if (app.isPackaged) {
            commandToExec = `"${process.execPath}"`;
        } else {
            commandToExec = `"${process.execPath}" "${app.getAppPath()}"`;
        }
        const finalCommand = process.platform === 'win32' ? `start "" ${commandToExec}` : commandToExec;
        sudo.exec(finalCommand, sudoOptions, (error) => {
            if (error) {
                dialog.showErrorBox('授权失败', '您取消了管理员授权，应用将继续以普通模式运行。');
            } else {
                app.quit();
            }
        });
        return { isAdmin: false, relaunching: true };
    }
    return { isAdmin: false, relaunching: false };
});
const safePromise = (promise) => {
    if (!promise || typeof promise.then !== 'function') {
        console.error("一个无效的非Promise值被传递给了safePromise:", promise);
        return Promise.resolve(null);
    }
    return promise.catch(err => {
        console.error("获取某项系统信息时出错 (非致命):", err.message);
        return null;
    });
};

function getWmicProperties(wmiClass, properties) {
    return new Promise((resolve) => {
        if (process.platform !== 'win32') {
            return resolve(null);
        }
        const command = `wmic ${wmiClass} get ${properties.join(',')} /format:csv`;
        exec(command, { encoding: 'buffer' }, (err, stdout) => {
            if (err) return resolve(null);
            try {
                const decoded = iconv.decode(stdout, 'cp936');
                const lines = decoded.trim().split('\r\n').filter(Boolean);
                if (lines.length < 2) return resolve(null);
                const headers = lines[0].split(',').map(h => h.trim());
                const results = lines.slice(1).map(line => {
                    const values = line.split(',');
                    const obj = {};
                    properties.forEach(prop => {
                        const index = headers.findIndex(h => h.toLowerCase() === prop.toLowerCase());
                        if (index > 0) {
                            obj[prop] = values[index]?.trim() || '';
                        }
                    });
                    return obj;
                });
                resolve(results);
            } catch {
                resolve(null);
            }
        });
    });
}
ipcMain.handle('get-system-info', async () => {
    try {
        let timeData = null;
        try {
            timeData = si.time();
        } catch (e) {
            console.error("获取同步时间信息失败:", e);
        }
        const [
            osData, cpuData, memData, memLayoutData, networkData,
            systemData, baseboardData, biosData, diskData,
            userData, versionsData, processesData, chassisData, graphicsData,

            wmicOs, wmicComputerSystem, wmicBaseboard, wmicCpu, wmicVideoControllers
        ] = await Promise.all([
            safePromise(si.osInfo()), safePromise(si.cpu()), safePromise(si.mem()), safePromise(si.memLayout()), safePromise(si.networkInterfaces()),
            safePromise(si.system()), safePromise(si.baseboard()), safePromise(si.bios()), safePromise(si.diskLayout()),
            safePromise(si.users()), safePromise(si.versions('node, npm, git, docker, python, gcc, java, perl, go')), safePromise(si.processes()),
            safePromise(si.chassis()), safePromise(si.graphics()),

            safePromise(getWmicProperties('os', ['Caption', 'Version', 'OSArchitecture', 'WindowsDirectory', 'SystemDirectory'])),
            safePromise(getWmicProperties('computersystem', ['Manufacturer', 'Model', 'Name'])),
            safePromise(getWmicProperties('baseboard', ['Manufacturer', 'Product', 'Version'])),
            safePromise(getWmicProperties('cpu', ['Name', 'NumberOfCores', 'NumberOfLogicalProcessors', 'MaxClockSpeed'])),
            safePromise(getWmicProperties('path win32_videocontroller', ['Name', 'AdapterRAM']))
        ]);
        const displaysFromElectron = screen.getAllDisplays().map(display => ({
            id: display.id, resolution: `${display.size.width}x${display.size.height}`,
            scaleFactor: display.scaleFactor, colorDepth: display.colorDepth,
            isPrimary: display.bounds.x === 0 && display.bounds.y === 0
        }));
        const totalVirtualMem = (memData?.total || 0) + (memData?.swaptotal || 0);
        const freeVirtualMem = (memData?.available || 0) + (memData?.swapfree || 0);
        const osWmic = wmicOs?.[0] || {};
        const csWmic = wmicComputerSystem?.[0] || {};
        const bbWmic = wmicBaseboard?.[0] || {};
        const cpuWmic = wmicCpu?.[0] || {};
        return {
            osInfo: {
                ...(osData || {}),
                distro: osWmic.Caption || osData?.distro,
                release: osWmic.Version || osData?.release,
                arch: osWmic.OSArchitecture || osData?.arch,
                hostname: csWmic.Name || osData?.hostname,
                windowsDir: osWmic.WindowsDirectory || process.env.SystemRoot,
                systemDir: osWmic.SystemDirectory || (process.env.SystemRoot + '\\system32'),
                uefi: osData?.uefi
            },
            users: userData,
            time: {
                uptime: os.uptime(),
                timezone: timeData?.timezone,
                timezoneName: timeData?.timezoneName,
                locale: app.getLocale()
            },
            cpu: {
                ...(cpuData || {}),
                brand: cpuWmic.Name || cpuData?.brand,
                physicalCores: cpuWmic.NumberOfCores || cpuData?.physicalCores,
                cores: cpuWmic.NumberOfLogicalProcessors || cpuData?.cores,
                speed: cpuWmic.MaxClockSpeed ? (cpuWmic.MaxClockSpeed / 1000).toFixed(2) + ' GHz' : (cpuData?.speed || 0) + ' GHz',
            },
            mem: { ...memData, layout: memLayoutData, totalVirtual: totalVirtualMem, freeVirtual: freeVirtualMem },
            networkInterfaces: networkData,
            system: {
                ...(systemData || {}),
                manufacturer: csWmic.Manufacturer || systemData?.manufacturer,
                model: csWmic.Model || systemData?.model,
                platformRole: chassisData?.type || 'N/A'
            },
            baseboard: {
                ...(baseboardData || {}),
                manufacturer: bbWmic.Manufacturer || baseboardData?.manufacturer,
                model: bbWmic.Product || baseboardData?.model,
                version: bbWmic.Version || baseboardData?.version
            },
            bios: biosData,
            diskLayout: diskData,
            graphics: {
                controllers: wmicVideoControllers?.map((vc, i) => ({
                    model: vc.Name || graphicsData?.controllers[i]?.model,
                    vram: vc.AdapterRAM ? vc.AdapterRAM / (1024 * 1024) : graphicsData?.controllers[i]?.vram,
                    vendor: graphicsData?.controllers[i]?.vendor
                })) || graphicsData?.controllers,
                displays: graphicsData?.displays
            },
            displays: displaysFromElectron,
            versions: {
                app: app.getVersion(), electron: process.versions.electron,
                node: versionsData?.node || process.versions.node,
                npm: versionsData?.npm, v8: process.versions.v8,
                chrome: process.versions.chrome
            },
            processes: processesData ? {
                all: processesData.all,
                running: processesData.running,
                blocked: processesData.blocked,
                sleeping: processesData.sleeping,
                list: (processesData.list || []).map(p => ({
                    pid: p.pid, name: p.name,
                    cpu: p.cpu.toFixed(2), mem: p.mem.toFixed(2)
                })).sort((a, b) => b.cpu - a.cpu)
            } : null
        };
    } catch (e) {
        console.error('获取系统信息时发生严重错误:', e);
        throw new Error('无法获取详细系统信息');
    }
});
ipcMain.handle('get-gpu-stats', async () => {
    try {
        const graphicsData = await si.graphics();
        if (graphicsData && graphicsData.controllers) {
            return graphicsData.controllers.map(gpu => ({
                model: gpu.model,
                vendor: gpu.vendor,
                load: gpu.utilizationGpu,
                temperature: gpu.temperatureGpu
            }));
        }
        return [];
    } catch (e) {
        console.error("获取 GPU 信息失败:", e);
        return [];
    }
});
ipcMain.handle('get-memory-update', async () => {
    const formatBytes = (bytes) => (bytes / (1024 ** 3)).toFixed(2);
    try {
        const mem = await si.mem();
        return {
            free: formatBytes(mem.available),
            swapfree: formatBytes(mem.swapfree),
            usagePercentage: ((mem.used / mem.total) * 100).toFixed(2)
        };
    } catch {
        const freeMem = os.freemem();
        const totalMem = os.totalmem();
        return {
            free: formatBytes(freeMem),
            swapfree: 'N/A',
            usagePercentage: (((totalMem - freeMem) / totalMem) * 100).toFixed(2)
        };
    }
});
ipcMain.handle('get-realtime-stats', () => {
    try {
        const currentUsage = process.cpuUsage(cpuUsage.prev);
        const timeDiff = process.hrtime(cpuUsage.prevTime);
        const elapsedTime = timeDiff[0] * 1e9 + timeDiff[1];
        cpuUsage.prev = process.cpuUsage();
        cpuUsage.prevTime = process.hrtime();
        if (elapsedTime === 0) return { cpu: '0.00', uptime: '00:00:00' };
        const totalUsage = (currentUsage.user + currentUsage.system) / 1000;
        const percentage = Math.min(100, (totalUsage / (elapsedTime / 1e6)) * 100);
        const uptimeSeconds = process.uptime();
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = Math.floor(uptimeSeconds % 60);
        const formattedUptime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        return { cpu: percentage.toFixed(2), uptime: formattedUptime };
    } catch (error) {
        console.error("获取实时状态失败 (非致命):", error);
        return { cpu: '0.00', uptime: '00:00:00' };
    }
});

function createAcknowledgementsWindow(theme) {
    if (acknowledgementsWindow) { acknowledgementsWindow.focus(); return; }
    const backgroundColor = theme === 'dark' ? '#1d1d1f' : '#ffffff';
    acknowledgementsWindow = new BrowserWindow({
        width: 400,
        height: 420,
        frame: false,
        resizable: false,
        show: false,
        transparent: false,
        backgroundColor: backgroundColor,
        hasShadow: true,
        skipTaskbar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
        }
    });
    acknowledgementsWindow.loadFile(path.join(__dirname, 'src/acknowledgements.html'), { query: { "theme": theme } });
    acknowledgementsWindow.once('ready-to-show', () => {
        acknowledgementsWindow.show();
    });
    acknowledgementsWindow.on('closed', () => {
        acknowledgementsWindow = null;
    });
}

// 帮助函数：从事件中获取窗口
function getWindowFromEvent(event) {
    return BrowserWindow.fromWebContents(event.sender);
}

// 通用的工具窗口创建函数
function createToolWindow(viewName, toolId, theme) {
    // 检查窗口是否已打开
    const windowKey = `${viewName}_${toolId || ''}`;
    if (toolWindows.has(windowKey)) {
        const existingWin = toolWindows.get(windowKey);
        if (existingWin) {
            existingWin.focus();
            return;
        }
    }

    let htmlFile = '';
    let windowOptions = {
        width: 1200, 
        height: 800,
        // parent: mainWindow, // <-- 设为主窗口的子窗口
        // modal: false, // <-- 非模态，允许操作主窗口
        frame: false, 
        show: false, 
        transparent: true, 
        hasShadow: false, 
        resizable: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            webviewTag: true,
            devTools: !app.isPackaged // 开发时允许调试
        }
    };

    // 根据 viewName 选择 HTML 文件和特定配置
    switch (viewName) {
        case 'view-browser':
            htmlFile = path.join(__dirname, 'src/views/view-browser.html');
            // 浏览器窗口可以有不同的默认大小
            windowOptions.width = 1366;
            windowOptions.height = 768;
            break;
            
        case 'view-tool':
            htmlFile = path.join(__dirname, 'src/views/view-tool.html');
            // 自定义工具窗口默认大小
            windowOptions.width = 1000;
            windowOptions.height = 700;
            break;

        default:
            console.error(`未知的视图名称: ${viewName}`);
            return;
    }

    if (!htmlFile) return;

    const newToolWin = new BrowserWindow(windowOptions);

    // 将 toolId 和 theme 作为 URL query 参数传递给窗口
    const urlQuery = new URLSearchParams({
        theme: theme,
        tool: toolId || ''
    });
    newToolWin.loadFile(htmlFile, { search: urlQuery.toString() });

    newToolWin.once('ready-to-show', () => { newToolWin.show(); });
    
    newToolWin.on('closed', () => {
        toolWindows.delete(windowKey);
    });
    
    toolWindows.set(windowKey, newToolWin);
}

ipcMain.on('open-acknowledgements-window', (event, theme) => { createAcknowledgementsWindow(theme); });
ipcMain.on('open-secret-window', (event, theme) => { 
    // "神秘档案馆" 现在只是 "view-browser" 视图的一个特例
    createToolWindow('view-browser', 'archive', theme); 
});
// 新增：处理来自 uiManager.js 的新请求
ipcMain.on('open-tool-window', (event, viewName, toolId, theme) => {
    createToolWindow(viewName, toolId, theme);
});
ipcMain.on('close-current-window', (event) => { const win = BrowserWindow.fromWebContents(event.sender); win?.close(); });

// 修改：使其能控制任何发送事件的窗口
ipcMain.on('secret-window-minimize', (event) => { 
    const win = getWindowFromEvent(event);
    win?.minimize(); 
});
ipcMain.on('secret-window-maximize', (event) => { 
    const win = getWindowFromEvent(event);
    if (win?.isMaximized()) { 
        win.unmaximize(); 
    } else { 
        win?.maximize(); 
    } 
});

ipcMain.handle('check-secret-access', async () => {
    const ipBanUntil = db.getConfig('secret_ip_ban_until');
    if (ipBanUntil && Date.now() < parseInt(ipBanUntil, 10)) {
        return { status: 'ip-banned', until: parseInt(ipBanUntil, 10) };
    }
    const publicIp = await getPublicIP();
    if (publicIp) {
        const banList = await fetchIpBanList();
        if (banList.includes(publicIp)) {
            const banDuration = 60 * 60 * 1000;
            const banEndTime = Date.now() + banDuration;
            db.setConfig('secret_ip_ban_until', banEndTime.toString());
            return { status: 'ip-banned', until: banEndTime };
        }
    }
    const lockoutUntil = db.getConfig('secret_code_lockout_until');
    if (lockoutUntil && Date.now() < parseInt(lockoutUntil, 10)) {
        return { status: 'locked', until: parseInt(lockoutUntil, 10) };
    }
    return { status: 'ok' };
});
ipcMain.handle('record-secret-failure', () => {
    let attempts = parseInt(db.getConfig('secret_code_attempts') || '0', 10);
    attempts++;
    const maxAttempts = 5;
    if (attempts >= maxAttempts) {
        const lockoutDuration = 60 * 60 * 1000;
        const lockoutEndTime = Date.now() + lockoutDuration;
        db.setConfig('secret_code_lockout_until', lockoutEndTime.toString());
        db.setConfig('secret_code_attempts', '0');
        return { isLocked: true, attemptsLeft: 0, lockoutUntil: lockoutEndTime };
    } else {
        db.setConfig('secret_code_attempts', attempts.toString());
        return { isLocked: false, attemptsLeft: maxAttempts - attempts };
    }
});
ipcMain.handle('reset-secret-attempts', () => {
    db.setConfig('secret_code_attempts', '0');
    db.setConfig('secret_code_lockout_until', '0');
    db.setConfig('secret_ip_ban_until', '0');
});

// 新增：处理来自 webview 的新窗口请求
ipcMain.on('request-new-window', (event, url, options) => {
    console.log(`Received request to open new window: ${url}`);

    // 获取触发事件的窗口 (通常是我们的浏览器工具窗口)
    const openerWindow = BrowserWindow.fromWebContents(event.sender);

    // 基础窗口选项
    const windowOptions = {
        width: options.width || 1024, // 使用建议的宽度，或默认值
        height: options.height || 768, // 使用建议的高度，或默认值
        parent: openerWindow || mainWindow, // 设置父窗口，使其行为更像弹窗
        // modal: false, // 弹窗通常不是模态的
        frame: true, // 弹窗通常需要标准框架以便用户控制
        autoHideMenuBar: true, // **隐藏菜单栏**
        // menuBarVisible: false, // 另一种隐藏菜单栏的方式
        icon: nativeImage.createFromPath(APP_ICON_PATH), // **设置图标**
        webPreferences: {
            // 弹窗的 webPreferences - 保持默认安全设置
            contextIsolation: true,
            // preload: path.join(__dirname, 'preload_popup.js'), // 可以为弹窗指定不同的 preload
            sandbox: false, // 根据需要设置 sandbox
            // webSecurity: true, // 保持 webSecurity 开启
            nodeIntegration: false, // 禁用 Node.js 集成
            webviewTag: false, // 弹窗内部通常不需要再嵌入 webview
            devTools: !app.isPackaged // 开发模式下允许打开开发者工具
        }
    };

    // 如果原始窗口设置了 x, y，尝试在附近打开
    if (options.x && options.y && openerWindow) {
        const openerBounds = openerWindow.getBounds();
        windowOptions.x = openerBounds.x + options.x;
        windowOptions.y = openerBounds.y + options.y;
    }

    const newPopupWindow = new BrowserWindow(windowOptions);

    // 加载 URL
    newPopupWindow.loadURL(url);

    // 可选：如果弹窗需要与其打开者通信，可以在这里设置 IPC 通道
    // newPopupWindow.webContents.on('did-finish-load', () => {
    //     newPopupWindow.webContents.send('opener-info', openerWindow.webContents.id);
    // });

    // 阻止窗口打开新窗口 (如果弹窗内部尝试 window.open) - 可选
    newPopupWindow.webContents.setWindowOpenHandler(({ url: popupUrl }) => {
         console.warn(`Blocked popup attempting to open: ${popupUrl}`);
         shell.openExternal(popupUrl); // 或者在外部浏览器打开
         return { action: 'deny' };
     });

    // 在关闭时清理引用 (如果需要管理这些弹窗的话)
    // newPopupWindow.on('closed', () => { /* ... */ });
});