import { BadRequestException } from '@nestjs/common';
import { EMAIL_TEMPLATE_VARIABLES } from './email.constants';

const allowed = new Set<string>(EMAIL_TEMPLATE_VARIABLES);
const variablePattern = /\{\{\s*([a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+)\s*\}\}/g;

export function validateTemplate(source: string): void {
  const matches = [...source.matchAll(variablePattern)];
  for (const match of matches) {
    if (!allowed.has(match[1]!))
      throw new BadRequestException(`Unsupported template variable: {{${match[1]}}}`);
  }
  const stripped = source.replace(variablePattern, '');
  if (stripped.includes('{{') || stripped.includes('}}'))
    throw new BadRequestException('Invalid template variable syntax');
}

export function renderTemplate(source: string, values: Record<string, string | undefined>): string {
  validateTemplate(source);
  return source.replace(variablePattern, (_match, key: string) => values[key] ?? '');
}
