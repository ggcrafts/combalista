# Narração gratuita com as vozes instaladas no Windows (System.Speech / SAPI).
# Chamado por pipeline/tts.ts. Lê o texto de um arquivo UTF-8, grava um .wav e
# grava em JSON (UTF-8) o tempo de cada palavra (para a legenda karaokê).
param(
  [Parameter(Mandatory = $true)][string]$TextFile,
  [Parameter(Mandatory = $true)][string]$Out,
  [Parameter(Mandatory = $true)][string]$JsonOut,
  [string]$Voice = "Microsoft Maria Desktop",
  [int]$Rate = 1
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

# Os eventos de progresso chegam em outra thread; coletamos em C# para não depender do runspace do PowerShell.
Add-Type -ReferencedAssemblies System.Speech -TypeDefinition @"
using System.Collections.Generic;
using System.Speech.Synthesis;
public class TtsWordCollector {
  public List<object[]> Words = new List<object[]>();
  public void Attach(SpeechSynthesizer s) {
    s.SpeakProgress += (o, e) => { lock (Words) Words.Add(new object[] { e.Text, e.AudioPosition.TotalSeconds, e.CharacterPosition }); };
  }
}
"@

$text = [System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8)
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice($Voice)
$synth.Rate = $Rate
$collector = New-Object TtsWordCollector
$collector.Attach($synth)
# 16 kHz mono: taxa nativa das vozes Desktop. Em outra taxa o AudioPosition dos eventos sai escalado e a legenda dessincroniza.
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$synth.SetOutputToWaveFile($Out, $fmt)
$synth.Speak($text)
$synth.SetOutputToNull()
$synth.Dispose()

$words = @($collector.Words | Sort-Object { $_[1] } | ForEach-Object { @{ start = $_[1]; pos = $_[2] } })
$json = @{ words = $words } | ConvertTo-Json -Depth 4 -Compress
[System.IO.File]::WriteAllText($JsonOut, $json, (New-Object System.Text.UTF8Encoding $false))
