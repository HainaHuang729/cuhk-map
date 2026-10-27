import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
export function officialUrl(value){
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&(url.hostname==='cuhk.edu.hk'||url.hostname.endsWith('.cuhk.edu.hk'));}catch{return false;}
}
export function validateRegistry(registry){
  if(registry.schema!=='cuhk_official_sources_v1'||!Array.isArray(registry.sources))throw new Error('Invalid official source registry');
  const ids=new Set();
  for(const source of registry.sources){
    if(!source.id||ids.has(source.id)||!officialUrl(source.url)||!['pdf','html'].includes(source.format)||!(source.reviewEveryDays>0))throw new Error('Invalid or duplicate official source: '+source.id);
    ids.add(source.id);
  }
}
export async function inspectSource(source,baseline={},options={}){
  const checkedAt=(options.now||new Date()).toISOString();
  const previous=baseline[source.id];
  const common={id:source.id,authority:source.authority,topic:source.topic,url:source.url,checkedAt,
    lastReviewedAt:previous?.reviewedAt||null,reviewDue:!previous||Date.parse(checkedAt)-Date.parse(previous.reviewedAt)>source.reviewEveryDays*86400000};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),options.timeoutMs||10000);
  try{
    const response=await (options.fetch||fetch)(source.url,{signal:controller.signal,redirect:'follow',headers:{'User-Agent':'CUHK-Map-Source-Review/1.0','Accept':source.format==='pdf'?'application/pdf':'text/html'}});
    const finalUrl=response.url||source.url;
    if(!officialUrl(finalUrl))return {...common,status:'needs_review',reason:'redirect_outside_official_domain',httpStatus:response.status,finalUrl};
    if(!response.ok)return {...common,status:'unavailable',reason:'http_error',httpStatus:response.status,finalUrl};
    const length=Number(response.headers.get('content-length'));
    if(length>12*1024*1024)return {...common,status:'needs_review',reason:'source_too_large',finalUrl};
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>12*1024*1024){controller.abort();return {...common,status:'needs_review',reason:'source_too_large',finalUrl};}chunks.push(chunk);}
    const buffer=Buffer.concat(chunks),type=response.headers.get('content-type')||'';
    const validFormat=source.format==='pdf'?buffer.subarray(0,5).toString()==='%PDF-':/html/i.test(type)&&/<(?:!doctype\s+html|html|head|body)\b/i.test(buffer.subarray(0,5000).toString('utf8'));
    if(!validFormat)return {...common,status:'needs_review',reason:'unexpected_document_format',httpStatus:response.status,contentType:type,finalUrl};
    const sha256=digest(buffer);
    return {...common,status:previous?.sha256===sha256?'unchanged':'needs_review',
      reason:!previous?'first_review_required':previous.sha256!==sha256?'content_changed':'matches_reviewed_fingerprint',
      sha256,bytes:size,httpStatus:response.status,contentType:type,finalUrl,
      sourceLastModified:response.headers.get('last-modified')||null,
      factCheckedAt:null,notice:'Retrieval time is not the publication date or approval of operating information.'};
  }catch(error){return {...common,status:'unavailable',reason:error.name==='AbortError'?'timeout':'network_error',error:String(error.message).slice(0,160)};}
  finally{clearTimeout(timer);}
}
export function approveFingerprint(report,sourceId,sha256,now=new Date()){
  const row=report.sources.find(row=>row.id===sourceId);
  const age=now-Date.parse(row?.checkedAt);
  if(!row?.sha256||row.sha256!==sha256||row.status==='unavailable'||!Number.isFinite(age)||age<0||age>86400000)
    throw new Error('Approval needs the exact successfully retrieved fingerprint from a check within 24 hours');
  return {sha256,reviewedAt:now.toISOString(),url:row.url,scope:'Document fingerprint reviewed; application facts still require an explicit data edit.'};
}
function atomicJson(file,value){const temp=file+'.tmp-'+process.pid;fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n');fs.renameSync(temp,file);}
async function main(){
  const args=process.argv.slice(2),get=name=>{const index=args.indexOf(name);return index>=0?args[index+1]:undefined;};
  const registryPath=path.resolve(get('--registry')||path.join(ROOT,'maintenance/official-sources.json'));
  const baselinePath=path.resolve(get('--baseline')||path.join(ROOT,'maintenance/source-baseline.json'));
  const output=path.resolve(get('--out')||path.join(ROOT,'maintenance/last-source-check.json'));
  const registry=JSON.parse(fs.readFileSync(registryPath)),baseline=JSON.parse(fs.readFileSync(baselinePath));validateRegistry(registry);
  if(get('--approve')){
    const report=JSON.parse(fs.readFileSync(output));
    baseline.sources[get('--approve')]=approveFingerprint(report,get('--approve'),get('--sha256'));
    atomicJson(baselinePath,baseline);console.log('Recorded manual source-fingerprint review; no application data was changed.');return;
  }
  const selected=get('--only')?registry.sources.filter(row=>row.id===get('--only')):registry.sources;
  if(!selected.length)throw new Error('Unknown source ID');
  const sources=[];
  // A small worker pool bounds load on the official servers; no background scheduler is created.
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(3,selected.length)},async()=>{while(cursor<selected.length){const spec=selected[cursor++];sources.push(await inspectSource(spec,baseline.sources,{timeoutMs:10000}));}}));
  const report={schema:'cuhk_source_check_v1',generatedAt:new Date().toISOString(),factsAutoUpdated:false,
    baselineAutoApproved:false,sources:sources.sort((a,b)=>a.id.localeCompare(b.id))};
  atomicJson(output,report);
  console.log(JSON.stringify({output,checked:sources.length,unchanged:sources.filter(row=>row.status==='unchanged').length,
    needsReview:sources.filter(row=>row.status==='needs_review').length,unavailable:sources.filter(row=>row.status==='unavailable').length,factsAutoUpdated:false},null,2));
  if(sources.some(row=>row.status==='unavailable'))process.exitCode=2;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
