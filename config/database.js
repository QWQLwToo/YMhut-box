// config/database.js
const Database = require('better-sqlite3');

class AppDatabase {
    // [修改] 构造函数现在接收一个数据库路径
    constructor(dbPath) {
        if (!dbPath) {
            throw new Error("Database path must be provided.");
        }
        try {
            this.db = new Database(dbPath);
            console.log(`成功连接到数据库: ${dbPath}`);
            this.initTables();
        } catch (err) {
            console.error('数据库连接错误:', err.message);
        }
    }

    run(sql, params = []) {
        try {
            return this.db.prepare(sql).run(params);
        } catch (err) {
            console.error('数据库操作错误:', err.message);
            throw err;
        }
    }

    get(sql, params = []) {
        try {
            return this.db.prepare(sql).get(params);
        } catch (err) {
            console.error('数据库查询错误:', err.message);
            throw err;
        }
    }

    all(sql, params = []) {
        try {
            return this.db.prepare(sql).all(params);
        } catch (err) {
            console.error('数据库查询错误:', err.message);
            throw err;
        }
    }

    initTables() {
        // ... (initTables 内部所有代码保持不变)
        const createLogsTable = `CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, action TEXT NOT NULL, category TEXT)`;
        this.run(createLogsTable);
        const createConfigTable = `CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)`;
        this.run(createConfigTable);
        const createTrafficLogTable = `CREATE TABLE IF NOT EXISTS traffic_log (log_date TEXT PRIMARY KEY, bytes_used INTEGER NOT NULL)`;
        this.run(createTrafficLogTable);
        const initialConfigs = {
            'theme': 'dark', 'global_volume': '0.5', 'total_downloaded_bytes': '0',
            'background_image': '', 'background_opacity': '1.0', 'card_opacity': '0.7',
            'window_width': '940', 'window_height': '700', 'window_x': 'null',
            'window_y': 'null', 'secret_code_attempts': '0', 'secret_code_lockout_until': '0'
        };
        const stmt = this.db.prepare(`INSERT OR IGNORE INTO app_config (key, value) VALUES (?, ?)`);
        this.db.transaction(() => {
            for (const [key, value] of Object.entries(initialConfigs)) {
                stmt.run(key, value);
            }
        })();
    }

    // ... (所有其他方法 logAction, getLogs, ... close 保持不变)
    logAction(logData) {
        const { timestamp, action, category = 'general' } = logData;
        const sql = `INSERT INTO logs (timestamp, action, category) VALUES (?, ?, ?)`;
        return this.run(sql, [timestamp, action, category]);
    }
    getLogs(filterDate = null, limit = 500) {
        if (filterDate) {
            return this.all(`SELECT * FROM logs WHERE date(timestamp) = ? ORDER BY timestamp DESC`, [filterDate]);
        }
        return this.all(`SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?`, [limit]);
    }
    clearLogs() { return this.run(`DELETE FROM logs`); }
    getConfig(key) {
        const result = this.get(`SELECT value FROM app_config WHERE key = ?`, [key]);
        return result ? result.value : null;
    }
    setConfig(key, value) {
        const sql = `INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)`;
        return this.run(sql, [key, value]);
    }
    getTrafficStats() {
        const result = this.get(`SELECT value FROM app_config WHERE key = 'total_downloaded_bytes'`);
        return result ? parseInt(result.value, 10) : 0;
    }
    getTrafficHistory() {
        const sql = `SELECT log_date, bytes_used FROM traffic_log ORDER BY log_date ASC`;
        return this.all(sql);
    }
    addTraffic(bytes) {
        if (typeof bytes !== 'number' || bytes <= 0) return;
        const currentTotalBytes = this.getTrafficStats();
        this.setConfig('total_downloaded_bytes', (currentTotalBytes + bytes).toString());
        const today = new Date().toISOString().split('T')[0];
        const sql = `INSERT INTO traffic_log (log_date, bytes_used) VALUES (?, ?) ON CONFLICT(log_date) DO UPDATE SET bytes_used = bytes_used + excluded.bytes_used;`;
        this.run(sql, [today, bytes]);
    }
    close() {
        if (this.db) {
            this.db.close();
            console.log('数据库连接已关闭。');
        }
    }
}

// [修改] 不再导出实例，而是导出 Class 本身
module.exports = AppDatabase;