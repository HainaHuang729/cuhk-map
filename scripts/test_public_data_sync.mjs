import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {fileChanged,stampChangedAssets,atomicApply,changedResources} from './sync_public_data.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cuhk-sync-test-'));
try{
  fs.mkdirSync(path.join(root,'data'));
  fs.writeFileSync(path.join(root,'data/test.js'),'new data');
  const html='<script src="data/test.js?v=old"></script><script src="data/keep.js?v=keep"></script>';
  const stamped=stampChangedAssets(html,root,new Set(['data/test.js']));
  assert(!stamped.includes('test.js?v=old'));assert(stamped.includes('keep.js?v=keep'));
  assert.equal(stampChangedAssets(stamped,root,new Set(['data/test.js'])),stamped);
  assert.equal(stampChangedAssets(html,root,new Set()),html);
  assert.equal(changedResources(root,root,['data/test.js']).size,0);
  assert.equal(changedResources(root,root,['data/test.js'],{'data/test.js':'previous-published-content'}).size,1,'Direct edits to a source-owned module must still refresh its URL');
  assert(!fileChanged(path.join(root,'data/test.js'),'new data'));
  assert(fileChanged(path.join(root,'data/test.js'),'changed'));
  atomicApply([{path:path.join(root,'data/test.js'),content:'changed'}]);
  assert.equal(fs.readFileSync(path.join(root,'data/test.js'),'utf8'),'changed');
  assert.throws(()=>atomicApply([{path:path.join(root,'data/test.js'),content:'overwrite',expectedSha256:'stale'}]),/changed during staging/);
  assert.equal(fs.readFileSync(path.join(root,'data/test.js'),'utf8'),'changed');
  fs.writeFileSync(path.join(root,'blocked'),'not a directory');
  assert.throws(()=>atomicApply([{path:path.join(root,'data/test.js'),content:'wrong'},{path:path.join(root,'blocked/file'),content:'fail'}]));
  assert.equal(fs.readFileSync(path.join(root,'data/test.js'),'utf8'),'changed','Rollback must retain the previous file');
  const rename=fs.renameSync;
  try{
    fs.renameSync=(from,to)=>{rename(from,to);if(to===path.join(root,'data/test.js'))fs.writeFileSync(to,'user concurrent edit');};
    assert.throws(()=>atomicApply([{path:path.join(root,'data/test.js'),content:'sync attempted'},{path:path.join(root,'blocked/file'),content:'fail'}]),/concurrent changes/);
    assert.equal(fs.readFileSync(path.join(root,'data/test.js'),'utf8'),'user concurrent edit');
  }finally{fs.renameSync=rename;}
  console.log('PASS: changed-file cache keys, deterministic no-op sync, guarded writes and rollback');
  const miniRoot=process.argv[2];
  if(miniRoot){
    const output=path.join(root,'generated');
    const files=['data/campus_guide.js','data/campus_walking.js','assets/campus-light.png','assets/campus-dark.png'];
    for(const file of files){fs.mkdirSync(path.dirname(path.join(output,file)),{recursive:true});fs.copyFileSync(file,path.join(output,file));}
    const generate=()=>execFileSync(process.execPath,['scripts/sync_campus_guide.js',miniRoot,'--out-dir',output],{encoding:'utf8'});
    generate();for(const file of files)assert(fs.readFileSync(file).equals(fs.readFileSync(path.join(output,file))),file+' should not churn');
    fs.writeFileSync(path.join(output,'data/campus_walking.js'),'stale walk cache');generate();
    assert(fs.readFileSync('data/campus_walking.js').equals(fs.readFileSync(path.join(output,'data/campus_walking.js'))));
    const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(output,'data/campus_guide.js'),'utf8'),context);
    assert(context.CUHK_CAMPUS_GUIDE.version.startsWith('guide-'),'Changed resources need a content-derived cache key');
    const once=fs.readFileSync(path.join(output,'data/campus_guide.js'));generate();assert(once.equals(fs.readFileSync(path.join(output,'data/campus_guide.js'))));
    console.log('PASS: real public generator preserves unchanged bundles, repairs stale walking data, refreshes cache keys once and is idempotent');
  }
}finally{fs.rmSync(root,{recursive:true,force:true});}
