const fs=require('node:fs/promises');
const path=require('node:path');
const nodes=require('lucide-static/icon-nodes.json');
const names=['activity','archive','check','chevron-right','circle-alert','circle-check','clipboard-paste','clock-3','download','eraser','eye-off','folder','folder-down','folder-open','globe','image','layers','layout-grid','list','list-plus','list-x','loader-circle','monitor','package-check','panel-bottom-close','pause','play','plus','refresh-cw','rotate-ccw','rotate-cw','search','settings-2','shield-alert','shield-check','sliders-horizontal','trash-2','x'];
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
(async()=>{
  const license=await fs.readFile(path.join(path.dirname(require.resolve('lucide-static/package.json')),'LICENSE'),'utf8');
  const symbols=names.map(name=>{
    const data=nodes[name==='trash-2'?'trash':name];
    if(!data)throw new Error('Unknown Lucide icon: '+name);
    return `<symbol id="${name}" viewBox="0 0 24 24">${data.map(([tag,attributes])=>`<${tag} ${Object.entries(attributes).map(([key,value])=>`${key}="${escape(value)}"`).join(' ')}/>`).join('')}</symbol>`;
  });
  await fs.writeFile(path.resolve(__dirname,'../src/icons.svg'),`<svg xmlns="http://www.w3.org/2000/svg"><metadata><![CDATA[${license}]]></metadata>${symbols.join('')}</svg>\n`);
  console.log(`Bundled ${names.length} Lucide icons without the full icon library.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
