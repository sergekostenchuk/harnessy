import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync,unlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ATTACHMENT_MAX_BYTES} from '@harnessy/journal';
import {AttachmentStore} from './attachments.ts';
import {ProjectError} from './errors.ts';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const fixtures=[
 ['image/png','ui/evidence/screens/TASKPLAN-PRO-V3-d09c89fe-7506-1.png'],
 ['image/jpeg','ui/evidence/threads-disarto/2026-08-31-share-modal-light-dark.jpg'],
 ['image/webp','ui/evidence/screens/TASKPLAN-PRO-V2-25570f76-9746-1.webp']
] as const;
const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64');
function project(t:TestContext){const dir=mkdtempSync(join(tmpdir(),'harnessy-attachments-'));mkdirSync(join(dir,'.harness'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return {dir,store:new AttachmentStore(dir)}}
function code(fn:()=>unknown,value:string){assert.throws(fn,error=>error instanceof ProjectError&&error.code===value)}

test('stores four image formats by content hash and deduplicates bytes',t=>{const {store}=project(t),rows=[...fixtures.map(([mime,path])=>[mime,readFileSync(join(root,path))] as const),['image/gif',gif] as const];for(const [mime,bytes]of rows){const first=store.upload(bytes.toString('base64')),again=store.upload(bytes.toString('base64')),resolved=store.resolve(first.id);assert.equal(first.mime,mime);assert.deepEqual(again,first);assert.equal(resolved.path.endsWith('.'+(mime==='image/jpeg'?'jpg':mime.slice(6))),true);assert.equal(resolved.size,bytes.length);assert.ok(resolved.w>0&&resolved.h>0)}assert.equal(readdirSync(store.directory).length,4)});

test('rejects forged, oversized, missing and changed attachment bytes',t=>{const {store}=project(t);code(()=>store.upload(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40)]).toString('base64')),'attachment_invalid');code(()=>store.upload(Buffer.alloc(ATTACHMENT_MAX_BYTES+1).toString('base64')),'attachment_too_large');const ref=store.upload(gif.toString('base64')),path=store.resolve(ref.id).path;writeFileSync(path,Buffer.from('changed'));code(()=>store.verify(ref),'attachment_invalid');unlinkSync(path);code(()=>store.verify(ref),'attachment_not_found')});

test('requires real image content inside every accepted container',t=>{const {store}=project(t),png=readFileSync(join(root,fixtures[0][1])),jpeg=readFileSync(join(root,fixtures[1][1])),scan=jpeg.indexOf(Buffer.from([0xff,0xda]));assert.ok(scan>0);const emptyPng=Buffer.concat([png.subarray(0,33),Buffer.from('000000004944415435af061e','hex'),png.subarray(-12)]),vp8x=Buffer.alloc(30),noScan=Buffer.concat([jpeg.subarray(0,scan),Buffer.from([0xff,0xd9])]),noFrame=Buffer.from('474946383961010001000000003b','hex');vp8x.write('RIFF');vp8x.writeUInt32LE(22,4);vp8x.write('WEBPVP8X',8);vp8x.writeUInt32LE(10,16);for(const bytes of [emptyPng,vp8x,noScan,noFrame])code(()=>store.upload(bytes.toString('base64')),'attachment_invalid')});
