const $ = id => document.getElementById(id);
const catalog = await fetch('./catalog.json').then(r => r.json());
const names = [...new Set(catalog.flatMap(i => Object.keys(i.profile)))];
function control(parent, text, type) {
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = type;
  label.append(input, ' ' + text);
  $(parent).append(label);
  return input;
}
const targets = names.map(name => {
  const input = control('targets', name + ' (%)', 'number');
  Object.assign(input, {min:0, max:100, step:'any', value:name === 'Linalool' ? 8 : 0});
  return input;
});
const enabled = catalog.map(i => {
  const composition = Object.entries(i.profile).map(([n,p]) => n+' '+p+'%').join(', ');
  const input = control('stock', i.name+' · '+i.type+' · '+(composition || 'no tracked terpenes'), 'checkbox');
  input.checked = true;
  return input;
});
// Pairwise coordinate descent on the simplex. Transfer mass between ingredients
// using the exact least-squares line minimum along each feasible direction.
function blend(items, goal) {
  const vectors = items.map(i => names.map(n => i.profile[n] || 0));
  const weights = items.map((_,i) => Number(i === 0));
  const residual = vectors[0].map((v,k) => v-goal[k]);
  for(let sweep=0;sweep<2000;sweep++){
    let movement=0;
    for(let i=0;i<items.length;i++) for(let j=0;j<i;j++){
      const delta=vectors[i].map((v,k)=>v-vectors[j][k]);
      const norm=delta.reduce((s,v)=>s+v*v,0);
      if(!norm) continue;
      const slope=delta.reduce((s,v,k)=>s+v*residual[k],0);
      const step=Math.max(-weights[i],Math.min(weights[j],-slope/norm));
      weights[i]+=step;
      weights[j]-=step;
      delta.forEach((v,k)=>residual[k]+=v*step);
      movement+=Math.abs(step);
    }
    if(movement<1e-10) break;
  }
  return weights;
}
const key='terpedia.rx.v1';
function render(){
  const recipes=JSON.parse(localStorage.getItem(key)||'[]');
  $('library').replaceChildren();
  if(!recipes.length) $('library').textContent='Your first recipe will appear here.';
  for(const rx of recipes){
    const panel=document.createElement('details');
    const title=document.createElement('summary');
    title.textContent=rx.name+' · '+rx.batchGrams+' g';
    const body=document.createElement('pre');
    body.textContent=rx.ingredients.map(i=>i.name+' · '+i.grams.toFixed(4)+' g').join('\n')+'\n\nTarget → estimated mass %\n'+rx.profile.map(p=>p.name+'   '+p.target+' → '+p.estimated.toFixed(3)).join('\n');
    const link=document.createElement('a');
    link.textContent='Download Rx JSON';
    link.download=rx.id+'.json';
    link.href='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(rx,null,2));
    panel.append(title,body,link);
    $('library').append(panel);
  }
}
$('form').onsubmit=e=>{
  e.preventDefault();
  const goal=targets.map(t=>Number(t.value));
  const sum=goal.reduce((a,b)=>a+b,0);
  const items=catalog.filter((_,i)=>enabled[i].checked);
  if(!items.length || sum<=0 || sum>100){
    $('message').textContent='Choose an ingredient and enter targets totaling more than 0% and at most 100%.';
    return;
  }
  const weights=blend(items,goal);
  const batchGrams=Number($('mass').value);
  const rx={schemaVersion:1,id:crypto.randomUUID(),name:$('titleInput').value,batchGrams,profileBasis:'illustrative mass percentages',ingredients:items.map((item,i)=>({...item,grams:weights[i]*batchGrams})).filter(i=>i.grams>0),profile:names.map((name,k)=>({name,target:goal[k],estimated:items.reduce((s,item,i)=>s+weights[i]*(item.profile[name]||0),0)}))};
  try {
    localStorage.setItem(key,JSON.stringify([rx,...JSON.parse(localStorage.getItem(key)||'[]')]));
    render();
    $('library').firstElementChild.open=true;
    $('message').textContent='Rx saved. Compare your targets with the estimated blend below.';
  } catch { $('message').textContent='Browser storage is unavailable. The recipe could not be saved.'; }
};
render();
