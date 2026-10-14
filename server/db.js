require('dotenv').config();
const mysql = require('mysql2/promise');

// Connection ki details .env file se aati hain (password code mein kabhi nahi likhte)
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'docmind',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10
});

// Tables banao (agar pehle se nahi hain). Server start hote hi ek baar chalta hai
async function initDb() {
  if (!process.env.DB_USER) {
    throw new Error('DB_USER is missing in your .env file');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      email         VARCHAR(254) NOT NULL UNIQUE,
      password_hash VARCHAR(100) NULL,
      google_sub    VARCHAR(64) NULL UNIQUE,
      name          VARCHAR(255) NULL,
      created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash CHAR(64) NOT NULL PRIMARY KEY,
      user_id    BIGINT UNSIGNED NOT NULL,
      expires_at BIGINT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sessions_user (user_id),
      CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

module.exports = { pool, initDb };