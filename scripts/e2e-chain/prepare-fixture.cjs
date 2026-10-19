'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {DATABASE,dbConfig,requireBackend,evidenceDir}=require('./config.cjs');
async function main(){
  const file=path.join(evidenceDir,'fixture.private.json');
  if(fs.existsSync(file))throw new Error('Fixture already exists; use the saved fixture, do not duplicate.');
  const db=await requireBackend('mysql2/promise').createConnection(dbConfig);
  const insert=async(table,data)=>{const [r]=await db.query(`INSERT INTO \`${table}\` SET ?`,data);return {id:r.insertId,...data};};
  try{
    const [[identity]]=await db.query('SELECT DATABASE() AS name');
    if(identity.name!==DATABASE)throw new Error('Wrong fixture database');
    await db.beginTransaction();
    const prefix='CHAIN'+Date.now().toString().slice(-8);
    const [roles]=await db.query('SELECT id,code FROM roles WHERE status=1');
    const actors={};
    for(const [name,roleCodes] of Object.entries({business:['admin'],finance:['finance_manager','cashier'],reviewer:['finance_manager','cashier']})){
      const password=crypto.randomBytes(20).toString('base64url')+'aA1!';
      const data=await insert('users',{username:`${prefix}_${name}`,password:await requireBackend('bcryptjs').hash(password,10),real_name:`${prefix}_${name}`,status:1,role:'user'});
      for(const code of roleCodes){const role=roles.find(r=>r.code===code);if(!role)throw new Error(`Missing role ${code}`);await insert('user_roles',{user_id:data.id,role_id:role.id});}
      actors[name]={id:data.id,username:data.username,realName:data.real_name,password};
    }
    const supplier=await insert('suppliers',{code:prefix+'SUP',name:prefix+'测试供应商',status:1,remark:prefix});
    const customer=await insert('customers',{code:prefix+'CUS',name:prefix+'测试客户',status:'active',credit_limit:100000,remark:prefix});
    const [[unit]]=await db.query('SELECT id,name FROM units WHERE deleted_at IS NULL ORDER BY id LIMIT 1');
    const location=await insert('locations',{code:prefix+'WH',name:prefix+'测试仓',status:1,remark:prefix});
    const [sources]=await db.query('SELECT id,type FROM material_sources WHERE deleted_at IS NULL');
    const materials={};
    for(const [key,type,quantity,price,cost]of[['internal','finished',5,100,10],['external','finished',3,40,15],['raw','raw',10,5,5],['semi','semi_finished',5,20,15]]){
      const source=sources.find(r=>r.type===(['internal','semi'].includes(key)?'internal':'external'));
      const data=await insert('materials',{code:prefix+key.toUpperCase(),name:prefix+'_'+key,material_source_id:source.id,supplier_id:supplier.id,unit_id:unit.id,location_id:location.id,location_name:location.name,material_type:type,price,cost_price:cost,tax_rate:0.13,status:1,remark:prefix});
      materials[key]={...data,quantity,price,onHand:0,costPrice:cost};
    }
    await db.commit();
    const fixture={database:DATABASE,prefix,today:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}),actors,supplier,customer,unit,location,locations:{raw:location,finished:location},materials};
    fs.mkdirSync(evidenceDir,{recursive:true});fs.writeFileSync(file,JSON.stringify(fixture,null,2));
    console.log(JSON.stringify({database:DATABASE,prefix,materialIds:Object.fromEntries(Object.entries(materials).map(([k,v])=>[k,v.id])),actorIds:Object.fromEntries(Object.entries(actors).map(([k,v])=>[k,v.id]))},null,2));
  }catch(e){await db.rollback();throw e;}finally{await db.end();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
