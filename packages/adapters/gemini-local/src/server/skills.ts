// TODO: Port skill management utilities from Paperclip's adapter-utils
// (buildPersistentSkillSnapshot, ensureBatonSkillSymlink, readBatonRuntimeSkillEntries,
//  readInstalledSkillTargets, resolveBatonDesiredSkillNames, AdapterSkillContext, AdapterSkillSnapshot)
// and re-enable the skill listing/syncing functions below.

export async function listGeminiSkills(_ctx: Record<string, unknown>): Promise<Record<string, unknown>> {
  return {
    adapterType: "gemini_local",
    skills: [],
    skillsHome: null,
  };
}

export async function syncGeminiSkills(
  _ctx: Record<string, unknown>,
  _desiredSkills: string[],
): Promise<Record<string, unknown>> {
  return {
    adapterType: "gemini_local",
    skills: [],
    skillsHome: null,
  };
}

export function resolveGeminiDesiredSkillNames(
  _config: Record<string, unknown>,
  _availableEntries: Array<{ key: string; required?: boolean }>,
): string[] {
  return [];
}
