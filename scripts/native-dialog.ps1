param([string]$Action = 'inspect', [string]$Path = '', [int]$OwnerProcessId = 0, [string]$OwnerTag = '')
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NativeDialog {
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, string l);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
}
'@
$root = [System.Windows.Automation.AutomationElement]::RootElement
$children = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
foreach ($window in $children) {
    try { $windowInfo = $window.Current } catch { continue }
    if (-not $windowInfo.ProcessId) { continue }
    $owner = Get-Process -Id $windowInfo.ProcessId -ErrorAction SilentlyContinue
    if ($OwnerProcessId -and $window.Current.ProcessId -ne $OwnerProcessId) { continue }
    if ($OwnerTag) {
        $commandLine = (Get-CimInstance Win32_Process -Filter "ProcessId=$($windowInfo.ProcessId)" -ErrorAction SilentlyContinue).CommandLine
        if (-not $commandLine -or -not $commandLine.Contains("--flightbook-validation=$OwnerTag")) { continue }
    }
    $testBrowserRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.cache\'))
    if (-not $OwnerTag -and -not $OwnerProcessId -and (-not $owner.Path -or -not $owner.Path.StartsWith($testBrowserRoot, [System.StringComparison]::OrdinalIgnoreCase))) { continue }
    "DIALOG: $($window.Current.Name)"
    $elements = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    if ($Action -in @('allow','deny','overwrite')) {
        $wanted = if ($Action -eq 'allow') { @('Zulassen','Allow','Allow access','Save','Speichern') } elseif ($Action -eq 'overwrite') { @('Ja','Yes','Ersetzen','Replace') } else { @('Nicht zulassen',"Don't allow",'Block') }
        $permissionButton = $elements | Where-Object { ($_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -or $Action -eq 'overwrite') -and $_.Current.Name -in $wanted } | Select-Object -First 1
        if ($permissionButton) {
            $invokePattern = $null
            if ($permissionButton.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invokePattern)) { $invokePattern.Invoke() }
            elseif ($Action -eq 'overwrite') {
                # Windows' replacement confirmation can expose Yes as a Pane
                # without an Invoke pattern. Click only this tagged test window.
                $rect = $permissionButton.Current.BoundingRectangle
                if ($rect.Width -le 0 -or $rect.Height -le 0) { throw 'Overwrite control has no visible bounds' }
                [NativeDialog]::SetForegroundWindow([IntPtr]$windowInfo.NativeWindowHandle) | Out-Null
                [NativeDialog]::SetCursorPos([int]($rect.Left + $rect.Width / 2), [int]($rect.Top + $rect.Height / 2)) | Out-Null
                [NativeDialog]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
                [NativeDialog]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
            }
            else { throw "Native $Action control has no supported action pattern" }
            "Permission: $Action"
        }
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
        [NativeDialog]::PostMessage([IntPtr]$button.Current.NativeWindowHandle, 0xF5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
        'Selected path'
    }
}
