import uiManager from './uiManager.js';
import configManager from './configManager.js';

class BaseTool {
    constructor(id, name, options = {}) {
        if (!id || !name) {
            throw new Error("工具必须提供 id 和 name。");
        }
        this.id = id;
        this.name = name;
        this.worker = null;
        this.workerUrl = null;

        if (options.workerCode) {
            try {
                const blob = new Blob([options.workerCode], { type: 'application/javascript' });
                this.workerUrl = URL.createObjectURL(blob);
                this.worker = new Worker(this.workerUrl, { type: 'module' });
                this.worker.onmessage = (event) => this._onWorkerMessage(event.data);
                this.worker.onerror = (error) => this._onWorkerError(error);
            } catch (e) {
                console.error(`创建工具 ${this.name} 的 Worker 失败:`, e);
            }
        }
    }

    // --- 日志记录优化 ---
    _log(action) {
        // 统一格式：[工具名] 具体操作
        const message = `[${this.name}] ${action}`;
        // 统一分类为 'tool'
        configManager.logAction(message, 'tool');
    }

    _notify(title, message, type = 'info') {
        uiManager.showNotification(title, message, type);
    }

    _postMessageToWorker(message) {
        if (this.worker) {
            this.worker.postMessage(message);
        }
    }

    _onWorkerMessage(data) {
        this._log(`收到 Worker 消息: ${JSON.stringify(data)}`);
    }

    _onWorkerError(error) {
        console.error(`工具 ${this.name} 的 Worker 发生错误:`, error);
        this._log(`Worker 错误: ${error.message}`);
    }

    render() {
        throw new Error(`工具 ${this.name} 必须实现 render() 方法。`);
    }

    init() {
        throw new Error(`工具 ${this.name} 必须实现 init() 方法。`);
    }

    destroy() {
        if (this.worker) {
            this.worker.terminate();
        }
        if (this.workerUrl) {
            URL.revokeObjectURL(this.workerUrl);
        }
    }
}

export default BaseTool;