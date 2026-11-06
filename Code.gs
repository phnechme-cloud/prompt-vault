/** Prompt Vault — backend Apps Script gắn với Google Sheet Kho_Prompt_Da_Phan_Loai. */
const PV = {
  SHEET: 'Kho', META: 'Meta', STATE: 'Trạng thái', TZ: 'Asia/Ho_Chi_Minh',
  META_HEADERS: ['ID','Hash nội dung','Tên tự động','Nhãn các bản (JSON mảng)','PL gợi ý','Tags','Ngày thêm','Cập nhật'],
  STATE_HEADERS: ['ID','Yêu thích','Ghim','Lượt dùng','Lần dùng cuối','Cập nhật'],
  VERSION_CACHE: 'PV_CONTENT_VERSION_V1', IDS_CACHE: 'PV_CURRENT_IDS_V1', LOCKOUT_KEY: 'PV_BAD_AUTH_V1', EID_PREFIX: 'PV_EID_'
};
const CATEGORY_KEYWORDS = {
  'Chỉnh sửa ảnh': ['ảnh','image','photo','portrait','render','scan','phục chế','retouch','lightroom','photoshop','bokeh'],
  'Kiến trúc': ['kiến trúc','architectural','landscape','cảnh quan','sketchup','quy hoạch','đô thị','urban','phối cảnh','đồ án'],
  'Huyền học': ['huyền học','lá số','bát tự','tứ trụ','chiêm tinh','ngũ hành','can chi','dụng thần','tử vi','saju'],
  'Tư duy': ['phản biện','tư duy','critical','ra quyết định','decision','đa chiều'],
  'Ngôn ngữ': ['dịch','translate','translator','phiên dịch','ngữ pháp'],
  'Tâm lý': ['tâm lý','giao tiếp','thiên kiến','cảm xúc','psycholog'],
  'Nghiên cứu': ['OSINT','nghiên cứu','kiểm chứng','fact','grounding','lịch sử','youtube','truy vết'],
  'Học tập': ['học tập','lộ trình','flashcard','ôn thi','quiz'],
  'Sáng tạo': ['brainstorm','ý tưởng','sáng tạo','creative'],
  'Kỹ năng': ['thuyết trình','presentation','kỹ năng','coach','phỏng vấn'],
  'Truyền thông': ['truyền thông','PR','thương hiệu','fandom','mạng xã hội','media']
};

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  ensureSheet_(ss, PV.META, PV.META_HEADERS);
  ensureSheet_(ss, PV.STATE, PV.STATE_HEADERS);
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('ACCESS_TOKEN');
  if (!token) { token = Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,''); props.setProperty('ACCESS_TOKEN', token); }
  Logger.log('ACCESS_TOKEN (chỉ nhập trong Cài đặt của Prompt Vault): ' + token);
  Logger.log('Đã sẵn sàng. Hãy triển khai ứng dụng web với Execute as: Me và Who has access: Anyone.');
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.getRange(1,1,1,headers.length).setValues([headers]);
  else {
    const existing = sh.getRange(1,1,1,Math.max(sh.getLastColumn(),headers.length)).getDisplayValues()[0];
    if (existing.every(x => !String(x).trim())) sh.getRange(1,1,1,headers.length).setValues([headers]);
  }
  return sh;
}

function doPost(e) {
  try {
    const body = JSON.parse(e && e.postData && e.postData.contents || '{}');
    if (!authorized_(String(body.token || ''))) return json_({ok:false,error:'unauthorized'});
    const action = String(body.action || '');
    if (action === 'ping') {
      const version = cachedVersion_() || getVersionOnly_();
      return json_({ok:true,version:version});
    }
    if (action === 'sync') return json_(sync_(body));
    if (action === 'events') return json_(applyEvents_(body));
    return json_({ok:false,error:'unknown_action'});
  } catch (err) {
    return json_({ok:false,error:String(err && err.message || err)});
  }
}

function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function authorized_(token) {
  const cache = CacheService.getScriptCache();
  const lock = cache.get(PV.LOCKOUT_KEY);
  if (lock && Number(lock) > Date.now()) return false;
  const expected = PropertiesService.getScriptProperties().getProperty('ACCESS_TOKEN');
  if (expected && token === expected) { cache.remove(PV.LOCKOUT_KEY); cache.remove('PV_BAD_COUNT_V1'); return true; }
  const count = Number(cache.get('PV_BAD_COUNT_V1') || 0) + 1;
  cache.put('PV_BAD_COUNT_V1', String(count), 600);
  if (count >= 10) cache.put(PV.LOCKOUT_KEY, String(Date.now() + 600000), 600);
  return false;
}

function sync_(body) {
  const known = String(body.ver || '');
  let version = cachedVersion_();
  let items = null;
  if (!version || known !== version) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) return {ok:false,error:'busy'};
    try {
      const snapshot = buildSnapshot_();
      version = snapshot.version;
      items = snapshot.items;
      CacheService.getScriptCache().put(PV.VERSION_CACHE, version, 60);
      cacheIds_(items.map(x=>x.id));
    } finally { lock.releaseLock(); }
  }
  let activeIds=items?items.map(x=>x.id):readCachedIds_();
  if(!activeIds)activeIds=Array.from(currentIds_());
  const state = Object.values(getStateForIds_(activeIds));
  const result = {ok:true,version:version,changed:known !== version,state:state,serverTime:new Date().toISOString()};
  if (result.changed) {
    result.items = items || [];
    const bytes = Utilities.newBlob(JSON.stringify(result.items)).getBytes().length;
    if (bytes > 8 * 1024 * 1024) result.warn = 'large';
  }
  return result;
}

function buildSnapshot_() {
  const ss = spreadsheet_();
  const sheet = ss.getSheetByName(PV.SHEET);
  if (!sheet) throw new Error('Thiếu tab «Kho». Hãy đổi tên tab dữ liệu thành Kho.');
  const values = sheet.getDataRange().getValues();
  if (!values.length) throw new Error('Tab «Kho» chưa có hàng tiêu đề.');
  const map = findColumns_(values[0]);
  const required = [];
  if (map.id < 0) required.push('ID');
  if (!map.promptCols.length) required.push('Nội dung Prompt 1 (hoặc Prompt 2… / Nội dung)');
  if (required.length) throw new Error('Thiếu cột bắt buộc: ' + required.join(', ') + '. Hãy kiểm tra hàng tiêu đề của tab «Kho».');
  const rows = values.slice(1);
  const ids = assignIds_(sheet, map, rows);
  const metaSheet = ensureSheet_(ss, PV.META, PV.META_HEADERS);
  const metaMap = getHeaderMap_(metaSheet);
  const priorMeta = readTableMap_(metaSheet, metaMap.ID);
  const categories = Array.from(new Set(rows.map(r => text_(r[map.category])).filter(Boolean)));
  const items = [];
  const metaUpdates = [];
  const now = isoNow_();
  const fingerprint = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const id = ids[i];
    if (!id) continue;
    const variants = map.promptCols.map((col, n) => ({col:col.index,labelCol:col.labelIndex,text:nfc_(row[col.index])})).filter(v=>v.text.trim() !== '');
    if (!variants.length) continue;
    const manualName = map.name >= 0 ? text_(row[map.name]) : '';
    const category = map.category >= 0 ? text_(row[map.category]) : '';
    const canonical = JSON.stringify([id,manualName,category,...map.promptCols.map(c=>nfc_(row[c.index]))]);
    const hash = md5_(canonical);
    fingerprint.push(canonical);
    let meta = priorMeta[id] || null;
    if (!meta || String(meta.hash || '') !== hash) {
      const first = variants[0].text;
      const naming = autoName(first);
      const labels = variants.map((v,n)=>variantLabel_(v.text,n+1));
      const suggestion = suggestCategory(variants.map(v=>v.text).join('\n'), categories);
      const tags = suggestion.tags;
      meta = {hash:hash,autoName:naming.name,nameSub:naming.nameSub,labels:labels,suggestion:suggestion.category,tags:tags,createdAt:meta && meta.createdAt || now,updatedAt:now};
      metaUpdates.push({id:id,meta:meta});
    }
    const effectiveName = manualName || meta.autoName || 'Chưa đặt tên';
    items.push({id:id,name:effectiveName,nameSource:manualName?'manual':'auto',nameSub:meta.nameSub||'',category:category||meta.suggestion||'',categorySource:category?'sheet':(meta.suggestion?'suggested':'none'),tags:meta.tags||[],variants:variants.map((v,n)=>({label:meta.labels && meta.labels[n] || v.label || 'Bản '+(n+1),text:v.text})),createdAt:meta.createdAt||now});
  }
  disambiguateNames_(items);
  if (metaUpdates.length) writeMeta_(metaSheet,metaMap,metaUpdates);
  const version = md5_(fingerprint.join('\n'));
  return {items:items,version:version};
}

function findColumns_(headers) {
  const norm = headers.map(normalizeHeader_);
  const exact = aliases => { for (const alias of aliases) { const i=norm.indexOf(normalizeHeader_(alias)); if (i>=0) return i; } return -1; };
  const id=exact(['ID']);
  const name=exact(['Tên Prompt','Tên']);
  const category=exact(['PL chức năng','Phân loại','Đề mục']);
  const promptCols=[];
  for (let i=0;i<headers.length;i++) {
    const h=norm[i];
    if (h==='noi dung') {promptCols.push({index:i,labelIndex:-1,number:1,title:String(headers[i]||'')});continue;}
    const m=h.match(/^(?:noi dung\s*)?prompt\s*(\d+)$/);
    if (m) promptCols.push({index:i,labelIndex:-1,number:Number(m[1]),title:String(headers[i]||'')});
  }
  promptCols.sort((a,b)=>a.number-b.number||a.index-b.index);
  return {id:id,name:name,category:category,promptCols:promptCols};
}
function normalizeHeader_(v) { return String(v==null?'':v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'d').trim().toLowerCase().replace(/\s+/g,' '); }
function text_(v) { return v==null?'':String(v).normalize('NFC').trim(); }
function nfc_(v) { return (v==null?'':String(v)).normalize('NFC'); }

function assignIds_(sheet,map,rows) {
  const props=PropertiesService.getScriptProperties();
  let counter=Number(props.getProperty('NEXT_PROMPT_ID')||0);
  const seen={};const ids=[];let changed=false;
  for(let i=0;i<rows.length;i++){
    const row=rows[i];const hasPrompt=map.promptCols.some(c=>nfc_(row[c.index]).trim()!=='');
    let id=text_(row[map.id]);
    if(!hasPrompt){if(id)seen[id]=true;ids.push('');continue;}
    const duplicate=!!id&&seen[id];
    if(!id||duplicate){if(id&&duplicate){/* giữ ID đầu tiên; dòng sau nhận mã mới */}while(true){counter++;const candidate='P'+String(counter).padStart(4,'0');if(!seen[candidate]){id=candidate;break;}}sheet.getRange(i+2,map.id+1).setValue(id);changed=true;}
    seen[id]=true;ids.push(id);
    const m=id.match(/^P(\d+)$/);if(m)counter=Math.max(counter,Number(m[1]));
  }
  if(changed||counter)props.setProperty('NEXT_PROMPT_ID',String(counter));
  return ids;
}

function readTableMap_(sheet,idColumn) {
  const result={};if(sheet.getLastRow()<2)return result;
  const vals=sheet.getDataRange().getValues();const headers=vals[0].map(normalizeHeader_);
  const indexes={};headers.forEach((h,i)=>indexes[h]=i);
  for(let r=1;r<vals.length;r++){const id=String(vals[r][idColumn]||'');if(!id)continue;result[id]={row:r+1,hash:vals[r][indexes[normalizeHeader_('Hash nội dung')]],autoName:vals[r][indexes[normalizeHeader_('Tên tự động')]],labels:parseJsonArray_(vals[r][indexes[normalizeHeader_('Nhãn các bản (JSON mảng)')]]),suggestion:vals[r][indexes[normalizeHeader_('PL gợi ý')]],tags:parseJsonArray_(vals[r][indexes[normalizeHeader_('Tags')]]),createdAt:dateText_(vals[r][indexes[normalizeHeader_('Ngày thêm')]]),updatedAt:dateText_(vals[r][indexes[normalizeHeader_('Cập nhật')]])};}
  return result;
}
function getHeaderMap_(sheet){const h=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];const m={};h.forEach((v,i)=>m[normalizeHeader_(v)]=i);return {ID:m[normalizeHeader_('ID')],Hash:m[normalizeHeader_('Hash nội dung')],Name:m[normalizeHeader_('Tên tự động')],Labels:m[normalizeHeader_('Nhãn các bản (JSON mảng)')],Suggestion:m[normalizeHeader_('PL gợi ý')],Tags:m[normalizeHeader_('Tags')],Created:m[normalizeHeader_('Ngày thêm')],Updated:m[normalizeHeader_('Cập nhật')]};}
function writeMeta_(sheet,map,updates){
  const existing={};if(sheet.getLastRow()>1)sheet.getRange(2,map.ID+1,sheet.getLastRow()-1,1).getValues().forEach((r,i)=>{if(r[0])existing[String(r[0])]=i+2;});
  const append=[];
  for(const u of updates){const m=u.meta;const row=[u.id,m.hash,m.autoName,JSON.stringify(m.labels),m.suggestion,JSON.stringify(m.tags),m.createdAt,m.updatedAt];const at=existing[u.id];if(at)sheet.getRange(at,1,1,PV.META_HEADERS.length).setValues([row]);else append.push(row);}
  if(append.length)sheet.getRange(sheet.getLastRow()+1,1,append.length,PV.META_HEADERS.length).setValues(append);
}
function parseJsonArray_(v){try{const x=JSON.parse(String(v||'[]'));return Array.isArray(x)?x:[]}catch(e){return []}}
function dateText_(v){if(v instanceof Date)return Utilities.formatDate(v,PV.TZ,"yyyy-MM-dd'T'HH:mm:ssXXX");return String(v||'')}
function isoNow_(){return Utilities.formatDate(new Date(),PV.TZ,"yyyy-MM-dd'T'HH:mm:ssXXX")}
function isoInTz_(value){const d=value?new Date(value):new Date();if(isNaN(d.getTime()))return isoNow_();return Utilities.formatDate(d,PV.TZ,"yyyy-MM-dd'T'HH:mm:ssXXX")}
function spreadsheet_(){const id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');return id?SpreadsheetApp.openById(id):SpreadsheetApp.getActiveSpreadsheet()}
function md5_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,String(s),Utilities.Charset.UTF_8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('')}

/** Tự đặt tên thuần: trả về {name,nameSub}; không gọi dịch vụ AI. */
function autoName(text) {
  let source=String(text||'').normalize('NFC').replace(/\r\n?/g,'\n').replace(/\\([#\-_* >\[\]()!|~+])/g,'$1');
  source=source.replace(/^\s*Return only Vietnamese\.?\s*\n?/i,'').replace(/^\s*Let's play a very interesting game:\s*\n?/i,'').replace(/^\s*Lưu ý:\s*/i,'').replace(/^\s*ROLE\s*\n+/i,'');
  const lines=source.split('\n');let candidate='';let nameSub='';
  for(const line of lines.slice(0,5)){
    const m=line.trim().match(/^#{1,6}\s*(?:ROLE\s*[—–-]\s*)?(?:Prompt\s*:\s*)?(.+)$/i);
    if(m){candidate=cleanTitleCandidate_(m[1]);const v=m[1].match(/\bv([A-Z][A-Za-z0-9]*(?:-[A-Z][A-Za-z0-9]*)*)\s+v(\d+(?:\.\d+)*(?:-[A-Za-z0-9.-]+)?)/);if(v)nameSub='v'+v[2];if(candidate)break;}
  }
  if(!candidate){
    const first=lines.find(x=>x.trim())||'';
    const m=first.match(/^(.{1,90}?):\s*(?:Với|Hãy|Bạn|Dựa|Cho|Từ|Khi|Trong|Nhiệm vụ|Mục tiêu)\b/i);
    if(m){const words=m[1].trim().split(/\s+/);if(words.length<=8&&!/^(Hãy|Bạn|Với|Return|You|Let)\b/i.test(m[1]))candidate=m[1].replace(/\s*\([^)]*\)\s*$/,'');}
  }
  if(!candidate){
    const version=source.match(/\bv([A-Z][A-Za-z0-9]*(?:-[A-Z][A-Za-z0-9]*)*)\s+v(\d+(?:\.\d+)*(?:-[A-Za-z0-9.-]+)?)(?:\s*[-–—]\s*([^\n(]+))?/);
    if(version){candidate=version[3]?version[3].trim():version[1].replace(/-/g,' ');nameSub='v'+version[2];}
  }
  if(!candidate){
    const character=source.match(/nhân vật\s+["“']([^"”']+)["”']/i);
    if(character)candidate=character[1];
  }
  if(!candidate){
    const role=/đóng vai\s+|bạn là\s+|nhân vật\s+|you are an?\s+|act as\s+|play the role of an?\s+|(?:^|\n)Role:\s*|(?:^|\n)Vai trò:\s*/i.exec(source);
    if(role){let rest=source.slice(role.index+role[0].length).trim();rest=rest.replace(/^nhân vật\s+/i,'');const quoted=rest.match(/^["“']([^"”']+)["”']/);if(quoted)candidate=quoted[1];else{rest=rest.split(/[,.\n;:]/)[0];rest=rest.split(/\s+(?:và|để|với|hãy|who|that|with|specializing)\s+/i)[0];candidate=rest.replace(/[.…]+$/g,'');}}
  }
  if(!candidate){const first=(lines.find(x=>x.trim())||'').trim();candidate=first.split(/(?<=[.!?])\s+/)[0].split(/\s+/).slice(0,7).join(' ')+'...';}
  candidate=cleanTitleCandidate_(candidate).replace(/\([^)]*\)\s*$/,'').trim();
  return {name:normalizeName_(candidate),nameSub:nameSub};
}
function cleanTitleCandidate_(value){
  let s=String(value||'').trim().replace(/^Prompt\s*:\s*/i,'').replace(/^ROLE\s*[—–-]\s*/i,'');
  const version=s.match(/^v([A-Z][A-Za-z0-9]*(?:-[A-Z][A-Za-z0-9]*)*)\s+v(\d+(?:\.\d+)*(?:-[A-Za-z0-9.-]+)?)(?:\s*[-–—]\s*([^\n(]+))?/);
  if(version)return version[3]?version[3].trim():version[1].replace(/-/g,' ');
  return s.replace(/\([^)]*\)\s*$/,'').replace(/[.…]+$/g,'').trim();
}
function normalizeName_(value){
  let s=String(value||'').replace(/\s+/g,' ').trim();if(!s)return 'Chưa đặt tên';
  const allCaps=s===s.toLocaleUpperCase('vi');const keep=['AI','OSINT','TOD','3D','2D','UI','UX','PDF','JSON','SEO','HDR','DSLR'];
  const words=s.split(' ');s=words.map((w,i)=>{const bare=w.replace(/[^\p{L}\p{N}]/gu,'');if(keep.includes(bare.toUpperCase()))return w.replace(bare,bare.toUpperCase());if(allCaps){if(bare.length<=3)return w;return w.toLocaleLowerCase('vi').replace(/^\p{L}/u,c=>c.toLocaleUpperCase('vi'));}if(i===0)return w.replace(/^\p{L}/u,c=>c.toLocaleUpperCase('vi'));return w;}).join(' ');
  if(s.length>60){s=s.slice(0,60);s=s.slice(0,s.lastIndexOf(' ')).trim();}return s;
}
function variantLabel_(text,n){
  for(const line of String(text||'').split('\n').slice(0,5)){const m=line.trim().match(/^#{1,6}\s*(?:ROLE\s*[—–-]\s*)?(?:Prompt\s*:\s*)?(.+)$/i);if(m){const value=cleanTitleCandidate_(m[1]);if(value)return normalizeName_(value);}}
  const lines=String(text||'').split('\n');for(const line of lines.slice(0,2)){const m=line.trim().match(/^(.{1,90}?):\s*(?:Với|Hãy|Bạn|Dựa|Cho|Từ|Khi|Trong|Nhiệm vụ|Mục tiêu)\b/i);if(m&&m[1].trim().split(/\s+/).length<=8)return normalizeName_(m[1]);}
  const v=String(text||'').match(/\bv([A-Z][A-Za-z0-9]*(?:-[A-Z][A-Za-z0-9]*)*)\s+v\d+(?:\.\d+)*(?:-[A-Za-z0-9.-]+)?/);if(v)return normalizeName_(v[1].replace(/-/g,' '));
  return 'Bản '+n;
}

function disambiguateNames_(items){
  const byName={};items.forEach(item=>{const key=String(item.name||'').toLocaleLowerCase('vi');(byName[key]||(byName[key]=[])).push(item);});
  Object.keys(byName).forEach(key=>{const group=byName[key];if(group.length<2)return;group.forEach((item,index)=>{const text=item.variants[0]&&item.variants[0].text||'';const m=text.match(/\b(?:và|and)\s+([^.,;\n]+)/i);let suffix=m?m[1].trim().split(/\s+/).slice(0,7).join(' '):'';if(suffix)item.name+=' · '+suffix;else if(index>0)item.name+=' ('+(index+1)+')';});});
}

function suggestCategory(text,categories) {
  const normalized=normalizeSearch_(text);const ranked=[];
  Object.keys(CATEGORY_KEYWORDS).forEach((group,index)=>{
    if(!categories.some(c=>normalizeHeader_(c)===normalizeHeader_(group)))return;
    const hits=[];let total=0;
    for(const word of CATEGORY_KEYWORDS[group]){const k=normalizeSearch_(word);if(k&&normalized.includes(k)){hits.push(String(word).toLocaleLowerCase('vi'));total+=(normalized.match(new RegExp(escapeRegex_(k),'g'))||[]).length;}}
    ranked.push({group,index,count:hits.length,hits:hits,total:total});
  });
  ranked.sort((a,b)=>b.count-a.count||a.index-b.index);
  const winner=ranked[0]&&ranked[0].count>=2?ranked[0]:null;
  const selected=winner?winner.hits.slice().sort((a,b)=>{const ca=(normalized.match(new RegExp(escapeRegex_(normalizeSearch_(a)),'g'))||[]).length;const cb=(normalized.match(new RegExp(escapeRegex_(normalizeSearch_(b)),'g'))||[]).length;return cb-ca}).slice(0,5):[];
  return {category:winner?winner.group:'',tags:selected};
}
function normalizeSearch_(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'d').toLowerCase()}
function escapeRegex_(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}

function getStateForIds_(onlyIds) {
  const ss=spreadsheet_();const sh=ensureSheet_(ss,PV.STATE,PV.STATE_HEADERS);const values=sh.getDataRange().getValues();const current=onlyIds?new Set(onlyIds):currentIds_();const map={};
  for(let r=1;r<values.length;r++){const id=String(values[r][0]||'');if(!id||!current.has(id))continue;map[id]={id:id,fav:values[r][1]===true||String(values[r][1]).toUpperCase()==='TRUE',pin:values[r][2]===true||String(values[r][2]).toUpperCase()==='TRUE',uses:Number(values[r][3]||0),lastUsed:dateText_(values[r][4]),updatedAt:dateText_(values[r][5])};}
  return map;
}
function currentIds_(){const sh=spreadsheet_().getSheetByName(PV.SHEET);if(!sh||sh.getLastRow()<2)return new Set();const values=sh.getDataRange().getValues();const m=findColumns_(values[0]);if(m.id<0)return new Set();const ids=new Set();for(let r=1;r<values.length;r++){if(m.promptCols.some(c=>nfc_(values[r][c.index]).trim())){const id=String(values[r][m.id]||'').trim();if(id)ids.add(id);}}return ids;}
function ensureStateRow_(sheet,id){const last=sheet.getLastRow();if(last>1){const vals=sheet.getRange(2,1,last-1,1).getDisplayValues().flat();const i=vals.indexOf(id);if(i>=0)return i+2;}const row=sheet.getLastRow()+1;sheet.getRange(row,1,1,PV.STATE_HEADERS.length).setValues([[id,false,false,0,'',isoNow_()]]);return row;}

function applyEvents_(body) {
  if(!Array.isArray(body.events))return {ok:false,error:'invalid_events'};
  const lock=LockService.getScriptLock();if(!lock.tryLock(20000))return {ok:false,error:'busy'};
  try{
    const ss=spreadsheet_();const kho=ss.getSheetByName(PV.SHEET);if(!kho)throw new Error('Thiếu tab «Kho».');
    const headers=kho.getRange(1,1,1,kho.getLastColumn()).getValues()[0];const cols=findColumns_(headers);if(cols.id<0)throw new Error('Thiếu cột «ID».');
    const meta=ensureSheet_(ss,PV.META,PV.META_HEADERS);const mm=getHeaderMap_(meta);const stateSheet=ensureSheet_(ss,PV.STATE,PV.STATE_HEADERS);const cache=CacheService.getScriptCache();const applied=[];const affected=new Set();let contentChanged=false;
    for(const event of body.events){
      const eid=String(event.eid||'');if(!eid)continue;if(cache.get(PV.EID_PREFIX+eid)){applied.push(eid);continue;}
      const id=String(event.id||'');if(!id)continue;
      const liveRow=findRowById_(kho,cols.id,id);if(liveRow<0)throw new Error('Không tìm thấy ID '+id+'; không ghi dữ liệu.');
      if(event.type==='fav'||event.type==='pin'||event.type==='copy'){
        const row=ensureStateRow_(stateSheet,id);const values=stateSheet.getRange(row,1,1,PV.STATE_HEADERS.length).getValues()[0];
        if(event.type==='fav')values[1]=!!event.value;else if(event.type==='pin')values[2]=!!event.value;else{values[3]=Number(values[3]||0)+Math.max(1,Number(event.n||1));values[4]=isoInTz_(event.ts);}
        values[5]=isoNow_();stateSheet.getRange(row,1,1,PV.STATE_HEADERS.length).setValues([values]);affected.add(id);
      }else if(event.type==='rename'||event.type==='category'){
        const target=event.type==='rename'?cols.name:cols.category;if(target<0)throw new Error('Thiếu cột «'+(event.type==='rename'?'Tên Prompt':'PL chức năng')+'» trong tab «Kho».');
        const row=findRowById_(kho,cols.id,id);if(row<0)throw new Error('Không tìm thấy ID '+id+'; không ghi dữ liệu.');
        kho.getRange(row,target+1).setValue(event.type==='rename'?String(event.name||''):String(event.category||''));contentChanged=true;affected.add(id);
      }else{continue;}
      cache.put(PV.EID_PREFIX+eid,'1',21600);applied.push(eid);
    }
    if(contentChanged){cache.remove(PV.VERSION_CACHE);cache.remove(PV.IDS_CACHE);}
    const states=getStateForIds_(Array.from(affected));return {ok:true,state:Array.from(affected).map(id=>states[id]||{id:id,fav:false,pin:false,uses:0,lastUsed:'',updatedAt:''}),applied:applied};
  }finally{lock.releaseLock();}
}
function findRowById_(sheet,idCol,id){if(sheet.getLastRow()<2)return -1;const values=sheet.getRange(2,idCol+1,sheet.getLastRow()-1,1).getDisplayValues();for(let i=0;i<values.length;i++)if(String(values[i][0])===id)return i+2;return -1;}
function cacheIds_(ids){const json=JSON.stringify(ids);if(Utilities.newBlob(json).getBytes().length<90000)CacheService.getScriptCache().put(PV.IDS_CACHE,json,60);else CacheService.getScriptCache().remove(PV.IDS_CACHE)}
function readCachedIds_(){const raw=CacheService.getScriptCache().get(PV.IDS_CACHE);if(!raw)return null;try{const ids=JSON.parse(raw);return Array.isArray(ids)?ids:null}catch(e){return null}}
function cachedVersion_(){return CacheService.getScriptCache().get(PV.VERSION_CACHE)||''}
function getVersionOnly_(){const lock=LockService.getScriptLock();if(!lock.tryLock(20000))return '';try{const s=buildSnapshot_();CacheService.getScriptCache().put(PV.VERSION_CACHE,s.version,60);cacheIds_(s.items.map(x=>x.id));return s.version}finally{lock.releaseLock()}}
function onEdit(e){try{if(e&&e.range&&e.range.getSheet().getName()===PV.SHEET){const c=CacheService.getScriptCache();c.remove(PV.VERSION_CACHE);c.remove(PV.IDS_CACHE)}}catch(err){}}

// Hàm thuần dễ chạy trong Apps Script để kiểm tra luật tên và phân loại từ editor.
function testAutoName(text){return autoName(text)}
