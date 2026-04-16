require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'mes'
  });
  
  const sql = `
    ALTER TABLE eight_d_reports 
    ADD COLUMN d2_responsible_person VARCHAR(100) COMMENT 'D2-责任人' AFTER d2_defect_type,
    ADD COLUMN d3_responsible_person VARCHAR(100) COMMENT 'D3-责任人' AFTER d3_effective_date,
    ADD COLUMN d4_responsible_person VARCHAR(100) COMMENT 'D4-责任人' AFTER d4_contributing_factors,
    ADD COLUMN d6_responsible_person VARCHAR(100) COMMENT 'D6-责任人' AFTER d6_verification_result,
    ADD COLUMN d7_responsible_person VARCHAR(100) COMMENT 'D7-责任人' AFTER d7_standardization,
    ADD COLUMN d8_responsible_person VARCHAR(100) COMMENT 'D8-责任人' AFTER d8_team_recognition;
  `;
  
  try {
    const [result] = await conn.query(sql);
    console.log('ALTER TABLE SUCCESS:', result);
  } catch(e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('Columns already exist.');
    } else {
      console.error('Migration failed:', e);
      process.exit(1);
    }
  }
  
  await conn.end();
}

run();
