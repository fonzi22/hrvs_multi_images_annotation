const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  try{
    const base=process.env.HRVS_URL||'http://127.0.0.1:8793';const page=await browser.newPage({baseURL:base});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.HRVS_URL||'http://127.0.0.1:8793');
    await page.waitForFunction(()=>!document.querySelector('#gtFiles').disabled);
    assert.equal(await page.locator('#backup,#autoBackup,#changeBackup').count(),0);
    const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=50;return c.toDataURL().split(',')[1];}),'base64');
    await page.locator('#gtFiles').setInputFiles({name:'backup-test.png',mimeType:'image/png',buffer:png});
    await page.waitForSelector('.gt-item.active[data-status="new"]');
    await page.locator('#question').fill('Original question');
    await page.waitForSelector('.gt-item.active[data-status="draft"]');
    await page.waitForFunction(()=>document.querySelector('#backupStatus').textContent.startsWith('Đã backup'));
    const rows=await (await page.request.get('/api/backups')).json();
    const snapshot=await (await page.request.get('/api/backups/'+rows[0].name)).json();
    assert.equal(Object.values(snapshot.samples)[0].question,'Original question');
    const savedName='c'.repeat(32)+'.json';
    assert((await page.request.put('/api/backups/'+savedName,{data:snapshot})).ok());
    await page.route('**/api/backups/*',async route=>route.request().method()==='PUT'?route.abort():route.continue());
    await page.locator('#question').fill('Changed question');
    await page.waitForFunction(()=>document.querySelector('#backupStatus').textContent.startsWith('Backup chưa lưu:'));
    await page.unroute('**/api/backups/*');
    await page.waitForFunction(()=>document.querySelector('#backupStatus').textContent.startsWith('Đã backup'));
    await page.locator('#serverBackups').selectOption(savedName);
    page.once('dialog',d=>d.accept());
    await page.locator('#restoreServer').click();
    await page.waitForFunction(()=>document.querySelector('#question').value==='Original question');
    await page.waitForFunction(()=>document.querySelector('#backupStatus').textContent.startsWith('Đã backup'));
    await page.reload();await page.waitForFunction(()=>!document.querySelector('#gtFiles').disabled);
    assert.equal(await page.locator('#question').inputValue(),'Original question');
    // Old JSON files remain restorable through the file picker.
    await page.locator('#question').fill('Changed again');
    page.once('dialog',d=>d.accept());
    await page.locator('#restore').setInputFiles({name:'old.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(snapshot))});
    await page.waitForFunction(()=>document.querySelector('#question').value==='Original question');
    await page.waitForFunction(()=>document.querySelector('#backupStatus').textContent.startsWith('Đã backup'));
    assert.deepEqual(errors,[]);
    console.log('PASS: GT new/draft, automatic server backup, failure/retry, server restore, legacy JSON restore, reload, no backup download controls');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
