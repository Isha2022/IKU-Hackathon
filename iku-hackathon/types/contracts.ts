import type { Belief, BusyBlock, StoredProposal, StoredProposalInvitation, User } from "../lib/types";

export interface SuggestRequest {
  userIds?: string[];
  startIso?: string;
  endIso?: string;
  durationMinutes?: number;
  groupId?: string;
  busyBlocks?: Array<Pick<BusyBlock, "userId" | "start" | "end">>;
}

export interface ReplyRequest {
  threadId?: string;
  proposalVersion: number;
  userId: string;
  response?: "accepted" | "declined";
  message: string;
  receivedAt?: string;
}

export interface SubmitInvitationRequest {
  threadId: string;
  proposalVersion: number;
  senderUserId: string;
}

export interface SubmitInvitationResponse {
  proposal: StoredProposal;
  invitations: StoredProposalInvitation[];
}

export interface CandidateSlot {
  start: string;
  end: string;
  freeUserIds: string[];
}

export interface PreferenceEvidence {
  userId?: string;
  kind: "activity" | "timing" | "venue";
  value: string;
  evidence?: string;
}

export interface RsvpRecord {
  id: string;
  threadId: string;
  proposalVersion: number;
  userId: string;
  response: "accepted" | "declined" | "commented";
  message?: string;
  receivedAt: string;
}

export interface ExtractedConstraint {
  kind: "after_time" | "before_time" | "unavailable" | "activity" | "venue" | "other";
  value: string;
  scope: "proposal" | "recurring";
  confidence: number;
  evidence: string;
}

export interface AgentEvidence {
  users: User[];
  candidates: CandidateSlot[];
  preferences: PreferenceEvidence[];
  beliefs: Array<Belief & { evidence?: string }>;
  rsvps: RsvpRecord[];
}

export interface SuggestResponse {
  threadId: string;
  proposal: StoredProposal;
  evidence: AgentEvidence;
  usedFallback: boolean;
}

export interface ReplyResponse {
  rsvp: RsvpRecord;
  constraints: ExtractedConstraint[];
  proposal: StoredProposal;
  previousProposal: StoredProposal;
  explanation: string;
  evidence: AgentEvidence;
  usedFallback: boolean;
  readyForConfirmation: boolean;
}
