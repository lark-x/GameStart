export interface RelationshipChangeDeltaDto {
  affinity: number;
  trust: number;
  conflict: number;
  dependency: number;
}

export interface RelationshipChangeCandidateDto {
  id: string;
  storyWorldId: string;
  edgeId: string;
  sourceType: string;
  sourceRef?: string;
  delta: RelationshipChangeDeltaDto;
  reason?: string;
  ruleVersion?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  idempotencyKey?: string;
  createdAt: string;
  reviewedAt?: string;
}

export interface RelationshipEventDto {
  id: string;
  storyWorldId: string;
  edgeId: string;
  sourceType: string;
  sourceRef?: string;
  before: RelationshipChangeDeltaDto;
  delta: RelationshipChangeDeltaDto;
  after: RelationshipChangeDeltaDto;
  reason?: string;
  ruleVersion?: string;
  reviewedBy?: string;
  idempotencyKey?: string;
  createdAt: string;
}

export interface ReviewRelationshipChangeRequest {
  action: "approve" | "reject";
  reviewedBy?: string;
}
