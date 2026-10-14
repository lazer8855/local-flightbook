param([string]$Action = 'inspect', [string]$Path = '', [int]$OwnerProcessId = 0, [string]$OwnerTag = '')
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NativeDialog {
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, string l);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
}
'@
$root = [System.Windows.Automation.AutomationElement]::RootElement
$children = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
foreach ($window in $children) {
    $owner = Get-Process -Id $window.Current.ProcessId -ErrorAction SilentlyContinue
    if ($OwnerProcessId -and $window.Current.ProcessId -ne $OwnerProcessId) { continue }
    if ($OwnerTag) {
        $commandLine = (Get-CimInstance Win32_Process -Filter "ProcessId=$($window.Current.ProcessId)").CommandLine
        if (-not $commandLine.Contains("--flightbook-validation=$OwnerTag")) { continue }
    }
    $testBrowserRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.cache\'))
    if (-not $OwnerTag -and -not $OwnerProcessId -and (-not $owner.Path -or -not $owner.Path.StartsWith($testBrowserRoot, [System.StringComparison]::OrdinalIgnoreCase))) { continue }
    "DIALOG: $($window.Current.Name)"
    $elements = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    if ($Action -in @('allow','deny')) {
        $wanted = if ($Action -eq 'allow') { @('Zulassen','Allow','Allow access','Save','Speichern') } else { @('Nicht zulassen',"Don't allow",'Block') }
        $permissionButton = $elements | Where-Object { $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $_.Current.Name -in $wanted } | Select-Object -First 1
        if ($permissionButton) { ([System.Windows.Automation.InvokePattern]$permissionButton.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)).Invoke(); "Permission: $Action" }
    } elseif ($Action -eq 'inspect') {
        foreach ($element in $elements) { "$($element.Current.ControlType.ProgrammaticName) | $($element.Current.AutomationId) | $($element.Current.Name)" }
    } elseif ($Action -eq 'cancel') {
        $cancel = $elements | Where-Object { $_.Current.AutomationId -eq '2' -and $_.Current.NativeWindowHandle -ne 0 } | Select-Object -First 1
        if ($cancel) { [NativeDialog]::SendMessage([IntPtr]$cancel.Current.NativeWindowHandle, 0xF5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null; 'Cancelled' }
    } elseif ($Action -eq 'choose') {
        $edit = $elements | Where-Object { $_.Current.AutomationId -in @('1148','1152') -and $_.Current.NativeWindowHandle -ne 0 } | Select-Object -First 1
        if (-not $edit) { $edit = $elements | Where-Object { $_.Current.AutomationId -eq '1001' -and $_.Current.NativeWindowHandle -ne 0 -and [System.Windows.Automation.TreeWalker]::RawViewWalker.GetParent($_).Current.AutomationId -eq 'FileNameControlHost' } | Select-Object -First 1 }
        if (-not $edit) { throw 'Filename edit control not found' }
        [NativeDialog]::SendMessage([IntPtr]$edit.Current.NativeWindowHandle, 0xC, [IntPtr]::Zero, $Path) | Out-Null
        $button = $elements | Where-Object { $_.Current.AutomationId -eq '1' -and $_.Current.NativeWindowHandle -ne 0 } | Select-Object -First 1
        [NativeDialog]::SendMessage([IntPtr]$button.Current.NativeWindowHandle, 0xF5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
        'Selected path'
    }
}
