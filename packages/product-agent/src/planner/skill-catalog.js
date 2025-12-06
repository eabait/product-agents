const BUILTIN_SKILL_PACKS = {
    'prd-skill-pack': async () => {
        const module = await import('@product-agents/skills-prd');
        return module.prdSkillPack;
    }
};
export class SkillCatalog {
    packs;
    loaded = false;
    skills = new Map();
    constructor(packs) {
        this.packs = packs;
    }
    async ensureLoaded() {
        if (this.loaded) {
            return;
        }
        for (const pack of this.packs) {
            const loader = BUILTIN_SKILL_PACKS[pack.id];
            if (!loader) {
                throw new Error(`Unknown skill pack "${pack.id}". Register a loader before using it.`);
            }
            const manifest = await loader();
            manifest.skills.forEach(skill => {
                if (this.skills.has(skill.id)) {
                    return;
                }
                this.skills.set(skill.id, {
                    id: skill.id,
                    label: skill.label,
                    version: skill.version,
                    category: skill.category,
                    description: skill.description,
                    section: skill.section,
                    packId: manifest.id
                });
            });
        }
        this.loaded = true;
    }
    async listSkills() {
        await this.ensureLoaded();
        return Array.from(this.skills.values());
    }
    async listByCategory(category) {
        await this.ensureLoaded();
        return Array.from(this.skills.values()).filter(skill => skill.category === category);
    }
    async findById(skillId) {
        await this.ensureLoaded();
        return this.skills.get(skillId);
    }
}
