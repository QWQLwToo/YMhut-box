// src/js/view-loader.js
import { toolRegistry } from './tool-registry.js';
import configManager from './configManager.js'; // <-- 新增：导入 configManager 以便记录日志

let activeTool = null;

export async function loadToolFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const toolId = params.get('tool');
    const contentArea = document.getElementById('tool-content-area');

    if (!toolId) {
        const errorMsg = '错误：未指定工具ID (tool=...)';
        contentArea.innerHTML = `<div class="loading-container"><p class="error-message">${errorMsg}</p></div>`;
        configManager.logAction(`[view-loader] ${errorMsg}`, 'error'); // <-- 新增日志
        return;
    }

    const ToolClass = toolRegistry[toolId];
    if (!ToolClass) {
        const errorMsg = `错误：未在注册表找到工具: ${toolId}`;
        contentArea.innerHTML = `<div class="loading-container"><p class="error-message">${errorMsg}</p></div>`;
        configManager.logAction(`[view-loader] ${errorMsg}`, 'error'); // <-- 新增日志
        return;
    }

    // 销毁旧工具 (如果存在)
    if (activeTool && activeTool.destroy) {
        activeTool.destroy();
    }

    // 实例化新工具
    activeTool = new ToolClass();
    
    // 设置窗口标题
    document.getElementById('window-title').innerText = activeTool.name || '工具窗口';
    document.title = activeTool.name || '工具窗口';
    
    // 新增日志：记录工具加载
    configManager.logAction(`[${activeTool.name}] 正在新窗口中加载工具`, 'tool');

    // 注入 HTML 并初始化
    try {
        contentArea.innerHTML = activeTool.render();
        activeTool.init();
    } catch (e) {
        console.error(`加载工具 ${toolId} 失败:`, e);
        const errorMsg = `加载工具 ${toolId} 失败: ${e.message}`;
        contentArea.innerHTML = `<div class="loading-container"><p class="error-message">${errorMsg}</p></div>`;
        configManager.logAction(`[${toolId}] 工具加载失败: ${e.message}`, 'error'); // <-- 新增日志
    }
}