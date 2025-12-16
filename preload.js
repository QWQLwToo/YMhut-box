// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    runInitialization: () => ipcRenderer.invoke('run-initialization'),
    onInitProgress: (callback) => ipcRenderer.on('init-progress', (_event, value) => callback(value)),
    initializationComplete: (result) => ipcRenderer.send('initialization-complete', result),
    
    onInitialData: (callback) => ipcRenderer.on('initial-data', (_event, value) => callback(value)),

    // [新增] 字体下载进度监听
    onFontDownloadProgress: (callback) => ipcRenderer.on('font-download-progress', (_event, value) => callback(value)),
    getLanguageConfig: () => ipcRenderer.invoke('get-language-config'),
    saveLanguageConfig: (lang) => ipcRenderer.invoke('save-language-config', lang),
    requestAdminRelaunch: () => ipcRenderer.invoke('check-and-relaunch-as-admin'),

    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    maximizeWindow: () => ipcRenderer.send('window-maximize'),
    closeWindow: () => ipcRenderer.send('window-close'),
    relaunchApp: () => ipcRenderer.send('relaunch-app'),
    
    openAcknowledgementsWindow: (theme, versions) => ipcRenderer.send('open-acknowledgements-window', theme, versions),
    closeCurrentWindow: () => ipcRenderer.send('close-current-window'),
    
    openSecretWindow: (theme) => ipcRenderer.send('open-secret-window', theme),
    openToolWindow: (viewName, toolId, theme) => ipcRenderer.send('open-tool-window', viewName, toolId, theme),
    secretWindowMinimize: () => ipcRenderer.send('secret-window-minimize'),
    secretWindowMaximize: () => ipcRenderer.send('secret-window-maximize'),

    logAction: (logData) => ipcRenderer.invoke('log-action', logData),
    getLogs: (filterDate) => ipcRenderer.invoke('get-logs', filterDate),
    clearLogs: () => ipcRenderer.invoke('clear-logs'),
    getTrafficStats: () => ipcRenderer.invoke('get-traffic-stats'),
    addTraffic: (bytes) => ipcRenderer.invoke('add-traffic', bytes),
    reportTraffic: (bytes) => ipcRenderer.send('report-traffic', bytes),

    getAppVersion: () => ipcRenderer.invoke('get-app-version'),

    checkUpdates: () => ipcRenderer.invoke('check-updates'),
    downloadUpdate: (url) => ipcRenderer.invoke('download-update', url),
    cancelDownload: () => ipcRenderer.invoke('cancel-download'),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_event, value) => callback(value)),
    onNetworkSpeedUpdate: (callback) => ipcRenderer.on('network-speed-update', (_event, value) => callback(value)),
    
    // [新增] 安装更新接口
    installUpdate: (filePath) => ipcRenderer.invoke('install-update', filePath),

    openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
    showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
    openExternalLink: (url) => ipcRenderer.invoke('open-external-link', url),

    saveMedia: (data) => ipcRenderer.invoke('save-media', data),

    setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
    setGlobalVolume: (volume) => ipcRenderer.invoke('set-global-volume'),
    selectBackgroundImage: () => ipcRenderer.invoke('select-background-image'),
    clearBackgroundImage: () => ipcRenderer.invoke('clear-background-image'),
    setBackgroundOpacity: (opacity) => ipcRenderer.invoke('set-background-opacity'),
    setCardOpacity: (opacity) => ipcRenderer.invoke('set-card-opacity'),
    
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
    getMemoryUpdate: () => ipcRenderer.invoke('get-memory-update'),
    getRealtimeStats: () => ipcRenderer.invoke('get-realtime-stats'),
    getGpuStats: () => ipcRenderer.invoke('get-gpu-stats'),
    getTrafficHistory: () => ipcRenderer.invoke('get-traffic-history'),
    
    getCachedIcon: (toolId, url) => ipcRenderer.invoke('get-cached-icon', toolId, url),
    // [新增] 字体下载接口
    downloadFont: (data) => ipcRenderer.invoke('download-font', data),

    compressFiles: (data) => ipcRenderer.invoke('compress-files', data),
    decompressFile: (data) => ipcRenderer.invoke('decompress-file', data),
    onArchiveProgress: (callback) => ipcRenderer.on('archive-progress', (_event, value) => callback(value)),
    onArchiveLog: (callback) => ipcRenderer.on('archive-log', (_event, value) => callback(value)),

    launchSystemTool: (command) => ipcRenderer.send('launch-system-tool', command),
    showConfirmationDialog: (options) => ipcRenderer.invoke('show-confirmation-dialog', options),
    checkSecretAccess: () => ipcRenderer.invoke('check-secret-access'),
    recordSecretFailure: () => ipcRenderer.invoke('record-secret-failure'),
    resetSecretAttempts: () => ipcRenderer.invoke('reset-secret-attempts'),
    checkAndRelaunchAsAdmin: () => ipcRenderer.invoke('check-and-relaunch-as-admin'),
    requestNewWindow: (url, options) => ipcRenderer.send('request-new-window', url, options),
    checkUserAgreement: () => ipcRenderer.invoke('check-user-agreement'),
confirmUserAgreement: () => ipcRenderer.invoke('confirm-user-agreement'),
});