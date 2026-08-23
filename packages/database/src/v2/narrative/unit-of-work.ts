import type { DatabaseSync } from "node:sqlite";
import type {
  V2NarrativeTransactionContext,
  V2NarrativeUnitOfWork,
} from "@living-network/ports/v2";
import {
  V2SqliteCanonRepository,
  V2SqliteGraphStateRepository,
} from "../core/canon-repository.ts";
import { withV2SqliteAsyncTransaction } from "../platform/index.ts";
import { SqliteNarrativeHierarchyRepository } from "./hierarchy-repository.ts";
import { SqliteSceneDocumentRepository } from "./scene-document-repository.ts";
import { SqliteNarrativeReferenceRepository } from "./reference-repository.ts";
import { SqliteCanonLoreRepository } from "./lore-repository.ts";
import { SqliteNarrativeSearchRepository } from "./search-repository.ts";

export class SqliteNarrativeUnitOfWork implements V2NarrativeUnitOfWork {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async withNarrativeTransaction<T>(
    run: (context: V2NarrativeTransactionContext) => Promise<T>,
  ): Promise<T> {
    return withV2SqliteAsyncTransaction(this.db, () =>
      run({
        canon: new V2SqliteCanonRepository(this.db),
        graphState: new V2SqliteGraphStateRepository(this.db),
        hierarchy: new SqliteNarrativeHierarchyRepository(this.db),
        sceneDocument: new SqliteSceneDocumentRepository(this.db),
        references: new SqliteNarrativeReferenceRepository(this.db),
        lore: new SqliteCanonLoreRepository(this.db),
        search: new SqliteNarrativeSearchRepository(this.db),
      }),
    );
  }
}

