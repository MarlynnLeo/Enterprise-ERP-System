const materialService = require('./src/services/materialService');
const { mapKeysToCamel } = require('./src/utils/fieldMap');
(async () => {
  const res = await materialService.getAllMaterials(1, 5, { search: '100601' });
  console.log(JSON.stringify(mapKeysToCamel(res.data), null, 2));
  process.exit(0);
})().catch(e=>{console.error(e); process.exit(1)});
