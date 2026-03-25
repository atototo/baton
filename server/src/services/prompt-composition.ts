import type { Db } from "@atototo/db";
import { projectConventionsService } from "./project-conventions.js";
import { logger } from "../middleware/logger.js";

const COMPOSED_INSTRUCTIONS_WARN_CHARS = 8000;

interface ComposedPrompt {
  instructionsContent: string;
  metadata: {
    projectConventionsId: string | null;
    compactMode: boolean;
    totalCharacters: number;
  };
}

export function promptCompositionService(db: Db) {
  const conventionsSvc = projectConventionsService(db);

  return {
    async composePromptLayers(params: {
      projectId: string | null;
      companyId: string;
    }): Promise<ComposedPrompt | null> {
      if (!params.projectId) return null;

      const conventions = await conventionsSvc.getByProjectId(params.projectId);
      if (!conventions) return null;

      // Use compact_context if available, otherwise full conventions_md
      const conventionsText = conventions.compactContext || conventions.conventionsMd;
      if (!conventionsText.trim()) return null;

      const sections: string[] = [];

      // Backstory
      if (conventions.backstory.trim()) {
        sections.push(`## Project Context\n\n${conventions.backstory.trim()}`);
      }

      // Conventions
      sections.push(`## Project Conventions\n\n${conventionsText.trim()}`);

      // Governance reminders (hardcoded critical rules)
      sections.push(`## Critical Governance Reminders

**These rules are absolute. Violating them will break the workflow.**

1. ALWAYS read the baton skill's \`references/governance.md\` before submitting work or handling approvals.
2. NEVER mark issues as \`done\` directly. Submit via \`in_review\` status.
3. NEVER skip the checkout step before starting work.
4. ALWAYS include \`X-Baton-Run-Id\` header on mutating API calls.
5. NEVER retry on HTTP 409 — read the error body and handle the conflict.`);

      const content = sections.join("\n\n---\n\n");

      if (content.length > COMPOSED_INSTRUCTIONS_WARN_CHARS) {
        logger.warn(
          {
            companyId: params.companyId,
            projectId: params.projectId,
            totalCharacters: content.length,
            limit: COMPOSED_INSTRUCTIONS_WARN_CHARS,
          },
          "Composed instructions exceed recommended character limit",
        );
      }

      return {
        instructionsContent: content,
        metadata: {
          projectConventionsId: conventions.id,
          compactMode: !!conventions.compactContext,
          totalCharacters: content.length,
        },
      };
    },
  };
}
