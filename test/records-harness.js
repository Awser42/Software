const {app}=require('electron');
const path=require('node:path');
app.setAppPath(path.resolve(__dirname,'..'));
app.setPath('userData',process.env.E2E_DATA);
app.on('ready',()=>app.setPath('userData',process.env.E2E_DATA));
require('../src/main');
