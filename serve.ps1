<#
.SYNOPSIS
    Lightweight HTTP static file server for the Timbre Space Sandbox.

.DESCRIPTION
    Hosts the sandbox web application locally using .NET HttpListener.
    Serves HTML, CSS, JavaScript, JSON, and audio files with proper MIME types.

.PARAMETER Port
    TCP port number to bind the HTTP listener (default: 8080).

.PARAMETER RootDirectory
    Filesystem path containing the static web files (default: ./sandbox).

.EXAMPLE
    .\serve.ps1 -Port 8080
#>

param(
    [int]$Port = 8080,
    [string]$RootDirectory = "$PSScriptRoot\sandbox"
)

function Get-ContentType {
    <#
    .SYNOPSIS
        Determines the HTTP Content-Type header based on file extension.
    .PARAMETER FilePath
        Path to the requested target file.
    .OUTPUTS
        MIME type string.
    #>
    param([string]$FilePath)

    $ext = [System.IO.Path]::GetExtension($FilePath).ToLower()
    $types = @{
        ".html" = "text/html; charset=utf-8"
        ".htm"  = "text/html; charset=utf-8"
        ".css"  = "text/css; charset=utf-8"
        ".js"   = "application/javascript; charset=utf-8"
        ".json" = "application/json; charset=utf-8"
        ".wav"  = "audio/wav"
        ".mp3"  = "audio/mpeg"
        ".ogg"  = "audio/ogg"
        ".svg"  = "image/svg+xml"
        ".png"  = "image/png"
        ".jpg"  = "image/jpeg"
        ".ico"  = "image/x-icon"
    }

    if ($types.ContainsKey($ext)) {
        return $types[$ext]
    }
    return "application/octet-stream"
}

function Start-StaticServer {
    <#
    .SYNOPSIS
        Starts the HttpListener loop and handles incoming HTTP GET requests.
    .PARAMETER ListenPort
        Port number to listen on.
    .PARAMETER WebRoot
        Root directory for static files.
    #>
    param(
        [int]$ListenPort,
        [string]$WebRoot
    )

    $listener = New-Object System.Net.HttpListener
    $url = "http://localhost:$ListenPort/"
    $listener.Prefixes.Add($url)

    try {
        $listener.Start()
        Write-Host "==========================================================" -ForegroundColor Cyan
        Write-Host " Timbre Space Sandbox Server Active" -ForegroundColor Green
        Write-Host " URL: $url" -ForegroundColor Yellow
        Write-Host " Serving: $WebRoot" -ForegroundColor Gray
        Write-Host " Press Ctrl+C to stop the server" -ForegroundColor Gray
        Write-Host "==========================================================" -ForegroundColor Cyan

        while ($listener.IsListening) {
            $context = $listener.GetContext()
            $request = $context.Request
            $response = $context.Response

            $relativePath = $request.Url.LocalPath.TrimStart('/')
            if ([string]::IsNullOrWhiteSpace($relativePath) -or $relativePath -eq "/") {
                $relativePath = "index.html"
            }

            # Normalize path and prevent directory traversal
            $targetPath = [System.IO.Path]::GetFullPath((Join-Path $WebRoot $relativePath))
            $rootFullPath = [System.IO.Path]::GetFullPath($WebRoot)

            if (-not $targetPath.StartsWith($rootFullPath, [System.StringComparison]::OrdinalIgnoreCase)) {
                $response.StatusCode = 403
                $msg = [System.Text.Encoding]::UTF8.GetBytes("403 Forbidden")
                $response.ContentLength64 = $msg.Length
                $response.OutputStream.Write($msg, 0, $msg.Length)
                $response.OutputStream.Close()
                continue
            }

            if (Test-Path -Path $targetPath -PathType Leaf) {
                try {
                    $bytes = [System.IO.File]::ReadAllBytes($targetPath)
                    $response.StatusCode = 200
                    $response.ContentType = Get-ContentType -FilePath $targetPath
                    $response.ContentLength64 = $bytes.Length
                    $response.AddHeader("Cache-Control", "no-cache, no-store, must-revalidate")
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                } catch {
                    $response.StatusCode = 500
                }
            } else {
                $response.StatusCode = 404
                $msg = [System.Text.Encoding]::UTF8.GetBytes("404 File Not Found: $relativePath")
                $response.ContentType = "text/plain; charset=utf-8"
                $response.ContentLength64 = $msg.Length
                $response.OutputStream.Write($msg, 0, $msg.Length)
            }

            $response.OutputStream.Close()
        }
    } catch {
        Write-Host "Server encountered an error: $_" -ForegroundColor Red
    } finally {
        if ($listener.IsListening) {
            $listener.Stop()
        }
        $listener.Close()
    }
}

Start-StaticServer -ListenPort $Port -WebRoot $RootDirectory
