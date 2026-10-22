const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execute=promisify(execFile);

async function chromiumWindowVisibility(processId,action) {
  if(!Number.isSafeInteger(processId)||processId<=0||processId===process.pid)throw new Error('Invalid Chromium process identity.');
  if(!['hide','show','inspect'].includes(action))throw new Error('Invalid Chromium window action.');
  const script=`
$ErrorActionPreference = 'Stop'
$browserProcess = Get-Process -Id ${processId} -ErrorAction Stop
if ($browserProcess.ProcessName -ne 'chrome') { throw 'The selected process is not Chromium.' }
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class ArchiverBrowserWindows {
  public delegate bool Callback(IntPtr handle, IntPtr state);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback, IntPtr state);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr handle, int command);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr handle);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr handle);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr handle, StringBuilder name, int length);
  public static IntPtr[] Find(uint processId) {
    var windows = new List<IntPtr>();
    EnumWindows((handle, state) => {
      uint owner; GetWindowThreadProcessId(handle, out owner);
      var name = new StringBuilder(256); GetClassName(handle, name, name.Capacity);
      if (owner == processId && name.ToString() == "Chrome_WidgetWin_1") windows.Add(handle);
      return true;
    }, IntPtr.Zero);
    return windows.ToArray();
  }
}
'@
$windows = @()
for ($attempt = 0; $attempt -lt 50; $attempt++) {
  $windows = @([ArchiverBrowserWindows]::Find(${processId}))
  if ($windows.Count -gt 0) { break }
  Start-Sleep -Milliseconds 100
}
if ($windows.Count -eq 0) { throw 'Chromium window is not ready.' }
foreach ($handle in $windows) {
  ${action==='hide'?'[void][ArchiverBrowserWindows]::ShowWindow($handle, 0)':action==='show'?'[void][ArchiverBrowserWindows]::ShowWindow($handle, 9)':''}
}
$visible = @($windows | Where-Object { [ArchiverBrowserWindows]::IsWindowVisible($_) }).Count
$minimized = @($windows | Where-Object { [ArchiverBrowserWindows]::IsIconic($_) }).Count
@{ windows = $windows.Count; visible = $visible; minimized = $minimized; hidden = ($visible -eq 0) } | ConvertTo-Json -Compress
`;
  const {stdout}=await execute('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:15000,maxBuffer:64*1024});
  const state=JSON.parse(stdout.trim());
  if(!Number.isInteger(state.windows)||state.windows<1||typeof state.hidden!=='boolean')throw new Error('Chromium window state could not be verified.');
  if(action==='hide'&&!state.hidden)throw new Error('Chromium is still visible.');
  if(action==='show'&&state.visible<1)throw new Error('Chromium could not be restored.');
  return state;
}
module.exports={chromiumWindowVisibility};
