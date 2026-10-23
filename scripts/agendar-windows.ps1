# Agenda o pipeline no Agendador de Tarefas do Windows.
# Uso (PowerShell, dentro da pasta do projeto):
#   powershell -ExecutionPolicy Bypass -File scripts\agendar-windows.ps1 -Hora "09:00"                 (pesquisa -> fila/1-revisar)
#   powershell -ExecutionPolicy Bypass -File scripts\agendar-windows.ps1 -Hora "09:00" -Modo pipeline  (100% automatico)
#   powershell -ExecutionPolicy Bypass -File scripts\agendar-windows.ps1 -Remover

param(
  [string]$Hora = "09:00",
  [ValidateSet("pesquisar", "produzir", "pipeline")]
  [string]$Modo = "pesquisar",
  [string]$Nome = "MTG Shorts Pipeline",
  [switch]$Remover
)

if ($Remover) {
  Unregister-ScheduledTask -TaskName $Nome -Confirm:$false
  Write-Host "Tarefa '$Nome' removida."
  exit 0
}

$projeto = Split-Path -Parent $PSScriptRoot
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$log = Join-Path $projeto "logs\agendador.log"

$acao = New-ScheduledTaskAction `
  -Execute "cmd.exe" `
  -Argument "/c cd /d `"$projeto`" && `"$npm`" run $Modo >> `"$log`" 2>&1" `
  -WorkingDirectory $projeto

$gatilho = New-ScheduledTaskTrigger -Daily -At $Hora
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Hours 3)

Register-ScheduledTask -TaskName $Nome -Action $acao -Trigger $gatilho -Settings $config -Force | Out-Null
Write-Host "Agendado: '$Nome' (npm run $Modo) todo dia às $Hora. Log em $log"
