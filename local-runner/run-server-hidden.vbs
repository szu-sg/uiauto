' Start UIAuto local runner without a visible console window.
Dim fso, sh, dir, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = "cmd /c npm.cmd start >> """ & dir & "\runner.log"" 2>&1"
sh.CurrentDirectory = dir
sh.Run cmd, 0, False
