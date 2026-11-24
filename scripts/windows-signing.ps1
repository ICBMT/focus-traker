param([ValidateSet('Prepare', 'Verify', 'Cleanup')][string]$Mode)
$ErrorActionPreference = 'Stop'
$thumbprint = $env:WINDOWS_CERTIFICATE_THUMBPRINT
if ($thumbprint -notmatch '^[A-Fa-f0-9]{40}$') { throw 'A full Authenticode certificate thumbprint is required.' }
$certificatePath = Join-Path $env:RUNNER_TEMP 'focus-signing.pfx'
if ($Mode -eq 'Prepare') {
  if ([string]::IsNullOrWhiteSpace($env:WINDOWS_CERTIFICATE_PFX_BASE64) -or [string]::IsNullOrWhiteSpace($env:WINDOWS_CERTIFICATE_PASSWORD)) { throw 'Trusted Windows signing credentials are missing.' }
  [IO.File]::WriteAllBytes($certificatePath, [Convert]::FromBase64String($env:WINDOWS_CERTIFICATE_PFX_BASE64))
  try {
    $password = ConvertTo-SecureString $env:WINDOWS_CERTIFICATE_PASSWORD -AsPlainText -Force
    $imported = Import-PfxCertificate -FilePath $certificatePath -CertStoreLocation Cert:\CurrentUser\My -Password $password -Exportable:$false
    $certificate = $imported | Where-Object { $_.Thumbprint -eq $thumbprint }
    if ($null -eq $certificate -or -not $certificate.HasPrivateKey) { throw 'The imported signing certificate does not match the configured identity/private key.' }
    if ($certificate.NotAfter.ToUniversalTime() -le [DateTime]::UtcNow) { throw 'The signing certificate has expired.' }
    $chain = [Security.Cryptography.X509Certificates.X509Chain]::new()
    if (-not $chain.Build($certificate)) { throw 'The signing certificate chain is not trusted on this runner.' }
    $patch = @{ bundle = @{ windows = @{ certificateThumbprint = $thumbprint; digestAlgorithm = 'sha256'; timestampUrl = 'http://timestamp.digicert.com'; tsp = $true } } }
    $patch | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8NoBOM src-tauri/release-signing.generated.json
  } finally {
    Remove-Item -LiteralPath $certificatePath -Force -ErrorAction SilentlyContinue
  }
} elseif ($Mode -eq 'Verify') {
  $files = @((Get-Item target/release/focus-desktop.exe)) + @(Get-ChildItem target/release/bundle/nsis/*.exe)
  if ($files.Count -lt 2) { throw 'The application and NSIS installer must both be present.' }
  foreach ($file in $files) {
    $signature = Get-AuthenticodeSignature -FilePath $file.FullName
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -ne $thumbprint -or $null -eq $signature.TimeStamperCertificate) { throw "Authenticode identity/timestamp validation failed for $($file.Name)." }
  }
} else {
  Remove-Item -LiteralPath $certificatePath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath src-tauri/release-signing.generated.json -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath "Cert:\CurrentUser\My\$thumbprint" -Force -ErrorAction SilentlyContinue
}
