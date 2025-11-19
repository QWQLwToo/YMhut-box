// config/database.js
const Database = require('better-sqlite3');

class AppDatabase {
    constructor(dbPath) {
        if (!dbPath) throw new Error("Database path must be provided.");
        try {
            this.db = new Database(dbPath);
            console.log(`成功连接到数据库: ${dbPath}`);
            this.initTables();
        } catch (err) {
            console.error('数据库连接错误:', err.message);
        }
    }

    run(sql, params = []) { return this.db.prepare(sql).run(params); }
    get(sql, params = []) { return this.db.prepare(sql).get(params); }
    all(sql, params = []) { return this.db.prepare(sql).all(params); }

    initTables() {
        // 日志表
        this.run(`CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, action TEXT NOT NULL, category TEXT)`);
        // 基础配置表
        this.run(`CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)`);
        // 流量统计表
        this.run(`CREATE TABLE IF NOT EXISTS traffic_log (log_date TEXT PRIMARY KEY, bytes_used INTEGER NOT NULL)`);
        
        // [新增] 远程配置存储表 (分表存储 tool-status, update-info, media-types)
        // id: config_name (e.g., 'tool_status')
        // data: JSON string
        // updated_at: timestamp
        this.run(`CREATE TABLE IF NOT EXISTS remote_configs (id TEXT PRIMARY KEY, data TEXT, updated_at TEXT)`);

        // 初始化默认配置
        const initialConfigs = {
            'theme': 'dark', 'global_volume': '0.5', 'total_downloaded_bytes': '0',
            'background_image': '', 'background_opacity': '1.0', 'card_opacity': '0.7',
            'window_width': '1200', 'window_height': '800', 'window_x': 'null', 'window_y': 'null',
            'secret_code_attempts': '0', 'secret_code_lockout_until': '0',
            'app_version': '0.0.0' // 初始版本
        };
        
        const stmt = this.db.prepare(`INSERT OR IGNORE INTO app_config (key, value) VALUES (?, ?)`);
        this.db.transaction(() => {
            for (const [key, value] of Object.entries(initialConfigs)) {
                stmt.run(key, value);
            }
        })();
    }

    // --- [新增] 远程配置操作 ---
    saveRemoteConfig(id, data) {
        const jsonStr = JSON.stringify(data);
        const time = new Date().toISOString();
        const sql = `INSERT OR REPLACE INTO remote_configs (id, data, updated_at) VALUES (?, ?, ?)`;
        return this.run(sql, [id, jsonStr, time]);
    }

    getRemoteConfig(id) {
        const result = this.get(`SELECT data FROM remote_configs WHERE id = ?`, [id]);
        return result ? JSON.parse(result.data) : null;
    }

    // --- [新增] 版本升级检查 ---
    // 返回: { isUpgrade: boolean, oldVersion: string }
    checkAndRecordVersion(currentVersion) {
        const oldVersion = this.getConfig('app_version') || '0.0.0';
        
        // 简单的版本比较逻辑 (假设版本号格式为 x.y.z)
        if (oldVersion !== currentVersion) {
            this.setConfig('app_version', currentVersion);
            return { isUpgrade: true, oldVersion: oldVersion };
        }
        return { isUpgrade: false, oldVersion: oldVersion };
    }

    // ... (原有方法保持不变: logAction, getLogs, clearLogs, getConfig, setConfig, getTrafficStats, getTrafficHistory, addTraffic, close)
    logAction(logData) {
        const { timestamp, action, category = 'general' } = logData;
        this.run(`INSERT INTO logs (timestamp, action, category) VALUES (?, ?, ?)`, [timestamp, action, category]);
    }
    getLogs(filterDate = null, limit = 500) {
        if (filterDate) return this.all(`SELECT * FROM logs WHERE date(timestamp) = ? ORDER BY timestamp DESC`, [filterDate]);
        return this.all(`SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?`, [limit]);
    }
    clearLogs() { return this.run(`DELETE FROM logs`); }
    getConfig(key) {
        const result = this.get(`SELECT value FROM app_config WHERE key = ?`, [key]);
        return result ? result.value : null;
    }
    setConfig(key, value) {
        return this.run(`INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)`, [key, value]);
    }
    getTrafficStats() {
        const result = this.get(`SELECT value FROM app_config WHERE key = 'total_downloaded_bytes'`);
        return result ? parseInt(result.value, 10) : 0;
    }
    getTrafficHistory() {
        return this.all(`SELECT log_date, bytes_used FROM traffic_log ORDER BY log_date ASC`);
    }
    addTraffic(bytes) {
        if (typeof bytes !== 'number' || bytes <= 0) return;
        const currentTotalBytes = this.getTrafficStats();
        this.setConfig('total_downloaded_bytes', (currentTotalBytes + bytes).toString());
        const today = new Date().toISOString().split('T')[0];
        this.run(`INSERT INTO traffic_log (log_date, bytes_used) VALUES (?, ?) ON CONFLICT(log_date) DO UPDATE SET bytes_used = bytes_used + excluded.bytes_used;`, [today, bytes]);
    }
    close() {
        if (this.db) { this.db.close(); console.log('数据库连接已关闭。'); }
    }
}

module.exports = AppDatabase;