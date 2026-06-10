const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor(dbPath = './nokosbot.db') {
        this.db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error membuka database:', err.message);
            } else {
                console.log('✅ Terhubung ke database SQLite.');
                this.initTables();
            }
        });
    }

    initTables() {
        // Tabel Users - menyimpan data user telegram
        this.db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id TEXT UNIQUE NOT NULL,
                username TEXT,
                first_name TEXT,
                last_name TEXT,
                saldo INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabel Orders - menyimpan riwayat order
        this.db.run(`
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id TEXT NOT NULL,
                order_id TEXT UNIQUE NOT NULL,
                service_name TEXT,
                country TEXT,
                phone_number TEXT,
                price INTEGER,
                status TEXT DEFAULT 'ACTIVE',
                otp_code TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME,
                FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
            )
        `);

        // Tabel Deposits - riwayat deposit
        this.db.run(`
            CREATE TABLE IF NOT EXISTS deposits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id TEXT NOT NULL,
                amount INTEGER NOT NULL,
                status TEXT DEFAULT 'pending',
                payment_method TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
            )
        `);
    }

    // User Methods
    async getUser(telegramId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM users WHERE telegram_id = ?',
                [telegramId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row || null);
                }
            );
        });
    }

    async createUser(telegramId, username, firstName, lastName) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO users (telegram_id, username, first_name, last_name, saldo) 
                 VALUES (?, ?, ?, ?, 0)
                 ON CONFLICT(telegram_id) DO UPDATE SET
                 username = excluded.username,
                 first_name = excluded.first_name,
                 last_name = excluded.last_name,
                 updated_at = CURRENT_TIMESTAMP`,
                [telegramId, username, firstName, lastName],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
        });
    }

    async getSaldo(telegramId) {
        const user = await this.getUser(telegramId);
        return user ? user.saldo : 0;
    }

    async updateSaldo(telegramId, amount) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE users SET saldo = saldo + ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?',
                [amount, telegramId],
                function(err) {
                    if (err) reject(err);
                    else resolve({ changes: this.changes });
                }
            );
        });
    }

    // Order Methods
    async createOrder(telegramId, orderId, serviceName, country, phoneNumber, price) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO orders (telegram_id, order_id, service_name, country, phone_number, price) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [telegramId, orderId, serviceName, country, phoneNumber, price],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
        });
    }

    async getOrder(orderId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM orders WHERE order_id = ?',
                [orderId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row || null);
                }
            );
        });
    }

    async getActiveOrders(telegramId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT * FROM orders WHERE telegram_id = ? AND status IN ('ACTIVE', 'PENDING') 
                 ORDER BY created_at DESC`,
                [telegramId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    }

    async getOrderHistory(telegramId, limit = 10) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT * FROM orders WHERE telegram_id = ? ORDER BY created_at DESC LIMIT ?`,
                [telegramId, limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    }

    async updateOrderStatus(orderId, status, otpCode = null) {
        return new Promise((resolve, reject) => {
            const completedAt = status === 'COMPLETED' ? 'CURRENT_TIMESTAMP' : 'NULL';
            this.db.run(
                `UPDATE orders SET status = ?, otp_code = ?, completed_at = ${completedAt} WHERE order_id = ?`,
                [status, otpCode, orderId],
                function(err) {
                    if (err) reject(err);
                    else resolve({ changes: this.changes });
                }
            );
        });
    }

    // Deposit Methods
    async createDeposit(telegramId, amount, paymentMethod = 'manual') {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO deposits (telegram_id, amount, payment_method) VALUES (?, ?, ?)`,
                [telegramId, amount, paymentMethod],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
        });
    }
    
async updateDepositStatus(depositId, status) {
    return new Promise((resolve, reject) => {
        this.db.run(
            `UPDATE deposits
             SET status = ?
             WHERE id = ?`,
            [status, depositId],
            function(err) {
                if (err) reject(err);
                else resolve({
                    changes: this.changes
                });
            }
        );
    });
}
    async getDeposits(telegramId) {
    return new Promise((resolve, reject) => {
        this.db.all(
            `SELECT * FROM deposits
             WHERE telegram_id = ?
             ORDER BY created_at DESC`,
            [telegramId],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            }
        );
    });
}

    close() {
        this.db.close((err) => {
            if (err) console.error('Error menutup database:', err.message);
            else console.log('🔒 Database ditutup.');
        });
    }
}

module.exports = Database;
