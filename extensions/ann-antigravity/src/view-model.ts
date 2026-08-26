import type { GitContextDisplay } from "./git-branch";
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

export function nextActionFor(snapshot: ControlRoomSnapshot): NextActionDisplay {
  if (!snapshot.projectRoot) {
    return {
      label: "Open a folder containing .ann/MASTER_PLAN.md.",
      command: "workbench.action.files.openFolder",
    };
  }

  if (!snapshot.profile.displayName) {
    return {
      label: "Set your local ANN user label.",
      command: "annGuardian.configureUserProfile",
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

  if (!snapshot.mentorLink) {
    return {
      label: "Link a ChatGPT Mentor project for this ANN project.",
      command: "annGuardian.configureChatGptMentor",
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
