import { describe, expect, test } from 'vitest';
import { isReadOnlySql } from './sql-validator';

describe('isReadOnlySql', () => {
  describe('allowed queries', () => {
    test('should allow basic SELECT', () => {
      expect(isReadOnlySql('SELECT * FROM USERS')).toBe(true);
    });

    test('should allow SELECT with lowercase', () => {
      expect(isReadOnlySql('select id, name from users')).toBe(true);
    });

    test('should allow SELECT with WHERE clause', () => {
      expect(isReadOnlySql('SELECT * FROM USERS WHERE ID = 1')).toBe(true);
    });

    test('should allow SELECT with JOIN', () => {
      expect(
        isReadOnlySql('SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id'),
      ).toBe(true);
    });

    test('should allow SELECT with subquery', () => {
      expect(isReadOnlySql('SELECT * FROM users WHERE id IN (SELECT user_id FROM orders)')).toBe(
        true,
      );
    });

    test('should allow SELECT with UNION', () => {
      expect(isReadOnlySql('SELECT id FROM users UNION SELECT id FROM admins')).toBe(true);
    });

    test('should allow SELECT with aggregate functions', () => {
      expect(
        isReadOnlySql('SELECT COUNT(*), MAX(id) FROM users GROUP BY status HAVING COUNT(*) > 1'),
      ).toBe(true);
    });

    test('should allow CTE (WITH clause)', () => {
      expect(isReadOnlySql('WITH cte AS (SELECT id FROM users) SELECT * FROM cte')).toBe(true);
    });

    test('should allow recursive CTE', () => {
      expect(
        isReadOnlySql(
          'WITH RECURSIVE cte AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM cte WHERE n < 10) SELECT * FROM cte',
        ),
      ).toBe(true);
    });

    test('should allow SELECT with trailing semicolon', () => {
      expect(isReadOnlySql('SELECT 1;')).toBe(true);
    });

    test('should allow SELECT with leading/trailing whitespace', () => {
      expect(isReadOnlySql('  SELECT 1  ')).toBe(true);
    });

    test('should allow SELECT with ORDER BY and LIMIT-like patterns', () => {
      expect(isReadOnlySql('SELECT FIRST 10 * FROM USERS ORDER BY ID')).toBe(true);
    });

    test('should allow SELECT with CASE expression', () => {
      expect(
        isReadOnlySql("SELECT CASE WHEN status = 1 THEN 'active' ELSE 'inactive' END FROM users"),
      ).toBe(true);
    });
    test('should allow blocked words inside string literals', () => {
      expect(isReadOnlySql("SELECT * FROM users WHERE note = 'drop table users'")).toBe(true);
    });

    test('should allow semicolon inside string literal', () => {
      expect(isReadOnlySql("SELECT * FROM users WHERE note = 'a;b'")).toBe(true);
    });

    test('should allow quoted identifiers containing blocked words', () => {
      expect(isReadOnlySql('SELECT "update" FROM users')).toBe(true);
    });

    test('should allow SELECT with DISTINCT', () => {
      expect(isReadOnlySql('SELECT DISTINCT name FROM users')).toBe(true);
    });
  });

  describe('blocked queries — DML', () => {
    test('should reject INSERT', () => {
      expect(isReadOnlySql("INSERT INTO users (name) VALUES ('test')")).toBe(false);
    });

    test('should reject UPDATE', () => {
      expect(isReadOnlySql("UPDATE users SET name = 'test'")).toBe(false);
    });

    test('should reject DELETE', () => {
      expect(isReadOnlySql('DELETE FROM users')).toBe(false);
    });

    test('should reject MERGE', () => {
      expect(
        isReadOnlySql(
          'MERGE INTO target USING source ON target.id = source.id WHEN MATCHED THEN UPDATE SET name = source.name',
        ),
      ).toBe(false);
    });

    test('should reject EXECUTE STATEMENT', () => {
      expect(isReadOnlySql("EXECUTE STATEMENT 'SELECT 1'")).toBe(false);
    });
    test('should reject execute statement hidden inside CTE body', () => {
      expect(
        isReadOnlySql("WITH cte AS (SELECT 1) SELECT * FROM cte EXECUTE STATEMENT 'SELECT 1'"),
      ).toBe(false);
    });

    test('should reject execute statement when keywords are split across newline', () => {
      expect(isReadOnlySql("SELECT 1 EXECUTE\nSTATEMENT 'SELECT 2'")).toBe(false);
    });
  });

  describe('blocked queries — DDL', () => {
    test('should reject CREATE TABLE', () => {
      expect(isReadOnlySql('CREATE TABLE test (id INT)')).toBe(false);
    });

    test('should reject ALTER TABLE', () => {
      expect(isReadOnlySql('ALTER TABLE users ADD COLUMN email VARCHAR(255)')).toBe(false);
    });

    test('should reject DROP TABLE', () => {
      expect(isReadOnlySql('DROP TABLE users')).toBe(false);
    });
  });

  describe('blocked queries — DCL', () => {
    test('should reject GRANT', () => {
      expect(isReadOnlySql('GRANT SELECT ON users TO PUBLIC')).toBe(false);
    });

    test('should reject REVOKE', () => {
      expect(isReadOnlySql('REVOKE SELECT ON users FROM PUBLIC')).toBe(false);
    });
  });

  describe('comments are properly ignored', () => {
    test('should allow SELECT with inline comment', () => {
      expect(isReadOnlySql('SELECT 1 -- hidden')).toBe(true);
    });

    test('should allow SELECT with block comment', () => {
      expect(isReadOnlySql('SELECT /* hidden */ 1')).toBe(true);
    });

    test('should reject DML hidden immediately after a block comment', () => {
      expect(
        isReadOnlySql('SELECT 1 FROM RDB$DATABASE /* hidden */INSERT INTO USERS VALUES (1)'),
      ).toBe(false);
      expect(isReadOnlySql('WITH x AS (SELECT 1) /* comment */UPDATE users SET name=1')).toBe(
        false,
      );
      expect(isReadOnlySql('SELECT /* comment */DELETE FROM table')).toBe(false);
      expect(isReadOnlySql("SELECT 1 /* comment */EXECUTE STATEMENT 'UPDATE table'")).toBe(false);
    });
    test('should reject unterminated single-quoted string', () => {
      expect(isReadOnlySql("SELECT * FROM users WHERE name = 'abc")).toBe(false);
    });

    test('should reject unterminated quoted identifier', () => {
      expect(isReadOnlySql('SELECT "name FROM users')).toBe(false);
    });

    test('should reject query with block comment end marker', () => {
      expect(isReadOnlySql('SELECT 1 */')).toBe(false);
    });

    test('should reject multiple statements separated by semicolon', () => {
      expect(isReadOnlySql('SELECT 1; SELECT 2')).toBe(false);
    });

    test('should reject SELECT followed by semicolon and DML', () => {
      expect(isReadOnlySql('SELECT 1; DELETE FROM users')).toBe(false);
    });

    test('should reject DML hidden after SELECT via semicolon', () => {
      expect(isReadOnlySql("SELECT 1; INSERT INTO users VALUES ('x')")).toBe(false);
    });

    test('should reject set term pair even with extra whitespace', () => {
      expect(isReadOnlySql('WITH x AS (SELECT 1) SELECT * FROM x SET   TERM ^')).toBe(false);
    });
  });

  describe('blocked queries — DML tokens embedded in SELECT', () => {
    test('should reject SELECT with INSERT token in body', () => {
      expect(isReadOnlySql('SELECT * FROM users WHERE insert = 1')).toBe(false);
    });

    test('should reject SELECT with UPDATE token in body', () => {
      expect(isReadOnlySql('SELECT * FROM users WHERE update = 1')).toBe(false);
    });

    test('should reject SELECT with DELETE token in body', () => {
      expect(isReadOnlySql('SELECT * FROM users WHERE delete = 1')).toBe(false);
    });

    test('should reject SELECT with DROP token in body', () => {
      expect(isReadOnlySql('SELECT * FROM users WHERE drop = 1')).toBe(false);
    });
  });

  describe('edge cases', () => {
    test('should reject empty string', () => {
      expect(isReadOnlySql('')).toBe(false);
    });

    test('should reject whitespace-only string', () => {
      expect(isReadOnlySql('   ')).toBe(false);
    });

    test('should reject non-SELECT non-WITH starting keyword', () => {
      expect(isReadOnlySql('SHOW TABLES')).toBe(false);
    });

    test('should reject EXPLAIN (not a standard Firebird keyword but not SELECT)', () => {
      expect(isReadOnlySql('EXPLAIN SELECT 1')).toBe(false);
    });
  });
});
