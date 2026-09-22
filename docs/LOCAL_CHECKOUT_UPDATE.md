# Update the Windows checkout safely

In VS Code, open `C:\RETRADE-UK\RETRADE`, then use a PowerShell terminal. A normal Git pull applies tracked renames/deletions; no destructive clean is needed.

The checked-in `scripts/update-local.ps1` performs this sequence, but an old checkout will not have that script until updated. For the first update, paste:

```powershell
Set-Location 'C:\RETRADE-UK\RETRADE'
git remote -v
git status --short
git branch "backup/before-cleanup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
git stash push --include-untracked -m 'Before RETRADE folder cleanup'
git fetch origin
git switch main
git pull --ff-only origin main
git status --short
```

Check that `origin` is `RETRADE-UK/RETRADE` before continuing past the first two checks. Stop on an error; do not substitute `reset --hard`. The backup branch preserves existing commits and the stash preserves edits/untracked files. If there are no edits, Git will say there was nothing to stash. Ignored business backups/exports remain untouched.

If main has local commits and fast-forward fails, preserve that state and ask for a comparison against the backup branch. Review `git stash list` and `git stash show --stat` before restoring edits; don't automatically pop them into moved files. GitHub changes do not update your PC until you run this process.

Optional `git clean -nd` only previews leftover untracked files. Do not run a destructive clean on a folder that holds business backups.

For future updates after the script exists:

```powershell
& .\scripts\update-local.ps1
```

Then, if Node/Python are installed, run `npm ci`, `npm run check` and `npm run build`. Browser checks additionally require `npx playwright install chromium` and `npm test`. Keep local exports outside the application checkout where possible.
