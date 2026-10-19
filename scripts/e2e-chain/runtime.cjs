'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {DATABASE,dbConfig,requireBackend,evidenceDir,baseUrl:pcBaseUrl}=require('./config.cjs');
function loadPlaywright(){
  if(process.env.CHAIN_PLAYWRIGHT_MODULE)return require(process.env.CHAIN_PLAYWRIGHT_MODULE);
  try{return require('playwright');}catch{}
  const cache=path.join(process.env.LOCALAPPDATA||'', 'npm-cache','_npx');
  for(const folder of fs.existsSync(cache)?fs.readdirSync(cache):[]){
    const candidate=path.join(cache,folder,'node_modules','playwright');
    if(fs.existsSync(path.join(candidate,'package.json')))return require(candidate);
  }
  throw new Error('Install Playwright or set CHAIN_PLAYWRIGHT_MODULE.');
}
async function createRuntime(phase){
  const mobile=process.env.CHAIN_MOBILE==='1';
  const baseUrl=mobile?'http://127.0.0.1:3512':pcBaseUrl;
  const fixture=JSON.parse(fs.readFileSync(path.join(evidenceDir,'fixture.private.json'),'utf8'));
  assert.equal(fixture.database,DATABASE,'Saved fixture belongs to another database; refusing to run');
  for(const name of ['manufacturing','finance']){
    const extra=path.join(evidenceDir,`${name}-fixture.json`);
    if(fs.existsSync(extra))fixture[name]=JSON.parse(fs.readFileSync(extra,'utf8'));
  }
  fixture.sales={customer:fixture.customer,contractCode:fixture.prefix+'CONTRACT',deliveryDate:fixture.today,
    lines:['internal','external'].map(key=>({...fixture.materials[key],sourceType:key,bom:key==='internal'?[{materialId:fixture.materials.raw.id,quantityPerUnit:2}]:[]}))};
  const {chromium}=loadPlaywright();
  const browser=await chromium.launch({headless:process.env.CHAIN_HEADED!=='1',channel:'chrome'});
  const db=await requireBackend('mysql2/promise').createConnection(dbConfig);
  const [[database]]=await db.query('SELECT DATABASE() AS name');
  if(database.name!==DATABASE){await db.end();await browser.close();throw new Error('Connected database does not match the isolated fixture');}
  const contexts={},pages={},results=[],network=[];
  const runDir=path.join(evidenceDir,`${phase}-${Date.now()}`);fs.mkdirSync(runDir,{recursive:true});
  const ctx={fixture,db,baseUrl,evidenceDir:runDir,actors:fixture.actors,results,network};
  ctx.record=async(name,detail)=>{results.push({type:'evidence',name,detail,at:new Date().toISOString()});fs.writeFileSync(path.join(runDir,'results.json'),JSON.stringify(results,null,2));};
  ctx.snapshot=async(name)=>{
    if(!ctx.page)return;
    const stem=name.replace(/[^\p{L}\p{N}_-]/gu,'-').slice(0,90);
    await ctx.page.screenshot({path:path.join(runDir,stem+'.png'),fullPage:true}).catch(()=>{});
    await ctx.page.locator('body').ariaSnapshot().then(s=>fs.writeFileSync(path.join(runDir,stem+'.aria.txt'),s)).catch(()=>{});
  };
  ctx.step=async(name,fn)=>{
    const start=Date.now();console.log('START '+name);
    try{const value=await fn();results.push({type:'step',name,status:'PASS',ms:Date.now()-start});await ctx.snapshot(`${results.length}-PASS-${name}`);console.log('PASS '+name);return value;}
    catch(e){results.push({type:'step',name,status:'FAIL',error:e.stack,ms:Date.now()-start});await ctx.snapshot(`${results.length}-FAIL-${name}`);console.error('FAIL '+name+': '+e.message);throw e;}
    finally{fs.writeFileSync(path.join(runDir,'results.json'),JSON.stringify(results,null,2));}
  };
  ctx.asActor=async(name)=>{
    assert(fixture.actors[name],`Unknown actor ${name}`);
    if(!contexts[name]){
      contexts[name]=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1600,height:1000},isMobile:mobile,hasTouch:mobile,locale:'zh-CN',timezoneId:'Asia/Taipei'});
      await contexts[name].route('**/api/**', route=>{
        if(new URL(route.request().url()).origin!==new URL(baseUrl).origin){
          network.push({type:'isolation-violation',url:route.request().url()});
          return route.abort('blockedbyclient');
        }
        return route.continue();
      });
      await contexts[name].tracing.start({screenshots:true,snapshots:true,sources:false});
      const page=pages[name]=await contexts[name].newPage();page.setDefaultTimeout(25000);
      page.on('pageerror',e=>network.push({actor:name,type:'pageerror',message:e.message}));
      page.on('response',async response=>{
        const request=response.request(),url=new URL(response.url());
        if(!url.pathname.startsWith('/api/')||url.pathname.includes('/auth/')||url.pathname.includes('csrf'))return;
        if(request.method()==='GET'&&response.status()<400)return;
        const item={actor:name,method:request.method(),path:url.pathname,status:response.status()};
        if(request.method()!=='GET')item.request=request.postData();
        try{item.response=await response.json();}catch{}
        network.push(item);
      });
      await page.goto(baseUrl+'/login');
      await page.getByPlaceholder(mobile?'请输入用户名':'请输入手机号或邮箱').fill(fixture.actors[name].username);
      await page.getByPlaceholder('请输入密码').fill(fixture.actors[name].password);
      const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/login'&&r.request().method()==='POST');
      await page.getByRole('button',{name:'登录',exact:true}).click();
      const login=await response;assert.equal(login.status(),200,'UI login failed');
      await page.waitForURL(url=>url.pathname!=='/login');
    }
    ctx.page=pages[name];ctx.actor=name;return ctx.page;
  };
  ctx.api=async(method,url,body,actor=ctx.actor||'business')=>{
    if(!contexts[actor]){const old=ctx.actor;await ctx.asActor(actor);if(old)await ctx.asActor(old);}
    const req=contexts[actor].request,headers={};
    if(method.toUpperCase()!=='GET'){
      const csrf=await req.get(baseUrl+'/api/csrf-token');const b=await csrf.json();
      headers['X-CSRF-Token']=b.csrfToken||b.token||b.data?.csrfToken;
    }
    const response=await req.fetch(baseUrl+(url.startsWith('/api/')?url:'/api'+url),{method,headers,data:body});
    return {status:response.status(),body:await response.json()};
  };
  ctx.saveChain=chain=>fs.writeFileSync(path.join(evidenceDir,'chain.json'),JSON.stringify(chain,null,2));
  ctx.loadChain=()=>JSON.parse(fs.readFileSync(path.join(evidenceDir,'chain.json'),'utf8'));
  ctx.close=async()=>{
    fs.writeFileSync(path.join(runDir,'network.json'),JSON.stringify(network,null,2));
    for(const [name,context]of Object.entries(contexts))await context.tracing.stop({path:path.join(runDir,`${name}-trace.zip`)}).catch(()=>{});
    await browser.close();await db.end();console.log('Evidence: '+runDir);
  };
  try { await ctx.asActor('business'); } catch(error) { await ctx.close(); throw error; }
  return ctx;
}
module.exports={createRuntime,loadPlaywright};
