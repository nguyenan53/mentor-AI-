import path from "node:path";

export interface TerminalReadiness {
  readonly shellLabel: string;
  readonly status: "ready" | "unavailable";
  readonly description: string;
}

function shellLabel(shellPath: string): string {
  const executable = path.basename(shellPath).replace(/\.exe$/i, "").toLowerCase();
  if (executable === "powershell" || executable === "pwsh") return "PowerShell";
  if (executable === "cmd") return "Command Prompt";
  if (executable === "bash") return "Bash";
  if (executable === "zsh") return "Zsh";
  if (executable === "fish") return "Fish";
  return path.basename(shellPath).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120);
}

export function describeTerminalReadiness(
  projectRoot: string | undefined,
  configuredShell: string | undefined,
): TerminalReadiness {
  if (!projectRoot) {
    return {
      shellLabel: "No project root",
      status: "unavailable",
      description: "Open an ANN project to establish the terminal root.",
    };
  }

  const shell = configuredShell?.trim();
  if (!shell) {
    return {
      shellLabel: "Shell not detected",
      status: "unavailable",
      description: "Select a default terminal profile in VS Code.",
    };
  }

  return {
    shellLabel: shellLabel(shell),
    status: "ready",
    description: `Ready at ${projectRoot}. No command has been executed.`,
  };
}
