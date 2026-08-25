export interface ParsedGitRemote {
  readonly providerLabel: "GitHub" | "Repository";
  readonly repositoryLabel: string;
}

function cleanPath(value: string): string | undefined {
  const cleaned = value
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.git$/i, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return cleaned.includes("/") ? cleaned.slice(0, 240) : undefined;
}

function parsedRemote(hostname: string, repositoryPath: string): ParsedGitRemote | undefined {
  const cleanHostname = hostname.toLowerCase().trim();
  const cleanRepository = cleanPath(repositoryPath);
  if (!cleanHostname || !cleanRepository) {
    return undefined;
  }

  if (cleanHostname === "github.com" || cleanHostname === "www.github.com") {
    return { providerLabel: "GitHub", repositoryLabel: cleanRepository };
  }

  return {
    providerLabel: "Repository",
    repositoryLabel: `${cleanHostname}/${cleanRepository}`.slice(0, 260),
  };
}

export function parseGitRemote(remoteUrl: unknown): ParsedGitRemote | undefined {
  if (typeof remoteUrl !== "string" || remoteUrl.trim().length === 0) {
    return undefined;
  }

  const candidate = remoteUrl.trim();
  const scpStyle = candidate.includes("://")
    ? null
    : /^(?:[^@\s]+@)?([^:\s/]+):(.+)$/.exec(candidate);
  if (scpStyle) {
    return parsedRemote(scpStyle[1] ?? "", scpStyle[2] ?? "");
  }

  try {
    const parsed = new URL(candidate);
    if (!parsed.hostname) {
      return undefined;
    }
    return parsedRemote(parsed.hostname, parsed.pathname);
  } catch {
    return undefined;
  }
}
