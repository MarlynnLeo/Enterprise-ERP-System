const { Client } = require('f:/ERP/backend/node_modules/ssh2');
const { spawn } = require('child_process');
const path = require('path');

const SERVER_HOST = '192.168.1.251';
const SERVER_PORT = 22;
const SERVER_USER = 'guiyi';
const SERVER_PASS = '99Kk@#';

async function gitPush() {
  return new Promise((resolve, reject) => {
    console.log('📦 正在提交本地更改并推送到 Git...');
    const cmd = 'git add . && git commit -m "update: supplier search and receive button permissions" && git push origin main';
    const child = spawn(cmd, { shell: true, cwd: 'f:\\ERP' });
    child.stdout.on('data', data => process.stdout.write(data));
    child.stderr.on('data', data => process.stderr.write(data));
    child.on('close', code => {
      resolve();
    });
  });
}

function runRemoteCommand(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 远程执行: ${cmd}`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on('close', (code, signal) => {
        if (code === 0) {
          resolve();
        } else {
          console.warn(`命令退出码: ${code}`);
          resolve();
        }
      }).on('data', data => {
        process.stdout.write(data);
      }).stderr.on('data', data => {
        process.stderr.write(data);
      });
    });
  });
}

async function main() {
  await gitPush();

  const conn = new Client();
  conn.on('ready', async () => {
    console.log('✅ SSH 连接成功: ' + SERVER_HOST);
    try {
      const deployCmd = `
        cd /home/guiyi/ERP || cd /opt/ERP || cd /data/ERP || cd $(find / -name "docker-compose.yml" 2>/dev/null | grep -E "kacon|ERP" | head -n 1 | xargs dirname)
        pwd
        git pull origin main || git pull
        docker compose build backend frontend
        docker compose up -d backend frontend
        docker compose ps
      `;
      await runRemoteCommand(conn, deployCmd);
      console.log('\n🎉 远程部署更新全部完成！');
    } catch (e) {
      console.error('部署执行出错:', e);
    } finally {
      conn.end();
    }
  }).on('error', err => {
    console.error('SSH 连接失败:', err);
  }).connect({
    host: SERVER_HOST,
    port: SERVER_PORT,
    username: SERVER_USER,
    password: SERVER_PASS
  });
}

main();
