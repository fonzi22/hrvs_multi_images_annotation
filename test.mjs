import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validBox,poolFor,qaErrors,sampleErrors,zip} from './dist/core.js';
import {writeFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {imageHash,isImageFile} from './dist/import.js';
test('HTTP fallback and Web Crypto produce identical SHA-256 IDs',async()=>{
  for(const size of [0,3,55,56,63,64,65,127,128,10000]){
    const bytes=Uint8Array.from({length:size},(_,i)=>(i*37)%256);
    const expected=createHash('sha256').update(bytes).digest('hex');
    assert.equal(await imageHash(bytes.buffer,null),expected);
    assert.equal(await imageHash(bytes.buffer,webcrypto.subtle),expected);
  }
});
test('import detects images by MIME or extension',()=>{
  for(const file of [{name:'photo.JFIF',type:''},{name:'no-extension',type:'image/png'},{name:'photo.JPG',type:'application/octet-stream'}])assert(isImageFile(file));
  assert(!isImageFile({name:'notes.txt',type:'text/plain'}));
});
const image={width:1000,height:1000};
const good={gt_id:'gt',annotator:'test',question:'What color is the hat worn by the person in the striped shirt?',answer:'Blue',question_type:'Attribute',answer_type:'Color',references:['',''],target_bbox:{x:0,y:0,width:30,height:30},selected:Array.from({length:19},(_,i)=>'o'+i),reviewed:Object.fromEntries(Array.from({length:19},(_,i)=>['o'+i,true])),checks:Array(5).fill(true)};
test('bbox: strict original-pixel threshold and finite bounds',()=>{assert(validBox(good.target_bbox,1000,1000));for(const b of [{x:0,y:0,width:10,height:100},{x:0,y:0,width:100,height:100},{x:-1,y:0,width:1,height:1},{x:999,y:0,width:2,height:2},{x:0,y:0,width:NaN,height:1},{x:0,y:0,width:0,height:1}])assert(!validBox(b,1000,1000));});
test('pool uniqueness, size, exhaustion and unseen-first shuffle',()=>{const a=Array.from({length:230},(_,i)=>i),first=poolFor(a),second=poolFor(a,first);assert.equal(first.length,100);assert.equal(new Set(first).size,100);assert.equal(second.filter(x=>first.includes(x)).length,0);assert.equal(poolFor(a.slice(0,12)).length,12);assert.deepEqual(poolFor([]),[]);});
test('completion requires 19 distinct reviewed others, checks, valid GT',()=>{assert.deepEqual(sampleErrors(good,image,good.selected),[]);for(const s of [{...good,selected:good.selected.slice(1)},{...good,selected:[...good.selected,'extra']},{...good,selected:Array(19).fill('o1')},{...good,selected:['gt',...good.selected.slice(1)]},{...good,reviewed:{}},{...good,checks:[]},{...good,annotator:''}])assert(sampleErrors(s,image,good.selected).length);});
test('spatial references and answer type, banned question/answer forms',()=>{assert(qaErrors({...good,question_type:'Spatial'},image).length);assert.deepEqual(qaErrors({...good,question_type:'Spatial',answer_type:'Spatial Position',question:'Where is the red bag relative to the blue bicycle?',answer:'Left of the bicycle',references:['blue bicycle','']},image),[]);assert(qaErrors({...good,question:'How many bags are visible?'},image).length);assert(qaErrors({...good,answer:'Yes'},image).length);});
test('ZIP supports original bytes and Unicode names',async()=>{const b=await zip([['ảnh.txt',new Blob(['test image bytes'])],['annotations.json',new Blob(['{"K":1,"N":20}'])]]);await writeFile('/tmp/hrvs-test.zip',new Uint8Array(await b.arrayBuffer()));assert(b.size>100);});
