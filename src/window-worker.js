function windowWorkerScript(processId){return `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$browserProcess = Get-Process -Id ${processId} -ErrorAction Stop
if ($browserProcess.ProcessName -ne 'chrome') { throw 'The selected process is not Chromium.' }
$started = $browserProcess.StartTime.ToUniversalTime().Ticks
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
[Console]::Out.WriteLine('{"ready":true}')
[Console]::Out.Flush()
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $request = $null
  try {
    $request = ConvertFrom-Json -InputObject $line
    if ($request.action -notin @('hide','show','inspect')) { throw 'Invalid window action.' }
    $current = Get-Process -Id ${processId} -ErrorAction Stop
    if ($current.ProcessName -ne 'chrome' -or $current.StartTime.ToUniversalTime().Ticks -ne $started) { throw 'Chromium process identity changed.' }
    $windows = @()
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
      $windows = @([ArchiverBrowserWindows]::Find(${processId}))
      if ($windows.Count -gt 0) { break }
      Start-Sleep -Milliseconds 100
    }
    if ($windows.Count -eq 0) { throw 'Chromium window is not ready.' }
    foreach ($handle in $windows) {
      if ($request.action -eq 'hide') { [void][ArchiverBrowserWindows]::ShowWindow($handle, 0) }
      if ($request.action -eq 'show') { [void][ArchiverBrowserWindows]::ShowWindow($handle, 9) }
    }
    $visible = @($windows | Where-Object { [ArchiverBrowserWindows]::IsWindowVisible($_) }).Count
    $minimized = @($windows | Where-Object { [ArchiverBrowserWindows]::IsIconic($_) }).Count
    $response = @{ id = $request.id; state = @{ windows = $windows.Count; visible = $visible; minimized = $minimized; hidden = ($visible -eq 0) } }
  } catch { $response = @{ id = $request.id; error = $_.Exception.Message } }
  [Console]::Out.WriteLine(($response | ConvertTo-Json -Depth 3 -Compress))
  [Console]::Out.Flush()
}
`;}
module.exports={windowWorkerScript};
