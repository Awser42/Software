const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createRequire}=require('node:module');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
test('the build-only proxy override retains Electron downloader proxy bootstrapping and real HTTP forwarding',async()=>{
  const builderRequire=createRequire(require.resolve('app-builder-lib/package.json')),entry=builderRequire.resolve('@electron/get');
  const downloaderRequire=createRequire(entry),agent=downloaderRequire('global-agent/package.json');assert.equal(agent.version,'4.1.3');
  const requests=[],server=http.createServer((request,response)=>{requests.push(request.url);response.writeHead(200,{'Content-Type':'text/plain'});response.end('proxy forwarding works');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const source=`require(${JSON.stringify(entry)}).initializeProxy();require('node:http').get('http://fixture.invalid/runtime-check',response=>{let text='';response.on('data',chunk=>text+=chunk);response.on('end',()=>process.stdout.write(text));}).on('error',error=>{console.error(error);process.exitCode=1;});`;
    const {stdout}=await promisify(execFile)(process.execPath,['-e',source],{timeout:10000,env:{...process.env,GLOBAL_AGENT_ENVIRONMENT_VARIABLE_NAMESPACE:'ARCHIVER_TEST_',ARCHIVER_TEST_HTTP_PROXY:`http://127.0.0.1:${server.address().port}`,ARCHIVER_TEST_NO_PROXY:''}});
    assert.equal(stdout,'proxy forwarding works');assert.deepEqual(requests,['http://fixture.invalid/runtime-check']);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
