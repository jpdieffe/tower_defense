export interface SkillDef {
  id: number;
  branch: 'Might' | 'Survival' | 'Tactics';
  tier: number;
  name: string;
  desc: string;
  icon: string;
  requires: number;
}

export const SKILLS: readonly SkillDef[] = [
  { id: 0, branch: 'Might', tier: 1, name: 'Keen Edge', desc: '+15% hero attack and skill damage.', icon: '⚔', requires: -1 },
  { id: 1, branch: 'Might', tier: 2, name: 'Battle Rhythm', desc: 'Hero attacks 18% faster.', icon: '✦', requires: 0 },
  { id: 2, branch: 'Might', tier: 3, name: 'Executioner', desc: '+25% damage to enemies below 35% health.', icon: '☠', requires: 1 },
  { id: 3, branch: 'Survival', tier: 1, name: 'Iron Heart', desc: '+25% maximum health and heal 25% now.', icon: '♥', requires: -1 },
  { id: 4, branch: 'Survival', tier: 2, name: 'Second Wind', desc: 'Regenerate an additional 8 health per second.', icon: '✚', requires: 3 },
  { id: 5, branch: 'Survival', tier: 3, name: 'Unbroken', desc: 'Respawn 40% faster.', icon: '🛡', requires: 4 },
  { id: 6, branch: 'Tactics', tier: 1, name: 'Long Reach', desc: '+20% hero attack range.', icon: '◎', requires: -1 },
  { id: 7, branch: 'Tactics', tier: 2, name: 'Arcane Focus', desc: 'Hero skill cooldown is 22% shorter.', icon: '⌛', requires: 6 },
  { id: 8, branch: 'Tactics', tier: 3, name: 'Quartermaster', desc: 'World items grant +1 extra charge.', icon: '🎒', requires: 7 },
];

export const skillDef = (id: number): SkillDef => SKILLS[id] ?? SKILLS[0];
export const hasSkill = (skills: readonly number[], id: number): boolean => skills.includes(id);
export function availableSkills(skills: readonly number[]): readonly SkillDef[] {
  return SKILLS.filter((s) => !hasSkill(skills, s.id) && (s.requires < 0 || hasSkill(skills, s.requires)));
}
