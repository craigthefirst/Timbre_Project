<#
.SYNOPSIS
    Robust static HTTP web server for the Timbre Space Sandbox using System.Net.Sockets.TcpListener.

.DESCRIPTION
    Serves the sandbox web application locally over TCP without external web framework dependencies.
    Handles HTTP GET requests, MIME types, and header responses.

.PARAMETER Port
    TCP port to bind (default: 8765).

.PARAMETER RootDirectory
    Folder containing static web files (default: ./sandbox).

.EXAMPLE
    .\serve.ps1 -Port 8765
#>

param(
    [int]$Port = 8765,
    [string]$RootDirectory = "$PSScriptRoot\sandbox"
)

function Get-ContentType {
    <#
    .SYNOPSIS
        Resolves MIME Content-Type header from file extension.
    .PARAMETER FilePath
        Absolute or relative path to file.
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

function Start-StaticTcpServer {
    <#
    .SYNOPSIS
        Initializes TcpListener and handles HTTP client connections.
    .PARAMETER ListenPort
        Port number to bind.
    .PARAMETER WebRoot
        Folder containing files to serve.
    #>
    param(
        [int]$ListenPort,
        [string]$WebRoot
    )

    $ip = [System.Net.IPAddress]::Loopback
    $server = [System.Net.Sockets.TcpListener]::new($ip, $ListenPort)

    try {
        $server.Start()
        $url = "http://localhost:$ListenPort/"
        Write-Host "==========================================================" -ForegroundColor Cyan
        Write-Host " Timbre Space Sandbox Active at: $url" -ForegroundColor Green
        Write-Host " Serving files from: $WebRoot" -ForegroundColor Gray
        Write-Host " Press Ctrl+C to terminate." -ForegroundColor Gray
        Write-Host "==========================================================" -ForegroundColor Cyan

        while ($true) {
            $client = $server.AcceptTcpClient()
            $stream = $client.GetStream()
            $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8)

            $requestLine = $reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($requestLine)) {
                $client.Close()
                continue
            }

            # Parse HTTP method and target URI
            $parts = $requestLine.Split(' ')
            $method = $parts[0]
            $rawPath = if ($parts.Length -gt 1) { $parts[1] } else { "/" }

            # Consume remaining request headers
            while (-not [string]::IsNullOrEmpty($reader.ReadLine())) {}

            if ($method -ne "GET" -and $method -ne "HEAD") {
                $statusLine = "HTTP/1.1 405 Method Not Allowed`r`nContent-Length: 0`r`nConnection: close`r`n`r`n"
                $bytes = [System.Text.Encoding]::ASCII.GetBytes($statusLine)
                $stream.Write($bytes, 0, $bytes.Length)
                $client.Close()
                continue
            }

            # Clean and normalize path
            $cleanPath = $rawPath.Split('?')[0].TrimStart('/')
            if ([string]::IsNullOrWhiteSpace($cleanPath) -or $cleanPath -eq "/") {
                $cleanPath = "index.html"
            }

            $targetPath = [System.IO.Path]::GetFullPath((Join-Path $WebRoot $cleanPath))
            $rootFullPath = [System.IO.Path]::GetFullPath($WebRoot)

            if (-not $targetPath.StartsWith($rootFullPath, [System.StringComparison]::OrdinalIgnoreCase)) {
                $body = [System.Text.Encoding]::UTF8.GetBytes("403 Forbidden")
                $header = "HTTP/1.1 403 Forbidden`r`nContent-Type: text/plain`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
                $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
                $stream.Write($headerBytes, 0, $headerBytes.Length)
                $stream.Write($body, 0, $body.Length)
                $client.Close()
                continue
            }

            if (Test-Path -Path $targetPath -PathType Leaf) {
                $fileBytes = [System.IO.File]::ReadAllBytes($targetPath)
                $contentType = Get-ContentType -FilePath $targetPath
                $header = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($fileBytes.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
                $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
                $stream.Write($headerBytes, 0, $headerBytes.Length)
                if ($method -ne "HEAD") {
                    $stream.Write($fileBytes, 0, $fileBytes.Length)
                }
            } else {
                $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $cleanPath")
                $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
                $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
                $stream.Write($headerBytes, 0, $headerBytes.Length)
                $stream.Write($body, 0, $body.Length)
            }

            $stream.Flush()
            $client.Close()
        }
    } catch {
        Write-Host "Server halted: $_" -ForegroundColor Yellow
    } finally {
        $server.Stop()
    }
}

Start-StaticTcpServer -ListenPort $Port -WebRoot $RootDirectory
