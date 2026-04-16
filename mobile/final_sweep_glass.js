const fs = require('fs');

const files = [
  'f:/ERP/mobile/src/views/inventory/InboundDetail.vue',
  'f:/ERP/mobile/src/views/inventory/OutboundDetail.vue',
  'f:/ERP/mobile/src/views/purchase/ReceiptDetail.vue',
  'f:/ERP/mobile/src/views/sales/OrderDetail.vue',
  'f:/ERP/mobile/src/views/sales/OutboundDetail.vue'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  // Remove glass components import
  content = content.replace(/import\s+\{[^\}]+\}\s+from\s+['"]@\/components\/glass['"][;\n]*/g, '');
  
  // Replace GlassCard
  content = content.replace(/<GlassCard(.*?)>/g, '<div class="detail-card"$1>');
  content = content.replace(/<\/GlassCard>/g, '</div>');
  
  // Replace GlassButton
  content = content.replace(/<GlassButton/g, '<Button');
  content = content.replace(/<\/GlassButton>/g, '</Button>');
  
  // Replace GlassListItem
  // Format 1: <GlassListItem label="X" value="Y" />
  content = content.replace(/<GlassListItem\s+label="([^"]+)"\s+value="([^"]*)"\s*\/>/g, 
    '<div class="info-row"><span class="label">$1</span><span class="value">$2</span></div>');
    
  // Format 2: <GlassListItem label="X" :value="Y" />
  content = content.replace(/<GlassListItem\s+label="([^"]+)"\s+:value="([^"]+)"\s*\/>/g, 
    '<div class="info-row"><span class="label">$1</span><span class="value">{{ $2 }}</span></div>');

  // Format 3: <GlassListItem label="X"> <template #value>Y</template> </GlassListItem>
  content = content.replace(/<GlassListItem\s+label="([^"]+)">([\s\S]*?)<\/GlassListItem>/g, (match, label, inner) => {
    let valueHtml = inner.replace(/<template\s+#value>/, '').replace(/<\/template>/, '').trim();
    return `<div class="info-row align-top"><span class="label">${label}</span><div class="value-block">${valueHtml}</div></div>`;
  });

  // Inject CSS if not present
  if (!content.includes('detail-card')) {
    content = content.replace(/<\/style>/, `
.detail-card {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  border: 1px solid var(--glass-border);
}
.info-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
}
.info-row.align-top {
  align-items: flex-start;
}
.info-row:last-child {
  margin-bottom: 0;
}
.info-row .label {
  color: var(--text-secondary);
  flex-shrink: 0;
  margin-right: 12px;
}
.info-row .value {
  color: var(--text-primary);
  text-align: right;
  word-break: break-all;
}
.value-block {
  flex: 1;
  text-align: right;
  color: var(--text-primary);
}
</style>`);
  }

  // Ensure Button is imported from vant if not already
  if (content.includes('<Button') && !content.includes('Button,') && !content.includes(', Button')) {
     content = content.replace(/import\s+\{(.*?)\}\s+from\s+['"]vant['"]/, (m, p1) => `import { ${p1}, Button } from 'vant'`);
  }

  fs.writeFileSync(file, content, 'utf8');
  console.log('Fixed:', file);
});
