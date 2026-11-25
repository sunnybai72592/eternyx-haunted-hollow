# Run from a trusted local checkout of reviewed main, with Node.js 22+.
# Passwords are entered without echo and never passed as command-line arguments.
param([ValidateSet("manual","signed")][string]$Mode = "manual")
$ErrorActionPreference = "Stop"
$node = Get-Command node -ErrorAction Stop
if ([int]((& $node.Source --version).TrimStart('v').Split('.')[0]) -lt 22) { throw "Node.js 22 or later required" }
$root = Split-Path -Parent $PSScriptRoot
$script = if ($Mode -eq "signed") { "automation-staging-signed-acceptance.mjs" } else { "automation-staging-fresh-auth.mjs" }
$entry = Join-Path $PSScriptRoot $script
if (!(Test-Path -LiteralPath $entry)) { throw "Reviewed acceptance runner missing" }
Write-Host "Eternyx Staging ONLY: mhodwvypfbxafamkrgsk"
Write-Host "Creates one temporary workflow, removes it after testing, retains private run metadata. Scheduler and external providers stay off."
if ((Read-Host "Type APPROVE to authorize this one staging test") -cne "APPROVE") { throw "Not approved" }
$envValues = @{
  ETERNYX_AUTOMATION_STAGING_REF = "mhodwvypfbxafamkrgsk"
  ETERNYX_AUTOMATION_PRODUCTION_REF = "wcncuarekaofmfurbtbh"
  ETERNYX_AUTOMATION_TWO_OWNER_MODE = "ONE_TEMPORARY_WORKFLOW"
  ETERNYX_AUTOMATION_TWO_OWNER_REVIEW = "STAGING_TEST_ACCOUNTS_REVIEWED"
  ETERNYX_AUTOMATION_TWO_OWNER_WRITE_CONSENT = "I_AUTHORIZE_ONE_ISOLATED_STAGING_RUN"
  ETERNYX_AUTOMATION_SIGNED_CONSENT = if ($Mode -eq "signed") { "I_APPROVE_ONE_STAGING_SIGNED_WEBHOOK" } else { "NOT_APPROVED" }
}
function Read-PrivatePassword([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $secure.Dispose() }
}
$previous = @{}
try {
  $envValues.ETERNYX_AUTOMATION_STAGING_PUBLISHABLE_KEY = Read-Host "Staging publishable key (sb_publishable_...)"
  if (!$envValues.ETERNYX_AUTOMATION_STAGING_PUBLISHABLE_KEY.StartsWith("sb_publishable_")) { throw "Only a staging publishable key is accepted" }
  $envValues.ETERNYX_AUTOMATION_STAGING_OWNER_A_EMAIL = Read-Host "Dedicated staging owner A email"
  $envValues.ETERNYX_AUTOMATION_STAGING_OWNER_A_PASSWORD = Read-PrivatePassword "Dedicated staging owner A password"
  $envValues.ETERNYX_AUTOMATION_STAGING_OWNER_B_EMAIL = Read-Host "Dedicated staging owner B email"
  $envValues.ETERNYX_AUTOMATION_STAGING_OWNER_B_PASSWORD = Read-PrivatePassword "Dedicated staging owner B password"
  foreach ($name in $envValues.Keys) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
    [Environment]::SetEnvironmentVariable($name, $envValues[$name], "Process")
  }
  if ($Mode -eq "signed") { & $node.Source $entry } else { & $node.Source $entry "--execute" }
  if ($LASTEXITCODE -ne 0) { throw "Staging acceptance failed; inspect the sanitized failure code" }
} finally {
  foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], "Process") }
  $envValues.Clear()
  $previous.Clear()
}
