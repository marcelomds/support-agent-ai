/**
 * Skills: instructions the agent loads only when it needs them.
 *
 * Putting every procedure in the system prompt makes each request longer and
 * more expensive, and dilutes the instructions that matter for the question
 * at hand. Instead the prompt carries one line per skill (name and when to
 * use it), and the full text comes back from the `load_skill` tool on demand.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ToolError, defineTool, type AgentTool } from './tool.js';

export interface Skill {
  name: string;
  /** One line telling the agent when this skill applies. Always in the prompt. */
  description: string;
  /** The full instructions. Only sent when the agent asks for them. */
  body: string;
}

/**
 * A skill file is markdown with a small header:
 *
 *   ---
 *   name: plan-recommendation
 *   description: Use when the customer asks which plan to choose.
 *   ---
 *   (instructions)
 */
export function parseSkill(source: string, file = 'skill'): Skill {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source);
  if (!match) throw new Error(`${file}: missing the "---" header.`);
  const header = Object.fromEntries(
    match[1]
      .split('\n')
      .map((line) => /^(\w+):\s*(.+)$/.exec(line))
      .filter((line) => line !== null)
      .map((line) => [line[1], line[2].trim()]),
  );
  if (!header.name || !header.description) {
    throw new Error(`${file}: the header needs "name" and "description".`);
  }
  return { name: header.name, description: header.description, body: match[2].trim() };
}

export function loadSkills(directory: string): Skill[] {
  return readdirSync(directory)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => parseSkill(readFileSync(path.join(directory, file), 'utf8'), file));
}

/** The short list that goes in the system prompt. */
export function describeSkills(skills: Skill[]): string {
  return skills.map((skill) => `- ${skill.name}: ${skill.description}`).join('\n');
}

export function createLoadSkillTool(skills: Skill[]): AgentTool {
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  return defineTool({
    name: 'load_skill',
    kind: 'read',
    description:
      'Loads the full instructions of one playbook listed in the system prompt. ' +
      'Call it before handling a situation a playbook covers, then follow what it returns.',
    schema: z.object({
      name: z.string().describe(`One of: ${skills.map((skill) => skill.name).join(', ')}.`),
    }),
    execute: async ({ name }) => {
      const skill = byName.get(name);
      if (!skill) {
        throw new ToolError(`Unknown playbook "${name}". Available: ${[...byName.keys()].join(', ')}.`);
      }
      return { name: skill.name, instructions: skill.body };
    },
  });
}
