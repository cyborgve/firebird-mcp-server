const BLOCKED_SINGLE_KEYWORDS = new Set([
  'insert',
  'update',
  'delete',
  'merge',
  'drop',
  'alter',
  'create',
  'revoke',
  'grant',
  'truncate',
  'commit',
  'rollback',
  'execute',
  'execute_block',
  'set',
]);

const BLOCKED_KEYWORD_PAIRS = new Set(['execute statement', 'set term']);

interface ParsedSql {
  tokens: string[];
  hasNonTrailingSemicolon: boolean;
}

function isWordChar(char: string): boolean {
  return /[a-z0-9_$]/i.test(char);
}

function parseSql(sql: string): ParsedSql | null {
  const tokens: string[] = [];
  let tokenBuffer = '';
  let hasNonTrailingSemicolon = false;

  let inSingleQuotedString = false;
  let inDoubleQuotedIdentifier = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i] ?? '';
    const next = sql[i + 1] ?? '';

    if (inSingleQuotedString) {
      if (char === "'" && next === "'") {
        i += 1;
        continue;
      }

      if (char === "'") {
        inSingleQuotedString = false;
      }
      continue;
    }

    if (inDoubleQuotedIdentifier) {
      if (char === '"') {
        inDoubleQuotedIdentifier = false;
      }
      continue;
    }

    if (char === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') {
        i += 1;
      }
      continue;
    }

    if (char === '/' && next === '*') {
      i += 2;
      while (i < sql.length) {
        if (sql[i] === '*' && sql[i + 1] === '/') {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (char === '*' && next === '/') {
      return null;
    }

    if (char === "'") {
      if (tokenBuffer) {
        tokens.push(tokenBuffer.toLowerCase());
        tokenBuffer = '';
      }
      inSingleQuotedString = true;
      continue;
    }

    if (char === '"') {
      if (tokenBuffer) {
        tokens.push(tokenBuffer.toLowerCase());
        tokenBuffer = '';
      }
      inDoubleQuotedIdentifier = true;
      continue;
    }

    if (char === ';') {
      if (tokenBuffer) {
        tokens.push(tokenBuffer.toLowerCase());
        tokenBuffer = '';
      }

      const remaining = sql.slice(i + 1).trim();
      if (remaining.length > 0) {
        hasNonTrailingSemicolon = true;
      }
      continue;
    }

    if (isWordChar(char)) {
      tokenBuffer += char;
      continue;
    }

    if (tokenBuffer) {
      tokens.push(tokenBuffer.toLowerCase());
      tokenBuffer = '';
    }
  }

  if (inSingleQuotedString || inDoubleQuotedIdentifier) {
    return null;
  }

  if (tokenBuffer) {
    tokens.push(tokenBuffer.toLowerCase());
  }

  return {
    tokens,
    hasNonTrailingSemicolon,
  };
}

export function isReadOnlySql(sql: string): boolean {
  const trimmed = sql.trim();
  if (!trimmed) {
    return false;
  }

  const parsed = parseSql(trimmed);
  if (!parsed) {
    return false;
  }

  if (parsed.hasNonTrailingSemicolon) {
    return false;
  }

  if (parsed.tokens.length === 0) {
    return false;
  }

  const firstToken = parsed.tokens[0] ?? '';
  if (firstToken !== 'select' && firstToken !== 'with') {
    return false;
  }

  for (let i = 0; i < parsed.tokens.length; i += 1) {
    const token = parsed.tokens[i] ?? '';
    const next = parsed.tokens[i + 1] ?? '';

    if (BLOCKED_SINGLE_KEYWORDS.has(token)) {
      return false;
    }

    if (BLOCKED_KEYWORD_PAIRS.has(`${token} ${next}`.trim())) {
      return false;
    }
  }

  return true;
}
