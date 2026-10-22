const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
(async()=>{
  const cli=process.env.npm_execpath;if(!cli)throw new Error('Run this check through npm run audit:dependencies.');
  const result=await new Promise(resolve=>execFile(process.execPath,[cli,'audit','--json'],{encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024},(error,stdout,stderr)=>resolve({error,stdout,stderr})));
  let report;try{report=JSON.parse(result.stdout);}catch{throw new Error('The dependency audit did not return a valid report. '+result.stderr);}
  await fs.mkdir(path.resolve('test-results'),{recursive:true});await fs.writeFile(path.resolve('test-results/dependency-audit.json'),JSON.stringify(report,null,2)+'\n');
  if(result.error||!report.metadata?.vulnerabilities||report.metadata.vulnerabilities.total!==0)throw new Error('Dependency audit failed. Review test-results/dependency-audit.json before releasing.');
  console.log('PASS: runtime and build dependency audit reports zero known vulnerabilities.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
