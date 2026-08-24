import { BranchDisplay } from "./git-branch";
import { ProjectStateDisplay } from "./state-reader";

export interface ControlRoomSnapshot {
  readonly projectRoot?: string;
  readonly state?: ProjectStateDisplay;
  readonly branch?: BranchDisplay;
}
