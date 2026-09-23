function num(v,fallback=null){const n=Number(v);return Number.isFinite(n)?n:fallback;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

export function scoreSeller(listing,monitor){
  const reviews=listing.sellerReviews==null?null:Math.max(0,Math.round(num(listing.sellerReviews,0)));
  const rating=listing.sellerRating==null?null:num(listing.sellerRating,null);
  let score=100,risk='low',label='Established';

  if(reviews===null){score=58;risk='medium';label='History unavailable';}
  else if(reviews===0){score=25;risk='high';label='Fresh seller';}
  else if(reviews<=3){score=48;risk='high';label='Very limited history';}
  else if(reviews<Math.max(5,num(monitor.seller_min_reviews,5))){score=68;risk='medium';label='Limited history';}
  else if(reviews<10){score=78;risk='medium';label='Some history';}
  else if(reviews>=50){score=96;label='Highly established';}
  else score=90;

  if(rating!=null){
    if(rating<4){score-=35;risk='high';label='Weak feedback';}
    else if(rating<num(monitor.seller_min_rating,4.5)){score-=18;if(risk!=='high')risk='medium';label='Below rating target';}
    else if(rating>=4.8&&reviews!=null&&reviews>=10)score+=4;
  }
  return {score:clamp(Math.round(score),0,100),risk,label,reviews,rating};
}

function modelValueRule(monitor,matchedModel){
  const cfg=monitor.config&&typeof monitor.config==='object'?monitor.config:{};
  const values=cfg.modelValues&&typeof cfg.modelValues==='object'?cfg.modelValues:{};
  return matchedModel&&values[matchedModel]?values[matchedModel]:null;
}

export function evaluateListing(listing,monitor,match){
  const seller=scoreSeller(listing,monitor);
  if(monitor.zero_review_mode==='hide'&&seller.reviews===0)return {hidden:true,seller};

  const rule=modelValueRule(monitor,match.matchedModel);
  const landed=num(listing.totalPrice,listing.itemPrice);
  if(!rule){
    const score=clamp(Math.round(50+seller.score*0.18+(match.warnings.length?0:6)),0,79);
    return {
      hidden:false,
      decision:seller.risk==='high'?'risky':'check',
      score,
      seller,
      matchedModel:match.matchedModel,
      landedCost:landed,
      resaleLow:null,resaleHigh:null,projectedProfit:null,roi:null,
      reasoning:{
        summary:seller.risk==='high'
          ? `${seller.label}. Listing matched, but seller needs manual review and model valuation is not calibrated yet.`
          : 'New matching listing. Seller check passed; model valuation is not calibrated yet.',
        warnings:match.warnings,
        accessories:match.accessories,
        valuationPending:true
      }
    };
  }

  const resaleLow=num(rule.resaleLow,null),resaleHigh=num(rule.resaleHigh,resaleLow);
  const exitCosts=Math.max(0,num(rule.exitCostAllowance,0));
  const shippingAllowance=Math.max(0,num(rule.buyShippingAllowance,0));
  const adjustedLanded=(landed==null?num(listing.itemPrice,0):landed)+shippingAllowance;
  const profit=resaleLow==null?null:resaleLow-exitCosts-adjustedLanded;
  const roi=profit!=null&&adjustedLanded>0?(profit/adjustedLanded)*100:null;
  const minProfit=Math.max(0,num(monitor.min_profit,0));
  const minROI=Math.max(0,num(monitor.min_roi,0));

  let score=45;
  if(profit!=null&&minProfit>0)score+=clamp((profit/minProfit)*25,0,34);
  if(roi!=null&&minROI>0)score+=clamp((roi/minROI)*16,0,22);
  score-=Math.max(0,(100-seller.score)*0.32);
  score=clamp(Math.round(score),0,99);

  let decision='check';
  if(seller.risk==='high'&&profit!=null&&profit>=minProfit)decision='risky';
  else if(profit!=null&&roi!=null&&profit>=minProfit*1.4&&roi>=minROI*1.25&&seller.risk==='low'){decision='snipe';score=Math.max(90,score);}
  else if(profit!=null&&roi!=null&&profit>=minProfit&&roi>=minROI&&seller.risk!=='high'){decision='buy';score=Math.max(80,score);}

  return {
    hidden:false,decision,score,seller,matchedModel:match.matchedModel,
    landedCost:+adjustedLanded.toFixed(2),
    resaleLow,resaleHigh,
    projectedProfit:profit!=null?+profit.toFixed(2):null,
    roi:roi!=null?+roi.toFixed(1):null,
    reasoning:{
      summary:decision==='snipe'?'Price, profit and seller confidence clear the monitor targets.'
        :decision==='buy'?'Clears the configured profit/ROI targets with acceptable seller confidence.'
        :decision==='risky'?`${seller.label}. Economics may work, but manual seller review is required.`
        :'Interesting match, but it does not clear every configured buy threshold.',
      warnings:match.warnings,
      accessories:match.accessories,
      valuationPending:false
    }
  };
}
