# Run in a PowerShell terminal. Preserves commits, tracked edits and untracked
# files before a fast-forward update. Ignored local business files stay untouched.
param([string]$RepoPath = 'C:\RETRADE-UK\RETRADE')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $RepoPath
function Invoke-Git {
    & git @args
    if ($LASTEXITCODE -ne 0) { throw "Git command stopped. Your backup branch/stash remain available. No reset or clean was performed." }
}
$remote = Invoke-Git remote get-url origin
if ($remote -notmatch 'github\.com[:/]RETRADE-UK/RETRADE(\.git)?$') {
    throw 'This script is for the RETRADE live checkout. Check the origin remote before continuing.'
}
$backupBranch = 'backup/before-cleanup-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
Invoke-Git branch $backupBranch
$pending = Invoke-Git status --porcelain
if ($pending) {
    Invoke-Git stash push --include-untracked -m $backupBranch
    Write-Host 'Local edits were preserved in git stash. Review them before applying them to the reorganised files.'
}
Invoke-Git fetch origin
Invoke-Git switch main
Invoke-Git pull --ff-only origin main
Invoke-Git status --short
Write-Host "Updated. Previous commits are preserved on $backupBranch. No local backups or exports were deleted."
