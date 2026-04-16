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
  
  // Fix duplicate class
  content = content.replace(/class="detail-card"\s+class="([^"]+)"/g, 'class="detail-card $1"');
  
  // Replace <GlassListItem ...> with <div class="basic-list-item">
  content = content.replace(/<GlassListItem\s+v-for="([^"]+)"\s+:key="([^"]+)"\s+:title="([^"]+)"(?:\s+:subtitle="([^"]+)")?(?:\s+:show-more="[^"]+")?(?:\s+:clickable="[^"]+")?>/g, 
    `<div class="basic-list-item" v-for="$1" :key="$2">
       <div class="item-title-row">
         <div class="item-title">{{ $3 }}</div>
         <div class="item-subtitle">{{ $4 || '' }}</div>
       </div>`);

  // Handle OrderDetail using <GlassListItem title="..."> without v-for (if any)
  content = content.replace(/<GlassListItem([^>]*)>/g, '<div class="basic-list-item" $1>');
  
  content = content.replace(/<\/GlassListItem>/g, '</div>');

  // If there are :title or title left on basic-list-item div, it's invalid Vue syntax for div, but if we don't fix it thoroughly it will break.
  // We can strip out :title, :subtitle, :show-more, :clickable, etc from div using regex
  content = content.replace(/<div class="basic-list-item"((?:(?!\/?>).)*)>/gs, (match, attrs) => {
     let cleanAttrs = attrs.replace(/:title="[^"]*"/g, '')
                           .replace(/:subtitle="[^"]*"/g, '')
                           .replace(/title="[^"]*"/g, '')
                           .replace(/subtitle="[^"]*"/g, '')
                           .replace(/:show-more="[^"]*"/g, '')
                           .replace(/:clickable="[^"]*"/g, '');
     return `<div class="basic-list-item"${cleanAttrs}>`;
  });

  // Inject basic-list-item css
  if (!content.includes('.basic-list-item {')) {
    content = content.replace(/<\/style>/, `
.basic-list-item {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
  border: 1px solid var(--glass-border);
}
.item-title-row {
  margin-bottom: 8px;
  border-bottom: 1px solid var(--glass-border);
  padding-bottom: 8px;
}
.item-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.item-subtitle {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 4px;
}
</style>`);
  }

  fs.writeFileSync(file, content, 'utf8');
});
