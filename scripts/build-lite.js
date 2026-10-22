const {build,Platform,Arch}=require('electron-builder');
const pkg=require('../package.json');
const config={...pkg.build,extraResources:[],directories:{...pkg.build.directories,output:'dist-lite'},nsis:{...pkg.build.nsis,artifactName:'AliExpress-Product-Archiver-${version}-Lite-Setup.${ext}'}};
if(require.main===module)build({targets:Platform.WINDOWS.createTarget(['nsis'],Arch.x64),config}).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={config};
