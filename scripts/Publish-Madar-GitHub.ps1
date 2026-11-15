#requires -Version 5.1
$ErrorActionPreference = "Stop"

$Owner = "Amin-Sheikhy"
$Repo = "Madar"
$FullName = "$Owner/$Repo"
$RemoteUrl = "https://github.com/$FullName.git"
$Description = "Madar: Persian-first, local-first Windows learning and research workspace with mastery progression, scientific knowledge organization, skill mapping, and local PDF workflows."
$Topics = @("madar", "education", "learning-system", "python", "persian", "open-source", "local-first", "windows", "knowledge-graph", "rtl")
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Write-Host ""
Write-Host "Madar public GitHub publisher" -ForegroundColor Cyan
Write-Host "Target: https://github.com/$FullName"
Write-Host "Source folder: $RepoRoot"
Write-Host ""

# Confirm the required project license is actually present.
$LicensePath = Join-Path $RepoRoot "LICENSE"
if (-not (Test-Path -LiteralPath $LicensePath)) {
    throw "LICENSE file missing. Refusing to publish."
}
$LicenseText = Get-Content -LiteralPath $LicensePath -Raw -Encoding UTF8
if ($LicenseText -notmatch "MIT License" -or $LicenseText -notmatch "Amin Sheikhy") {
    throw "The LICENSE file does not match the approved MIT license/copyright. Refusing to publish."
}

# Conservative pre-publication scan. Do not upload private runtime/build artifacts.
$ForbiddenExtensions = @(".exe", ".dll", ".sqlite", ".sqlite3", ".db", ".pdf", ".dpapi", ".log", ".pyc", ".pyo", ".obj", ".o")
$ForbiddenNames = @("settings.json", "chatgpt-host.json", ".env")
$Files = Get-ChildItem -LiteralPath $RepoRoot -Recurse -File -Force | Where-Object { $_.FullName -notmatch '[\\/]\.git[\\/]' }
$BadFiles = @()
foreach ($File in $Files) {
    if ($ForbiddenExtensions -contains $File.Extension.ToLowerInvariant() -or
        $ForbiddenNames -contains $File.Name -or
        $File.Name.StartsWith(".env.", [System.StringComparison]::OrdinalIgnoreCase)) {
        $BadFiles += $File.FullName
    }
}
if ($BadFiles.Count -gt 0) {
    Write-Host "Potentially private/runtime files detected:" -ForegroundColor Red
    $BadFiles | ForEach-Object { Write-Host " - $_" }
    throw "Safety scan failed. Remove these files before publishing."
}

# Check text files for the known personal D-drive folder path.
$TextExtensions = @(".md", ".txt", ".py", ".js", ".html", ".css", ".json", ".yml", ".yaml", ".ps1", ".bat", ".sh")
$PersonalPathHits = @()
foreach ($File in $Files) {
    if ($TextExtensions -contains $File.Extension.ToLowerInvariant()) {
        try {
            $Content = Get-Content -LiteralPath $File.FullName -Raw -Encoding UTF8
            $SensitivePathPrefix = "D:" + [char]92 + "AWHQ CENTER"
            if ($Content.Contains($SensitivePathPrefix)) {
                $PersonalPathHits += $File.FullName
            }
        } catch {
            # Skip files that cannot be read as UTF-8 text; binary extension filtering above still applies.
        }
    }
}
if ($PersonalPathHits.Count -gt 0) {
    Write-Host "Personal path string found in:" -ForegroundColor Red
    $PersonalPathHits | ForEach-Object { Write-Host " - $_" }
    throw "Personal path scan failed. Normalize the paths before publishing."
}

# Required local tools. If missing, offer installation through the official winget package IDs.
$MissingTools = @()
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    $MissingTools += @{ Label = "Git for Windows"; Id = "Git.Git" }
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    $MissingTools += @{ Label = "GitHub CLI"; Id = "GitHub.cli" }
}
if ($MissingTools.Count -gt 0) {
    $Winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $Winget) {
        throw "Required tools are missing and winget is unavailable. Install Git for Windows (https://git-scm.com/download/win) and GitHub CLI (https://cli.github.com/), then double-click this publisher again."
    }
    Write-Host "Missing tools:" -ForegroundColor Yellow
    $MissingTools | ForEach-Object { Write-Host " - $($_.Label)" }
    $InstallConsent = Read-Host "Install the missing tools with winget? Type INSTALL-TOOLS"
    if ($InstallConsent -cne "INSTALL-TOOLS") {
        throw "Tool installation canceled. Install Git and GitHub CLI, then rerun the publisher."
    }
    foreach ($Tool in $MissingTools) {
        $ErrorActionPreference = "Continue"
        & winget install --exact --id $Tool.Id --source winget --accept-package-agreements --accept-source-agreements
        $WingetExit = $LASTEXITCODE
        $ErrorActionPreference = "Stop"
        if ($WingetExit -ne 0) {
            throw "winget installation failed for $($Tool.Label)."
        }
    }
    $MachinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$MachinePath;$UserPath"
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git is still unavailable after installation. Close and reopen PowerShell, then rerun the publisher."
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI is still unavailable after installation. Close and reopen PowerShell, then rerun the publisher."
}

# From here on, native commands (git/gh) legitimately write to stderr (e.g. git progress or 404 probe).
# Keep ErrorActionPreference as Continue and explicitly check $LASTEXITCODE after each command.
$ErrorActionPreference = "Continue"

# Authenticate with GitHub CLI through GitHub's own browser flow if needed.
& gh auth status --hostname github.com *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Starting GitHub browser sign-in. Complete the official GitHub login flow." -ForegroundColor Yellow
    & gh auth login --hostname github.com --git-protocol https --web
    if ($LASTEXITCODE -ne 0) {
        throw "GitHub sign-in did not complete."
    }
}
& gh auth status --hostname github.com
if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI authentication check failed."
}

# Do not silently overwrite an existing repository or push to a different remote.
& gh api "repos/$FullName" --jq ".full_name" *> $null
if ($LASTEXITCODE -eq 0) {
    throw "Repository $FullName already exists. Refusing to overwrite it; inspect it manually first."
}

Set-Location $RepoRoot
$GitRootCheck = (& git rev-parse --is-inside-work-tree 2>$null)
if ($LASTEXITCODE -eq 0 -and $GitRootCheck -eq "true") {
    $Origin = (& git remote get-url origin 2>$null)
    if ($LASTEXITCODE -eq 0 -and $Origin -and $Origin -ne $RemoteUrl) {
        throw "This folder already has a different origin remote ($Origin). Refusing to replace it."
    }
} else {
    & git init --initial-branch=main
    if ($LASTEXITCODE -ne 0) {
        throw "git init failed."
    }
}

# Use the linked GitHub account and its noreply address as the local commit author.
$Login = (& gh api user --jq ".login").Trim()
$UserId = (& gh api user --jq ".id").Trim()
if (-not $Login -or -not $UserId -or $Login -ne $Owner) {
    throw "Authenticated GitHub user is '$Login', but this publication target is '$Owner'. Refusing to publish under a different account."
}
& git config --local user.name "Amin Sheikhy"
& git config --local user.email "$UserId+$Login@users.noreply.github.com"

# Stage the reviewed source tree and make an initial commit if needed.
& git add --all
if ($LASTEXITCODE -ne 0) {
    throw "git add failed."
}
& git diff --cached --quiet
$StagedDiffExit = $LASTEXITCODE
if ($StagedDiffExit -eq 1) {
    & git commit -m "Initial public source release: Madar v4.53 (MIT License)"
    if ($LASTEXITCODE -ne 0) {
        throw "git commit failed."
    }
} elseif ($StagedDiffExit -gt 1) {
    throw "Could not inspect staged changes."
} else {
    $HeadCheck = (& git rev-parse --verify HEAD 2>$null)
    if ($LASTEXITCODE -ne 0) {
        throw "No staged changes and no existing commit. Refusing to publish an empty repository."
    }
}

# Public release is the requested goal; explicit typing prevents accidental publication.
Write-Host ""
Write-Host "This action will create a PUBLIC repository and push the reviewed source and MIT license." -ForegroundColor Yellow
$Approval = (Read-Host "Type PUBLISH-MADAR to continue").Trim()
if ($Approval -cne "PUBLISH-MADAR") {
    throw "Publication canceled by user."
}

& gh repo create $FullName --public --description $Description
if ($LASTEXITCODE -ne 0) {
    throw "GitHub repository creation failed. No push was attempted."
}

$Origin = (& git remote get-url origin 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $Origin) {
    & git remote add origin $RemoteUrl
    if ($LASTEXITCODE -ne 0) {
        throw "Could not add origin remote."
    }
}
& git branch -M main
& git push --set-upstream origin main
if ($LASTEXITCODE -ne 0) {
    throw "Repository was created, but pushing the source failed. The local git folder remains available for retry."
}

# Configure repository topics and enable issues.
$TopicArgs = @("repo", "edit", $FullName, "--enable-issues")
foreach ($T in $Topics) {
    $TopicArgs += "--add-topic"
    $TopicArgs += $T
}
& gh @TopicArgs *> $null

# Best-effort enable vulnerability alerts on the public repository.
& gh api --method PUT "repos/$FullName/vulnerability-alerts" *> $null

# Verify the repository's public visibility, default branch, and HEAD commit.
$Verify = & gh repo view $FullName --json url,visibility,defaultBranchRef --jq "{url: .url, visibility: .visibility, defaultBranch: .defaultBranchRef.name}"
if ($LASTEXITCODE -ne 0) {
    throw "Push completed, but public repository verification failed. Check the GitHub repository page."
}
$CommitHash = (& git rev-parse HEAD).Trim()
Write-Host ""
Write-Host "Publication completed and verified:" -ForegroundColor Green
Write-Host $Verify
Write-Host "Commit Hash: $CommitHash" -ForegroundColor Cyan
Write-Host "Next: open the Codex for Open Source application and submit the accurate project details."
