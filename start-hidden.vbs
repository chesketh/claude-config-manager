Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")
Set objEnv = objShell.Environment("Process")
objEnv("CLAUDE_DISABLED_SKILLS_DIR") = objShell.ExpandEnvironmentStrings("%USERPROFILE%\Documents\Claudetemp\Skills")
objShell.CurrentDirectory = objFSO.GetParentFolderName(WScript.ScriptFullName)
objShell.Run "node server.js", 0, False
