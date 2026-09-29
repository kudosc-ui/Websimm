'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const el=(t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const LS=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}};
const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('on'),2200)};
const debounce=(f,ms)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>f(...a),ms)}};

/* ---------- Device library: simulated viewport profiles (CSS px) ---------- */
const RAW=`Phone|iPhone 16 Pro|402|874|3
Phone|iPhone 16 Pro Max|440|956|3
Phone|iPhone 16|393|852|3
Phone|iPhone 15|393|852|3
Phone|iPhone 15 Pro Max|430|932|3
Phone|iPhone SE|375|667|2
Phone|Samsung Galaxy S25|360|780|3
Phone|Samsung Galaxy S25 Ultra|412|915|3.5
Phone|Samsung Galaxy A-series|360|800|2.75
Phone|Google Pixel 9|412|923|2.6
Phone|Google Pixel 9 Pro|412|923|2.6
Phone|OnePlus flagship|412|919|3.5
Phone|Xiaomi flagship|393|873|2.75
Phone|Small Android|360|640|2
Phone|Standard Android|412|892|2.6
Phone|Large Android|448|998|3
Phone|Small iPhone|375|812|3
Phone|Large iPhone|430|932|3
Tablet|iPad|820|1180|2
Tablet|iPad Air|820|1180|2
Tablet|iPad Pro 11-inch|834|1194|2
Tablet|iPad Pro 13-inch|1032|1376|2
Tablet|Samsung Galaxy Tab|800|1280|2
Tablet|Generic 8-inch tablet|600|960|2
Tablet|Generic 10-inch tablet|800|1280|2
Tablet|Generic 12-inch tablet|1024|1366|2
Laptop|13-inch laptop|1280|800|2
Laptop|14-inch laptop|1440|900|2
Laptop|15-inch laptop|1536|864|1.25
Laptop|16-inch laptop|1728|1117|2
Laptop|MacBook-style laptop|1470|956|2
Laptop|Windows laptop|1366|768|1
Desktop|1280×720 Desktop|1280|720|1
Desktop|1366×768 Desktop|1366|768|1
Desktop|1440×900 Desktop|1440|900|1
Desktop|1920×1080 Desktop|1920|1080|1
Desktop|2560×1440 Desktop|2560|1440|1
Desktop|3840×2160 Desktop|3840|2160|1`;
const BASE=RAW.split('\n').map(l=>{const[c,n,w,h,d]=l.split('|');return{cat:c,name:n,w:+w,h:+h,dpr:+d}});
const custom=()=>LS('ws.custom',[]).map(d=>({...d,cat:'Custom',custom:1}));
const allDev=()=>[...custom(),...BASE];
const kind=d=>d.cat!=='Custom'?d.cat.toLowerCase():d.w<=500?'phone':d.w<=1100?'tablet':'laptop';
const BPS=[320,375,390,402,430,768,820,1024,1280,1440,1920];
const CHK=['iPhone 16 Pro','Small Android','iPad','14-inch laptop','1920×1080 Desktop'];

/* ---------- State + settings ---------- */
const cfg={theme:'dark',dev:'iPhone 16 Pro',zoom:'fit',frame:true,auto:false,save:true,...LS('ws.cfg',{})};
const saveCfg=()=>localStorage.setItem('ws.cfg',JSON.stringify(cfg));
const S={dev:allDev().find(d=>d.name===cfg.dev)||BASE[0],flip:false,vw:0,zoom:cfg.zoom,frame:cfg.frame,cmp:[],favs:LS('ws.favs',[]),proj:null,entry:null,doc:'',cat:'All',units:[]};
const applyTheme=()=>{document.body.dataset.theme=cfg.theme==='system'?(matchMedia('(prefers-color-scheme:light)').matches?'light':'dark'):cfg.theme};
applyTheme();

/* ---------- IndexedDB (projects stay local) ---------- */
const db=new Promise((res,rej)=>{const r=indexedDB.open('websim',1);r.onupgradeneeded=()=>{r.result.createObjectStore('meta',{keyPath:'id'});r.result.createObjectStore('files',{keyPath:'id'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
const idb=(st,m,f)=>db.then(d=>new Promise((res,rej)=>{const t=d.transaction(st,m),o=f(...st.map(n=>t.objectStore(n)));t.oncomplete=()=>res(o&&o.result);t.onerror=()=>rej(t.error)}));
const listP=()=>idb(['meta'],'readonly',m=>m.getAll()).then(a=>a.sort((x,y)=>y.ts-x.ts)).catch(()=>[]);
const persist=p=>cfg.save?idb(['meta','files'],'readwrite',(m,f)=>{m.put(meta(p));f.put({id:p.id,files:p.files})}).catch(()=>toast('Could not save locally')):0;
const meta=p=>({id:p.id,name:p.name,ts:p.ts,n:Object.keys(p.files).length,c:count(p.files)});
const count=F=>{const c={html:0,css:0,js:0};for(const k in F){const e=k.split('.').pop().toLowerCase();if(/^html?$/.test(e))c.html++;else if(e==='css')c.css++;else if(/^m?js$/.test(e))c.js++}return c};
const ago=t=>{const m=(Date.now()-t)/6e4;return m<1?'Just now':m<60?Math.floor(m)+' minutes ago':m<1440?Math.floor(m/60)+' hours ago':m<2880?'Yesterday':Math.floor(m/1440)+' days ago'};

/* ---------- Import: ZIP (native DecompressionStream), files, folders ---------- */
const MIME={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',mp4:'video/mp4'};
const TEXT=/\.(html?|css|m?js|json|txt|md|xml|svg|csv)$/i;
async function add(F,path,blob){path=path.replace(/^\/+/,'');if(/(^|\/)(\.git|node_modules|__MACOSX)\//.test(path)||/\.DS_Store$/.test(path))return;
 F[path]=TEXT.test(path)?{t:'text',d:await blob.text()}:{t:'bin',d:blob.slice(0,blob.size,MIME[path.split('.').pop().toLowerCase()]||'application/octet-stream')}}
async function readZip(buf){const dv=new DataView(buf),u=new Uint8Array(buf),F={};let e=buf.byteLength-22;while(e>=0&&dv.getUint32(e,true)!==0x06054b50)e--;
 if(e<0)throw Error('Not a valid ZIP');let o=dv.getUint32(e+16,true);const n=dv.getUint16(e+10,true);
 for(let i=0;i<n;i++){const m=dv.getUint16(o+10,true),cs=dv.getUint32(o+20,true),nl=dv.getUint16(o+28,true),xl=dv.getUint16(o+30,true),cl=dv.getUint16(o+32,true),lo=dv.getUint32(o+42,true);
  const name=new TextDecoder().decode(u.subarray(o+46,o+46+nl));o+=46+nl+xl+cl;if(name.endsWith('/'))continue;
  const ds=lo+30+dv.getUint16(lo+26,true)+dv.getUint16(lo+28,true),raw=new Blob([u.subarray(ds,ds+cs)]);
  const out=m===0?raw:await new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();await add(F,name,out)}
 return F}
async function walk(en,path,F){if(en.isFile){const f=await new Promise(r=>en.file(r));await add(F,path+en.name,f)}
 else{const rd=en.createReader();let b;do{b=await new Promise(r=>rd.readEntries(r));for(const c of b)await walk(c,path+en.name+'/',F)}while(b.length)}}
async function ingest(files,entries){toast('Importing…');const F={};let name='';
 try{if(entries&&entries.length){for(const e of entries)await walk(e,'',F);name=entries[0].name}
 else for(const f of files){if(/\.zip$/i.test(f.name)){Object.assign(F,await readZip(await f.arrayBuffer()));name=name||f.name.replace(/\.zip$/i,'')}else await add(F,f.webkitRelativePath||f.name,f)}}
 catch(e){return toast(e.message||'Import failed')}
 let ks=Object.keys(F);if(!ks.length)return toast('No supported files found');
 const root=ks[0].split('/')[0];if(ks.every(k=>k.includes('/')&&k.startsWith(root+'/'))){const G={};ks.forEach(k=>G[k.slice(root.length+1)]=F[k]);Object.keys(F).forEach(k=>delete F[k]);Object.assign(F,G);name=name||root}
 const p={id:'p'+Date.now(),name:name||Object.keys(F).find(k=>/html?$/.test(k))||'Project',ts:Date.now(),files:F};
 await persist(p);await openProject(p,true)}
async function loadProject(id){const r=await idb(['files'],'readonly',f=>f.get(id));const m=(await listP()).find(x=>x.id===id);if(!r||!m)return toast('Project not found');await openProject({...m,files:r.files},false)}

/* ---------- Building the preview document ---------- */
const findEntry=F=>{const h=Object.keys(F).filter(k=>/\.html?$/i.test(k)).sort((a,b)=>a.split('/').length-b.split('/').length);return h.find(k=>/^index\.html?$/i.test(k))||h[0]};
const norm=(ref,base)=>{if(!ref||/^(#|[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref))return null;let p;try{p=decodeURIComponent(ref.split(/[?#]/)[0])}catch(e){return null}
 const o=[];for(const s of(p[0]==='/'?[]:base.split('/')).concat(p.split('/'))){if(s==='..')o.pop();else if(s&&s!=='.')o.push(s)}return o.join('/')};
async function build(){const F=S.proj.files,ent=S.entry&&F[S.entry]?S.entry:(S.entry=findEntry(F));
 if(!ent)return'<body style="font:15px system-ui;padding:24px">No HTML file found in this project.</body>';
 const dir=ent.replace(/[^/]*$/,''),cache={},du=p=>cache[p]||(cache[p]=F[p].t==='text'?Promise.resolve('data:'+(MIME[p.split('.').pop()]||'text/plain')+';charset=utf-8,'+encodeURIComponent(F[p].d)):new Promise(r=>{const fr=new FileReader;fr.onload=()=>r(fr.result);fr.readAsDataURL(F[p].d)}));
 const cssFix=async(css,base)=>{for(const m of[...css.matchAll(/url\((['"]?)([^)'"]+)\1\)/g)]){const p=norm(m[2],base);if(p&&F[p])css=css.replace(m[0],'url('+await du(p)+')')}return css};
 const doc=new DOMParser().parseFromString(F[ent].d,'text/html');
 for(const l of $$('link[rel~=stylesheet][href]',doc)){const p=norm(l.getAttribute('href'),dir);if(p&&F[p]&&F[p].t==='text'){const s=doc.createElement('style');s.textContent=await cssFix(F[p].d,p.replace(/[^/]*$/,''));l.replaceWith(s)}}
 for(const s of $$('script[src]',doc)){const p=norm(s.getAttribute('src'),dir);if(p&&F[p]&&F[p].t==='text'){s.removeAttribute('src');s.textContent=F[p].d.replace(/<\/script/gi,'<\\/script')}}
 for(const i of $$('img[src],source[src],video[src],audio[src],link[rel~=icon][href]',doc)){const a=i.hasAttribute('src')?'src':'href',p=norm(i.getAttribute(a),dir);if(p&&F[p])i.setAttribute(a,await du(p))}
 for(const s of $$('style',doc))s.textContent=await cssFix(s.textContent,dir);
 const pr=doc.createElement('script');pr.textContent='('+probe+')()';(doc.body||doc.documentElement).append(pr);
 return'<!doctype html>'+doc.documentElement.outerHTML}

/* Runs INSIDE the sandboxed preview: analysis is heuristic, results are "possible" issues */
function probe(){const P=m=>parent.postMessage(m,'*');
 const sel=e=>e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.classList[0]?'.'+e.classList[0]:'');
 const run=()=>{const W=innerWidth,d=document.documentElement,is=[];
  if(!document.querySelector('meta[name=viewport]'))is.push(['Viewport meta missing','Possible issue: phones may render this page at desktop width.']);
  if(d.scrollWidth>W+1)is.push(['Horizontal overflow','Potential overflow: content is '+d.scrollWidth+'px wide in a '+W+'px viewport.']);
  const over=[],fixed=[];let small=0;
  for(const e of[...document.body.querySelectorAll('*')].slice(0,2000)){const r=e.getBoundingClientRect();if(!r.width)continue;const cs=getComputedStyle(e);
   if(r.right>W+1&&cs.position!=='fixed')over.push(sel(e)+' ends at '+Math.round(r.right)+'px');
   const w=parseFloat(e.style.width);if(/px$/.test(e.style.width)&&w>W)fixed.push(sel(e)+' ('+w+'px wide)');
   if(W<=1024&&e.matches('a[href],button,input:not([type=hidden]),select,[role=button]')&&(r.width<44||r.height<44)&&cs.visibility!=='hidden')small++}
  over.slice(0,3).forEach(t=>is.push(['Content extends past viewport','Check this element: '+t]));
  fixed.slice(0,2).forEach(t=>is.push(['Possible fixed-width element','Check this element: '+t]));
  if(small)is.push(['Small touch targets','Possible issue: '+small+' interactive elements are under 44px.']);
  let mq=0;try{for(const s of document.styleSheets)for(const r of s.cssRules)if(r.type===4)mq++}catch(e){}
  if(!mq&&is.length)is.push(['No media queries found','Check whether the layout adapts at narrow widths.']);
  P({ws:'check',W,is,mq})};
 addEventListener('load',()=>setTimeout(run,250));
 addEventListener('message',e=>{const m=e.data;if(!m)return;if(m.ws==='check')run();
  if(m.ws==='html'){const c=document.documentElement.cloneNode(true);c.querySelectorAll('script').forEach(s=>s.remove());P({ws:'html',html:new XMLSerializer().serializeToString(c)})}});
 addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[href]');if(!a)return;const h=a.getAttribute('href');if(h&&!/^(#|[a-z][a-z0-9+.-]*:|\/\/)/i.test(h)){e.preventDefault();P({ws:'nav',href:h})}})}

/* ---------- Views + navigation ---------- */
let view='home';
function go(v){if(v==='preview'&&!S.proj){toast('Import a project first');v='home'}
 view=v;$$('.view').forEach(x=>x.classList.toggle('on',x.id==='v-'+v));$$('#nav button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
 ({home:renderHome,projects:renderProjects,devices:renderDevices,preview:renderPreview,settings:renderSettings,tests:()=>{}})[v]()}
$$('[data-v]').forEach(b=>b.onclick=()=>go(b.dataset.v));
const sheet=(t,n)=>{$('#shT').textContent=t;const b=$('#shB');b.replaceChildren(n);$('#sheet').classList.add('on')};
const closeSheet=()=>{$('#sheet').classList.remove('on');if(view==='preview')renderStage()};
$('#shX').onclick=closeSheet;$('#sheet').onclick=e=>{if(e.target.id==='sheet')closeSheet()};

async function openProject(p,fresh){S.proj=p;S.entry=null;S.doc=await build();if(fresh){const c=count(p.files),b=el('div','',`<p><b>Project imported</b></p><h1 style="margin:6px 0 4px">${esc(p.name)}</h1><p class="mut">${Object.keys(p.files).length} files<br>HTML: ${c.html} · CSS: ${c.css} · JS: ${c.js}</p><br><button class="btn ac" id="opn" style="width:100%">Open Simulator</button>`);sheet('Import',b);$('#opn').onclick=()=>{$('#sheet').classList.remove('on');go('preview')}}else go('preview');
 if(cfg.auto)runChecks($('#tbox'))}

function projItem(m){const b=el('button','item',`<div class="g"><b>${esc(m.name)}</b><small>${ago(m.ts)} · ${m.n} files</small></div><span class="mut">›</span>`);b.onclick=()=>loadProject(m.id);return b}
async function renderHome(){const l=await listP(),r=$('#recent');r.replaceChildren(...(l.length?l.slice(0,5).map(projItem):[el('p','mut','No projects yet. Import one to start testing.')]))}
async function renderProjects(){const l=await listP(),r=$('#plist');r.replaceChildren(...(l.length?l.map(m=>{const w=el('div','item');const b=projItem(m);b.style.cssText='border:0;padding:0;background:none';const x=el('button','ib','✕');x.title='Delete';x.onclick=async()=>{await idb(['meta','files'],'readwrite',(a,f)=>{a.delete(m.id);f.delete(m.id)});renderProjects()};w.append(b,x);return w}):[el('p','mut','No saved projects.')]))}

/* Devices */
const isFav=d=>S.favs.includes(d.name);
function devRow(d,mode){const r=el('div','row'+(d.name===S.dev.name&&mode==='pick'?' sel':''));const i=el('div','ri',`<b>${esc(d.name)}</b><small>${d.w}×${d.h} · @${d.dpr}x</small>`);
 const st=el('button',isFav(d)?'on':'',isFav(d)?'★':'☆');st.title='Favorite';st.onclick=()=>{S.favs=isFav(d)?S.favs.filter(n=>n!==d.name):[...S.favs,d.name];localStorage.setItem('ws.favs',JSON.stringify(S.favs));view==='devices'?renderDevices():(st.textContent=isFav(d)?'★':'☆',st.className=isFav(d)?'on':'')};
 const on=S.cmp.includes(d.name),cm=el('button','cm'+(on?' on':''),on?'☑':'☐');cm.title='Compare';cm.onclick=()=>{S.cmp=S.cmp.includes(d.name)?S.cmp.filter(n=>n!==d.name):[...S.cmp,d.name];cm.className='cm'+(S.cmp.includes(d.name)?' on':'');cm.textContent=S.cmp.includes(d.name)?'☑':'☐'};
 i.onclick=()=>{if(mode==='cmp')return cm.click();S.dev=d;S.flip=false;S.vw=0;S.cmp=[];cfg.dev=d.name;saveCfg();$('#sheet').classList.remove('on');go('preview')};
 r.append(i,st,cm);if(d.custom&&mode==='pick'){const x=el('button','','✕');x.onclick=()=>{localStorage.setItem('ws.custom',JSON.stringify(LS('ws.custom',[]).filter(c=>c.name!==d.name)));renderDevices()};r.append(x)}return r}
function devList(box,q,mode,cat='All'){const toks=q.toLowerCase().replace(/[-]/g,' ').replace(/\binches\b|\bin\b/g,'inch').split(/\s+/).filter(Boolean);
 const hit=d=>(cat==='All'||d.cat+'s'===cat||d.cat===cat)&&toks.every(t=>(d.name+' '+d.cat+' '+d.w+'x'+d.h).toLowerCase().replace(/[-×]/g,c=>c==='×'?'x':' ').includes(t));
 const all=allDev().filter(hit),out=[],sec=(t,a)=>{if(a.length)out.push(el('h2','',t),...a.map(d=>devRow(d,mode)))};
 sec('⭐ My Devices',all.filter(isFav));for(const c of['Custom','Phone','Tablet','Laptop','Desktop'])sec(c==='Custom'?'Custom':c+'s',all.filter(d=>d.cat===c&&!isFav(d)));
 box.replaceChildren(...(out.length?out:[el('p','mut','No devices match your search.')]))}
function renderDevices(){$('#cats').replaceChildren(...['All','Phones','Tablets','Laptops','Desktop'].map(c=>{const b=el('button','chip'+(S.cat===c?' on':''),c);b.onclick=()=>{S.cat=c;renderDevices()};return b}));devList($('#dlist'),$('#q').value,'pick',S.cat)}
$('#q').oninput=debounce(()=>devList($('#dlist'),$('#q').value,'pick',S.cat),80);
$('#cs').onclick=()=>{const n=$('#cn').value.trim(),w=+$('#cw').value,h=+$('#ch').value,d=+$('#cd').value||1;if(!n||w<200||h<200)return toast('Enter a name and size (200px or more)');
 const l=LS('ws.custom',[]).filter(c=>c.name!==n);l.unshift({name:n,w,h,dpr:d});localStorage.setItem('ws.custom',JSON.stringify(l));toast('Device saved');renderDevices()};

/* Simulator */
const dims=(d,primary)=>{let[w,h]=S.flip?[d.h,d.w]:[d.w,d.h];if(primary&&S.vw)w=S.vw;return[w,h]};
const steps=[25,50,75,100,125,150];
function renderPreview(){$('#pvName').textContent=S.proj.name;$('#pvDev').textContent=S.dev.name+' ▾';$('#frm').checked=S.frame;
 $('#bps').replaceChildren(...BPS.map(w=>{const b=el('button','chip',w);b.onclick=()=>{S.vw=w;layout()};return b}));renderStage()}
function renderStage(){const st=$('#stage');st.replaceChildren();S.units=[];const list=S.cmp.length>1?S.cmp.map(n=>allDev().find(d=>d.name===n)).filter(Boolean):[S.dev];
 for(const d of list){const u=el('div','unit'),sc=el('div','scaler'),fr=el('div','frame '+kind(d)),f=el('iframe'),lab=el('small');f.sandbox='allow-scripts allow-forms';f.title=d.name+' preview';f.srcdoc=S.doc;fr.append(f,el('div','base'));sc.append(fr);u.append(lab,sc);st.append(u);S.units.push({d,f,fr,sc,lab,primary:list.length===1})}layout()}
function layout(rot){const multi=S.units.length>1,ah=$('#stage').clientHeight-72,aw=$('#stage').clientWidth-40;let fs='';
 for(const u of S.units){const[w,h]=dims(u.d,u.primary);u.f.style.width=w+'px';u.f.style.height=h+'px';u.fr.classList.toggle('nof',!S.frame);u.fr.classList.toggle('land',w>h);u.fr.style.transform='none';
  const fw=u.fr.offsetWidth,fh=u.fr.offsetHeight,s=S.zoom==='fit'?Math.max(.1,Math.min(multi?9:aw/fw,ah/fh,1)):S.zoom/100;
  u.fr.style.transform=`scale(${s})`;u.sc.style.width=fw*s+'px';u.sc.style.height=fh*s+'px';u.lab.textContent=`${u.d.name} · ${w} × ${h}`;u.s=s;
  if(rot){u.sc.classList.remove('rot');void u.sc.offsetWidth;u.sc.classList.add('rot')}
  if(u.primary)fs=Math.round(s*100)}
 const[w,h]=dims(S.units[0].d,S.units[0].primary);$('#zv').textContent=S.zoom==='fit'?'Fit '+(fs||Math.round(S.units[0].s*100))+'%':S.zoom+'%';
 $('#vwv').textContent=w+' px';$('#vwr').value=Math.min(1920,Math.max(280,w));$$('#bps .chip').forEach(c=>c.classList.toggle('on',+c.textContent===w));
 $$('.seg button').forEach(b=>b.classList.toggle('on',(b.dataset.o==='l')===(w>h)));
 $('#foot').innerHTML=`<span><b>${w} × ${h} px</b> simulated viewport</span><span>${multi?S.units.length+' devices':S.dev.name+' · @'+S.dev.dpr+'x'}</span>`}
addEventListener('resize',debounce(()=>view==='preview'&&S.units.length&&layout(),120));
const flipTo=land=>{const[w,h]=dims(S.dev,0);if((w>h)!==land){S.flip=!S.flip;S.vw=0;layout(true)}};
$$('.seg button').forEach(b=>b.onclick=()=>flipTo(b.dataset.o==='l'));
const zs=d=>{const cur=S.zoom==='fit'?Math.round((S.units[0]?.s||1)*100):S.zoom;let i=steps.findIndex(v=>v>=cur);i=d>0?(steps[i]>cur?i:i+1):i<0?steps.length:i-1;S.zoom=steps[Math.max(0,Math.min(steps.length-1,i))];layout()};
$('#zo').onclick=()=>zs(-1);$('#zi').onclick=()=>zs(1);$('#zv').onclick=()=>{S.zoom='fit';layout()};
$('#vwr').oninput=e=>{S.vw=+e.target.value;layout()};
$('#frm').onchange=e=>{S.frame=e.target.checked;layout()};
$('#pvMore').onclick=()=>$('#more').classList.toggle('open');
$('#pvBack').onclick=()=>go('home');
$('#pvDev').onclick=()=>{const b=el('div'),i=el('input','inp'),l=el('div');i.type='search';i.placeholder='Search devices...';b.append(i,l);devList(l,'','pick');i.oninput=()=>devList(l,i.value,'pick');sheet('Choose device',b)};
$('#cmpb').onclick=()=>{const b=el('div',''),i=el('input','inp'),l=el('div');i.type='search';i.placeholder='Search devices...';b.append(el('p','mut','Tick 2 or more devices to compare side by side. Untick all to return to one device.'),i,l);devList(l,'','cmp');i.oninput=()=>devList(l,i.value,'cmp');sheet('Compare',b)};
$('#infob').onclick=()=>{const d=S.dev,[w,h]=dims(d,1);sheet('Device information',el('div','',`<h1 style="margin-bottom:12px">${esc(d.name)}</h1><dl class="kv"><dt>Viewport</dt><dd>${w} × ${h}</dd><dt>Orientation</dt><dd>${w>h?'Landscape':'Portrait'}</dd><dt>Device Pixel Ratio</dt><dd>${d.dpr}</dd><dt>Type</dt><dd>${kind(d)}</dd></dl><p class="note">Simulated viewport. These are simulation parameters, not a reproduction of the physical hardware.</p>`))};
const fsOn=on=>{document.body.classList.toggle('fs',on);setTimeout(layout,50);if(on)document.documentElement.requestFullscreen?.().catch(()=>{});else if(document.fullscreenElement)document.exitFullscreen()};
$('#fsb').onclick=()=>fsOn(true);$('#exitFs').onclick=()=>fsOn(false);
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&document.body.classList.contains('fs'))fsOn(false)});

/* Messages from previews */
const pending=new Map();
addEventListener('message',e=>{const m=e.data;if(!m||!m.ws)return;
 if(m.ws==='nav'&&S.proj){const p=norm(m.href,(S.entry||'').replace(/[^/]*$/,''));if(p&&S.proj.files[p]&&/\.html?$/i.test(p)){S.entry=p;live()}else toast('Link target not in project')}
 else if(m.ws==='html'&&pending.has('html')){pending.get('html')(m.html);pending.delete('html')}});

/* Screenshot (local canvas, nothing uploaded) */
$('#shot').onclick=async()=>{const u=S.units[0];if(!u)return;toast('Capturing…');
 try{const html=await new Promise((res,rej)=>{pending.set('html',res);u.f.contentWindow.postMessage({ws:'html'},'*');setTimeout(()=>rej(Error('Preview did not respond')),4000)});
  const[w,h]=dims(u.d,u.primary),pad=S.frame?24:0,sc=Math.min(u.d.dpr,2),svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%">${html}</foreignObject></svg>`;
  const img=new Image();await new Promise((r,j)=>{img.onload=r;img.onerror=()=>j(Error('Browser could not render capture'));img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)});
  const c=el('canvas'),x=c.getContext('2d');c.width=(w+pad*2)*sc;c.height=(h+pad*2)*sc;x.scale(sc,sc);
  if(pad){x.fillStyle='#0a0b0d';x.beginPath();x.roundRect(0,0,w+pad*2,h+pad*2,kind(u.d)==='phone'?44:16);x.fill()}
  x.fillStyle='#fff';x.fillRect(pad,pad,w,h);x.drawImage(img,pad,pad);
  c.toBlob(b=>{const a=el('a');a.href=URL.createObjectURL(b);a.download=`websim-${u.d.name.replace(/\W+/g,'-')}-${w}x${h}.png`;a.click();toast('Screenshot saved')})}
 catch(e){toast(e.message||'Screenshot failed')}};

/* Responsive check */
const check=d=>new Promise(res=>{const[w,h]=dims(d,0),f=el('iframe');f.sandbox='allow-scripts';f.style.cssText=`position:fixed;left:-99999px;top:0;width:${w}px;height:${h}px;border:0`;
 const done=r=>{clearTimeout(t);removeEventListener('message',on);f.remove();res(r||{is:[['Could not analyze','The page did not respond in time.']]})},on=e=>{if(e.source===f.contentWindow&&e.data&&e.data.ws==='check')done(e.data)},t=setTimeout(()=>done(),5000);
 addEventListener('message',on);f.srcdoc=S.doc;document.body.append(f)});
const W8={'Horizontal overflow':30,'Viewport meta missing':15,'Content extends past viewport':8,'Possible fixed-width element':8,'Small touch targets':8};
async function runChecks(box){if(!S.proj)return;box.innerHTML='<p class="mut">Analyzing across devices…</p>';
 const ds=CHK.map(n=>BASE.find(d=>d.name===n)),rs=await Promise.all(ds.map(check));
 const sc=rs.map(r=>Math.max(0,100-r.is.reduce((a,[t])=>a+(W8[t]||4),0))),tot=Math.round(sc.reduce((a,b)=>a+b,0)/sc.length),n=rs.reduce((a,r)=>a+r.is.length,0);
 box.innerHTML=`<div class="card"><h2 style="margin-top:0">Responsive Health</h2><div class="score"><b class="${tot>=85?'ok':tot>=60?'wa':'er'}">${tot}</b><span class="mut">/ 100</span></div><div class="bar"><i style="width:${tot}%;background:var(--${tot>=85?'ok':tot>=60?'wa':'er'})"></i></div>
 <div class="dv">${ds.map((d,i)=>`<span class="${sc[i]>=85?'ok':sc[i]>=60?'wa':'er'}">${sc[i]>=85?'✓':'⚠'} ${esc(d.name)} · ${sc[i]}</span>`).join('')}</div>
 <p class="note">Automated heuristic, not a guarantee. It can miss problems and flag things that are intentional.</p></div>
 <h2>${n?'⚠ '+n+' possible issue'+(n>1?'s':''):'✓ No issues detected'}</h2><div class="card">${rs.map((r,i)=>r.is.map(([t,m])=>`<div class="iss"><b>${esc(t)}</b><small>${esc(ds[i].name)} · ${esc(m)}</small></div>`).join('')).join('')||'<p class="mut">Nothing flagged at these widths.</p>'}</div>`}
$('#pvChk').onclick=()=>{const b=el('div');sheet('Responsive Check',b);runChecks(b)};
$('#runT').onclick=()=>S.proj?runChecks($('#tbox')):toast('Import a project first');
const chkMore=el('button','btn ac chk2','Responsive Check');chkMore.onclick=$('#pvChk').onclick;chkMore.style.cssText='width:100%';$('#more').append(chkMore);

/* Project file viewer + live reload */
const live=debounce(async()=>{S.doc=await build();S.units.forEach(u=>u.f.srcdoc=S.doc)},300);
$('#filesb').onclick=()=>{const F=S.proj.files,b=el('div','list');Object.keys(F).sort().forEach(p=>{const d=p.split('/').length-1,x=el('button','item',`<div class="g" style="padding-left:${d*14}px"><b>${d?'📄':'📄'} ${esc(p.split('/').pop())}</b><small>${esc(p)}</small></div>`);x.onclick=()=>editFile(p);b.append(x)});sheet('Project files',b)};
function editFile(p){const f=S.proj.files[p],b=el('div');b.append(el('p','mono mut',esc(p)));
 if(f.t==='text'){const t=el('textarea');t.value=f.d;t.spellcheck=false;const ap=debounce(()=>{f.d=t.value;persist(S.proj);toast(p.split('/').pop()+' changed · ↻ Preview updated');live()},500);t.oninput=ap;b.append(t,el('p','note','Edits update the preview automatically.'))}
 else if(/^image\//.test(f.d.type)){const i=el('img');i.src=URL.createObjectURL(f.d);b.append(i)}else b.append(el('p','mut','Binary file · '+Math.round(f.d.size/1024)+' KB'));
 sheet('Inspect file',b)}

/* Settings */
function renderSettings(){const b=$('#sbox');b.replaceChildren();
 const row=(l,c)=>{const r=el('label','card set');r.append(el('span','',l),c);b.append(r);return c};
 const sel=(v,opts,fn)=>{const s=el('select');opts.forEach(([k,t])=>{const o=el('option','',esc(t));o.value=k;s.append(o)});s.value=v;s.onchange=()=>fn(s.value);return s};
 const chk=(v,fn)=>{const c=el('input');c.type='checkbox';c.checked=v;c.onchange=()=>fn(c.checked);return c};
 row('Theme',sel(cfg.theme,[['dark','Dark'],['light','Light'],['system','System']],v=>{cfg.theme=v;saveCfg();applyTheme()}));
 row('Default device',sel(cfg.dev,allDev().map(d=>[d.name,d.name]),v=>{cfg.dev=v;S.dev=allDev().find(d=>d.name===v);S.flip=false;S.vw=0;saveCfg()}));
 row('Default zoom',sel(String(cfg.zoom),[['fit','Fit'],...steps.map(s=>[s,s+'%'])],v=>{cfg.zoom=v==='fit'?v:+v;S.zoom=cfg.zoom;saveCfg()}));
 row('Show device frame',chk(cfg.frame,v=>{cfg.frame=S.frame=v;saveCfg()}));
 row('Auto-run responsive check',chk(cfg.auto,v=>{cfg.auto=v;saveCfg()}));
 row('Auto-save projects',chk(cfg.save,v=>{cfg.save=v;saveCfg()}));
 const c=el('button','btn','Clear recent projects');c.onclick=async()=>{await idb(['meta','files'],'readwrite',(m,f)=>{m.clear();f.clear()});toast('Recent projects cleared')};b.append(c);
 b.append(el('p','note','Your project files are processed locally in your browser and are never uploaded. Previews run in a sandboxed frame. Device profiles are simulated viewports, not pixel-perfect hardware emulation.'))}

/* Import wiring */
const drop=$('#drop');$('#pickFiles').onclick=drop.onclick=()=>$('#fi').click();drop.onkeydown=e=>{if(e.key==='Enter'||e.key===' ')$('#fi').click()};$('#pickDir').onclick=()=>$('#fd').click();
$('#fi').onchange=e=>{ingest([...e.target.files]);e.target.value=''};$('#fd').onchange=e=>{ingest([...e.target.files]);e.target.value=''};
['dragover','dragenter'].forEach(t=>addEventListener(t,e=>{e.preventDefault();drop.classList.add('over')}));
['dragleave','drop'].forEach(t=>addEventListener(t,e=>{e.preventDefault();drop.classList.remove('over')}));
addEventListener('drop',e=>{const it=[...(e.dataTransfer.items||[])].map(i=>i.webkitGetAsEntry&&i.webkitGetAsEntry()).filter(Boolean);
 if(it.some(x=>x.isDirectory))ingest(null,it);else ingest([...e.dataTransfer.files])});
go('home');
