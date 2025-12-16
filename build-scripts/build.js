// build-scripts/build.js
const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs-extra');
const path = require('path');

// ====================================================================================
// --- 🚀 核心配置区 ---
// ====================================================================================

/**
 * @name CUSTOM_SALT
 * @description [自定义盐值] 用于初始化所有随机操作，确保每次构建结果唯一。
 */
const CUSTOM_SALT = 'YMhut_Box_v1.3.3_Fully_Automated_Salt_20251018';

// ====================================================================================
// --- 🛡️ 稳定版混淆选项 (注意：reservedNames 和 reservedStrings 将在下方动态生成) ---
// ====================================================================================
const rootDir = path.join(__dirname, '..');
const outputDir = path.join(rootDir, 'app_dist');

// 先定义一个基础的 obfuscationOptions 对象
const obfuscationOptions = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.25,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.1,
    debugProtection: true,
    debugProtectionInterval: 4000,
    disableConsoleOutput: true,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    // 注意：reservedNames 和 reservedStrings 会在 run() 函数中被动态添加
    reservedNames: [],
    reservedStrings: [],
    seed: CUSTOM_SALT,
    selfDefending: false,
    simplify: true,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    target: 'node',
    transformObjectKeys: false,
    unicodeEscapeSequence: false
};

// ====================================================================================
// --- ⚙️ 构建脚本执行区 ---
// ====================================================================================

// 移除 'lang'（无需复制到 app_dist，从 build 目录读取）→ 注释说明保留，实际已补充 lang 复制逻辑
const sourcesToProcess = [
    'main.js',
    'preload.js',
    'config',
    'src'
];

/**
 * [自动化功能] 动态从 preload.js 文件中提取所有 IPC 通信频道名称。
 * @returns {Promise<string[]>} - 返回一个包含所有频道名称的字符串数组。
 */
async function getIpcChannels() {
    try {
        const preloadPath = path.join(rootDir, 'preload.js');
        const content = await fs.readFile(preloadPath, 'utf8');
        const regex = /ipcRenderer\.(?:invoke|send|on)\(['"]([^'"]+)['"]/g;
        const channels = new Set();
        let match;
        while ((match = regex.exec(content)) !== null) {
            channels.add(match[1]);
        }
        console.log(`- 成功提取到 ${channels.size} 个 IPC 频道名称需要保护。`);
        return Array.from(channels);
    } catch (error) {
        console.error('❌ 自动提取 IPC 频道名称失败:', error);
        throw new Error("Failed to dynamically parse IPC channels.");
    }
}

/**
 * [新增自动化功能] 动态扫描JS文件，提取所有 export 的类名和通过 new 导出的类名。
 * @returns {Promise<string[]>} - 返回需要保护的类名数组。
 */
async function getReservedNames() {
    const names = new Set();
    const dirsToScan = [path.join(rootDir, 'src', 'js'), path.join(rootDir, 'src', 'js', 'tools')];
    // 这个正则表达式可以匹配 `export default class ClassName` 和 `export default new ClassName()`
    const regex = /export\s+default\s+(?:class|new)\s+([a-zA-Z0-9_]+)/g;

    async function scanDir(dir) {
        const files = await fs.readdir(dir);
        for (const file of files) {
            if (!file.endsWith('.js')) continue;
            const filePath = path.join(dir, file);
            const content = await fs.readFile(filePath, 'utf8');
            let match;
            while ((match = regex.exec(content)) !== null) {
                names.add(match[1]);
            }
        }
    }

    try {
        for (const dir of dirsToScan) {
            await scanDir(dir);
        }
        console.log(`- 成功提取到 ${names.size} 个模块/工具类名需要保护。`);
        return Array.from(names);
    } catch (error) {
        console.error('❌ 自动提取模块/工具类名失败:', error);
        throw new Error("Failed to dynamically parse reserved names.");
    }
}

async function findJsFiles(dir) {
    let results = [];
    const list = await fs.readdir(dir);
    for (const file of list) {
        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(await findJsFiles(filePath));
        } else if (filePath.endsWith('.js')) {
            results.push(filePath);
        }
    }
    return results;
}

async function run() {
    console.log('🧹 [1/6] 清理旧的构建目录...');
    await fs.remove(outputDir);
    await fs.ensureDir(outputDir);

    console.log('🔄 [2/6] 复制并清理文件用于发布...');
    const packageJsonPath = path.join(rootDir, 'package.json');
    const packageJson = await fs.readJson(packageJsonPath);
    const prodPackageJson = {
        name: packageJson.name, version: packageJson.version, productName: packageJson.productName,
        description: packageJson.description, main: packageJson.main, author: packageJson.author,
        dependencies: packageJson.dependencies
    };
    await fs.writeJson(path.join(outputDir, 'package.json'), prodPackageJson, { spaces: 2 });
    console.log('- 已清理并写入 package.json');
    
    // 👇 修复1：复制 lang 目录到 app_dist（解决语言文件找不到问题）
    const langSrc = path.join(rootDir, 'lang');
    const langDest = path.join(outputDir, 'lang');
    if (await fs.pathExists(langSrc)) {
        await fs.copy(langSrc, langDest);
        console.log('- 已复制 lang 目录到 app_dist');
    } else {
        throw new Error(`❌ 找不到 lang 目录：${langSrc}`);
    }

    // 👇 修复2：恢复 config-template.ini 复制（解决配置模板缺失问题）
    const configTemplatePath = path.join(rootDir, 'build-scripts', 'config-template.ini');
    const configTemplateDest = path.join(outputDir, 'config-template.ini');
    if (await fs.pathExists(configTemplatePath)) {
        await fs.copy(configTemplatePath, configTemplateDest);
        console.log('- 已复制 config-template.ini 到 app_dist');
    } else {
        throw new Error(`❌ 找不到 config-template.ini：${configTemplatePath}`);
    }

    // 原有源文件复制逻辑（main.js、preload.js、config、src 等）
    for (const source of sourcesToProcess) {
        const sourcePath = path.join(rootDir, source);
        const destPath = path.join(outputDir, source);
        if (await fs.pathExists(sourcePath)) {
            await fs.copy(sourcePath, destPath);
        }
    }

    console.log('- 其他所有源文件已复制。');

    // --- [自动化核心] ---
    console.log('🔍 [3/6] 动态解析 IPC 通信频道...');
    obfuscationOptions.reservedStrings = await getIpcChannels();
    
    console.log('🔍 [4/6] 动态解析模块和工具类名...');
    obfuscationOptions.reservedNames = await getReservedNames();
    
    // --- [BUG 修复] 开始 ---
    // 告诉混淆器保留 preload.js 导出的 API 名称，防止 mainPage.js 调用时因名称不匹配而失败
    console.log('🛡️ [4.5/6] 注入 preload.js API 名称以防止混淆...');
    const preloadApiNames = [
        'onInitialData', // <--- 修复: TypeError: window[_0x...
        'getLanguageConfig',
        'saveLanguageConfig',
        'requestAdminRelaunch',
        // (为安全起见，添加所有在 preload.js 中定义的 API)
        'runInitialization', 'onInitProgress', 'initializationComplete',
        'minimizeWindow', 'maximizeWindow', 'closeWindow', 'relaunchApp',
        'openAcknowledgementsWindow', 'closeCurrentWindow', 'openSecretWindow',
        'openToolWindow', 'secretWindowMinimize', 'secretWindowMaximize',
        'logAction', 'getLogs', 'clearLogs', 'getTrafficStats', 'addTraffic',
        'reportTraffic', 'getAppVersion', 'checkUpdates', 'downloadUpdate',
        'cancelDownload', 'onDownloadProgress', 'onNetworkSpeedUpdate',
        'openFile', 'showItemInFolder', 'openExternalLink', 'saveMedia',
        'setTheme', 'setGlobalVolume', 'selectBackgroundImage',
        'clearBackgroundImage', 'setBackgroundOpacity', 'setCardOpacity',
        'getSystemInfo', 'getMemoryUpdate', 'getRealtimeStats', 'getGpuStats',
        'getTrafficHistory', 'launchSystemTool', 'showConfirmationDialog',
        'checkSecretAccess', 'recordSecretFailure', 'resetSecretAttempts',
        'checkAndRelaunchAsAdmin', 'requestNewWindow'
    ];
    obfuscationOptions.reservedNames.push(...preloadApiNames);
    console.log(`- 已添加 ${preloadApiNames.length} 个 preload API 名称到保留列表。`);
    // --- [修复结束] ---

    console.log('🛡️ [5/6] 查找并混淆 JavaScript 文件...');
    const jsFilesToObfuscate = await findJsFiles(outputDir);

    for (const filePath of jsFilesToObfuscate) {
        const relativePath = path.relative(rootDir, filePath).replace('app_dist' + path.sep, '');
        console.log(`- 正在混淆: ${relativePath}`);
        
        const code = await fs.readFile(filePath, 'utf8');
        const obfuscationResult = JavaScriptObfuscator.obfuscate(code, obfuscationOptions);
        
        await fs.writeFile(filePath, obfuscationResult.getObfuscatedCode());
    }

    console.log('✅ [6/6] 构建过程成功完成！');
    console.log(`📦 最终的应用文件已准备就绪，位于: ${outputDir}`);
}

run().catch(err => {
    console.error('❌ 在构建过程中发生错误:');
    console.error(err);
    process.exit(1);
});