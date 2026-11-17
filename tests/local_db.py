"""Fixture SQL on the isolated local D1, without booting Wrangler for each assertion.
Product behaviour is always exercised through HTTP. Never accepts another database or remote state.
Wrangler/Miniflare's locked version stores local D1 in SQLite; fail closed if that layout changes.
"""
import os
import re
import sqlite3
from pathlib import Path


def sql(command):
    state = Path(os.environ['ROS_TEST_STATE']).resolve()
    if state != (Path.cwd() / '.wrangler/integration').resolve():
        raise RuntimeError('Fixture SQL requires the dedicated integration state')
    files = [p for p in (state / 'v3/d1/miniflare-D1DatabaseObject').glob('*.sqlite')
             if re.fullmatch(r'[a-f0-9]{64}\.sqlite', p.name)]
    if len(files) != 1 or not files[0].resolve().is_relative_to(state):
        raise RuntimeError('Expected exactly one isolated local D1 SQLite database')
    with sqlite3.connect(files[0].resolve().as_uri() + '?mode=rw', uri=True, timeout=30) as db:
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('BEGIN IMMEDIATE')
        statement, result = '', []
        for char in command:
            statement += char
            if char == ';' and sqlite3.complete_statement(statement):
                cursor = db.execute(statement)
                result = [dict(row) for row in cursor] if cursor.description else []
                statement = ''
        if statement.strip():
            cursor = db.execute(statement)
            result = [dict(row) for row in cursor] if cursor.description else []
        return result
