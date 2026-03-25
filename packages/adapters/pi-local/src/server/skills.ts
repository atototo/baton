// TODO: Port skill management utilities from Paperclip's adapter-utils
// (buildPersistentSkillSnapshot, ensureBatonSkillSymlink, readBatonRuntimeSkillEntries,
//  readInstalledSkillTargets, resolveBatonDesiredSkillNames, AdapterSkillContext, AdapterSkillSnapshot)
// and re-enable the skill listing/syncing functions below.

export async function listPiSkills(_ctx: Record<string, unknown>): Promise<Record<string, unknown>> {
  return {
    adapterType: "pi_local",
    skills: [],
    skillsHome: null,
  };
}

export async function syncPiSkills(
  _ctx: Record<string, unknown>,
  _desiredSkills: string[],
): Promise<Record<string, unknown>> {
  return {
    adapterType: "pi_local",
    skills: [],
    skillsHome: null,
  };
}

export function resolvePiDesiredSkillNames(
  _config: Record<string, unknown>,
  _availableEntries: Array<{ key: string; required?: boolean }>,
): string[] {
  return [];
}
