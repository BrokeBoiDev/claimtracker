Start-Process `
  -WindowStyle Hidden `
  -FilePath "npm.cmd" `
  -ArgumentList @("run", "dev", "--", "--host", "127.0.0.1") `
  -WorkingDirectory "C:\Users\broke\Downloads\studiogrid-command-mvp\studiogrid-command-mvp"
