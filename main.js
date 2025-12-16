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
const ini = require('ini');
const { Worker } = require('worker_threads');

// --- [核心路径定义] ---
const exeDir = path.dirname(process.execPath);
const rootDir = app.isPackaged ? path.resolve(exeDir, '..') : __dirname;
const langDir = app.isPackaged ? path.join(exeDir, 'lang') : path.join(__dirname, 'lang');
const langDirFallback = app.isPackaged ? path.join(exeDir, 'resources', 'lang') : path.join(__dirname, 'lang');

function determineDataPath() {
    if (!app.isPackaged) {
        return path.join(__dirname, 'config', 'app.db');
    }
    const dataDir = path.join(rootDir, 'data');
    if (!fs.existsSync(dataDir)) {
        try { fs.mkdirSync(dataDir, { recursive: true }); } catch (error) { }
    }
    return path.join(dataDir, 'app.db');
}

// --- 全局变量 ---
let currentLanguagePack = {};
let fallbackLanguagePack = {};
let appConfig = { Settings: { Language: 'auto' } };
let db;
let mainWindow;
let splashWindow;
let disclaimerWindow;
let downloadController = null;
let windowStateChangeTimer = null;
let acknowledgementsWindow = null;
let toolWindows = new Map();
const APP_VERSION = app.getVersion();

// 缓存启动配置
let pendingLaunchConfig = null;

const compressionWorkerPath = path.join(__dirname, 'src/js/workers/compressionWorker.js');

app.commandLine.appendSwitch('force-gpu-rasterization');
app.commandLine.appendSwitch('enable-features', 'WebView2');

// ==========================================
// --- [核心工具函数定义 (Moved to Top)] ---
// ==========================================

// 简单的 HTTP GET 请求
function simpleFetch(url) {
    return new Promise((resolve) => {
        const req = https.get(url, { timeout: 3000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.abort(); resolve(null); });
    });
}

// 加载远程配置 (前置定义，防止 undefined)
async function loadRemoteConfigs() {
    const urls = {
        media_types: 'https://update.ymhut.cn/media-types.json',
        update_info: `https://update.ymhut.cn/update-info.json?r=${Date.now()}`,
        tool_status: `https://update.ymhut.cn/tool-status.json?r=${Date.now()}`
    };
    const offlineCapableTools = ['system-tool', 'system-info', 'base64-converter', 'qr-code-generator', 'chinese-converter', 'profanity-check', 'image-processor', 'archive-tool'];

    const fetchAndCache = (key, url) => new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    db.saveRemoteConfig(key, json);
                    resolve(json);
                } catch (e) { reject(e); }
            });
        }).on('error', (err) => reject(err));
    });

    try {
        const [mediaTypes, updateInfo, toolStatus] = await Promise.all([
            fetchAndCache('media_types', urls.media_types),
            fetchAndCache('update_info', urls.update_info),
            fetchAndCache('tool_status', urls.tool_status)
        ]);
        const configVersion = updateInfo.last_updated || 'unknown';
        const oldConfigVersion = db.getConfig('config_version');
        if (oldConfigVersion !== configVersion) {
            db.setConfig('config_version', configVersion);
            db.logAction({ timestamp: new Date().toISOString(), action: `远程配置已更新: ${configVersion}`, category: 'system' });
        }
        return { ...mediaTypes, ...updateInfo, tool_status: toolStatus, config_version: configVersion, is_offline_mode: false };
    } catch (error) {
        console.warn(`联网获取配置失败 (${error.message})，尝试读取数据库缓存...`);
        const cachedMedia = db.getRemoteConfig('media_types');
        const cachedUpdate = db.getRemoteConfig('update_info');
        const cachedStatus = db.getRemoteConfig('tool_status');

        if (cachedMedia && cachedUpdate && cachedStatus) {
            console.log('已加载本地缓存配置 (离线工具模式)');
            const modifiedStatus = { ...cachedStatus };
            for (const toolId in modifiedStatus) {
                if (!offlineCapableTools.includes(toolId) && !toolId.startsWith('comment')) {
                    modifiedStatus[toolId] = { enabled: false, message: "网络不可用，此在线工具已暂停服务 (离线模式)" };
                }
            }
            db.logAction({ timestamp: new Date().toISOString(), action: `进入离线工具模式: ${error.message}`, category: 'system' });
            return { ...cachedMedia, ...cachedUpdate, tool_status: modifiedStatus, config_version: (cachedUpdate.last_updated || 'cached') + ' (Offline)', is_offline_mode: true };
        }
        throw new Error(`无法连接网络且无本地缓存: ${error.message}`);
    }
}

async function checkWriteAccess() {
    if (!app.isPackaged) return true;
    const dataDir = path.join(rootDir, 'data');
    const testFile = path.join(dataDir, `_writetest_${Date.now()}`);
    try {
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        return true;
    } catch (error) {
        dialog.showMessageBoxSync({ type: 'error', title: '权限不足', message: `应用需要管理员权限才能在安装目录中写入数据。` });
        await ipcMain.handle('check-and-relaunch-as-admin');
        app.quit();
        return false;
    }
}

async function checkAndDownloadLanguagePack() {
    let targetDir = langDir;
    let defaultLangFile = path.join(targetDir, 'zh-CN.json');
    if (!fs.existsSync(targetDir)) {
        if (fs.existsSync(langDirFallback)) targetDir = langDirFallback;
        else try { fs.mkdirSync(langDir, { recursive: true }); } catch (e) { }
    }
    if (fs.existsSync(path.join(targetDir, 'zh-CN.json'))) return true;

    const choice = dialog.showMessageBoxSync({ type: 'warning', title: '缺失核心文件', message: '检测到默认语言包丢失。', buttons: ['下载修复', '退出'], defaultId: 0, cancelId: 1 });
    if (choice === 1) { app.quit(); return false; }

    try {
        const downloadUrl = 'https://update.ymhut.cn/lang/zh-CN.json';
        const downloadTarget = path.join(langDir, 'zh-CN.json');
        await new Promise((resolve, reject) => {
            const file = fs.createWriteStream(downloadTarget);
            https.get(downloadUrl, (res) => {
                if (res.statusCode !== 200) { reject(new Error(res.statusCode)); return; }
                res.pipe(file); file.on('finish', () => file.close(resolve));
            }).on('error', (err) => { fs.unlink(downloadTarget, () => { }); reject(err); });
        });
        app.relaunch(); app.quit(); return false;
    } catch (error) { return false; }
}

function loadConfigAndLanguage() {
    try {
        const configPath = path.join(rootDir, 'config.ini');
        if (fs.existsSync(configPath)) appConfig = ini.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) { }
    let activeLangDir = langDir;
    if (!fs.existsSync(path.join(activeLangDir, 'zh-CN.json')) && fs.existsSync(path.join(langDirFallback, 'zh-CN.json'))) activeLangDir = langDirFallback;
    try { fallbackLanguagePack = JSON.parse(fs.readFileSync(path.join(activeLangDir, 'zh-CN.json'), 'utf-8')); } catch (e) { }
    let targetLang = appConfig.Settings?.Language || 'auto';
    if (targetLang === 'auto') targetLang = app.getLocale().split('-')[0] === 'zh' ? 'zh-CN' : 'en-US';
    if (targetLang === 'zh-CN') currentLanguagePack = fallbackLanguagePack;
    else {
        try { currentLanguagePack = JSON.parse(fs.readFileSync(path.join(activeLangDir, `${targetLang}.json`), 'utf-8')); } catch (e) { currentLanguagePack = fallbackLanguagePack; }
    }
}

async function migrateAndInitializeDatabase() {
    const newDbPath = determineDataPath();
    const newDbDir = path.dirname(newDbPath);
    if (fs.existsSync(newDbPath)) {
        try { db = new AppDatabase(newDbPath); return; } catch (e) { app.quit(); return; }
    }
    try { fs.mkdirSync(newDbDir, { recursive: true }); db = new AppDatabase(newDbPath); } catch (e) { app.quit(); }
}

async function checkAndLogReinstall() {
    const uninstallInfo = appConfig.UninstallInfo;
    if (uninstallInfo && uninstallInfo.Time) {
        try {
            const uninstallTime = new Date(uninstallInfo.Time);
            if (new Date() - uninstallTime < 86400000) db.logAction({ timestamp: new Date().toISOString(), action: `检测到快速重装/升级至 v${APP_VERSION}`, category: 'system' });
            delete appConfig.UninstallInfo;
            fs.writeFileSync(path.join(rootDir, 'config.ini'), ini.stringify(appConfig));
        } catch (e) { }
    }
}

let userPublicIp = null;
async function getPublicIP() {
    if (userPublicIp) return userPublicIp;
    const apis = ['https://api.ipify.org?format=json', 'https://ipinfo.io/json'];
    for (const apiUrl of apis) {
        try {
            const response = await new Promise((resolve, reject) => { https.get(apiUrl, { timeout: 3000 }, res => resolve(res)).on('error', reject); });
            if (response.statusCode === 200) {
                let data = ''; for await (const chunk of response) { data += chunk; }
                const jsonData = JSON.parse(data);
                if (jsonData.ip) { userPublicIp = jsonData.ip; return userPublicIp; }
            }
        } catch (e) { }
    }
    return null;
}

async function fetchIpBanList() {
    return new Promise((resolve) => {
        https.get(`https://update.ymhut.cn/ip-ban-list.json?r=${Date.now()}`, { timeout: 4000 }, (res) => {
            if (res.statusCode !== 200) return resolve([]);
            let data = ''; res.on('data', chunk => data += chunk);
            res.on('end', () => { try { const parsed = JSON.parse(data); resolve(Array.isArray(parsed.banned_ips) ? parsed.banned_ips : []); } catch (e) { resolve([]); } });
        }).on('error', () => resolve([]));
    });
}

let networkMonitor = { currentBytes: 0, lastTimestamp: Date.now() };
let networkSpeedInterval = null;
let cpuUsage = { prev: process.cpuUsage(), prevTime: process.hrtime() };

process.on('uncaughtException', (error, origin) => {
    try { if (db) db.logAction({ timestamp: new Date().toISOString(), action: `主进程错误: ${error.message}`, category: 'error' }); } catch (dbError) { }
});

// ==========================================
// --- [窗口管理] ---
// ==========================================

function createSplashWindow() {
    const themeFromConfig = db ? db.getConfig('theme') : 'dark';
    splashWindow = new BrowserWindow({
        width: 600, height: 300, frame: false, resizable: false, center: true, transparent: true, hasShadow: false, alwaysOnTop: true,
        backgroundColor: '#00000000', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
        show: false, skipTaskbar: true,
    });
    splashWindow.loadFile(path.join(__dirname, 'src/splash.html'), { query: { "theme": themeFromConfig } });
    splashWindow.on('ready-to-show', () => splashWindow.show());
    splashWindow.on('closed', () => { splashWindow = null; });
}

function createDisclaimerWindow() {
    const themeFromConfig = db ? db.getConfig('theme') : 'dark';
    disclaimerWindow = new BrowserWindow({
        width: 480, height: 600, frame: false, resizable: false, center: true, transparent: true, hasShadow: false,
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
        show: false
    });
    disclaimerWindow.loadFile(path.join(__dirname, 'src/disclaimer.html'), { query: { "theme": themeFromConfig } });
    disclaimerWindow.once('ready-to-show', () => {
        disclaimerWindow.show();
        if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    });
    disclaimerWindow.on('closed', () => { disclaimerWindow = null; });
}

function launchMainApp() {
    if (!pendingLaunchConfig) return;
    if (pendingLaunchConfig.isOffline) createMainWindow({ isOffline: true, error: pendingLaunchConfig.error });
    else createMainWindow(pendingLaunchConfig.config);
}

function isWindowVisible(bounds) {
    const displays = screen.getAllDisplays();
    return displays.some(display => {
        const dBounds = display.workArea;
        return (bounds.x >= dBounds.x && bounds.y >= dBounds.y && bounds.x + bounds.width <= dBounds.x + dBounds.width && bounds.y + bounds.height <= dBounds.y + dBounds.height);
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
    const customFontName = db.getConfig('custom_font_name') || '';
    const customFontPath = db.getConfig('custom_font_path') || '';

    let windowOptions = {
        width: savedWidth || 1500, height: savedHeight || 940, minWidth: 1200, minHeight: 768, frame: false, titleBarStyle: 'hidden',
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, webviewTag: true },
        show: false, icon: path.join(__dirname, 'src/assets/icon.ico'), transparent: true, hasShadow: false
    };

    if (!isNaN(savedX) && !isNaN(savedY)) {
        if (isWindowVisible({ x: savedX, y: savedY, width: windowOptions.width, height: windowOptions.height })) {
            windowOptions.x = savedX; windowOptions.y = savedY;
        }
    }

    let cachedVersions = {};
    const today = new Date().toISOString().split('T')[0];
    if (appConfig.Environment && appConfig.Environment.app_version && appConfig.Environment.last_checked_date === today) {
        cachedVersions = appConfig.Environment;
    } else {
        const detectedVersions = await si.versions('node, npm, git, docker, python, gcc, java, perl, go');
        cachedVersions = { ...detectedVersions, app_version: APP_VERSION, electron: process.versions.electron, node: process.versions.node, chromium: process.versions.chrome, last_checked_date: today };
        appConfig.Environment = cachedVersions;
        try { fs.writeFileSync(path.join(rootDir, 'config.ini'), ini.stringify(appConfig)); } catch (e) { }
    }

    const finalConfig = {
        ...initialConfig,
        dbSettings: {
            theme, globalVolume: volume ? parseFloat(volume) : 0.5, backgroundImage: background_image, backgroundOpacity: background_opacity ? parseFloat(background_opacity) : 1.0, cardOpacity: card_opacity ? parseFloat(card_opacity) : 0.7, customFontName, customFontPath, versions: cachedVersions, electronVersion: process.versions.electron, nodeVersion: process.versions.node, chromeVersion: process.versions.chrome, config_version: initialConfig.config_version
        }
    };

    mainWindow = new BrowserWindow(windowOptions);

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const policy = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
            "worker-src 'self' blob:",
            "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
            "font-src 'self' https://cdnjs.cloudflare.com https://s1.hdslb.com https://cdn.jsdelivr.net https://registry.npmmirror.com file: data:",
            "img-src 'self' data: blob: http: https:",
            "connect-src 'self' http: https:",
            "media-src 'self' blob: http: https:",
            "frame-src 'self' http: https:",
            "upgrade-insecure-requests"
        ].join('; ');

        try {
            const contentLength = details.responseHeaders['Content-Length'] || details.responseHeaders['content-length'];
            if (contentLength && contentLength.length > 0) {
                const bytes = parseInt(contentLength[0], 10);
                if (bytes > 0) { db.addTraffic(bytes); networkMonitor.currentBytes += bytes; }
            }
        } catch (e) { }

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
                networkMonitor.currentBytes = 0; networkMonitor.lastTimestamp = now;
            }
        }
    }, 1000);

    const saveWindowState = () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        const bounds = mainWindow.getBounds();
        db.setConfig('window_width', bounds.width.toString()); db.setConfig('window_height', bounds.height.toString());
        db.setConfig('window_x', bounds.x.toString()); db.setConfig('window_y', bounds.y.toString());
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

        // 确保其他窗口关闭，避免进程退出
        if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
        if (disclaimerWindow && !disclaimerWindow.isDestroyed()) disclaimerWindow.close();
    });
    mainWindow.on('closed', () => { mainWindow = null; });
}

app.on('ready', async () => {
    if (app.isPackaged) { if (!(await checkWriteAccess())) return; }
    if (!(await checkAndDownloadLanguagePack())) return;
    loadConfigAndLanguage();
    await migrateAndInitializeDatabase();
    await checkAndLogReinstall();
    const verCheck = db.checkAndRecordVersion(APP_VERSION);
    if (verCheck.isUpgrade) db.logAction({ timestamp: new Date().toISOString(), action: `应用已更新: v${verCheck.oldVersion} -> v${APP_VERSION}`, category: 'update' });
    createSplashWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') { if (networkSpeedInterval) clearInterval(networkSpeedInterval); db.close(); app.quit(); } });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createSplashWindow(); });

// ==========================================
// --- [IPC 通信处理] ---
// ==========================================

// 1. 初始化 (加载配置和天气)
ipcMain.handle('run-initialization', async () => {
    let totalProgress = 0;
    const updateStep = async (status, increment, minDuration = 500) => {
        totalProgress += increment;
        const targetProgress = Math.min(totalProgress, 99);
        if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.webContents.send('init-progress', { status, progress: targetProgress });
        }
        await new Promise(r => setTimeout(r, minDuration));
    };

    let combinedConfig = {};
    let isFatalOffline = false;
    let errorMsg = '';
    let initWeatherData = null;

    try {
        await updateStep('正在检测运行环境权限...', 10, 600);
        await updateStep('读取本地配置文件...', 15, 800);
        await updateStep('校验数据库与本地缓存...', 15, 800);

        const startTime = Date.now();
        // 调用前置定义的 loadRemoteConfigs
        combinedConfig = await loadRemoteConfigs();

        if (!combinedConfig.is_offline_mode) {
            const ipData = await simpleFetch('https://uapis.cn/api/v1/network/myip?source=commercial');
            if (ipData && ipData.code === 200 && ipData.city) {
                const weatherData = await simpleFetch(`https://api.suyanw.cn/api/weather.php?city=${encodeURIComponent(ipData.city)}&type=json`);
                if (weatherData) initWeatherData = { ip: ipData, weather: weatherData };
            }
        }

        const networkTime = Date.now() - startTime;
        if (networkTime < 1500) await new Promise(r => setTimeout(r, 1500 - networkTime));
        totalProgress = 70;

        if (combinedConfig.is_offline_mode) await updateStep('网络受限，正在切换离线策略...', 20, 1000);
        else await updateStep('解析气象卫星数据...', 20, 800);

    } catch (error) {
        isFatalOffline = true; errorMsg = error.message; await updateStep('初始化遇到问题...', 10, 1500);
    }
    await updateStep('正在构建 UI...', 5, 600);
    return { success: true, config: { ...combinedConfig, initWeatherData }, isOffline: isFatalOffline, error: errorMsg };
});

// 2. 初始化完成 -> 协议分流
ipcMain.on('initialization-complete', (event, result) => {
    pendingLaunchConfig = result;
    const dbAgreed = db.getConfig('user_agreement_accepted') === 'true';
    let iniAgreed = false;
    try {
        const configPath = path.join(rootDir, 'config.ini');
        if (fs.existsSync(configPath)) {
            const d = ini.parse(fs.readFileSync(configPath, 'utf-8'));
            if (d.Settings?.UserAgreementAccepted === 'true') iniAgreed = true;
        }
    } catch (e) { }

    if (dbAgreed || iniAgreed) launchMainApp();
    else createDisclaimerWindow();
});

// 3. 确认协议
ipcMain.handle('confirm-user-agreement', () => {
    try {
        if (db) {
            db.setConfig('user_agreement_accepted', 'true');
            db.logAction({ timestamp: new Date().toISOString(), action: '用户已同意免责声明', category: 'system' });
        }
        const configPath = path.join(rootDir, 'config.ini');
        let iniConfig = {};
        if (fs.existsSync(configPath)) { try { iniConfig = ini.parse(fs.readFileSync(configPath, 'utf-8')); } catch (e) { } }
        iniConfig.Settings = iniConfig.Settings || {};
        iniConfig.Settings.UserAgreementAccepted = 'true';
        try { fs.writeFileSync(configPath, ini.stringify(iniConfig)); } catch (e) { }

        launchMainApp();
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('check-user-agreement', () => {
    const dbValue = db ? db.getConfig('user_agreement_accepted') : 'false';
    const configPath = path.join(rootDir, 'config.ini');
    let iniValue = 'false';
    try {
        if (fs.existsSync(configPath)) {
            const iniData = ini.parse(fs.readFileSync(configPath, 'utf-8'));
            iniValue = iniData.Settings?.UserAgreementAccepted || 'false';
        }
    } catch (e) { }
    return (dbValue === 'true' || iniValue === 'true');
});

// ... (其余标准 IPC 处理器) ...
ipcMain.handle('get-language-config', () => {
    let lang = appConfig.Settings?.Language || 'auto';
    if (lang === 'auto') { const locale = app.getLocale().split('-')[0]; lang = locale === 'en' ? 'en-US' : 'zh-CN'; }
    return { current: lang, pack: currentLanguagePack, fallback: fallbackLanguagePack };
});
ipcMain.handle('save-language-config', (event, lang) => {
    try {
        const configPath = path.join(rootDir, 'config.ini');
        const currentConfig = ini.parse(fs.readFileSync(configPath, 'utf-8'));
        currentConfig.Settings = currentConfig.Settings || {}; currentConfig.Settings.Language = lang;
        fs.writeFileSync(configPath, ini.stringify(currentConfig));
        if (db) db.close(); setTimeout(() => { app.relaunch(); app.quit(); }, 1000);
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});
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
            let data = ''; res.on('data', chunk => data += chunk);
            res.on('end', () => { try { const info = JSON.parse(data); const hasUpdate = info.app_version > APP_VERSION; resolve({ hasUpdate, currentVersion: APP_VERSION, remoteVersion: info.app_version, updateNotes: info.update_notes, downloadUrl: info.download_url }); } catch (e) { reject(new Error('解析失败')); } });
        }).on('error', (e) => reject(new Error('获取失败: ' + e.message)));
    });
});
ipcMain.handle('download-update', async (event, url) => {
    const filename = path.basename(new URL(url).pathname);
    const downloadPath = path.join(app.getPath('downloads'), filename);
    const writer = require('fs').createWriteStream(downloadPath);
    return new Promise((resolve, reject) => {
        const request = https.get(url, (response) => {
            if (response.statusCode !== 200) return reject({ success: false, error: `Code ${response.statusCode}` });
            const totalBytes = parseInt(response.headers['content-length'], 10);
            let receivedBytes = 0; let lastTime = Date.now(); let lastReceivedBytes = 0;
            downloadController = { abort: () => request.abort() };
            response.on('data', (chunk) => {
                networkMonitor.currentBytes += chunk.length; receivedBytes += chunk.length;
                const now = Date.now();
                if (now - lastTime > 500) {
                    const speed = (receivedBytes - lastReceivedBytes) / ((now - lastTime) / 1000);
                    mainWindow.webContents.send('download-progress', { total: totalBytes, received: receivedBytes, percent: (receivedBytes / totalBytes) * 100, speed: speed });
                    lastTime = now; lastReceivedBytes = receivedBytes;
                }
            });
            response.on('aborted', () => { downloadController = null; reject({ success: false, error: 'Stop' }); });
            pipeline(response, writer, async (err) => { downloadController = null; if (err) reject({ success: false, error: err.message }); else resolve({ success: true, path: downloadPath }); });
        }).on('error', (err) => { downloadController = null; reject({ success: false, error: 'Network Error' }); });
    });
});
ipcMain.handle('cancel-download', () => { if (downloadController) { downloadController.abort(); downloadController = null; return { success: true }; } return { success: false }; });
ipcMain.handle('install-update', async (event, filePath) => { try { shell.openPath(filePath); setTimeout(() => app.quit(), 1500); return { success: true }; } catch (e) { return { success: false, error: e.message }; } });
ipcMain.handle('open-file', (event, filePath) => shell.openPath(filePath));
ipcMain.handle('open-external-link', (event, url) => shell.openExternal(url));
ipcMain.handle('show-item-in-folder', (event, filePath) => shell.showItemInFolder(filePath));
ipcMain.handle('save-media', async (event, { buffer, defaultPath, type, name, path: fPath }) => {
    if (type === 'config_font') { await db.setConfig('custom_font_name', name); await db.setConfig('custom_font_path', fPath); return { success: true }; }
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, { title: '保存', defaultPath });
    if (!canceled && filePath) { try { await fs.promises.writeFile(filePath, Buffer.from(buffer)); return { success: true, path: filePath }; } catch (error) { return { success: false, error: error.message }; } }
    return { success: false, error: 'Cancel' };
});
ipcMain.handle('set-theme', async (event, theme) => { nativeTheme.themeSource = theme; return await db.setConfig('theme', theme); });
ipcMain.handle('set-global-volume', async (event, volume) => await db.setConfig('global_volume', volume.toString()));
ipcMain.handle('select-background-image', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { title: '选择图片', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'png', 'webp'] }] });
    if (!canceled && filePaths.length > 0) {
        try {
            const filePath = filePaths[0]; const dataUrl = `data:image/${path.extname(filePath).substring(1)};base64,${await fs.promises.readFile(filePath, 'base64')}`;
            await db.setConfig('background_image', dataUrl); return { success: true, path: dataUrl };
        } catch (error) { return { success: false, error: error.message }; }
    } return { success: false, error: 'Cancel' };
});
ipcMain.handle('clear-background-image', async () => await db.setConfig('background_image', ''));
ipcMain.handle('set-background-opacity', async (event, opacity) => await db.setConfig('background_opacity', opacity.toString()));
ipcMain.handle('set-card-opacity', async (event, opacity) => await db.setConfig('card_opacity', opacity.toString()));
ipcMain.on('launch-system-tool', (event, command) => { const cmd = process.platform === 'win32' ? `start "" "${command}"` : command; exec(cmd, (error) => { if (error) dialog.showErrorBox('Fail', error.message); }); });
ipcMain.handle('show-confirmation-dialog', async (event, options) => { return await dialog.showMessageBox(mainWindow, { type: 'question', buttons: ['确定', '取消'], defaultId: 0, cancelId: 1, title: options.title, message: options.message, detail: options.detail }); });
ipcMain.handle('check-and-relaunch-as-admin', async () => {
    const isAdmin = await new Promise(r => process.platform === 'win32' ? exec('net session', err => r(!err)) : r(process.getuid && process.getuid() === 0));
    if (isAdmin) return { isAdmin: true };
    const { response } = await dialog.showMessageBox(mainWindow, { type: 'info', buttons: ['以管理员身份重启', '取消'], title: '需要权限', message: '部分功能需要管理员权限。' });
    if (response === 0) {
        const cmd = app.isPackaged ? `"${process.execPath}"` : `"${process.execPath}" "${app.getAppPath()}"`;
        sudo.exec(process.platform === 'win32' ? `start "" ${cmd}` : cmd, { name: 'YMhut Box' }, (err) => { if (err) dialog.showErrorBox('Fail', 'Cancel'); else app.quit(); });
        return { isAdmin: false, relaunching: true };
    }
    return { isAdmin: false, relaunching: false };
});
ipcMain.handle('get-system-info', async () => {
    try {
        let timeData = null; try { timeData = si.time(); } catch (e) { }
        const [osData, cpuData, memData, memLayoutData, networkData, systemData, baseboardData, biosData, diskData, userData, versionsData, processesData, chassisData, graphicsData] = await Promise.all([
            safePromise(si.osInfo()), safePromise(si.cpu()), safePromise(si.mem()), safePromise(si.memLayout()), safePromise(si.networkInterfaces()), safePromise(si.system()), safePromise(si.baseboard()), safePromise(si.bios()), safePromise(si.diskLayout()), safePromise(si.users()), safePromise(si.versions('node, npm, git, docker, python, gcc, java, perl, go')), safePromise(si.processes()), safePromise(si.chassis()), safePromise(si.graphics())
        ]);
        const displaysFromElectron = screen.getAllDisplays().map(display => ({ id: display.id, resolution: `${display.size.width}x${display.size.height}`, scaleFactor: display.scaleFactor, colorDepth: display.colorDepth, isPrimary: display.bounds.x === 0 && display.bounds.y === 0 }));
        return { osInfo: osData, users: userData, time: { uptime: os.uptime(), ...timeData, locale: app.getLocale() }, cpu: cpuData, mem: { ...memData, layout: memLayoutData }, networkInterfaces: networkData, system: { ...systemData, platformRole: chassisData?.type }, baseboard: baseboardData, bios: biosData, diskLayout: diskData, graphics: { ...graphicsData, displaysFromElectron }, versions: { app: app.getVersion(), electron: process.versions.electron, node: process.versions.node, ...versionsData }, processes: processesData };
    } catch (e) { console.error('Error:', e); throw new Error('Info Error'); }
});
ipcMain.handle('get-gpu-stats', async () => { try { const g = await si.graphics(); return g?.controllers?.map(c => ({ model: c.model, vendor: c.vendor, load: c.utilizationGpu, temperature: c.temperatureGpu })) || []; } catch { return []; } });
ipcMain.handle('get-memory-update', async () => { try { const m = await si.mem(); return { free: (m.available / 1024 ** 3).toFixed(2), swapfree: (m.swapfree / 1024 ** 3).toFixed(2), usagePercentage: ((m.used / m.total) * 100).toFixed(2) }; } catch { return { free: 0, swapfree: 0, usagePercentage: 0 }; } });
ipcMain.handle('get-realtime-stats', () => { try { const cur = process.cpuUsage(cpuUsage.prev), td = process.hrtime(cpuUsage.prevTime), el = td[0] * 1e9 + td[1]; cpuUsage.prev = process.cpuUsage(); cpuUsage.prevTime = process.hrtime(); if (el === 0) return { cpu: '0.00', uptime: '00:00:00' }; const pct = Math.min(100, ((cur.user + cur.system) / 1000 / (el / 1e6)) * 100), up = process.uptime(), h = Math.floor(up / 3600), m = Math.floor((up % 3600) / 60), s = Math.floor(up % 60); return { cpu: pct.toFixed(2), uptime: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` }; } catch { return { cpu: '0.00', uptime: '00:00:00' }; } });
ipcMain.handle('compress-files', (event, data) => new Promise((resolve) => {
    dialog.showSaveDialog(mainWindow, { title: 'Save Archive', defaultPath: `archive_${Date.now()}.${data.format}`, filters: [{ name: 'Archive', extensions: [data.format] }] }).then(res => {
        if (res.canceled || !res.filePath) return resolve({ success: false, error: 'Cancel' });
        const w = new Worker(compressionWorkerPath);
        w.on('message', (msg) => { if (msg.status === 'complete') { resolve({ success: true, path: msg.path }); w.terminate(); } else if (msg.status === 'error') { resolve({ success: false, error: msg.error }); w.terminate(); } });
        w.postMessage({ type: 'compress', data: { ...data, output: res.filePath } });
    });
}));
ipcMain.handle('decompress-file', (event, data) => new Promise((resolve) => {
    dialog.showOpenDialog(mainWindow, { title: 'Select Folder', properties: ['openDirectory'] }).then(res => {
        if (res.canceled || !res.filePaths.length) return resolve({ success: false, error: 'Cancel' });
        const w = new Worker(compressionWorkerPath);
        w.on('message', (msg) => { if (msg.status === 'complete') { shell.openPath(msg.path); resolve({ success: true, path: msg.path }); w.terminate(); } else if (msg.status === 'error') { resolve({ success: false, error: msg.error }); w.terminate(); } });
        w.postMessage({ type: 'decompress', data: { ...data, targetDir: res.filePaths[0] } });
    });
}));
function createToolWindow(viewName, toolId, theme) {
    const k = `${viewName}_${toolId}`; if (toolWindows.has(k)) { const w = toolWindows.get(k); if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); return; } }
    const w = new BrowserWindow({ width: 1200, height: 800, frame: false, show: false, transparent: true, hasShadow: false, resizable: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, webviewTag: true, devTools: !app.isPackaged } });
    const html = viewName === 'view-browser' ? 'src/views/view-browser.html' : 'src/views/view-tool.html';
    w.loadFile(path.join(__dirname, html), { search: new URLSearchParams({ theme, tool: toolId || '' }).toString() });
    w.once('ready-to-show', () => { w.show(); w.focus(); }); w.on('closed', () => toolWindows.delete(k)); toolWindows.set(k, w);
}
ipcMain.on('open-acknowledgements-window', (e, t, v) => { if (acknowledgementsWindow) { acknowledgementsWindow.focus(); return; } acknowledgementsWindow = new BrowserWindow({ width: 400, height: 520, frame: false, resizable: false, show: false, backgroundColor: t === 'dark' ? '#1d1d1f' : '#ffffff', hasShadow: true, skipTaskbar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } }); acknowledgementsWindow.loadFile(path.join(__dirname, 'src/acknowledgements.html'), { search: new URLSearchParams({ theme: t, versions: JSON.stringify(v || {}) }).toString() }); acknowledgementsWindow.once('ready-to-show', () => acknowledgementsWindow.show()); acknowledgementsWindow.on('closed', () => acknowledgementsWindow = null); });
ipcMain.on('open-secret-window', (e, t) => createToolWindow('view-browser', 'archive', t));
ipcMain.on('open-tool-window', (e, v, i, t) => createToolWindow(v, i, t));
ipcMain.on('close-current-window', (e) => BrowserWindow.fromWebContents(e.sender)?.close());
ipcMain.on('secret-window-minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.on('secret-window-maximize', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.isMaximized() ? w.unmaximize() : w.maximize(); });
const iconDir = path.join(rootDir, 'data', 'icons'); if (!fs.existsSync(iconDir)) try { fs.mkdirSync(iconDir, { recursive: true }); } catch (e) { }
const downloadFile = (url, dest) => new Promise((resolve, reject) => { const f = fs.createWriteStream(dest); https.get(url, r => { if (r.statusCode !== 200) reject(new Error(r.statusCode)); r.pipe(f); f.on('finish', () => f.close(resolve)); }).on('error', e => { fs.unlink(dest, () => { }); reject(e); }); });
ipcMain.handle('get-cached-icon', async (e, id, url) => { if (!url) return null; const ext = path.extname(url) || '.svg'; const p = path.join(iconDir, `${id}${ext}`); if (fs.existsSync(p) && fs.statSync(p).size > 0) return `file://${p.replace(/\\/g, '/')}`; try { await downloadFile(url, p); return `file://${p.replace(/\\/g, '/')}`; } catch (e) { return null; } });
const fontsDir = path.join(rootDir, 'data', 'fonts'); if (!fs.existsSync(fontsDir)) try { fs.mkdirSync(fontsDir, { recursive: true }); } catch (e) { }
ipcMain.handle('download-font', async (e, { fontName, fontUrl }) => { const u = new URL(fontUrl); const ext = path.extname(u.pathname) || '.woff2'; const p = path.join(fontsDir, `${fontName.replace(/[^a-zA-Z0-9_-]/g, '_')}${ext}`); if (fs.existsSync(p) && fs.statSync(p).size > 102400) return { success: true, path: `file://${p.replace(/\\/g, '/')}`, cached: true }; try { await downloadFile(fontUrl, p); return { success: true, path: `file://${p.replace(/\\/g, '/')}`, cached: false }; } catch (e) { return { success: false, error: e.message }; } });
ipcMain.handle('check-secret-access', async () => { const b = db.getConfig('secret_ip_ban_until'); if (b && Date.now() < parseInt(b)) return { status: 'ip-banned', until: parseInt(b) }; const ip = await getPublicIP(); if (ip && (await fetchIpBanList()).includes(ip)) { const t = Date.now() + 3600000; db.setConfig('secret_ip_ban_until', t.toString()); return { status: 'ip-banned', until: t }; } const l = db.getConfig('secret_code_lockout_until'); if (l && Date.now() < parseInt(l)) return { status: 'locked', until: parseInt(l) }; return { status: 'ok' }; });
ipcMain.handle('record-secret-failure', () => { let a = parseInt(db.getConfig('secret_code_attempts') || '0') + 1; if (a >= 5) { const t = Date.now() + 3600000; db.setConfig('secret_code_lockout_until', t.toString()); db.setConfig('secret_code_attempts', '0'); return { isLocked: true, attemptsLeft: 0, lockoutUntil: t }; } db.setConfig('secret_code_attempts', a.toString()); return { isLocked: false, attemptsLeft: 5 - a }; });
ipcMain.handle('reset-secret-attempts', () => { db.setConfig('secret_code_attempts', '0'); db.setConfig('secret_code_lockout_until', '0'); db.setConfig('secret_ip_ban_until', '0'); });
ipcMain.on('request-new-window', (e, u, o) => { const p = BrowserWindow.fromWebContents(e.sender); const w = new BrowserWindow({ width: o.width || 1024, height: o.height || 768, parent: p || mainWindow, frame: true, autoHideMenuBar: true, webPreferences: { contextIsolation: true, sandbox: false, webviewTag: false } }); w.loadURL(u); w.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; }); });