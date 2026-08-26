import type { GitContextDisplay } from "./git-branch";
import {
  currentGptAccount,
  gptAccountById,
  type LocalAnnProject,
  type LocalGptAccount,
  type LocalWorkspaceState,
} from "./local-workspace";
import type { ProjectRootInspection } from "./project-root-status";
import type { ProjectStateDisplay } from "./state-reader";
import type { TerminalReadiness } from "./terminal-readiness";
import type { ChatGptMentorLink, LocalUserProfile } from "./user-settings";

export interface ControlRoomSnapshot {
  readonly projectRoot?: string;
  readonly state?: ProjectStateDisplay;
  readonly git?: GitContextDisplay;
  readonly profile: LocalUserProfile;
  readonly mentorLink?: ChatGptMentorLink;
  readonly terminal: TerminalReadiness;
  readonly localWorkspace: LocalWorkspaceState;
  readonly currentRegisteredProject?: LocalAnnProject;
  readonly currentProjectInspection?: ProjectRootInspection;
  readonly registeredProjects: readonly RegisteredProjectDisplay[];
}

export interface RegisteredProjectDisplay {
  readonly project: LocalAnnProject;
  readonly inspection: ProjectRootInspection;
}

export interface NextActionDisplay {
  readonly label: string;
  readonly command?: string;
}

export function formatTaskStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

export function accountForCurrentProject(snapshot: ControlRoomSnapshot): LocalGptAccount | undefined {
  return gptAccountById(snapshot.localWorkspace, snapshot.currentRegisteredProject?.gptAccountId)
    ?? currentGptAccount(snapshot.localWorkspace)
    ?? (snapshot.mentorLink
      ? { id: "legacy-ux0-link", label: snapshot.mentorLink.accountLabel }
      : undefined);
}

export function currentChatGptProject(snapshot: ControlRoomSnapshot): { label: string; url: string } | undefined {
  const project = snapshot.currentRegisteredProject;
  if (project?.chatGptProjectLabel && project.chatGptProjectUrl) {
    return { label: project.chatGptProjectLabel, url: project.chatGptProjectUrl };
  }
  return snapshot.mentorLink
    ? { label: snapshot.mentorLink.projectLabel, url: snapshot.mentorLink.url }
    : undefined;
}

export function nextActionFor(snapshot: ControlRoomSnapshot): NextActionDisplay {
  if (!snapshot.projectRoot) {
    return {
      label: "Open an existing ANN project or start the New Personal Project wizard.",
      command: "annGuardian.openExistingProject",
    };
  }

  if (!snapshot.profile.displayName) {
    return {
      label: "Set your local ANN user label.",
      command: "annGuardian.configureUserProfile",
    };
  }

  if (!accountForCurrentProject(snapshot)) {
    return {
      label: "Configure a local GPT account context for this project.",
      command: "annGuardian.loginGpt",
    };
  }

  if (!snapshot.currentRegisteredProject) {
    return {
      label: "Add the current ANN project to My Projects.",
      command: "annGuardian.registerCurrentProject",
    };
  }

  const state = snapshot.state;
  if (!state || state.status === "missing") {
    return { label: "Initialize PROJECT_STATE.json through ANN Core." };
  }
  if (state.status === "malformed") {
    return { label: "Repair malformed PROJECT_STATE.json through ANN Core." };
  }
  if (state.status === "unavailable") {
    return { label: "Restore access to PROJECT_STATE.json through ANN Core." };
  }

  if (!currentChatGptProject(snapshot)) {
    return {
      label: "Optionally link a ChatGPT Project to this ANN project.",
      command: "annGuardian.configureProjectChatGptLink",
    };
  }

  if (!state.taskStatus) {
    if (state.task.startsWith("No current task")) {
      return { label: "Select or create the current task through ANN Core." };
    }
    return { label: `Continue ${state.task} through ANN Core; its persisted status is unavailable.` };
  }

  if (state.taskStatus === "COMPLETE") {
    return { label: "Select the next Core unit from the Master Plan." };
  }
  if (state.taskStatus === "CANCELLED") {
    return { label: "Select a replacement Core task for the cancelled unit." };
  }
  if (state.taskStatus === "BLOCKED") {
    return { label: `Resolve the recorded ANN Core blocker for ${state.task}.` };
  }
  if (state.taskStatus === "ESCALATED") {
    return { label: `Resolve the approved decision required for ${state.task}.` };
  }

  return { label: `Continue ${state.task} through ANN Core (${formatTaskStatus(state.taskStatus)}).` };
}
