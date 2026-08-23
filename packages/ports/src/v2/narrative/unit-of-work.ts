import type { V2CanonRepository } from "../core/canon-repository.ts";
import type { V2GraphStateRepository } from "../core/graph-state-repository.ts";
import type { V2NarrativeHierarchyRepository } from "./hierarchy-repository.ts";
import type { V2SceneDocumentRepository } from "./scene-document-repository.ts";
import type { V2NarrativeReferenceRepository } from "./reference-repository.ts";
import type { V2CanonLoreRepository } from "./lore-repository.ts";
import type { V2NarrativeSearchRepository } from "./search-repository.ts";

export interface V2NarrativeTransactionContext {
  readonly canon: V2CanonRepository;
  readonly graphState: V2GraphStateRepository;
  readonly hierarchy: V2NarrativeHierarchyRepository;
  readonly sceneDocument: V2SceneDocumentRepository;
  readonly references: V2NarrativeReferenceRepository;
  readonly lore: V2CanonLoreRepository;
  readonly search: V2NarrativeSearchRepository;
}

export interface V2NarrativeUnitOfWork {
  withNarrativeTransaction<T>(
    run: (context: V2NarrativeTransactionContext) => Promise<T>,
  ): Promise<T>;
}
