import { compileImageWorkflow, type ImageJob, type JsonObject } from "../../../packages/domain/src/index.ts";
import type {
  DomainRepositories,
  CharacterVisualIdentityRepository,
  ImageWorkflowTemplateRepository,
} from "../../../packages/database/src/index.ts";
import type { ComfyUiClient } from "./comfyui-types.ts";
import { ComfyUiError } from "./comfyui-client.ts";

export interface ImageWorkflowResolver {
  resolve(job: ImageJob): Promise<JsonObject>;
}

export type RepositoryImageWorkflowResolverRepositories = {
  readonly characterVisualIdentities: CharacterVisualIdentityRepository;
  readonly imageWorkflowTemplates: ImageWorkflowTemplateRepository;
  readonly behaviorActions?: import("../../../packages/database/src/index.ts").BehaviorActionRepository;
};

function splitWorkflowVersion(value: string): { id: string; version: string } {
  const separator = value.lastIndexOf("@");
  if (separator <= 0 || separator === value.length - 1) {
    throw new ComfyUiError(
      "CONFIGURATION",
      "ImageJob workflowVersion must use templateId@version",
    );
  }
  return { id: value.slice(0, separator), version: value.slice(separator + 1) };
}

export class RepositoryImageWorkflowResolver implements ImageWorkflowResolver {
  private readonly repositories: RepositoryImageWorkflowResolverRepositories;

  public constructor(repositories: RepositoryImageWorkflowResolverRepositories) {
    this.repositories = repositories;
  }

  public async resolve(job: ImageJob): Promise<JsonObject> {
    const reference = splitWorkflowVersion(job.workflowVersion);
    const template = await this.repositories.imageWorkflowTemplates.getById(
      reference.id,
      reference.version,
    );
    if (!template) {
      throw new ComfyUiError(
        "CONFIGURATION",
        `Image workflow template not found: ${job.workflowVersion}`,
      );
    }
    let visualCharacterId = job.ownerCharacterId;
    const action = this.repositories.behaviorActions === undefined
      ? undefined
      : await this.repositories.behaviorActions.getById(job.actionId);
    const recipientCharacterId = action?.payload.recipientCharacterId;
    if (typeof recipientCharacterId === "string" && recipientCharacterId.trim().length > 0) {
      visualCharacterId = recipientCharacterId;
    }
    const identity = await this.repositories.characterVisualIdentities.getByCharacterId(visualCharacterId);
    if (!identity) {
      throw new ComfyUiError(
        "CONFIGURATION",
        `Character visual identity not found: ${visualCharacterId}`,
      );
    }
    const compiled = compileImageWorkflow(template, identity, {
      prompt: job.prompt,
      ...(job.negativePrompt === undefined ? {} : { negativePrompt: job.negativePrompt }),
      ...(job.seed === undefined ? {} : { seed: job.seed }),
    });
    return compiled.workflow;
  }
}

export function createRepositoryImageWorkflowResolver(
  repositories: DomainRepositories,
): RepositoryImageWorkflowResolver {
  if (!repositories.characterVisualIdentities || !repositories.imageWorkflowTemplates) {
    throw new TypeError("Visual identity/workflow repositories are not configured");
  }
  return new RepositoryImageWorkflowResolver({
    characterVisualIdentities: repositories.characterVisualIdentities,
    imageWorkflowTemplates: repositories.imageWorkflowTemplates,
    ...(repositories.behaviorActions === undefined ? {} : { behaviorActions: repositories.behaviorActions }),
  });
}
