import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const read=file=>fs.readFileSync(file);
const copy=(from,to)=>{fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);};
const run=(args,cwd)=>execFileSync(process.execPath,args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:4*1024*1024});
export function fileChanged(file,content){return !fs.existsSync(file)||!read(file).equals(Buffer.from(content));}
export function changedResources(stage,target,files,baseline={}){
  return new Set(files.filter(file=>{
    const content=read(path.join(stage,file));
    return fileChanged(path.join(target,file),content)||(baseline[file]&&baseline[file]!==hash(content));
  }));
}
export function stampChangedAssets(html,directory,changed){
  return html.replace(/((?:src|href)="((?:data|assets)\/[^"?]+)\?v=)[^"\s]+/g,(whole,prefix,file)=>
    changed.has(file)&&fs.existsSync(path.join(directory,file))?prefix+hash(read(path.join(directory,file))).slice(0,16):whole);
}
function miniContext(miniRoot){
  const file=path.join(miniRoot,'miniprogram/pages/index/index.js');
  const context=vm.createContext({require:createRequire(file),Page(){},wx:{},getApp:()=>({globalData:{}}),setTimeout,clearTimeout,setInterval,clearInterval});
  vm.runInContext(fs.readFileSync(file,'utf8'),context);return context;
}
export function transportParity(webRoot,miniRoot){
  const context=vm.createContext({});
  for(const file of ['data/cuhk_bus_routes.js','data/transport_route_schemes.js'])vm.runInContext(fs.readFileSync(path.join(webRoot,file),'utf8'),context);
  context.CUHK_TRANSPORT_ROUTE_SCHEMES.applyTransportRouteScheme(context.CUHK_BUS_DATA,'2026-09');
  const mini=vm.runInContext('MAP_DATA',miniContext(miniRoot)),web=context.CUHK_BUS_DATA;
  const coordinates=createRequire(import.meta.url)(path.join(webRoot,'assets/campus_coordinates.js'));
  const errors=[];let points=0;
  const compare=(a,b,label)=>{if(!a||!b){errors.push(label+': missing coordinate');return;}const target=coordinates.toGcj02(a);const meters=Math.hypot((target[0]-b[0])*103000,(target[1]-b[1])*111320);points++;if(meters>3)errors.push(label+': coordinate differs by '+Math.round(meters)+'m');};
  for(const [id,stop]of Object.entries(web.stops))if(stop.coord)compare(stop.coord,mini.stops[id]?.coord,'stop/'+id);
  for(const route of web.routes){
    const other=mini.routes.find(row=>row.id===route.id);
    if(!other||JSON.stringify(route.stops)!==JSON.stringify(other.stops)){errors.push('route/'+route.id+': stop order mismatch');continue;}
    if(JSON.stringify(route.schedule)!==JSON.stringify(other.schedule))errors.push('route/'+route.id+': timetable mismatch');
    if(route.path.length!==other.path?.length)errors.push('route/'+route.id+': path length mismatch');
    else route.path.forEach((point,index)=>compare(point,other.path[index],'route/'+route.id+'/'+index));
  }
  return {routes:web.routes.length,coordinatePoints:points,errors};
}
function listFiles(folder,prefix=''){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?listFiles(path.join(folder,entry.name),prefix+entry.name+'/'):[prefix+entry.name]);}
export function atomicApply(changes){
  for(const row of changes)if(Object.hasOwn(row,'expectedSha256')&&(fs.existsSync(row.path)?hash(read(row.path)):null)!==row.expectedSha256)throw new Error('Target changed during staging; no files written: '+row.path);
  const before=changes.map(row=>({...row,previous:fs.existsSync(row.path)?read(row.path):null}));
  const applied=[];let temporary;
  try{for(const row of before){fs.mkdirSync(path.dirname(row.path),{recursive:true});temporary=row.path+'.sync-'+crypto.randomUUID();fs.writeFileSync(temporary,row.content,{flag:'wx'});fs.renameSync(temporary,row.path);temporary=null;applied.push(row);}}
  catch(error){
    const failures=[];
    if(temporary){try{fs.rmSync(temporary,{force:true});}catch(cleanup){failures.push(cleanup);}}
    for(const row of applied.reverse()){
      try{
        if(!fs.existsSync(row.path)||hash(read(row.path))!==hash(row.content))throw new Error('Concurrent edit preserved during rollback: '+row.path);
        if(row.previous===null)fs.rmSync(row.path);else fs.writeFileSync(row.path,row.previous);
      }catch(rollback){failures.push(rollback);}
    }
    if(failures.length)throw new AggregateError([error,...failures],'Sync failed; concurrent changes were retained for manual review');
    throw error;
  }
}
export function synchronize(options){
  const webRoot=path.resolve(options.webRoot||ROOT),miniRoot=path.resolve(options.miniRoot),sitesRoot=path.resolve(options.sitesRoot);
  const contract=JSON.parse(fs.readFileSync(path.join(webRoot,'maintenance/public-data-contract.json')));
  if(contract.schema!=='cuhk_public_data_contract_v1')throw new Error('Unknown public data contract');
  const manifestPath=path.join(webRoot,'maintenance/public-data-manifest.json');
  const previousManifest=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath)):{};
  const inputs=[...contract.publicWebFiles.map(file=>path.join(webRoot,file)),...contract.shared.map(row=>path.join(miniRoot,row.mini)),
    path.join(miniRoot,'miniprogram/pages/index/index.js'),path.join(sitesRoot,'.openai/hosting.json')];
  for(const [root,directories]of [[miniRoot,['miniprogram/data','miniprogram/assets/facilities','miniprogram/assets/basemap','miniprogram/assets/ui']],[sitesRoot,['scripts','overrides']]]){
    for(const directory of directories)for(const file of listFiles(path.join(root,directory)))inputs.push(path.join(root,directory,file));
  }
  for(const file of listFiles(path.join(sitesRoot,'dist')))inputs.push(path.join(sitesRoot,'dist',file));
  const inputHashes=new Map([...new Set(inputs)].map(file=>[file,hash(read(file))]));
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cuhk-public-sync-')),stage=path.join(temp,'web'),siteStage=path.join(temp,'sites');
  try{
    for(const file of contract.publicWebFiles)copy(path.join(webRoot,file),path.join(stage,file));
    const changes=[];
    const plan=(target,content)=>changes.push({path:target,content,expectedSha256:fs.existsSync(target)?hash(read(target)):null});
    for(const spec of contract.shared){
      const source=path.join(spec.owner==='mini'?miniRoot:webRoot,spec[spec.owner]);
      const target=path.join(spec.owner==='mini'?webRoot:miniRoot,spec[spec.owner==='mini'?'web':'mini']);
      const content=read(source);copy(source,path.join(stage,spec.web));
      if(fileChanged(target,content))plan(target,content);
    }
    const parity=transportParity(stage,miniRoot);
    if(parity.errors.length)throw new Error('Transport drift needs explicit review; no geometry overwritten: '+parity.errors.slice(0,8).join('; '));
    const originalHtml=fs.readFileSync(path.join(stage,'index.html'),'utf8');
    if(!originalHtml.includes('const ENABLE_WEB_GPS_COLLECTION = false')||!originalHtml.includes('const ENABLE_WEB_PASSENGER_REPORTS = false'))throw new Error('Web read-only policy changed');
    run([path.join(webRoot,'scripts/sync_campus_guide.js'),miniRoot,'--out-dir',stage],webRoot);
    const changedWeb=changedResources(stage,webRoot,contract.publicWebFiles,{...previousManifest.publicDataHashes,...previousManifest.runtimeHashes});
    const index=stampChangedAssets(originalHtml,stage,changedWeb);fs.writeFileSync(path.join(stage,'index.html'),index);
    for(const file of new Set([...contract.webGenerated,...contract.shared.map(row=>row.web),'index.html'])){
      const content=read(path.join(stage,file)),target=path.join(webRoot,file);
      if(fileChanged(target,content)&&!changes.some(row=>row.path===target))plan(target,content);
    }
    // Only the Site's public importer, overrides and identity are used in staging.
    for(const directory of ['scripts','overrides'])fs.cpSync(path.join(sitesRoot,directory),path.join(siteStage,directory),{recursive:true});
    copy(path.join(sitesRoot,'.openai/hosting.json'),path.join(siteStage,'.openai/hosting.json'));
    run([path.join(siteStage,'scripts/import-web.mjs'),stage],siteStage);
    run([path.join(siteStage,'scripts/sync-mini-visuals.mjs'),miniRoot],siteStage);
    const siteDist=path.join(siteStage,'dist'),siteFiles=listFiles(siteDist);
    const changedSite=changedResources(siteDist,path.join(sitesRoot,'dist'),siteFiles,previousManifest.siteRuntimeHashes);
    const siteHtml=stampChangedAssets(fs.readFileSync(path.join(siteDist,'index.html'),'utf8'),siteDist,changedSite);
    fs.writeFileSync(path.join(siteDist,'index.html'),siteHtml);
    run([path.join(siteStage,'scripts/check-static.mjs')],siteStage);
    for(const file of siteFiles){const target=path.join(sitesRoot,'dist',file),content=read(path.join(siteDist,file));if(fileChanged(target,content))plan(target,content);}
    const guideContext=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(stage,'data/campus_guide.js'),'utf8'),guideContext);
    const guide=guideContext.CUHK_CAMPUS_GUIDE;
    const manifest={schema:'cuhk_public_data_manifest_v1',sourceOwnership:contract.shared.map(({id,owner,web,mini})=>({id,owner,web,mini})),
      coordinateSystems:contract.coordinateSystems,facilityRecords:guide.items.length,diningRecords:guide.dining.length,
      guideVersion:guide.version,transportParity:parity,
      sharedHashes:Object.fromEntries(contract.shared.map(row=>[row.id,hash(read(path.join(stage,row.web)))])),
      publicDataHashes:Object.fromEntries(contract.publicWebFiles.filter(file=>file.startsWith('data/')).map(file=>[file,hash(read(path.join(stage,file)))])),
      runtimeHashes:Object.fromEntries(contract.publicWebFiles.map(file=>[file,hash(read(path.join(stage,file)))])),
      siteRuntimeHashes:Object.fromEntries(siteFiles.map(file=>[file,hash(read(path.join(siteDist,file)))])),
      privateDataIncluded:false,cloudCallsAdded:0,driverFeatureChanged:false};
    const manifestContent=JSON.stringify(manifest,null,2)+'\n';
    if(fileChanged(manifestPath,manifestContent))plan(manifestPath,manifestContent);
    for(const [file,sha256]of inputHashes)if(!fs.existsSync(file)||hash(read(file))!==sha256)throw new Error('Source changed during staging; no files written: '+file);
    if(options.apply)atomicApply(changes);
    return {mode:options.apply?'applied':'check',changes:changes.map(row=>({path:row.path,sha256:hash(row.content)})),
      facilityRecords:guide.items.length,diningRecords:guide.dining.length,transportParity:parity,
      privateDataIncluded:false,published:false,miniProgramUploadNeeded:changes.some(row=>row.path.startsWith(miniRoot+path.sep))};
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
function main(){
  const args=process.argv.slice(2),get=key=>{const index=args.indexOf(key);return index>=0?args[index+1]:undefined;};
  if(!get('--mini-root')||!get('--sites-root'))throw new Error('Usage: node scripts/sync_public_data.mjs --mini-root <mini checkout> --sites-root <Sites checkout> [--apply]');
  const result=synchronize({miniRoot:get('--mini-root'),sitesRoot:get('--sites-root'),apply:args.includes('--apply')});console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
