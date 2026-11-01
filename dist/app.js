import {imageHash,isImageFile} from './import.js';
import {ANSWERS,validBox,poolFor,qaErrors,sampleErrors} from './core.js';
const $=id=>document.getElementById(id);let db,images=[],samples={},active=null,step=1,viewerId=null,importing=false;const urls=new Map();let toastTimer;
const checksText=['GT có đúng một target thỏa mọi cues; answer thấy rõ từ pixels, cần visual search.','Question và Answer bằng English; không OCR, đếm, Yes/No, chất liệu hoặc suy diễn; không lộ answer.','Question type đúng; Spatial có 1–2 mốc duy nhất và answer là vị trí tương đối.','Bbox ôm sát toàn bộ phần nhìn thấy của target instance, không nhầm sang answer object; dưới 0.1%.','Đã kiểm tra cả 20 ảnh: chỉ GT trả lời được Q. Không có ảnh trùng, crop hay resize từ cùng ảnh.'];
function toast(message,error=false){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').className=error?'error':'';$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,error?11000:5000);}
function request(store,mode,action){return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode);const r=action(tx.objectStore(store));tx.oncomplete=()=>resolve(r?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Không thể lưu dữ liệu.'));});}
const put=(store,value)=>request(store,'readwrite',s=>s.put(value));const get=(store,key)=>request(store,'readonly',s=>s.get(key));const all=store=>request(store,'readonly',s=>s.getAll());
const current=()=>samples[active];const meta=id=>images.find(i=>i.id===id);const otherIds=()=>images.filter(i=>i.roles.includes('other')&&i.id!==active).map(i=>i.id);
function newSample(id){return {gt_id:id,sample_id:'sample_'+id,annotator:$('annotator').value.trim(),question_type:'Attribute',answer_type:'Color',question:'',answer:'',references:['',''],notes:'',target_bbox:null,selected:[],reviewed:{},pool:[],checks:Array(5).fill(false),status:'draft',created_at:new Date().toISOString()};}
async function persist(){if(!active)return;const s=current();s.updated_at=new Date().toISOString();try{await put('samples',structuredClone(s));$('status').textContent=s.status==='complete'?'✓ Hoàn tất':'Nháp · Đã lưu';renderList();scheduleBackup();return true;}catch(e){$('status').textContent='Lỗi lưu dữ liệu';toast('Không lưu được. Có thể bộ nhớ trình duyệt đã đầy. Hãy kiểm tra trạng thái backup. '+e.message,true);return false;}}
function invalidate(){const s=current();s.status='draft';s.checks=Array(5).fill(false);s.reviewed={};renderChecks();persist();}
async function imageUrl(id,thumb=false){const key=id+(thumb?'-thumb':'');if(urls.has(key))return urls.get(key);const row=await get('blobs',id);if(!row)throw Error('Thiếu ảnh. Nhập lại folder chứa ảnh này.');const url=URL.createObjectURL(thumb?row.thumb:row.blob);urls.set(key,url);return url;}
async function readImage(blob){const url=URL.createObjectURL(blob);try{const img=new Image();img.src=url;await img.decode();return img;}finally{URL.revokeObjectURL(url);}}
async function thumbnail(img){const c=document.createElement('canvas'),scale=Math.min(1,320/img.naturalWidth,220/img.naturalHeight);c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(img.naturalHeight*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Không tạo được thumbnail.')),'image/jpeg',.8));}
const importInputs=['gtFolder','otherFolder','gtFiles','otherFiles'];
function setImportEnabled(enabled){for(const id of importInputs)$(id).disabled=!enabled;}
async function importFolder(files,role){
  if(importing){toast('Đợi lượt nhập hiện tại hoàn tất.',true);return;}
  const candidates=Array.from(files).filter(isImageFile);
  if(!candidates.length){toast('Không tìm thấy ảnh. Hãy chọn thư mục chứa ảnh hoặc dùng Chọn ảnh lẻ (JPG, PNG, WebP…).',true);return;}
  importing=true;setImportEnabled(false);
  let imported=0,duplicates=0;const failures=[];
  $('importStatus').textContent=`Đang chuẩn bị nhập ${candidates.length} ảnh…`;
  try{
    // Persistent storage is optional; a permission failure must not block importing.
    try{await navigator.storage?.persist?.();}catch{}
    for(const [index,file] of candidates.entries()){
      $('importStatus').textContent=`Đang nhập ${index+1}/${candidates.length}: ${file.name}`;
      // Let the browser paint progress between files, including duplicate files.
      await new Promise(resolve=>setTimeout(resolve,0));
      try{
        const hash=await imageHash(await file.arrayBuffer());
        const existing=meta(hash);
        if(existing){
          if(!existing.roles.includes(role)){
            const row={...existing,roles:[...existing.roles,role]};
            await put('images',row);images[images.indexOf(existing)]=row;
          }
          duplicates++;continue;
        }
        const img=await readImage(file),thumb=await thumbnail(img);
        const row={id:hash,name:file.name,path:file.webkitRelativePath||file.name,width:img.naturalWidth,height:img.naturalHeight,size:file.size,type:file.type,roles:[role]};
        await put('blobs',{id:hash,blob:file,thumb});await put('images',row);images.push(row);imported++;
      }catch(e){
        failures.push(file.name+': '+(e.name==='QuotaExceededError'?'Bộ nhớ trình duyệt đã đầy. Hãy backup dữ liệu và giải phóng dung lượng.':e.message));
        if(e.name==='QuotaExceededError')break;
      }
    }
    const processed=imported+duplicates+failures.length;
    const message=`Đã nhập ${imported} ảnh; ${duplicates} ảnh trùng nội dung được gộp.`+(failures.length?'\nKhông nhập được '+failures.length+' ảnh: '+failures.slice(0,3).join('; '):'')+(processed<candidates.length?`\nCòn ${candidates.length-processed} ảnh chưa xử lý.`:'');
    $('importStatus').textContent=message;toast(message,!!failures.length);
    renderList();
    if(!active){const gt=images.find(i=>i.roles.includes('gt'));if(gt)await selectGT(gt.id);}
  }finally{
    importing=false;setImportEnabled(true);
    for(const id of importInputs)$(id).value='';
    renderList();scheduleBackup();
  }
}
function gtState(s){if(s?.status==='complete')return 'complete';return s&&(s.question.trim()||s.answer.trim()||s.target_bbox||s.notes?.trim()||s.selected.length||s.references.some(r=>r.trim()))?'draft':'new';}
function renderList(){const gts=images.filter(i=>i.roles.includes('gt')),others=images.filter(i=>i.roles.includes('other')),done=Object.values(samples).filter(s=>s.status==='complete').length;$('datasetInfo').textContent=`${gts.length} GT · ${others.length} OtherImages`;$('progress').textContent=`${done} / 100 samples`;$('progressBar').value=done;$('totalGT').textContent=`${gts.length} GT`;$('gtList').replaceChildren();const term=$('search').value.toLowerCase();for(const img of gts.filter(i=>i.path.toLowerCase().includes(term))){const b=document.createElement('button');b.className='gt-item'+(img.id===active?' active':'')+(samples[img.id]?.status==='complete'?' done':'');const label=document.createElement('span');label.textContent=img.path;b.title=img.path;label.className='gt-name';const state=gtState(samples[img.id]);const badge=document.createElement('small');badge.className='gt-state '+state;badge.textContent={new:'Chưa annotate',draft:'Đang annotate',complete:'Đã annotate'}[state];b.dataset.status=state;b.append(label,badge);b.onclick=()=>selectGT(img.id).catch(e=>toast(e.message,true));$('gtList').append(b);}}
class Viewport{constructor(canvas,draw=false){this.c=canvas;this.ctx=canvas.getContext('2d');this.img=null;this.scale=1;this.x=0;this.y=0;this.mode=draw?'draw':'pan';this.allowDraw=draw;this.box=null;this.drag=null;this.loadToken=0;new ResizeObserver(()=>{this.resize();this.fit();}).observe(canvas);canvas.addEventListener('wheel',e=>{e.preventDefault();const p=this.point(e);this.zoom(Math.exp(-e.deltaY*.001),p.x,p.y);},{passive:false});canvas.onpointerdown=e=>{if(!this.img||e.button!==0)return;const p=this.point(e);if(this.mode==='draw'){const q=this.coords(p);if(q.x<0||q.y<0||q.x>this.img.naturalWidth||q.y>this.img.naturalHeight)return;}canvas.setPointerCapture(e.pointerId);this.drag={p,start:this.coords(p),x:this.x,y:this.y};};canvas.onpointermove=e=>{if(!this.drag)return;const p=this.point(e);if(this.mode==='pan'){this.x=this.drag.x+p.x-this.drag.p.x;this.y=this.drag.y+p.y-this.drag.p.y;}else{const q=this.coords(p),a=this.drag.start;this.preview={x:Math.min(a.x,q.x),y:Math.min(a.y,q.y),width:Math.abs(q.x-a.x),height:Math.abs(q.y-a.y)};}this.paint();};canvas.onpointerup=()=>{if(!this.drag)return;if(this.mode==='draw'&&this.preview){const b=this.preview;if(validBox(b,this.img.naturalWidth,this.img.naturalHeight)){this.box=b;current().target_bbox=b;invalidate();renderBBox();}else toast('Bbox bị từ chối: phải có diện tích > 0, nằm trong ảnh và nhỏ hơn 0.1% ảnh gốc.',true);}this.drag=null;this.preview=null;this.paint();};canvas.onpointercancel=()=>{this.drag=null;this.preview=null;this.paint();};}
resize(){const r=this.c.getBoundingClientRect();this.w=r.width;this.h=r.height;const dpr=window.devicePixelRatio||1;this.c.width=Math.max(1,Math.round(r.width*dpr));this.c.height=Math.max(1,Math.round(r.height*dpr));this.ctx.setTransform(dpr,0,0,dpr,0,0);}
point(e){const r=this.c.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}coords(p){return{x:Math.max(0,Math.min(this.img.naturalWidth,(p.x-this.x)/this.scale)),y:Math.max(0,Math.min(this.img.naturalHeight,(p.y-this.y)/this.scale))};}
async load(id,box=null){const token=++this.loadToken;this.img=null;this.box=null;this.paint();const img=new Image();img.src=await imageUrl(id);await img.decode();if(token!==this.loadToken)return;this.img=img;this.box=box;this.resize();this.fit();}
fit(){if(!this.img||!this.w||!this.h)return;this.scale=Math.min(this.w/this.img.naturalWidth,this.h/this.img.naturalHeight)*.96;this.x=(this.w-this.img.naturalWidth*this.scale)/2;this.y=(this.h-this.img.naturalHeight*this.scale)/2;this.paint();}
zoom(f,x=this.w/2,y=this.h/2){if(!this.img)return;const next=Math.min(32,Math.max(.005,this.scale*f)),ratio=next/this.scale;this.x=x-(x-this.x)*ratio;this.y=y-(y-this.y)*ratio;this.scale=next;this.paint();}
paint(){const c=this.ctx;c.clearRect(0,0,this.w||1,this.h||1);if(!this.img)return;c.drawImage(this.img,this.x,this.y,this.img.naturalWidth*this.scale,this.img.naturalHeight*this.scale);const b=this.preview||this.box;if(b){c.strokeStyle=validBox(b,this.img.naturalWidth,this.img.naturalHeight)?'#3df5ba':'#ff6774';c.fillStyle=validBox(b,this.img.naturalWidth,this.img.naturalHeight)?'#3df5ba20':'#ff677420';c.lineWidth=2;c.fillRect(this.x+b.x*this.scale,this.y+b.y*this.scale,b.width*this.scale,b.height*this.scale);c.strokeRect(this.x+b.x*this.scale,this.y+b.y*this.scale,b.width*this.scale,b.height*this.scale);}}}
const gtView=new Viewport($('canvas'),true),otherView=new Viewport($('otherCanvas'));
async function selectGT(id){active=id;try{localStorage.setItem('hrvs-active-gt',id);}catch{}if(!samples[id])samples[id]=newSample(id);const s=current(),i=meta(id);$('empty').hidden=true;$('editor').hidden=false;$('imageName').textContent=i.path;$('dimensions').textContent=`${i.width} × ${i.height} px · Original`;$('questionType').value=s.question_type;fillAnswerTypes(s.answer_type);$('question').value=s.question;$('answer').value=s.answer;$('ref1').value=s.references[0]||'';$('ref2').value=s.references[1]||'';$('notes').value=s.notes||'';if(s.annotator)$('annotator').value=s.annotator;renderChecks();renderBBox();setStep(1);renderList();await gtView.load(id,s.target_bbox);await persist();}
function fillAnswerTypes(selected){const spatial=$('questionType').value==='Spatial';$('answerType').replaceChildren();for(const type of ANSWERS.filter(a=>spatial?a==='Spatial Position':a!=='Spatial Position')){const o=document.createElement('option');o.textContent=type;$('answerType').append(o);}if([...$('answerType').options].some(o=>o.value===selected))$('answerType').value=selected;$('referenceFields').hidden=!['Spatial','Relation'].includes($('questionType').value);$('typeHelp').textContent={Attribute:'Cue chính: thuộc tính nhìn thấy. Hỏi một chi tiết khác chưa được tiết lộ.',Spatial:'Hỏi vị trí tương đối của target với 1–2 object mốc; answer là vị trí.',Relation:'Cue chính: tương tác nhìn thấy. Hỏi một thuộc tính, hành động hoặc trạng thái khác.'}[$('questionType').value];}
function updateQA(){if(!active)return;const s=current();s.question_type=$('questionType').value;s.answer_type=$('answerType').value;s.question=$('question').value;s.answer=$('answer').value;s.references=[$('ref1').value,$('ref2').value];invalidate();}
function renderBBox(){if(!active)return;const b=current().target_bbox,i=meta(active);$('bboxInfo').textContent=b?`Target: (${b.x.toFixed(1)}, ${b.y.toFixed(1)}) · ${b.width.toFixed(1)} × ${b.height.toFixed(1)} px · ${(100*b.width*b.height/(i.width*i.height)).toFixed(6)}% < 0.1%`:'Chưa có target bbox — hãy zoom rồi vẽ sát target.';}
function setStep(n){if(!active)return;if(n>1){const errors=qaErrors(current(),meta(active));if(errors.length){toast(errors.join('\n'),true);return;}}step=n;for(let k=1;k<=3;k++)$('step'+k).hidden=k!==n;document.querySelectorAll('[data-step]').forEach(b=>b.classList.toggle('active',+b.dataset.step===n));if(n===1){gtView.resize();gtView.fit();}if(n===2){ensurePool();renderPool();}if(n===3)renderReview();}
function ensurePool(shuffle=false){const s=current(),available=otherIds().filter(id=>!s.selected.includes(id));const old=s.pool||[];s.pool=old.filter(id=>available.includes(id));if(shuffle||s.pool.length===0)s.pool=poolFor(available,shuffle?old:[]);else if(s.pool.length<Math.min(100,available.length)){const left=available.filter(id=>!s.pool.includes(id));s.pool.push(...poolFor(left,[],100-s.pool.length));}persist();}
let poolRender=0;
async function renderPool(){const render=++poolRender,s=current();$('selectionCount').textContent=`${s.selected.length} / 19`;$('poolQuestion').textContent='Q: '+s.question;$('poolCount').textContent=`Pool: ${s.pool.length} ảnh ngẫu nhiên${s.pool.length<100?' · Nguồn còn dưới 100 ảnh chưa chọn':''}`;$('reviewProgress').textContent=`${s.selected.filter(id=>s.reviewed[id]).length} / 19 ảnh đã kiểm tra`;$('poolGrid').replaceChildren();const ids=$('selectedOnly').checked?s.selected:[...s.selected,...s.pool.filter(id=>!s.selected.includes(id))];for(const id of ids){const i=meta(id);if(!i)continue;const b=document.createElement('button');b.className='image-card'+(s.selected.includes(id)?' selected':'');const img=document.createElement('img');img.loading='lazy';img.alt=i.name;const name=document.createElement('span');name.className='caption';name.textContent=i.path;b.title=i.path;b.append(img,name);if(s.selected.includes(id)){const tag=document.createElement('span');tag.className='tag';tag.textContent=s.reviewed[id]?'✓ Đã kiểm tra':'↻ Cần kiểm tra lại';b.append(tag);}b.onclick=()=>openOther(id);$('poolGrid').append(b);imageUrl(id,true).then(url=>{if(render===poolRender)img.src=url;}).catch(e=>toast(e.message,true));}}
async function openOther(id){viewerId=id;$('viewerName').textContent=meta(id).path;$('viewerQuestion').textContent='Q: '+current().question;$('confirmOther').disabled=true;$('removeOther').disabled=!current().selected.includes(id);$('viewer').showModal();try{await otherView.load(id);$('confirmOther').disabled=false;}catch(e){toast(e.message,true);}}
function renderChecks(){const s=current();if(!s)return;$('checks').replaceChildren();checksText.forEach((text,k)=>{const label=document.createElement('label');label.className='inline';const box=document.createElement('input');box.type='checkbox';box.checked=s.checks[k];box.onchange=()=>{s.checks[k]=box.checked;s.status='draft';persist();};const span=document.createElement('span');span.textContent=text;label.append(box,span);$('checks').append(label);});}
function renderReview(){const s=current(),m=meta(active);$('reviewSummary').replaceChildren();for(const text of [`GT: ${m.path}`,`Question type: ${s.question_type} · Answer type: ${s.answer_type}`,`Q: ${s.question}`,`A: ${s.answer}`,`Target bbox: ${(100*s.target_bbox.width*s.target_bbox.height/(m.width*m.height)).toFixed(6)}% · ${s.selected.length} OtherImages`]){const p=document.createElement('div');p.textContent=text;$('reviewSummary').append(p);}const reviewed=s.selected.filter(id=>s.reviewed[id]).length;$('allImagesViewed').checked=reviewed===19&&s.selected.length===19;$('reviewCount').textContent=`${reviewed} / 19 OtherImages đã mở và xác nhận với Q/A hiện tại.`;renderChecks();}
function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function exportRecord(s){const i=meta(s.gt_id);return {...s,K:1,N:20,bbox_format:'xywh_original_pixels',bbox_area_ratio:s.target_bbox.width*s.target_bbox.height/(i.width*i.height),gt_image_id:s.gt_id,other_image_ids:s.selected,images:[s.gt_id,...s.selected].map(id=>({...meta(id),source_path:meta(id).path}))};}
async function exportSamples(list){if(!list.length){toast('Chưa có sample hoàn tất để export.',true);return;}for(const s of list){const e=sampleErrors(s,meta(s.gt_id),images.filter(i=>i.roles.includes('other')).map(i=>i.id));if(s.status!=='complete'||e.length){toast('Sample chưa hoàn tất hoặc không hợp lệ: '+(e.join(' ')||'Hãy lưu hoàn tất.'),true);return;}}download(new Blob([JSON.stringify({schema_version:1,exported_at:new Date().toISOString(),samples:list.map(exportRecord)},null,2)],{type:'application/json'}),'hrvs_'+list.length+'_samples_'+Date.now()+'.json');toast('Đã export annotation JSON.');}
for(const [id,role] of [['gtFolder','gt'],['otherFolder','other'],['gtFiles','gt'],['otherFiles','other']])$(id).onchange=e=>importFolder(e.target.files,role).catch(e=>{$('importStatus').textContent='Không nhập được ảnh: '+e.message;toast(e.message,true);});$('search').oninput=renderList;$('questionType').onchange=()=>{fillAnswerTypes();updateQA();};for(const id of ['question','answer','ref1','ref2'])$(id).oninput=updateQA;$('answerType').onchange=updateQA;$('notes').oninput=()=>{if(active){current().notes=$('notes').value;persist();}};$('annotator').oninput=()=>{if(active){current().annotator=$('annotator').value.trim();current().status='draft';persist();}};
$('draw').onclick=()=>{gtView.mode='draw';$('draw').classList.add('active');$('pan').classList.remove('active');};$('pan').onclick=()=>{gtView.mode='pan';$('pan').classList.add('active');$('draw').classList.remove('active');};$('zoomIn').onclick=()=>gtView.zoom(1.4);$('zoomOut').onclick=()=>gtView.zoom(1/1.4);$('fit').onclick=()=>gtView.fit();$('clearBox').onclick=()=>{gtView.box=null;current().target_bbox=null;invalidate();renderBBox();gtView.paint();};$('otherPlus').onclick=()=>otherView.zoom(1.5);$('otherMinus').onclick=()=>otherView.zoom(1/1.5);$('otherFit').onclick=()=>otherView.fit();$('closeViewer').onclick=()=>$('viewer').close();$('guideBtn').onclick=()=>$('guide').showModal();$('closeGuide').onclick=()=>$('guide').close();
$('confirmOther').onclick=()=>{const s=current();if(!s.selected.includes(viewerId)){if(s.selected.length>=19){toast('Đã chọn đủ 19 ảnh. Bỏ một ảnh trước khi thêm ảnh khác.',true);return;}s.selected.push(viewerId);s.pool=s.pool.filter(id=>id!==viewerId);}s.reviewed[viewerId]=new Date().toISOString();s.status='draft';s.checks=Array(5).fill(false);persist();$('viewer').close();renderPool();};$('removeOther').onclick=()=>{const s=current();s.selected=s.selected.filter(id=>id!==viewerId);delete s.reviewed[viewerId];s.status='draft';s.checks=Array(5).fill(false);ensurePool();$('viewer').close();renderPool();};$('shuffle').onclick=()=>{ensurePool(true);renderPool();};$('selectedOnly').onchange=renderPool;document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>setStep(+b.dataset.step));$('toPool').onclick=()=>setStep(2);$('toReview').onclick=()=>setStep(3);
$('complete').onclick=async()=>{const s=current();s.annotator=$('annotator').value.trim();const errors=sampleErrors(s,meta(active),otherIds());if(errors.length){toast(errors.join('\n'),true);return;}s.status='complete';s.completed_at=new Date().toISOString();if(!await persist())return;toast('Đã lưu sample hoàn tất. Có thể export hoặc chọn GT tiếp theo.');};$('exportOne').onclick=()=>exportSamples([current()]);$('exportAll').onclick=()=>exportSamples(Object.values(samples).filter(s=>s.status==='complete'));
let backupId=null,backupTimer,backupDirty=false,backupWriting=false;
const workspaceBackup=()=>({schema_version:1,kind:'hrvs_workspace',backed_up_at:new Date().toISOString(),images,samples});
async function backupRequest(path,options){const response=await fetch(path,{cache:'no-store',...options});if(!response.ok)throw Error(`Máy chủ trả lỗi ${response.status}. Hãy chạy python server.py.`);return response.json();}
async function refreshBackups(){
  const rows=await backupRequest('/api/backups');const selected=$('serverBackups').value;$('serverBackups').replaceChildren();
  for(const row of rows){const option=document.createElement('option');option.value=row.name;option.textContent=new Date(row.updated_at*1000).toLocaleString('vi-VN')+' · '+row.name.slice(0,8);$('serverBackups').append(option);}
  if(rows.some(row=>row.name===selected))$('serverBackups').value=selected;
  $('restoreServer').disabled=!rows.length;
}
function scheduleBackup(){if(!backupId)return;backupDirty=true;clearTimeout(backupTimer);$('backupStatus').textContent='Đang chờ backup vào ./backup…';backupTimer=setTimeout(flushBackup,600);}
async function flushBackup(){
  if(!backupId||backupWriting||!backupDirty)return;
  backupWriting=true;backupDirty=false;
  try{
    await backupRequest('/api/backups/'+backupId+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(workspaceBackup())});
    $('backupStatus').textContent='Đã backup vào ./backup lúc '+new Date().toLocaleTimeString('vi-VN');
    refreshBackups().catch(()=>{});
  }catch(e){backupDirty=true;$('backupStatus').textContent='Backup chưa lưu: '+e.message;toast('Backup chưa lưu: '+e.message,true);}
  finally{backupWriting=false;if(backupDirty){clearTimeout(backupTimer);backupTimer=setTimeout(flushBackup,3000);}}
}
async function initBackup(){
  const saved=await get('settings','serverBackupId');
  backupId=saved?.value;
  if(!backupId){const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);backupId=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');await put('settings',{id:'serverBackupId',value:backupId});}
  try{await refreshBackups();$('backupStatus').textContent='Tự động backup vào ./backup sau mỗi thay đổi.';}
  catch(e){$('backupStatus').textContent='Backup chưa kết nối: '+e.message;}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&backupDirty)flushBackup();});
window.addEventListener('beforeunload',e=>{if(backupDirty||backupWriting){e.preventDefault();e.returnValue='';}});
$('restoreServer').onclick=async()=>{try{await restoreWorkspace(await backupRequest('/api/backups/'+$('serverBackups').value));}catch(e){toast(e.message,true);}};
async function restoreWorkspace(data){
  if(data.kind!=='hrvs_workspace'||data.schema_version!==1||!Array.isArray(data.images)||typeof data.samples!=='object'||!data.samples)throw Error('Sai định dạng backup.');
  const incoming=Object.entries(data.samples);
  for(const [id,s]of incoming){if(!/^[a-f0-9]{64}$/.test(id)||s.gt_id!==id||!Array.isArray(s.selected)||!Array.isArray(s.pool)||!Array.isArray(s.references)||!Array.isArray(s.checks)||!s.reviewed||typeof s.question!=='string'||typeof s.answer!=='string')throw Error('Backup chứa sample không hợp lệ.');}
  const missing=data.images.filter(i=>!meta(i.id));if(missing.length)throw Error(`Hãy nhập lại hai folder ảnh trước. Backup còn thiếu ${missing.length} ảnh.`);
  if(incoming.some(([id])=>samples[id])&&!confirm('Backup có GT đã tồn tại. Ghi đè các annotation trùng GT?'))return;
  for(const [id,s]of incoming){const errors=sampleErrors(s,meta(id),images.filter(i=>i.roles.includes('other')).map(i=>i.id));if(errors.length)s.status='draft';await put('samples',s);samples[id]=s;}
  renderList();if(active)await selectGT(active);scheduleBackup();toast('Đã khôi phục backup.');
}
$('restore').onchange=async e=>{try{const file=e.target.files[0];if(file)await restoreWorkspace(JSON.parse(await file.text()));}catch(e){toast(e.message,true);}finally{$('restore').value='';}};
async function boot(){db=await new Promise((resolve,reject)=>{const r=indexedDB.open('hrvs-multiimage-qa',2);r.onupgradeneeded=()=>{for(const name of ['images','blobs','settings'])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name,{keyPath:'id'});if(!r.result.objectStoreNames.contains('samples'))r.result.createObjectStore('samples',{keyPath:'gt_id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});await initBackup();images=await all('images');samples=Object.fromEntries((await all('samples')).map(s=>[s.gt_id,s]));renderList();let saved=null;try{saved=localStorage.getItem('hrvs-active-gt');}catch{}const first=images.find(i=>i.id===saved&&i.roles.includes('gt'))||images.find(i=>i.roles.includes('gt'));if(first)await selectGT(first.id);}
setImportEnabled(false);
boot().then(()=>setImportEnabled(true)).catch(e=>{
  $('importStatus').textContent='Không mở được bộ nhớ trình duyệt. Hãy cho phép lưu dữ liệu trang web và tải lại trang. '+e.message;
  toast('Không mở được workspace: '+e.message,true);
});
