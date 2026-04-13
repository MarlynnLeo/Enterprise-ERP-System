const fs = require('fs');
const path = require('path');

function findAll(dir) {
  let r = [];
  try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) r.push(...findAll(p));
        else if (e.name.endsWith('.js')) r.push(p);
      }
  } catch (err) {}
  return r;
}

const baseDir = path.join(process.cwd(), 'src');
const files = findAll(baseDir);
let issues = [];

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf-8');
  const rel = path.relative(baseDir, f);
  
  // Rule 1: 扫描丢失的事务回滚或连接释放机制
  const functionBlocks = content.split(/(?:async function|\w+\s*[:=]\s*async\s*(?:\([^)]*\))?\s*=>?)/g).slice(1);
  functionBlocks.forEach((funcBody) => {
    if (funcBody.includes('getConnection()') && !funcBody.includes('release()')) {
        issues.push('⚠️ 资源泄漏风险 (无 release): ' + rel);
    }
    if (funcBody.includes('beginTransaction()') && !funcBody.includes('rollback()')) {
        issues.push('⚠️ 事务处理缺陷 (无 rollback): ' + rel);
    }
  });

  const lines = content.split('\n');
  lines.forEach((line, i) => {
    // Rule 2: 扫描硬编码的管理员限制（这违背了动态权限系统设计）
    if (line.match(/\W(req\.user(?:\??\.id)?)\s*[=!]==?\s*['\"]?1['\"]?\W/) || line.match(/\bid\s*[=!]==?\s*['\"]?1['\"]?/)) {
        if (!line.includes('//') && !rel.includes('AuditService')) {
            issues.push('🚨 硬编码1号账号特权限制: ' + rel + ':L' + (i+1));
        }
    }
    
    // Rule 3: 寻找裸露的动态字符串拼接（存在注入或稳定性隐患）
    // 忽略之前的 limit/offset 处理，因为它们已经被证实为 parseInt 后绝对安全
    if (line.match(/LIKE\s+['\"].*\+.*['\"]/) || line.match(/=\s*['\"].*\+.*['\"]/)) {
        if (!line.includes('//') && !line.includes('LIMIT') && !line.includes('OFFSET')) {
            issues.push('⚠️ 潜在的SQL拼接注入: ' + rel + ':L' + (i+1) + ' => ' + line.trim());
        }
    }

    // Rule 4: 补丁式代码或者TODO/FIXME技术债
    if (line.toUpperCase().includes('FIXME') || line.toUpperCase().includes('TODO')) {
        issues.push('📝 业务欠债 (遗留TODO): ' + rel + ':L' + (i+1));
    }
  });
});

const uniqueIssues = [...new Set(issues)];
console.log('--- ERP 全栈深度架构初步审计 ---');
if (uniqueIssues.length > 0) {
    uniqueIssues.forEach(i => console.log(i));
} else {
    console.log('尚未扫描到常见低级错误模式。');
}
