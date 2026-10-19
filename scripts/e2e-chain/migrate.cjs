'use strict';
const path=require('node:path');
const {dbConfig,requireBackend}=require('./config.cjs');
async function main(){
  const knex=requireBackend('knex')({client:'mysql2',connection:dbConfig,migrations:{directory:path.resolve(__dirname,'../../backend/migrations')}});
  try{const [batch,files]=await knex.migrate.latest();console.log(JSON.stringify({database:dbConfig.database,batch,files}));}
  finally{await knex.destroy();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
