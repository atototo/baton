export interface MentionableAgent {
  id: string;
  name: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractMentionedAgentIds(
  body: string,
  agents: MentionableAgent[],
): string[] {
  const normalizedAgents = agents
    .map((agent) => ({
      ...agent,
      normalizedName: agent.name.trim().toLocaleLowerCase(),
    }))
    .filter((agent) => agent.normalizedName.length > 0)
    .sort((a, b) => b.normalizedName.length - a.normalizedName.length);

  if (normalizedAgents.length === 0 || body.trim().length === 0) return [];

  const idsByName = new Map<string, string[]>();
  for (const agent of normalizedAgents) {
    const existing = idsByName.get(agent.normalizedName);
    if (existing) existing.push(agent.id);
    else idsByName.set(agent.normalizedName, [agent.id]);
  }

  const pattern = normalizedAgents
    .map((agent) => escapeRegExp(agent.name.trim()))
    .join("|");

  const mentionRe = new RegExp(
    `(^|[^\\p{L}\\p{N}_])@(${pattern})(?=$|[\\s@,!?.:;\\)\\]\\}>"'])`,
    "giu",
  );

  const mentioned = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = mentionRe.exec(body)) !== null) {
    const ids = idsByName.get(match[2].toLocaleLowerCase()) ?? [];
    for (const id of ids) mentioned.add(id);
  }

  return [...mentioned];
}
