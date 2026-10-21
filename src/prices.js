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
  if (skuId && state.selectedSkuId) return String(state.selectedSkuId)===String(skuId);
  if (!targets?.length || targets.length!==state.groups.length) return false;
  return targets.every(target=>selectedTarget(state,target));
}
// A range is a product-level observation, not a price for one selected SKU.
const singlePrice=value=>typeof value==='string' && /\d/.test(value) && !/\d\s*(?:-|–|—|~|to)\s*(?:[A-Z]{2,3}\s*)?[$€£¥₹]?\s*\d/i.test(value);
async function captureVisiblePrices(page,product,queue,{settleMs=700,timeoutMs=5000,onGate=async()=>{},onProgress=()=>{}}={}) {
  product.warnings ||= []; product.prices ||= {}; product.variations ||= [];
  product.prices.mode='visible-variation';
  for (const variant of product.variations) variant.displayedPrice=null;
  const checkPage=state=>{
    if (product.productId && state.productId!==String(product.productId)) throw new Error('Product changed while reading visible variation prices. No price was assigned from a different page.');
  };
  const waitStable=async(targets=null,skuId=null,freshAfter=null,onlyTarget=null)=>{
    await queue.checkpoint(); await onGate();
    // Give AliExpress time to update the current-price panel after selection.
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
  const initial=await waitStable();
  product.prices.displayed=initial?.displayed||null;
  product.prices.displayedUnassigned=!!initial?.displayed;
  if (!initial) {
    product.warnings.push('Visible current price did not settle. Hidden catalog prices were not substituted.');
    return product;
  }
  const originalSelection=initial.groups.map(group=>{
    const selected=group.values.filter(v=>v.selected&&!v.disabled);
    return selected.length===1?{groupId:group.id,groupName:group.name,valueId:selected[0].id,valueName:selected[0].name}:null;
  }).filter(Boolean);
  const plans=product.variations.map(variant=>({variant,targets:targetsFor(variant,product.properties||[])}));
  // A single exposed option group can be observed directly, even when the
  // page does not expose SKU records. Never create Cartesian combinations.
  if (!plans.length && initial.groups.length===1) {
    const group=initial.groups[0];
    for (const value of group.values) {
      const variant={skuId:null,name:[group.name,value.name].filter(Boolean).join(': '),price:null,displayedPrice:null};
      product.variations.push(variant);
      plans.push({variant,targets:[{groupId:group.id,groupName:group.name,valueId:value.id,valueName:value.name}]});
    }
  }
  const initialMatches=plans.filter(plan=>matches(initial,plan.targets,plan.variant.skuId));
  if (singlePrice(initial.displayed) && initialMatches.length===1) {
    initialMatches[0].variant.displayedPrice=initial.displayed;
    product.prices.displayedUnassigned=false;
  }
  try {
    variantsLoop: for (let index=0;index<plans.length;index++) {
      const {variant,targets}=plans[index];
      await queue.checkpoint(); await onGate();
      onProgress(`Reading visible variation price ${index+1} of ${plans.length}`);
      if (variant.displayedPrice!==null) continue;
      if (!targets?.length || targets.length!==initial.groups.length) continue;
      const before=await readPriceState(page); checkPage(before);
      if (!before.selectedSkuId && plans.filter(p=>JSON.stringify(p.targets)===JSON.stringify(targets)).length>1) continue;
      let selected=true,observed=null;
      for (const target of targets) {
        await queue.checkpoint(); await onGate();
        const beforeGroup=await readPriceState(page); checkPage(beforeGroup);
        if (selectedTarget(beforeGroup,target)) continue;
        // Settle each changed group separately. A price update for an
        // intermediate Color/Size combination must not confirm the final SKU.
        await beginPriceObservation(page);
        if (!await selectObservedValue(page,target)) { selected=false; break; }
        observed=await waitStable(null,null,beforeGroup,target);
        if (!observed) {
          product.warnings.push('A variation price update could not be confirmed. Remaining price selections were stopped to avoid attributing a late update to another variation.');
          break variantsLoop;
        }
      }
      if (!selected) continue;
      observed=observed || await waitStable(targets,variant.skuId);
      if (observed && matches(observed,targets,variant.skuId) && singlePrice(observed.displayed)) variant.displayedPrice=observed.displayed;
    }
  } finally {
    await endPriceObservation(page).catch(()=>{});
    // Leave the user's initially selected options in place; no cart or checkout
    // controls are ever part of the option-selector helper.
    for (const target of originalSelection) {
      await queue.checkpoint();
      await selectObservedValue(page,target).catch(()=>false);
    }
  }
  const missing=plans.filter(p=>p.variant.displayedPrice===null).length;
  if (missing) product.warnings.push(`${missing} variation price(s) could not be confirmed in the visible current-price panel; their CSV prices are blank.`);
  if (!plans.length && initial.groups.length>1) product.warnings.push('SKU combinations were not exposed. Only the current visible product price was retained; option combinations were not invented.');
  return product;
}
module.exports={captureVisiblePrices};
