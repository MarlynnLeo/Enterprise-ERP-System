'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createRuntime}=require('./runtime.cjs');
async function main(){
  const ctx=await createRuntime(process.env.CHAIN_MOBILE==='1'?'mobile-page-smoke':'page-smoke'),results=[];
  try{
    const routes=await ctx.page.evaluate(async()=>{
      const router=(await import('/src/router/index.js')).default;
      return [...new Map(router.getRoutes().filter(r=>r.components?.default&&!r.redirect&&!r.path.includes(':')).map(r=>[r.path,{path:r.path,title:r.meta.title||r.name,permission:r.meta.permission}])).values()];
    });
    const excluded=new Set(['/login','/force-password','/diagnose','/scan']);
    const selected=process.argv.slice(2);
    const targets=routes.filter(r=>!excluded.has(r.path)&&(!selected.length||selected.includes(r.path)));
    if(!targets.length)throw new Error('No matching page routes selected');
    for(const route of targets){
      const errors=[],responses=[];
      const onError=e=>errors.push(e.message);
      const onResponse=r=>{if(r.url().includes('/api/')&&r.status()>=400)responses.push({path:new URL(r.url()).pathname,status:r.status()});};
      ctx.page.on('pageerror',onError);ctx.page.on('response',onResponse);
      let result={...route};
      try{
        await ctx.page.goto(ctx.baseUrl+route.path,{waitUntil:'domcontentloaded'});
        await ctx.page.waitForLoadState('networkidle',{timeout:12000}).catch(()=>{});
        const info=await ctx.page.evaluate(()=>({url:location.pathname,textLength:document.body.innerText.length,buttons:[...document.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width>0).map(b=>({text:b.innerText.trim(),disabled:b.disabled})),alerts:[...document.querySelectorAll('.el-message--error,.el-notification--error')].filter(e=>e.getBoundingClientRect().width>0).map(e=>e.innerText)}));
        result={...result,...info,errors,responses,status:errors.length||responses.length||info.alerts.length||['/404','/403','/login','/force-password'].includes(info.url)||info.textLength<40?'FAIL':'PASS'};
        if(result.status==='FAIL')await ctx.snapshot('page-'+route.path);
      }catch(e){result={...result,status:'FAIL',error:e.message};await ctx.snapshot('page-'+route.path);}
      finally{ctx.page.off('pageerror',onError);ctx.page.off('response',onResponse);}
      results.push(result);fs.writeFileSync(path.join(ctx.evidenceDir,'pages.json'),JSON.stringify({scope:'Real API page load and visible button inventory, not workflow acceptance',results},null,2));
      console.log(`${results.length}/${targets.length} ${result.status} ${route.path}`);
    }
    console.log(JSON.stringify({pages:results.length,passed:results.filter(r=>r.status==='PASS').length,failures:results.filter(r=>r.status==='FAIL').map(r=>({path:r.path,errors:r.errors,responses:r.responses,error:r.error}))},null,2));
    if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
  }finally{await ctx.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
