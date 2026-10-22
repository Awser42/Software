const {readPriceState,selectObservedValue,beginPriceObservation,endPriceObservation}=require('./price-page');
const normalized=value=>String(value??'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
function sameValue(observed,target) {
  return target.valueId && observed.id ? String(target.valueId)===String(observed.id) : !!target.valueName && normalized(observed.name)===normalized(target.valueName);
}
function findGroup(state,target) {
  const byId=target.groupId && state.groups.filter(g=>g.id && String(g.id)===String(target.groupId));
  if (byId?.length===1) return byId[0];
  const byName=state.groups.filter(g=>normalized(g.name)===normalized(target.groupName));
  return byName.length===1?byName[0]:null;
}
function targetsFor(variant,properties) {
  if (!variant.attributes) return null;
  const targets=[];
  for (const pair of variant.attributes.split(';').filter(Boolean)) {
    const [groupId,rest='']=pair.split(':'); const valueId=rest.split('#')[0];
    const property=properties.find(p=>String(p.id)===groupId);
    const value=property?.values?.find(v=>String(v.id)===valueId);
    if (!property || !value) return null;
    targets.push({groupId,groupName:property.name,valueId,valueName:value.name});
  }
  return targets.length?targets:null;
}
function selectedTarget(state,target) {
  const group=findGroup(state,target); if (!group) return false;
  const selected=group.values.filter(v=>v.selected&&!v.disabled);
  return selected.length===1&&sameValue(selected[0],target);
}
function matches(state,targets,skuId) {
  if (!targets?.length || targets.length!==state.groups.length) return false;
  if (skuId && state.selectedSkuId && String(state.selectedSkuId)!==String(skuId)) return false;
  return targets.every(target=>selectedTarget(state,target))&&new Set(targets.map(target=>findGroup(state,target))).size===state.groups.length;
}
// A range is a product-level observation, not a price for one selected SKU.
const singlePrice=value=>typeof value==='string' && /\d/.test(value) && !/\d\s*(?:-|–|—|~|to)\s*(?:[A-Z]{2,3}\s*)?[$€£¥₹]?\s*\d/i.test(value);
function selectionTargets(state) {
  if (!state.groups.length) return null;
  const targets=[];
  for (const group of state.groups) {
    const selected=group.values.filter(v=>v.selected&&!v.disabled);
    if (selected.length!==1) return null;
    targets.push({groupId:group.id,groupName:group.name,valueId:selected[0].id,valueName:selected[0].name,image:selected[0].image||null});
  }
  return targets;
}
function selectionKey(targets) {
  return JSON.stringify(targets.map(t=>[t.groupId||normalized(t.groupName),t.valueId||normalized(t.valueName)]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
}
function assignObservation(variant,state) {
  variant.displayedPrice=state.displayed;
  const targets=selectionTargets(state)||[];
  variant.observedOptions=targets.map(t=>({name:t.groupName,value:t.valueName,id:t.valueId,propertyId:t.groupId}));
  if (targets.length) variant.name=targets.map(t=>[t.groupName,t.valueName].filter(Boolean).join(': ')).join(' / ');
  variant.observedImageUrls=[...new Set(targets.map(t=>t.image).filter(Boolean))];
}
async function captureVisiblePrices(page,product,queue,{settleMs=700,timeoutMs=10000,onGate=async()=>{},onProgress=()=>{},maxObservedRows=200}={}) {
  product.warnings ||= []; product.prices ||= {}; product.variations ||= [];
  product.prices.mode='visible-variation';
  for (const variant of product.variations) { variant.displayedPrice=null; variant.observedOptions=[]; variant.observedImageUrls=[]; }
  const checkPage=state=>{
    if (product.productId && state.productId!==String(product.productId)) throw new Error('Product changed while reading visible variation prices. No price was assigned from a different page.');
  };
  const waitStable=async(targets=null,skuId=null,freshAfter=null,onlyTarget=null)=>{
    await queue.checkpoint(); await onGate();
    await page.waitForTimeout(Math.max(0,settleMs));
    let deadline=Date.now()+Math.max(timeoutMs,300); let previous=null;
    while (Date.now()<deadline) {
      const pausedAt=Date.now();
      await queue.checkpoint(); await onGate();
      deadline+=Date.now()-pausedAt;
      const state=await readPriceState(page); checkPage(state);
      const selectionOK=onlyTarget?selectedTarget(state,onlyTarget):(!targets&&!skuId || matches(state,targets,skuId));
      const fresh=!freshAfter || state.revision>0 || state.displayed!==freshAfter.displayed;
      if (selectionOK && fresh && state.displayed && !state.loading) {
        const key=JSON.stringify([state.displayed,state.groups.map(g=>g.values.filter(v=>v.selected).map(v=>[g.id,g.name,v.id,v.name]))]);
        if (previous===key) return state;
        previous=key;
      } else previous=null;
      await page.waitForTimeout(150);
    }
    return null;
  };
  let initial=await waitStable();
  let snapshot=initial || await readPriceState(page); checkPage(snapshot);
  const beforeSeeding=snapshot;
  // Some products require both Color and Size before exposing any price. Select
  // only real enabled controls, confirm every selection, then require a fresh
  // price for the complete selected state. Partial states never receive prices.
  if(snapshot.groups.length&&!selectionTargets(snapshot)) {
    let lastBefore=null,failed=false;
    for(let index=0;index<snapshot.groups.length;index++) {
      await queue.checkpoint();await onGate();
      const current=await readPriceState(page);checkPage(current);
      const group=current.groups[index];if(!group){failed=true;break;}
      const selected=group.values.filter(value=>value.selected&&!value.disabled);
      if(selected.length===1)continue;
      if(selected.length>1){failed=true;break;}
      const value=group.values.find(value=>!value.disabled&&value.name);
      if(!value){failed=true;break;}
      const target={groupId:group.id,groupName:group.name,valueId:value.id,valueName:value.name};
      await beginPriceObservation(page);lastBefore=current;
      if(!await selectObservedValue(page,target)){failed=true;break;}
      let confirmed=false;
      const deadline=Date.now()+Math.max(timeoutMs,300);
      while(Date.now()<deadline){await queue.checkpoint();await onGate();const observed=await readPriceState(page);checkPage(observed);if(selectedTarget(observed,target)){confirmed=true;break;}await page.waitForTimeout(100);}
      if(!confirmed){failed=true;break;}
      // Finish the previous option's network work before selecting the next
      // required group. A late partial-selection response must not freshen the
      // final combination's price observer.
      try{await page.waitForLoadState('networkidle',{timeout:Math.max(timeoutMs,1500)});}catch{failed=true;break;}
      await page.waitForTimeout(Math.max(150,settleMs));
    }
    const selected=await readPriceState(page);checkPage(selected);
    if(!failed&&selectionTargets(selected))initial=await waitStable(selectionTargets(selected),null,lastBefore);
    else initial=null;
    snapshot=initial||selected;
  }
  product.prices.displayed=initial?.displayed||null;
  product.prices.displayedUnassigned=!!initial?.displayed;
  // An unselected single required group has no intermediate combination: it
  // can be selected and then priced through the same freshness checks below.
  const canSeedSingle=!initial && snapshot.groups.length===1 && !snapshot.loading && !snapshot.groups[0].values.some(v=>v.selected);
  if (!initial && !canSeedSingle) {
    product.warnings.push('Visible current price did not settle. Hidden catalog prices were not substituted. Select required options in Chromium and retry if the product has no default selection.');
    return product;
  }
  const originalSelection=selectionTargets(beforeSeeding)||beforeSeeding.groups.flatMap(group=>{
    const selected=group.values.filter(v=>v.selected&&!v.disabled);
    return selected.length===1?[{groupId:group.id,groupName:group.name,valueId:selected[0].id,valueName:selected[0].name}]:[];
  });
  let halted=false;
  const selectTargets=async(targets,skuId=null)=>{
    let observed=null;
    for (const target of targets) {
      await queue.checkpoint(); await onGate();
      const before=await readPriceState(page); checkPage(before);
      if (selectedTarget(before,target)) continue;
      await beginPriceObservation(page);
      if (!await selectObservedValue(page,target)) return {state:null,unavailable:true};
      // Each changed group settles independently; an intermediate combination
      // cannot freshen the observer used to confirm the final combination.
      observed=await waitStable(null,null,before,target);
      if (!observed) {
        halted=true;
        product.warnings.push('A variation price update could not be confirmed. Remaining price selections were stopped to avoid attributing a late update to another variation.');
        return {state:null,unavailable:false};
      }
    }
    observed=observed||await waitStable(targets,skuId);
    return {state:observed&&matches(observed,targets,skuId)&&singlePrice(observed.displayed)?observed:null,unavailable:false};
  };
  let plans=product.variations.map(variant=>({variant,targets:targetsFor(variant,product.properties||[])}));
  const rawVariants=product.variations;
  const mappedKey=plan=>{
    if(!plan.targets?.length||plan.targets.length!==snapshot.groups.length)return null;
    const groups=new Set(),targets=[];
    for(const target of plan.targets){const group=findGroup(snapshot,target),value=group?.values.find(value=>sameValue(value,target));if(!value)return null;groups.add(group);targets.push({groupId:group.id,groupName:group.name,valueId:value.id,valueName:value.name});}
    return groups.size===snapshot.groups.length?selectionKey(targets):null;
  };
  const uiMapped=plan=>mappedKey(plan)!==null;
  const useObservedUI=snapshot.groups.length>0&&!plans.some(uiMapped);
  if(useObservedUI){plans=[];product.variations=[];if(rawVariants.length)product.warnings.push('Catalog options could not be mapped to the visible controls; variations are captured from actual selectable page options instead.');}
  if (!plans.length && snapshot.groups.length===1) {
    const group=snapshot.groups[0];
    for (const value of group.values) {
      const variant={skuId:null,name:[group.name,value.name].filter(Boolean).join(': '),price:null,displayedPrice:null,observedOptions:[],observedImageUrls:[]};
      product.variations.push(variant);
      plans.push({variant,targets:[{groupId:group.id,groupName:group.name,valueId:value.id,valueName:value.name}]});
    }
  }
  if (initial) {
    const initialMatches=plans.filter(plan=>matches(initial,plan.targets,plan.variant.skuId));
    if (singlePrice(initial.displayed) && initialMatches.length===1) {
      assignObservation(initialMatches[0].variant,initial);
      product.prices.displayedUnassigned=false;
    }
  }
  const mappedPlans=new Map();
  for(const plan of plans){const key=mappedKey(plan);if(key===null)continue;if(!mappedPlans.has(key))mappedPlans.set(key,[]);mappedPlans.get(key).push(plan);}
  // Catalog responses can expose only one size/pack per design. Use the visible
  // choice count only to detect incomplete coverage, never to invent SKU rows.
  const possibleSelections=snapshot.groups.reduce((count,group)=>count*new Set(group.values.map(value=>value.id||normalized(value.name))).size,1);
  const discover=snapshot.groups.length>0&&mappedPlans.size<possibleSelections;
  try {
    if (discover && initial && selectionTargets(initial) && singlePrice(initial.displayed)) {
      // Walk the graph of real enabled UI choices. A candidate is never an
      // exported variation until its full selected state and price are read.
      const visited=new Set(); const limit=Math.min(200,Math.max(1,Number(maxObservedRows)||200));
      let transitions=0,limited=false;
      const record=state=>{
        const targets=selectionTargets(state); if (!targets||!singlePrice(state.displayed)||state.loading) return false;
        const key=selectionKey(targets); if (visited.has(key)) return false;
        if (visited.size>=limit) { limited=true; return false; }
        visited.add(key);
        const existing=mappedPlans.get(key)||[],matching=existing.filter(plan=>matches(state,plan.targets,plan.variant.skuId));
        let variant=matching.length===1?matching[0].variant:null;
        if(!existing.length){variant={skuId:state.selectedSkuId||null,name:null,attributes:null,price:null,displayedPrice:null};product.variations.push(variant);}
        if(variant){assignObservation(variant,state);if(key===selectionKey(selectionTargets(initial)))product.prices.displayedUnassigned=false;}
        return true;
      };
      record(initial);
      const walk=async state=>{
        const parent=selectionTargets(state); if (!parent||halted||limited) return;
        const choices=state.groups.flatMap(group=>group.values.filter(value=>!value.selected&&!value.disabled).map(value=>({groupId:group.id,groupName:group.name,valueId:value.id,valueName:value.name})));
        for (const choice of choices) {
          if (halted||limited) return;
          const predicted=parent.map(target=>findGroup(state,target)===findGroup(state,choice)?choice:target);
          if(visited.has(selectionKey(predicted)))continue;
          if (++transitions>limit*12) { limited=true; return; }
          const current=await readPriceState(page); checkPage(current);
          const group=findGroup(current,choice); const value=group?.values.find(v=>sameValue(v,choice));
          if (!value||value.disabled) continue;
          onProgress(`Reading observed variation ${visited.size} (up to ${limit})`);
          await beginPriceObservation(page);
          if (!await selectObservedValue(page,choice)) continue;
          const observed=await waitStable(null,null,current,choice);
          if (!observed) {
            halted=true;
            product.warnings.push('A discovered option change did not produce a confirmed fresh price; further discovery stopped to avoid misattributing late updates.');
            return;
          }
          if (record(observed)) await walk(observed);
          if (halted||limited) return;
          // Backtracking is itself a sequence of confirmed single-group
          // updates; a late response from a child cannot price its parent.
          const restored=await selectTargets(parent);
          if (!restored.state) {
            halted=true;
            product.warnings.push('The previous option combination could not be restored and confirmed; further variation discovery stopped.');
            return;
          }
        }
      };
      await walk(initial);
      if (limited) product.warnings.push(`Variation discovery stopped at its safety limit (${visited.size} confirmed rows, maximum ${limit}). Only actual observed combinations were exported; additional combinations may remain.`);
    } else {
      for (let index=0;index<plans.length;index++) {
        const {variant,targets}=plans[index];
        await queue.checkpoint(); await onGate();
        onProgress(`Reading visible variation price ${index+1} of ${plans.length}`);
        if (variant.displayedPrice!==null) continue;
        if (!targets?.length || targets.length!==snapshot.groups.length) continue;
        const before=await readPriceState(page); checkPage(before);
        if (!before.selectedSkuId && plans.filter(p=>JSON.stringify(p.targets)===JSON.stringify(targets)).length>1) continue;
        const result=await selectTargets(targets,variant.skuId);
        if (halted) break;
        if (result.state) assignObservation(variant,result.state);
      }
    }
  } finally {
    await endPriceObservation(page).catch(()=>{});
    for (const target of originalSelection) {
      await queue.checkpoint();
      await selectObservedValue(page,target).catch(()=>false);
    }
  }
  if(useObservedUI&&!product.variations.length)product.variations=rawVariants;
  const missing=plans.filter(p=>p.variant.displayedPrice===null).length;
  if (missing) product.warnings.push(`${missing} variation price(s) could not be confirmed in the visible current-price panel; their Excel prices are blank.`);
  if (!plans.length && snapshot.groups.length>1 && !product.variations.length) product.warnings.push('No full option combination could be confirmed. Only an observed product-level price was retained; combinations were not invented.');
  return product;
}
module.exports={captureVisiblePrices};
