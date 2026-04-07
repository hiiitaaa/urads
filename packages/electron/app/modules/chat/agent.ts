/**
 * チャットエージェント — スキル一覧のみ（セッション管理はsession-manager.tsに移行）
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface SkillInfo {
  name: string;
  description: string;
  trigger: string;
  persona: string;
  maxTurns: number;
}

function getSkillsDir(): string {
  const devPath = join(__dirname, '../../resources/skills');
  if (existsSync(devPath)) return devPath;
  return join(process.resourcesPath || '', 'skills');
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return meta;
}

/**
 * スキル一覧を取得
 */
export function listSkills(): SkillInfo[] {
  const dir = getSkillsDir();
  if (!existsSync(dir)) return [];

  const skills: SkillInfo[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(dir, entry.name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;

    const content = readFileSync(skillFile, 'utf-8');
    const meta = parseFrontmatter(content);

    skills.push({
      name: entry.name,
      description: meta.description || '',
      trigger: meta.trigger || entry.name,
      persona: meta.persona || '',
      maxTurns: parseInt(meta.maxTurns || '10'),
    });
  }
  return skills;
}
