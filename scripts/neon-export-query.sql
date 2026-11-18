WITH src AS (
  SELECT 1 o, 'manager_users' t, id::bigint k, to_jsonb(x) j FROM manager_users x
  UNION ALL SELECT 2, 'employees', id, to_jsonb(x) FROM employees x
  UNION ALL SELECT 3, 'app_settings', 0, to_jsonb(x) FROM app_settings x
  UNION ALL SELECT 4, 'shifts', id, to_jsonb(x) FROM shifts x
  UNION ALL SELECT 5, 'rejected_clock_outs', id, to_jsonb(x) FROM rejected_clock_outs x
  UNION ALL SELECT 6, 'manager_force_clockouts', id, to_jsonb(x) FROM manager_force_clockouts x
  UNION ALL SELECT 7, 'audit_logs', id, to_jsonb(x) FROM audit_logs x
  UNION ALL SELECT 8, 'auth_attempts', id, to_jsonb(x) FROM auth_attempts x
  UNION ALL SELECT 9, 'pin_reset_requests', id, to_jsonb(x) FROM pin_reset_requests x
  UNION ALL SELECT 10, 'retention_runs', id, to_jsonb(x) FROM retention_runs x
  UNION ALL SELECT 11, 'employee_sessions', 0, to_jsonb(x) FROM employee_sessions x
), stmts AS (
  SELECT s.o, s.k, s.t,
    (CASE WHEN s.t='app_settings' THEN 'INSERT OR REPLACE INTO ' ELSE 'INSERT INTO ' END) || s.t || '(' ||
    string_agg(e.key, ',' ORDER BY e.key) || ') VALUES(' ||
    string_agg(CASE jsonb_typeof(e.value)
      WHEN 'null' THEN 'NULL'
      WHEN 'boolean' THEN CASE WHEN e.value::text='true' THEN '1' ELSE '0' END
      WHEN 'number' THEN e.value::text
      WHEN 'string' THEN CASE WHEN (e.value#>>'{}') ~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?[+-]\d\d:\d\d$'
        THEN '''' || to_char((e.value#>>'{}')::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || ''''
        ELSE '''' || replace(e.value#>>'{}', '''', '''''') || '''' END
      ELSE '''' || replace(e.value::text, '''', '''''') || '''' END, ',' ORDER BY e.key) || ');' AS q
  FROM src s, jsonb_each(s.j) e
  GROUP BY s.o, s.k, s.t, s.j
), seqs AS (
  SELECT 99 o, 0::bigint k, 'seq' t, 'DELETE FROM sqlite_sequence; INSERT INTO sqlite_sequence(name,seq) VALUES' || string_agg(format('(%L,%s)', n, v), ',') || ';' q
  FROM (
    SELECT 'manager_users' n, (SELECT CASE WHEN is_called THEN last_value ELSE last_value-1 END FROM manager_users_id_seq) v
    UNION ALL SELECT 'employees', (SELECT CASE WHEN is_called THEN last_value ELSE last_value-1 END FROM employees_id_seq)
    UNION ALL SELECT 'shifts', (SELECT CASE WHEN is_called THEN last_value ELSE last_value-1 END FROM shifts_id_seq)
    UNION ALL SELECT 'rejected_clock_outs', (SELECT CASE WHEN is_called THEN last_value ELSE last_value-1 END FROM rejected_clock_outs_id_seq)
    UNION ALL SELECT 'manager_force_clockouts', (SELECT CASE WHEN is_called THEN last_value ELSE last_value-1 END FROM manager_force_clockouts_id_seq)
    UNION ALL SELECT 'audit_logs', (SELECT CASE WHEN is_called THEN last_value ELSE last_value-1 END FROM audit_logs_id_seq)
    UNION ALL SELECT 'auth_attempts', (SELECT CASE WHEN is_called THEN last_value ELSE last_value-1 END FROM auth_attempts_id_seq)
    UNION ALL SELECT 'pin_reset_requests', (SELECT CASE WHEN is_called THEN last_value ELSE last_value-1 END FROM pin_reset_requests_id_seq)
    UNION ALL SELECT 'retention_runs', (SELECT CASE WHEN is_called THEN last_value ELSE last_value-1 END FROM retention_runs_id_seq)
  ) z WHERE v > 0
), allq AS (
  SELECT o, k, q FROM stmts UNION ALL SELECT o, k, q FROM seqs
), numbered AS (
  SELECT o, k, q, sum(length(q)) OVER (ORDER BY o, k, q ROWS UNBOUNDED PRECEDING) run FROM allq
)
SELECT (run / 45000)::int AS chunk, count(*) AS stmts, sum(length(q)) AS bytes,
       string_agg(q, ' ' ORDER BY o, k, q) AS sql
FROM numbered GROUP BY 1 ORDER BY 1
