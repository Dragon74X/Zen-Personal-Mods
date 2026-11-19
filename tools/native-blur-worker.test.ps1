# Run with Windows PowerShell 5.1 or pwsh. No desktop capture or user data.
$ErrorActionPreference = 'Stop'
$source = Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot 'native-blur-probe.js')
$worker = [regex]::Match($source, 'const capturePS = String.raw`([\s\S]*?)`;').Groups[1].Value
if (!$worker) { throw 'Embedded capture worker missing' }
$tokens = $null; $parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseInput($worker, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }

# Execute the shipped scale/ROI/occlusion code. Only Win32 calls are substituted;
# this catches PowerShell expression semantics that the JS mock cannot exercise.
$start = $ast.Find({ param($n)
    $n -is [System.Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$sx'
}, $true).Extent.StartOffset
$roiLoop = $ast.Find({ param($n)
    $n -is [System.Management.Automation.Language.ForEachStatementAst] -and $n.Variable.VariablePath.UserPath -eq 'roi'
}, $true)
$pixels = $roiLoop.Body.Find({ param($n)
    $n -is [System.Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$bitmap'
}, $true).Extent.StartOffset
if (!$start -or !$roiLoop -or !$pixels) { throw 'Capture geometry boundaries missing' }
$geometry = [scriptblock]::Create(
    $worker.Substring($start, $roiLoop.Extent.StartOffset - $start) +
    $worker.Substring($roiLoop.Body.Extent.StartOffset + 1, $pixels - $roiLoop.Body.Extent.StartOffset - 1))
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Text;
public static class BlurWindow {
    public struct Point {
        public int X, Y;
        public Point(int x, int y) { X = x; Y = y; }
    }
    public static List<Point> Seen = new List<Point>();
    public static int OccludedAt = -1;
    public static IntPtr WindowFromPoint(Point point) {
        Seen.Add(point);
        return new IntPtr(Seen.Count - 1 == OccludedAt ? 99 : 42);
    }
    public static IntPtr Foreground = new IntPtr(42);
    public static uint Owner = 123;
    public static int MissingTitle = 0;
    public static IntPtr GetForegroundWindow() { return Foreground; }
    public static uint GetWindowThreadProcessId(IntPtr window, out uint owner) { owner = Owner; return 1; }
    public static int GetWindowText(IntPtr window, StringBuilder text, int size) {
        text.Append(MissingTitle-- > 0 ? "loading" : "ZZBLUR-fixture"); return text.Length;
    }
    public static IntPtr GetAncestor(IntPtr window, uint flags) { return flags == 3 && window == new IntPtr(43) ? new IntPtr(42) : window; }
}
'@

$q = [pscustomobject]@{ width = 1920; height = 1080 }
$handle = [IntPtr]42
$cases = @(
    @{ Name='left'; Scale=1; Origin=@(100,200); Crop=@(24,60,200,120); Expected='124,260;323,260;124,379;323,379;224,320' }
    @{ Name='negative-origin-fractional'; Scale=1.25; Origin=@(-1600,-100); Crop=@(17.5,27.5,101,81); Expected='-1578,-66;-1453,-66;-1578,34;-1453,34;-1515,-16' }
    @{ Name='right'; Scale=1; Origin=@(0,0); Crop=@(1700,100,180,180); Expected='1700,100;1879,100;1700,279;1879,279;1790,190' }
    @{ Name='double-dpi-rounding'; Scale=2; Origin=@(500,100); Crop=@(30.25,44.75,25.5,41.5); Expected='560,190;610,190;560,272;610,272;586,232' }
    @{ Name='minimum-crop'; Scale=1; Origin=@(-200,50); Crop=@(0,0,8,8); Expected='-200,50;-193,50;-200,57;-193,57;-196,54' }
)
foreach ($case in $cases) {
    $client = [pscustomobject]@{ L=0; T=0; R=1920*$case.Scale; B=1080*$case.Scale }
    $origin = [pscustomobject]@{ X=$case.Origin[0]; Y=$case.Origin[1] }
    $roi = [pscustomobject]@{ x=$case.Crop[0]; y=$case.Crop[1]; width=$case.Crop[2]; height=$case.Crop[3] }
    [BlurWindow]::Seen.Clear()
    . $geometry
    $actual = (@([BlurWindow]::Seen | ForEach-Object { "$($_.X),$($_.Y)" }) -join ';')
    if ($actual -cne $case.Expected) { throw "$($case.Name): expected $($case.Expected); got $actual" }
}

function Expect-Rejection([string]$Expected) {
    [BlurWindow]::Seen.Clear()
    try { . $geometry } catch {
        if ($_.Exception.Message -notlike "*$Expected*") { throw }
        return
    }
    throw "Expected capture refusal: $Expected"
}
# Every sampled corner and the center must still reject an occluding window.
for ($i=0; $i -lt 5; $i++) {
    [BlurWindow]::OccludedAt = $i
    Expect-Rejection 'occluded'
    if ([BlurWindow]::Seen.Count -ne $i+1) { throw 'Occlusion check continued after refusal' }
}
[BlurWindow]::OccludedAt = -1
$roi.width = 7
Expect-Rejection 'Invalid crop size'
$roi.width = 1601
Expect-Rejection 'Invalid crop size'
$roi.width = 8
$client.B = 1000
Expect-Rejection 'scale mismatch'
$client.R = 9600; $client.B = 5400
Expect-Rejection 'scale mismatch'

# Exercise the shipped per-request error journal, not a reimplementation.
$captureCatch = $ast.Find({ param($n)
    $n -is [System.Management.Automation.Language.CatchClauseAst] -and $n.Body.Extent.Text.Contains('$answer.error=')
}, $true)
if (!$captureCatch) { throw 'Per-request error journal missing' }
$answer = @{}; $stage = 'synthetic-capture-failure'
. ([scriptblock]::Create('try { throw "synthetic failure" } catch ' + $captureCatch.Body.Extent.Text))
if ($answer.error -ne 'synthetic failure' -or $answer.failure.stage -ne $stage -or
    !$answer.failure.id -or $answer.failure.line -lt 1) { throw 'Worker failure lost its stage, identifier or line' }
Write-Output "PowerShell $($PSVersionTable.PSVersion): 5 coordinate cases, 9 refusal cases and error-journal check passed; Win32 substituted, no pixel claim."

# Execute the shipped identity gate. Missing titles must omit captures, then
# recover only after process, marker and previously authenticated HWND agree.
$identityStart = $ast.Find({ param($n)
    $n -is [System.Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$stage' -and $n.Right.Extent.Text -eq "'verify-window'"
}, $true).Extent.StartOffset
$identityEnd = $ast.Find({ param($n)
    $n -is [System.Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$client'
}, $true).Extent.StartOffset
$identityGate = [scriptblock]::Create($worker.Substring($identityStart,$identityEnd-$identityStart))
$Directory = Join-Path ([IO.Path]::GetTempPath()) ('zen-identity-fixture-'+[Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $Directory
try {
    $q = [pscustomobject]@{pid=123;marker='ZZBLUR-fixture';ownedPopup=$false}
    $answer=@{}; $fixtureHandle=[IntPtr]::Zero; $frame=2
    [BlurWindow]::MissingTitle=3
    . $identityGate
    if ($fixtureHandle -ne [IntPtr]42 -or $answer.gaps.Count -ne 1 -or $answer.gaps[0].waitMs -lt 50 -or $answer.gaps[0].identity.titleMatches) { throw 'Transient title gap not recorded or recovered safely' }
    $q.ownedPopup=$true; [BlurWindow]::Foreground=[IntPtr]43; $answer=@{}
    . $identityGate
    if ($handle -ne [IntPtr]42 -or $answer.gaps) { throw 'Owned native popup did not retain the verified browser' }
    $q.ownedPopup=$false; [BlurWindow]::Foreground=[IntPtr]42
    foreach ($failure in @('title','process','window')) {
        $answer=@{}
        [BlurWindow]::MissingTitle=if($failure -eq 'title'){100000}else{0}
        [BlurWindow]::Owner=if($failure -eq 'process'){999}else{123}
        [BlurWindow]::Foreground=if($failure -eq 'window'){[IntPtr]99}else{[IntPtr]42}
        try { . $identityGate; throw 'Expected identity refusal' } catch {
            if ($_.Exception.Message -notmatch 'capture refused') { throw }
            $key=@{title='titleMatches';process='processMatches';window='windowMatches'}[$failure]
            if ($answer.identity[$key]) { throw 'Identity refusal lost the specific failing condition' }
        }
    }
    [IO.File]::WriteAllText((Join-Path $Directory 'stop'),'stop')
    try { . $identityGate; throw 'Expected cancellation' } catch { if ($_.Exception.Message -ne 'Capture stopped') { throw } }
} finally { Remove-Item -LiteralPath $Directory -Recurse -Force }
Write-Output 'Identity gate: transient title recovery, owned popup, three distinct refusals and cancellation passed; no window titles or process identifiers recorded.'
