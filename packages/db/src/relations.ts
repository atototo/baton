import { relations } from "drizzle-orm";
import { agents } from "./schema/agents.js";
import { companies } from "./schema/companies.js";
import { agentInstructions } from "./schema/agent_instructions.js";
import { agentInstructionRevisions } from "./schema/agent_instruction_revisions.js";

export const agentInstructionsRelations = relations(agentInstructions, ({ one }) => ({
  agent: one(agents, {
    fields: [agentInstructions.agentId],
    references: [agents.id],
  }),
  company: one(companies, {
    fields: [agentInstructions.companyId],
    references: [companies.id],
  }),
}));

export const agentInstructionRevisionsRelations = relations(agentInstructionRevisions, ({ one }) => ({
  agent: one(agents, {
    fields: [agentInstructionRevisions.agentId],
    references: [agents.id],
  }),
  company: one(companies, {
    fields: [agentInstructionRevisions.companyId],
    references: [companies.id],
  }),
}));

export const agentsRelations = relations(agents, ({ many }) => ({
  instructions: many(agentInstructions),
  instructionRevisions: many(agentInstructionRevisions),
}));
