/*
 * Experimental anonymous Vinted adapter.
 *
 * Uses the same catalogue/detail endpoints referenced by current community
 * monitor projects. They are undocumented and are NOT a general public Vinted
 * developer API. This adapter intentionally does not implement CAPTCHA solving,
 * proxy rotation, TLS/browser fingerprint spoofing or any other bypass.
 *
 * 403/429 are surfaced to the worker, which backs off.
 */
export class VintedAccessError extends Error{
  constructor(message,status,kind){
    super(message);this.name='VintedAccessError';this.status=status;this.kind=kind;
  }
}

function n(v){
  if(v==null||v==='')return null;
  if(typeof v==='object'&&v.amount!=null)v=v.amount;
  const x=Number(v);return Number.isFinite(x)?x:null;
}
function first(...vals){
  for(const v of vals)if(v!==undefined&&v!==null&&v!=='')return v;
  return null;
}
function reputationToFive(v){
  const x=n(v);if(x==null)return null;
  return x<=1.01?Math.round(x*500)/100:Math.round(x*100)/100;
}
function feedbackCount(u){
  const direct=n(first(u?.feedback_count,u?.feedbackCount));
  if(direct!=null)return Math.max(0,Math.round(direct));
  const p=n(u?.positive_feedback_count),ne=n(u?.neutral_feedback_count),ng=n(u?.negative_feedback_count);
  if(p==null&&ne==null&&ng==null)return null;
  return Math.max(0,Math.round((p||0)+(ne||0)+(ng||0)));
}
function setCookieValues(headers){
  if(typeof headers.getSetCookie==='function')return headers.getSetCookie();
  const raw=headers.get('set-cookie');return raw?[raw]:[];
}
class CookieJar{
  constructor(){this.map=new Map();}
  absorb(headers){
    for(const raw of setCookieValues(headers)){
      const firstPart=String(raw).split(';',1)[0];
      const at=firstPart.indexOf('=');
      if(at>0)this.map.set(firstPart.slice(0,at).trim(),firstPart.slice(at+1).trim());
    }
  }
  header(){
    return [...this.map.entries()].map(([k,v])=>`${k}=${v}`).join('; ');
  }
}

export class VintedAdapter{
  constructor({baseUrl='https://www.vinted.co.uk'}={}){
    this.baseUrl=String(baseUrl).replace(/\/+$/,'');
    this.jar=new CookieJar();
    this.warmed=false;
  }
  async warm(){
    const res=await fetch(this.baseUrl+'/',{
      headers:{'accept':'text/html,application/xhtml+xml','user-agent':'RETRADE-Monitor/0.2'},
      redirect:'follow'
    });
    this.jar.absorb(res.headers);
    if(res.status===403)throw new VintedAccessError('Vinted rejected anonymous session bootstrap',403,'blocked');
    if(res.status===429)throw new VintedAccessError('Vinted rate limited session bootstrap',429,'rate_limited');
    if(!res.ok)throw new VintedAccessError(`Vinted bootstrap HTTP ${res.status}`,res.status,'http');
    this.warmed=true;
  }
  async json(path,query={}){
    if(!this.warmed)await this.warm();
    const url=new URL(path,this.baseUrl);
    for(const [k,v] of Object.entries(query)){
      if(v!==undefined&&v!==null&&v!=='')url.searchParams.set(k,String(v));
    }
    const headers={
      'accept':'application/json,text/plain,*/*',
      'user-agent':'RETRADE-Monitor/0.2'
    };
    const cookie=this.jar.header();if(cookie)headers.cookie=cookie;
    const res=await fetch(url,{headers,redirect:'follow'});
    this.jar.absorb(res.headers);
    if(res.status===403)throw new VintedAccessError('Vinted returned 403. Worker will back off; no bypass is attempted.',403,'blocked');
    if(res.status===429)throw new VintedAccessError('Vinted rate limited the worker. Worker will back off.',429,'rate_limited');
    if(!res.ok)throw new VintedAccessError(`Vinted HTTP ${res.status}`,res.status,'http');
    const ct=res.headers.get('content-type')||'';
    if(!ct.toLowerCase().includes('json')){
      throw new VintedAccessError('Vinted response was not JSON; connector may need updating.',res.status,'unexpected');
    }
    return res.json();
  }
  async search({searchText='',priceFrom=0,priceTo=100,perPage=50}={}){
    const data=await this.json('/api/v2/catalog/items',{
      search_text:searchText,
      price_from:priceFrom,
      price_to:priceTo,
      currency:'GBP',
      order:'newest_first',
      page:1,
      per_page:perPage
    });
    const arr=Array.isArray(data?.items)?data.items:[];
    return arr.map(raw=>this.normalize(raw));
  }
  async enrich(listing){
    let itemRaw=null,userRaw=null;
    try{
      const detail=await this.json(`/api/v2/items/${encodeURIComponent(listing.id)}`,{localize:'true'});
      itemRaw=detail?.item||detail;
    }catch(e){
      if(e instanceof VintedAccessError&&(e.status===403||e.status===429))throw e;
      // Details are enrichment, not a hard requirement. Keep catalog payload.
    }
    const merged=this.normalize(itemRaw||listing.raw||{});
    // Preserve catalog fields where detail payload is sparse.
    const out={...listing,...Object.fromEntries(Object.entries(merged).filter(([,v])=>v!==null&&v!==''))};
    const seller=first(itemRaw?.seller,itemRaw?.user,listing.raw?.seller,listing.raw?.user);
    const sellerId=first(seller?.id,out.sellerId);
    if(sellerId!=null){
      try{
        const prof=await this.json(`/api/v2/users/${encodeURIComponent(sellerId)}`);
        userRaw=prof?.user||prof;
      }catch(e){
        if(e instanceof VintedAccessError&&(e.status===403||e.status===429))throw e;
      }
    }
    if(userRaw){
      out.sellerId=first(userRaw.id,out.sellerId);
      out.sellerUsername=first(userRaw.login,out.sellerUsername);
      out.sellerRating=reputationToFive(first(userRaw.feedback_reputation,out.sellerRating));
      out.sellerReviews=feedbackCount(userRaw);
      out.sellerPositive=n(userRaw.positive_feedback_count);
      out.sellerNeutral=n(userRaw.neutral_feedback_count);
      out.sellerNegative=n(userRaw.negative_feedback_count);
      out.sellerCreatedAt=first(userRaw.created_at,out.sellerCreatedAt);
    }
    out.raw={catalog:listing.raw||{},detail:itemRaw||null,user:userRaw||null};
    return out;
  }
  normalize(raw){
    const r=raw||{};
    const u=first(r.seller,r.user)||{};
    const id=first(r.id,r.item_id);
    const path=first(r.url,r.path);
    const url=path?(String(path).startsWith('http')?String(path):this.baseUrl+String(path)):(id?`${this.baseUrl}/items/${id}`:null);
    const photos=Array.isArray(r.photos)?r.photos:[];
    const p=first(r.photo,photos[0])||{};
    const imageUrl=first(p.url,p.full_size_url,p.image_url,r.image_url);
    const images=photos.map(x=>first(x?.url,x?.full_size_url,x?.image_url)).filter(Boolean);
    return {
      id:id!=null?String(id):null,
      url,
      title:first(r.title,r.name)||'Vinted listing',
      description:first(r.description,r.body)||'',
      itemPrice:n(first(r.price,r.price_numeric,r.price_amount)),
      totalPrice:n(first(r.total_item_price,r.total_item_price_numeric,r.total_price)),
      currency:first(r.currency,r.price?.currency_code,r.price?.currency)||'GBP',
      condition:first(r.status_title,r.status,r.condition),
      brand:first(r.brand_title,r.brand?.title,r.brand),
      imageUrl:imageUrl||null,
      imageUrls:images,
      sellerId:first(u.id,r.user_id,r.seller_id),
      sellerUsername:first(u.login,u.username,r.seller_name),
      sellerRating:reputationToFive(first(u.feedback_reputation,u.reputation)),
      sellerReviews:feedbackCount(u),
      sellerPositive:n(u.positive_feedback_count),
      sellerNeutral:n(u.neutral_feedback_count),
      sellerNegative:n(u.negative_feedback_count),
      sellerCreatedAt:first(u.created_at,null),
      uploadedAt:first(r.upload_date,r.created_at,r.created_at_ts,r.updated_at_ts),
      raw:r
    };
  }
}
