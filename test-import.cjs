const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-proxy-server','--host-resolver-rules=MAP hrvs.test 127.0.0.1']});
  try{
    const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{if(navigator.storage)navigator.storage.persist=async()=>{throw Error('Permission denied');};});
    await page.goto(process.env.HRVS_IMPORT_URL||'http://hrvs.test:8793');
    await page.waitForFunction(()=>!document.querySelector('#gtFiles').disabled);
    assert.equal(await page.evaluate(()=>!!crypto.subtle),false,'exercise real insecure HTTP');
    const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=64;return c.toDataURL().split(',')[1];}),'base64');
    const file={name:'test.JFIF',mimeType:'',buffer:png};
    await page.locator('#gtFiles').setInputFiles(file);
    await page.waitForFunction(()=>document.querySelector('#datasetInfo').textContent.includes('1 GT')).catch(async e=>{console.error(await page.locator('#importStatus').textContent(),errors);throw e;});
    await page.waitForFunction(()=>!document.querySelector('#gtFiles').disabled);
    assert.equal(await page.locator('#gtFiles').inputValue(),'');
    assert(await page.locator('#editor').isVisible());
    await page.locator('#gtFiles').setInputFiles(file);
    await page.waitForFunction(()=>document.querySelector('#importStatus').textContent.includes('1 ảnh trùng'));
    await page.waitForFunction(()=>!document.querySelector('#otherFiles').disabled);
    await page.locator('#otherFiles').setInputFiles(file);
    await page.waitForFunction(()=>document.querySelector('#datasetInfo').textContent.includes('1 OtherImages'));
    await page.waitForFunction(()=>!document.querySelector('#gtFiles').disabled);
    await page.locator('#gtFiles').setInputFiles({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('hello')});
    await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Không tìm thấy ảnh'));
    await page.locator('#gtFiles').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('broken')});
    await page.waitForFunction(()=>document.querySelector('#importStatus').textContent.includes('Không nhập được 1 ảnh'));
    await page.reload();
    await page.waitForFunction(()=>!document.querySelector('#gtFiles').disabled);
    assert((await page.locator('#datasetInfo').textContent()).includes('1 GT · 1 OtherImages'));
    assert(await page.locator('#editor').isVisible());
    assert.deepEqual(errors,[]);
    console.log('PASS: insecure HTTP, denied persistence permission, JFIF, individual files, reselect, deduplication, GT/Other roles, empty selection, corrupt image, reload');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
