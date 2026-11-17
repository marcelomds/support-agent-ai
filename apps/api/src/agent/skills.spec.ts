import { createLoadSkillTool, describeSkills, parseSkill } from './skills.js';

const source = '---\nname: greeting\ndescription: Use when the customer says hello.\n---\n\nSay hello back.\nThen offer help.\n';
const context = { customerId: 1, conversationId: 'c' };

describe('skills', () => {
  it('parses the header and the body', () => {
    expect(parseSkill(source)).toEqual({
      name: 'greeting',
      description: 'Use when the customer says hello.',
      body: 'Say hello back.\nThen offer help.',
    });
  });

  it('rejects a file without a header or without a description', () => {
    expect(() => parseSkill('Just text.', 'a.md')).toThrow('a.md: missing');
    expect(() => parseSkill('---\nname: x\n---\nBody', 'b.md')).toThrow('b.md: the header needs');
  });

  it('puts only names and descriptions in the prompt, never the body', () => {
    const line = describeSkills([parseSkill(source)]);
    expect(line).toBe('- greeting: Use when the customer says hello.');
    expect(line).not.toContain('Say hello back');
  });

  it('returns the full instructions through the tool, and explains an unknown name', async () => {
    const tool = createLoadSkillTool([parseSkill(source)]);
    expect(await tool.execute({ name: 'greeting' }, context)).toEqual({
      name: 'greeting',
      instructions: 'Say hello back.\nThen offer help.',
    });
    await expect(tool.execute({ name: 'missing' }, context)).rejects.toThrow('Available: greeting');
  });
});
