import { readFileSync } from 'node:fs';
const canon=JSON.parse(readFileSync(new URL('../catalog/canon-dslr.json',import.meta.url),'utf8'));

function norm(v){
  return String(v||'').toLowerCase().replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
}
function hasTerm(text,term){
  const t=norm(term);if(!t)return false;
  const escaped=t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const re=new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`,'i');
  return re.test(norm(text));
}
function canonModel(text,selected){
  const allowed=new Set((selected||[]).map(x=>String(x).toUpperCase()));
  for(const model of canon.models){
    if(allowed.size&& !allowed.has(model.id.toUpperCase()))continue;
    if(model.aliases.some(a=>hasTerm(text,a)))return model.id;
  }
  return null;
}
function normalizeCondition(v){
  const x=norm(v).replace(/ /g,'_');
  if(x.includes('very_good'))return 'very_good';
  if(x.includes('satisfactory'))return 'satisfactory';
  if(x.includes('good'))return 'good';
  if(x.includes('new'))return 'new';
  return x||null;
}
function accessorySignals(text){
  const found=[];
  for(const [label,signals] of Object.entries(canon.accessorySignals||{})){
    if(signals.some(s=>norm(text).includes(norm(s))))found.push(label);
  }
  return found;
}
export function basicMatch(listing,monitor){
  if(!listing?.id||listing.itemPrice==null)return {ok:false,reason:'missing_id_or_price'};
  const min=Number(monitor.price_min)||0,max=Number(monitor.price_max)||Infinity;
  if(listing.itemPrice<min||listing.itemPrice>max)return {ok:false,reason:'price'};
  const text=`${listing.title||''}\n${listing.description||''}`;
  const reject=(Array.isArray(monitor.reject_keywords)?monitor.reject_keywords:[]).find(k=>norm(text).includes(norm(k)));
  if(reject)return {ok:false,reason:'reject_keyword',reject};
  const selected=Array.isArray(monitor.models)?monitor.models:[];
  const matchedModel=monitor.template_key==='canon'||monitor.template_key==='canonBenchmark'||norm(monitor.brand)==='canon'
    ? canonModel(text,selected)
    : (selected.find(model=>hasTerm(text,model))||null);
  if(selected.length&&!matchedModel)return {ok:false,reason:'model'};
  const allowed=Array.isArray(monitor.allowed_conditions)?monitor.allowed_conditions:[];
  const c=normalizeCondition(listing.condition);
  if(allowed.length&&c&&!allowed.includes(c))return {ok:false,reason:'condition'};
  return {
    ok:true,
    matchedModel,
    condition:c,
    warnings:(Array.isArray(monitor.warning_keywords)?monitor.warning_keywords:[]).filter(k=>norm(text).includes(norm(k))),
    accessories:accessorySignals(text)
  };
}

export function buildQueries(monitor){
  const configured=Array.isArray(monitor.search_terms)?monitor.search_terms.map(String).map(x=>x.trim()).filter(Boolean):[];
  if(configured.length)return [...new Set(configured)];
  if(monitor.brand&&String(monitor.brand).trim())return [String(monitor.brand).trim()];
  const models=Array.isArray(monitor.models)?monitor.models:[];
  return models.slice(0,5).map(String);
}
