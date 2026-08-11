import {
  createImageWorkflowTemplate,
  importImageWorkflow as importImageWorkflowDomain,
  assertImageWorkflowTemplateBindings,
  type JsonObject,
} from "@living-network/domain";
import type { ApiStore } from "../context.ts";
import { ApiError } from "../helpers.ts";
import { toImageWorkflowTemplateDto } from "../mappers.ts";
import { requireVisualWorkflowStore } from "../store-helpers.ts";
import type {
  ValidateImageWorkflowRequest,
  ImageWorkflowTemplateDto,
} from "@living-network/contracts";

export async function listImageWorkflowTemplates(store: ApiStore): Promise<ImageWorkflowTemplateDto[]> {
  const vwStore = requireVisualWorkflowStore(store);
  return (await vwStore.imageWorkflowTemplates.list()).map(toImageWorkflowTemplateDto);
}

export function validateImageWorkflow(input: ValidateImageWorkflowRequest): { valid: true; id: string; version: string; checkedBindings: string[] } {
  try {
    const template = createImageWorkflowTemplate({
      id: input.id, version: input.version, workflow: input.workflow as JsonObject,
      positivePromptPath: input.positivePromptPath,
      ...(input.negativePromptPath === undefined ? {} : { negativePromptPath: input.negativePromptPath }),
      ...(input.seedPath === undefined ? {} : { seedPath: input.seedPath }),
    });
    assertImageWorkflowTemplateBindings(template);
    return {
      valid: true, id: template.id, version: template.version,
      checkedBindings: ["positivePromptPath", ...(template.negativePromptPath === undefined ? [] : ["negativePromptPath"]), ...(template.seedPath === undefined ? [] : ["seedPath"])],
    };
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
    throw error;
  }
}

export async function importImageWorkflow(store: ApiStore, input: { id: string; version: string; workflow: JsonObject; positivePromptPath?: string[]; negativePromptPath?: string[]; seedPath?: string[] }): Promise<ImageWorkflowTemplateDto> {
  const vwStore = requireVisualWorkflowStore(store);
  try {
    const imported = importImageWorkflowDomain(input.workflow);
    const template = createImageWorkflowTemplate({
      id: input.id, version: input.version, workflow: imported.workflow,
      positivePromptPath: input.positivePromptPath ?? imported.positivePromptPath,
      ...(input.negativePromptPath ?? imported.negativePromptPath ? { negativePromptPath: input.negativePromptPath ?? imported.negativePromptPath } : {}),
      ...(input.seedPath ?? imported.seedPath ? { seedPath: input.seedPath ?? imported.seedPath } : {}),
    });
    assertImageWorkflowTemplateBindings(template);
    await vwStore.imageWorkflowTemplates.save(template);
    return toImageWorkflowTemplateDto(template);
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
    throw error;
  }
}
