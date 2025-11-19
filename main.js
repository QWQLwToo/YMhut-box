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
// [修复 2] 引入 Worker 线程支持
const { Worker } = require('worker_threads');

// --- 国际化(i18n)配置 ---
// 默认中文语言包 (后备)
const defaultLanguagePack = {
    "comment": "Chinese Fallback Pack",
    "nav.home": "主页",
    "nav.toolbox": "工具箱",
    "nav.logs": "日志",
    "nav.settings": "设置",
    "home.greeting.morning": "早上好, 新的一天元气满满",
    "home.greeting.noon": "中午好, 午休时间到了",
    "home.greeting.afternoon": "下午好, 继续努力吧",
    "home.greeting.evening": "晚上好, 放松一下吧",
    "home.greeting.night": "凌晨了, 注意休息哦",
    "home.welcome": "欢迎使用 YMhut Box, 愿你拥有美好的一天。",
    "home.announcement": "公告",
    "home.announcement.failed": "公告加载失败...",
    "home.announcement.viewFull": "查看完整公告",
    "home.search.placeholder": "智能搜索：输入查询内容...",
    "home.search.button": "搜索",
    "home.search.disabled": "智能搜索工具当前不可用",
    "home.search.results.stats": "找到约 {count} 条结果 (耗时 {time}ms)",
    "home.search.results.viewFull": "查看完整结果 (含高级选项)",
    "home.search.results.empty.title": "未找到关于 \"{query}\" 的结果",
    "home.search.results.empty.sub": "请尝试更换关键词。",
    "home.search.failed.title": "搜索失败",
    "home.updates": "更新日志",
    "home.updates.close": "关闭",
    "home.updates.modal.title": "完整公告",
    "tool.smartSearch.name": "智能搜索",
    "tool.smartSearch.desc": "AI 聚合搜索，获取高质量结果",
    "common.loading": "加载中...",
    "common.search": "搜索",
    "common.backToToolbox": "返回工具箱",
    "common.options": "高级选项",
    "common.error": "错误",
    "common.loading.tool": "正在初始化工具模块...",
    "common.notification.title.success": "成功",
    "common.notification.title.error": "错误",
    "common.notification.title.info": "提示",
    "settings.appearance": "外观",
    "settings.updates": "更新管理",
    "settings.about": "关于",
    "settings.status.monitor": "状态监控",
    "settings.status.cpu": "CPU",
    "settings.status.mem": "内存",
    "settings.status.gpu": "GPU",
    "settings.status.uptime": "运行时长",
    "settings.appearance.title": "外观设置",
    "settings.appearance.theme": "界面主题",
    "settings.appearance.language": "语言 (Language)",
    "settings.appearance.language.auto": "自动 (Auto)",
    "settings.appearance.language.zh-CN": "简体中文",
    "settings.appearance.language.en-US": "English",
    "settings.appearance.language.restartMsg": "语言设置将在重启后生效。",
    "settings.appearance.bg": "自定义背景",
    "settings.appearance.bg.select": "选择",
    "settings.appearance.bg.clear": "清除",
    "settings.appearance.bg.opacity": "背景透明度",
    "settings.appearance.card.opacity": "卡片透明度",
    "settings.traffic.title": "流量统计",
    "settings.traffic.total": "累计使用流量",
    "settings.traffic.chart.empty.title": "暂无历史流量数据",
    "settings.traffic.chart.empty.sub": "数据将从今天开始记录",
    "settings.update.title": "更新管理",
    "settings.update.checkBtn": "检查更新",
    "settings.update.checking": "正在检查...",
    "settings.update.checkDefault": "点击按钮检查新版本",
    "settings.about.title": "关于与软件环境",
    "settings.about.version": "当前版本",
    "settings.about.developer": "开发者",
    "settings.about.moreInfo": "更多信息与鸣谢",
    "settings.about.env.title": "已安装的开发环境"
};

// 全局变量
let languagePacks = {
    'zh-CN': defaultLanguagePack
};
let appConfig = {
    Settings: { Language: 'auto' },
    Paths: { LanguagePath: 'resources/lang' }
};

let db;

// 确定安装目录 (指向可执行文件所在的目录)
const installDir = app.isPackaged
    ? path.dirname(process.execPath)
    : __dirname;

function determineDataPath() {
    // 开发环境下，数据仍在项目 config 目录中
    if (!app.isPackaged) {
        const devDbDir = path.join(__dirname, 'config');
        if (!fs.existsSync(devDbDir)) fs.mkdirSync(devDbDir, { recursive: true });
        return path.join(devDbDir, 'app.db');
    }
    // 生产环境下，数据固定在 $INSTDIR\data 文件夹中
    const dataDir = path.join(installDir, 'data');
    if (!fs.existsSync(dataDir)) {
        try {
            fs.mkdirSync(dataDir, { recursive: true });
        } catch (error) {
            // 这个错误会在 checkWriteAccess 中被捕获
        }
    }
    return path.join(dataDir, 'app.db');
}

// 权限检查
async function checkWriteAccess() {
    if (!app.isPackaged) return true; // 开发模式下跳过
    
    const dataDir = path.join(installDir, 'data');
    const testFile = path.join(dataDir, `_writetest_${Date.now()}`);
    
    try {
        if (!fs.existsSync(dataDir)) {
             fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        return true;
    } catch (error) {
        console.error(`[权限错误] 无法写入安装目录: ${dataDir}`, error.message);
        dialog.showMessageBoxSync({
            type: 'error',
            title: '权限不足',
            message: `应用需要管理员权限才能在安装目录中写入数据 (例如数据库和日志)。\n\n请以管理员身份重新运行本应用。`,
        });
        await ipcMain.handle('check-and-relaunch-as-admin'); 
        app.quit();
        return false;
    }
}

// 数据库迁移逻辑
async function migrateAndInitializeDatabase() {
    const newDbPath = determineDataPath();
    const newDbDir = path.dirname(newDbPath);

    // 1. 检查新数据库是否已存在
    if (fs.existsSync(newDbPath)) {
        try {
            db = new AppDatabase(newDbPath);
            console.log(`数据库已在 ${newDbPath} 成功加载`);
            return;
        } catch (e) {
            console.error(`[致命] 无法加载数据库: ${e.message}`);
            dialog.showErrorBox('数据库错误', `无法加载数据库文件。\n${e.message}`);
            app.quit();
            return;
        }
    }

    // 2. 新数据库不存在，开始检查旧版数据库
    console.log('未找到新数据库，开始检查旧版数据库...');
    
    const oldAppDataPath = path.join(app.getPath('userData'), 'app.db');
    const oldWeirdPath = path.resolve(app.getPath('userData'), '..', 'ymhut-box', 'app.db');
    const oldInstallDir = app.isPackaged ? path.join(path.dirname(process.execPath), '..') : __dirname;
    const oldInstallPathDb = path.join(oldInstallDir, 'data', 'app.db');

    let migrationPath = null;

    if (fs.existsSync(oldAppDataPath)) {
        migrationPath = oldAppDataPath;
        console.log(`发现旧数据库 (AppData): ${migrationPath}`);
    } else if (fs.existsSync(oldWeirdPath)) {
        migrationPath = oldWeirdPath;
        console.log(`发现旧数据库 (Weird AppData): ${migrationPath}`);
    } else if (app.isPackaged && fs.existsSync(oldInstallPathDb)) {
        migrationPath = oldInstallPathDb;
        console.log(`发现旧数据库 (Old Install Dir): ${migrationPath}`);
    }

    // 3. 执行迁移
    if (migrationPath) {
        try {
            console.log(`正在迁移数据库从 ${migrationPath} 到 ${newDbPath}...`);
            fs.mkdirSync(newDbDir, { recursive: true });
            fs.copyFileSync(migrationPath, newDbPath);
            console.log('迁移成功。');
            
            dialog.showMessageBoxSync({
                type: 'info',
                title: '数据库迁移',
                message: `已将您的数据库文件迁移到新的应用数据目录。\n\n应用即将重启以应用更改。`
            });
            
            db?.close();
            app.relaunch();
            app.quit();
            return;

        } catch (e) {
            console.error(`[致命] 数据库迁移失败: ${e.message}`);
            dialog.showErrorBox('数据库迁移失败', `无法将旧数据库复制到新位置。\n\n错误: ${e.message}\n\n请尝试手动复制文件:\n从: ${migrationPath}\n到: ${newDbPath}`);
            app.quit();
            return;
        }
    }

    // 4. 全新安装
    console.log('未找到旧数据库。将在新位置创建全新数据库。');
    try {
        fs.mkdirSync(newDbDir, { recursive: true });
        db = new AppDatabase(newDbPath);
        console.log(`全新数据库已在 ${newDbPath} 创建`);
    } catch (e) {
        console.error(`[致命] 无法创建新数据库: ${e.message}`);
        dialog.showErrorBox('数据库创建失败', `无法在应用目录中创建数据库。\n${e.message}`);
        app.quit();
    }
}

// 加载配置和语言
function loadConfigAndLanguage() {
    const configPath = path.join(installDir, 'config.ini');
    try {
        if (fs.existsSync(configPath)) {
            appConfig = ini.parse(fs.readFileSync(configPath, 'utf-8'));
        } else {
            console.warn('config.ini 未找到，将使用默认配置。');
        }
    } catch (e) {
        console.error('加载 config.ini 失败:', e);
    }
    
    const langPath = appConfig.Paths?.LanguagePath || 'resources/lang';
    const langDir = path.join(installDir, langPath);
    
    try {
        if (fs.existsSync(langDir)) {
            const langFiles = fs.readdirSync(langDir).filter(f => f.endsWith('.json'));
            for (const file of langFiles) {
                const langKey = file.replace('.json', '');
                if (langKey === 'zh-CN') continue;
                const filePath = path.join(langDir, file);
                languagePacks[langKey] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                console.log(`已加载语言包: ${langKey}`);
            }
        } else {
            console.warn(`语言目录未找到: ${langDir}。将仅使用内置后备语言。`);
        }
    } catch (e) {
        console.error('加载语言目录失败:', e);
    }
}

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
        if (db) {
            db.logAction({
                timestamp: new Date().toISOString(),
                action: `主进程发生未捕获的错误: ${error.message}`,
                category: 'error'
            });
        }
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

    // 检查 config.ini 缓存
    let cachedVersions = {};
    const today = new Date().toISOString().split('T')[0];
    if (appConfig.Environment && appConfig.Environment.app_version && appConfig.Environment.last_checked_date === today) {
        console.log('从 config.ini 加载缓存的环境信息。');
        cachedVersions = appConfig.Environment;
    } else {
        if (appConfig.Environment && appConfig.Environment.app_version) {
            console.log('环境信息缓存已过期，正在重新检测...');
        } else {
            console.log('未找到环境缓存，正在检测并写入 config.ini...');
        }
        
        const detectedVersions = await si.versions('node, npm, git, docker, python, gcc, java, perl, go');
        cachedVersions = { ...detectedVersions };
        cachedVersions.app_version = APP_VERSION;
        cachedVersions.electron = process.versions.electron;
        cachedVersions.node = process.versions.node;
        cachedVersions.chromium = process.versions.chrome;
        cachedVersions.last_checked_date = today; 
        
        appConfig.Environment = cachedVersions;
        try {
            fs.writeFileSync(path.join(installDir, 'config.ini'), ini.stringify(appConfig));
            console.log('环境信息已缓存到 config.ini。');
        } catch (e) {
            console.error('缓存环境信息到 config.ini 失败:', e.message);
        }
    }

    const finalConfig = {
        ...initialConfig,
        dbSettings: {
            theme,
            globalVolume: volume ? parseFloat(volume) : 0.5,
            backgroundImage: background_image,
            backgroundOpacity: background_opacity ? parseFloat(background_opacity) : 1.0,
            cardOpacity: card_opacity ? parseFloat(card_opacity) : 0.7,
            versions: cachedVersions, 
            electronVersion: process.versions.electron,
            nodeVersion: process.versions.node,
            chromeVersion: process.versions.chrome,
            config_version: initialConfig.config_version
        }
    };

    mainWindow = new BrowserWindow(windowOptions);

    // 全局流量监控
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const policy = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
            "worker-src 'self' blob:",
            "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
            "font-src 'self' https://cdnjs.cloudflare.com",
            "img-src 'self' data: blob: http: https:",
            "connect-src 'self' http: https:",
            "media-src 'self' blob: http: https:",
            "frame-src 'self' http: https:",
            "upgrade-insecure-requests"
        ].join('; ');
        
        try {
            const headers = details.responseHeaders;
            const contentLength = headers['Content-Length'] || headers['content-length'];
            if (contentLength && contentLength.length > 0) {
                const bytes = parseInt(contentLength[0], 10);
                if (bytes > 0) {
                    db.addTraffic(bytes);
                    networkMonitor.currentBytes += bytes;
                }
            }
        } catch (e) {
            console.warn('流量统计失败:', e.message);
        }
        
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
    if (app.isPackaged) {
        const hasAccess = await checkWriteAccess();
        if (!hasAccess) return;
    }
    
    loadConfigAndLanguage();
    
    await migrateAndInitializeDatabase(); 

    // 版本升级检测
    const verCheck = db.checkAndRecordVersion(APP_VERSION);
    if (verCheck.isUpgrade) {
        const msg = `应用已更新: v${verCheck.oldVersion} -> v${APP_VERSION}`;
        console.log(msg);
        db.logAction({ timestamp: new Date().toISOString(), action: msg, category: 'update' });
    }

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

// 优化远程配置加载与离线模式
async function loadRemoteConfigs() {
    const urls = {
        media_types: 'https://update.ymhut.cn/media-types.json',
        update_info: `https://update.ymhut.cn/update-info.json?r=${Date.now()}`,
        tool_status: `https://update.ymhut.cn/tool-status.json?r=${Date.now()}`
    };

    // 定义不需要网络的工具 ID (白名单)
    const offlineCapableTools = [
        'system-tool', 'system-info', 'base64-converter', 
        'qr-code-generator', 'chinese-converter', 'profanity-check',
        'image-processor', 'archive-tool'
    ];

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
        // 1. 尝试联网获取
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
        
        // 2. 联网失败，读取缓存
        const cachedMedia = db.getRemoteConfig('media_types');
        const cachedUpdate = db.getRemoteConfig('update_info');
        const cachedStatus = db.getRemoteConfig('tool_status');

        if (cachedMedia && cachedUpdate && cachedStatus) {
            console.log('已加载本地缓存配置 (离线工具模式)');
            
            const modifiedStatus = { ...cachedStatus };
            for (const toolId in modifiedStatus) {
                if (!offlineCapableTools.includes(toolId) && !toolId.startsWith('comment')) {
                    modifiedStatus[toolId] = {
                        enabled: false,
                        message: "网络不可用，此在线工具已暂停服务 (离线模式)"
                    };
                }
            }
            
            db.logAction({ timestamp: new Date().toISOString(), action: `进入离线工具模式: ${error.message}`, category: 'system' });

            return { 
                ...cachedMedia, 
                ...cachedUpdate, 
                tool_status: modifiedStatus, 
                config_version: (cachedUpdate.last_updated || 'cached') + ' (Offline)',
                is_offline_mode: true 
            };
        }

        throw new Error(`无法连接网络且无本地缓存: ${error.message}`);
    }
}

ipcMain.handle('run-initialization', async () => {
    let totalProgress = 0;
    const sendProgress = (status, increment) => {
        totalProgress += increment;
        if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.webContents.send('init-progress', { status, progress: Math.min(totalProgress, 100) });
        }
    };
    
    let combinedConfig = {};
    let isFatalOffline = false;
    let errorMsg = '';

    sendProgress('启动核心服务...', 10);
    await new Promise(r => setTimeout(r, 200));
    sendProgress('检查本地数据...', 15);
    await new Promise(r => setTimeout(r, 500));
    
    try {
        sendProgress('同步配置数据...', 30);
        combinedConfig = await loadRemoteConfigs();
        
        if (combinedConfig.is_offline_mode) {
             sendProgress('网络受限，启用离线模式...', 20);
        } else {
             sendProgress('配置同步完成...', 20);
        }
    } catch (error) {
        console.error('致命错误:', error.message);
        isFatalOffline = true;
        errorMsg = error.message;
        sendProgress('初始化失败...', 40);
    }
    
    sendProgress('准备就绪...', 5);
    await new Promise(r => setTimeout(r, 200));
    
    return {
        success: true,
        config: combinedConfig,
        isOffline: isFatalOffline,
        error: errorMsg
    };
});

async function checkNetworkStatus() {
    return true; 
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
                else { 
                    resolve({ success: true, path: downloadPath }); 
                }
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
            return { success: true, path: filePath };
        } catch (error) { return { success: false, error: error.message }; }
    }
    return { success: false, error: '用户取消保存' };
});

ipcMain.handle('get-language-config', () => {
    let lang = appConfig.Settings?.Language || 'auto';
    if (lang === 'auto') {
        const locale = app.getLocale().split('-')[0];
        if (locale === 'en') {
            lang = 'en-US';
        } else {
            lang = 'zh-CN'; 
        }
    }
    
    return {
        current: lang,
        pack: languagePacks[lang] || defaultLanguagePack,
        fallback: defaultLanguagePack
    };
});

ipcMain.handle('save-language-config', (event, lang) => {
    try {
        const configPath = path.join(installDir, 'config.ini');
        appConfig.Settings.Language = lang;
        fs.writeFileSync(configPath, ini.stringify(appConfig));
        db.close(); 
        app.relaunch();
        app.quit();
        return { success: true };
    } catch (e) {
        console.error('保存 config.ini 失败:', e);
        return { success: false, error: e.message };
    }
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

// [修复 2] 压缩/解压 IPC 处理逻辑 (适配 Worker)
const compressionWorkerPath = path.join(__dirname, 'src/js/workers/compressionWorker.js');

ipcMain.handle('compress-files', (event, data) => {
    return new Promise((resolve, reject) => {
        dialog.showSaveDialog(mainWindow, {
            title: '保存压缩包',
            defaultPath: `archive_${Date.now()}.${data.format || 'zip'}`,
            filters: [{ name: 'Archive', extensions: [data.format || 'zip'] }]
        }).then(result => {
            if (result.canceled || !result.filePath) {
                return resolve({ success: false, error: '用户取消操作' });
            }
            const worker = new Worker(compressionWorkerPath);
            worker.on('message', (msg) => {
                if (msg.status === 'progress') mainWindow.webContents.send('archive-progress', msg);
                else if (msg.status === 'log') mainWindow.webContents.send('archive-log', msg.message);
                else if (msg.status === 'complete') { resolve({ success: true, path: msg.path }); worker.terminate(); }
                else if (msg.status === 'error') { resolve({ success: false, error: msg.error }); worker.terminate(); }
            });
            worker.on('error', (err) => { resolve({ success: false, error: err.message }); worker.terminate(); });
            worker.postMessage({ type: 'compress', data: { ...data, output: result.filePath } });
        });
    });
});

ipcMain.handle('decompress-file', (event, data) => {
    return new Promise((resolve, reject) => {
        dialog.showOpenDialog(mainWindow, {
            title: '选择解压目标文件夹',
            properties: ['openDirectory']
        }).then(result => {
            if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
                return resolve({ success: false, error: '用户取消操作' });
            }
            const worker = new Worker(compressionWorkerPath);
            worker.on('message', (msg) => {
                if (msg.status === 'progress') mainWindow.webContents.send('archive-progress', msg);
                else if (msg.status === 'log') mainWindow.webContents.send('archive-log', msg.message);
                else if (msg.status === 'complete') { shell.openPath(msg.path); resolve({ success: true, path: msg.path }); worker.terminate(); }
                else if (msg.status === 'error') { resolve({ success: false, error: msg.error }); worker.terminate(); }
            });
            worker.on('error', (err) => { resolve({ success: false, error: err.message }); worker.terminate(); });
            worker.postMessage({ type: 'decompress', data: { ...data, targetDir: result.filePaths[0] } });
        });
    });
});

function createAcknowledgementsWindow(theme, versions) {
    if (acknowledgementsWindow) { acknowledgementsWindow.focus(); return; }
    const backgroundColor = theme === 'dark' ? '#1d1d1f' : '#ffffff';
    acknowledgementsWindow = new BrowserWindow({
        width: 400,
        height: 520, 
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
    
    const urlQuery = new URLSearchParams({
        "theme": theme,
        "versions": JSON.stringify(versions || {})
    });
    
    acknowledgementsWindow.loadFile(path.join(__dirname, 'src/acknowledgements.html'), { search: urlQuery.toString() });
    
    acknowledgementsWindow.once('ready-to-show', () => {
        acknowledgementsWindow.show();
    });
    acknowledgementsWindow.on('closed', () => {
        acknowledgementsWindow = null;
    });
}

function getWindowFromEvent(event) {
    return BrowserWindow.fromWebContents(event.sender);
}

function createToolWindow(viewName, toolId, theme) {
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
        frame: false, 
        show: false, 
        transparent: true, 
        hasShadow: false, 
        resizable: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            webviewTag: true,
            devTools: !app.isPackaged 
        }
    };

    switch (viewName) {
        case 'view-browser':
            htmlFile = path.join(__dirname, 'src/views/view-browser.html');
            windowOptions.width = 1366;
            windowOptions.height = 768;
            break;
            
        case 'view-tool':
            htmlFile = path.join(__dirname, 'src/views/view-tool.html');
            windowOptions.width = 1000;
            windowOptions.height = 700;
            break;

        default:
            console.error(`未知的视图名称: ${viewName}`);
            return;
    }

    if (!htmlFile) return;

    const newToolWin = new BrowserWindow(windowOptions);

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

ipcMain.on('open-acknowledgements-window', (event, theme, versions) => { 
    createAcknowledgementsWindow(theme, versions); 
});

ipcMain.on('open-secret-window', (event, theme) => { 
    createToolWindow('view-browser', 'archive', theme); 
});
ipcMain.on('open-tool-window', (event, viewName, toolId, theme) => {
    createToolWindow(viewName, toolId, theme);
});
ipcMain.on('close-current-window', (event) => { const win = BrowserWindow.fromWebContents(event.sender); win?.close(); });

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

ipcMain.on('request-new-window', (event, url, options) => {
    console.log(`Received request to open new window: ${url}`);

    const openerWindow = BrowserWindow.fromWebContents(event.sender);

    const windowOptions = {
        width: options.width || 1024, 
        height: options.height || 768, 
        parent: openerWindow || mainWindow, 
        frame: true, 
        autoHideMenuBar: true, 
        webPreferences: {
            contextIsolation: true,
            sandbox: false, 
            nodeIntegration: false, 
            webviewTag: false, 
            devTools: !app.isPackaged 
        }
    };

    if (options.x && options.y && openerWindow) {
        const openerBounds = openerWindow.getBounds();
        windowOptions.x = openerBounds.x + options.x;
        windowOptions.y = openerBounds.y + options.y;
    }

    const newPopupWindow = new BrowserWindow(windowOptions);

    newPopupWindow.loadURL(url);

    newPopupWindow.webContents.setWindowOpenHandler(({ url: popupUrl }) => {
         console.warn(`Blocked popup attempting to open: ${popupUrl}`);
         shell.openExternal(popupUrl); 
         return { action: 'deny' };
     });
});