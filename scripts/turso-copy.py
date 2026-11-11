#!/usr/bin/env python3
"""Salin SELURUH data Mage LMS dari satu database Turso ke database lain.

Hanya butuh Python 3 bawaan macOS (tanpa Node, tanpa Turso CLI). Bicara langsung ke
HTTP API Turso, jadi tipe data (integer/teks/null/blob) tersalin persis.

  1) Dump database lama → file JSON (skema + semua baris):
       python3 -I scripts/turso-copy.py dump --env .env.local
  2) Tulis dump ke database baru (kredensial di .env.target):
       python3 -I scripts/turso-copy.py restore backups/<file>.json --env .env.target
     Tambah --wipe kalau database tujuan sudah berisi data dan memang boleh ditimpa.

Restore berjalan dalam SATU transaksi: kalau ada yang gagal, database tujuan tidak
berubah. Setelah itu jumlah baris tiap tabel dicocokkan dengan dump.
Target `file:nama.db` (SQLite lokal) juga didukung — berguna untuk uji coba.
"""
import argparse, base64, datetime, json, os, re, sqlite3, sys, urllib.error, urllib.request

SKIP = re.compile(r'^(sqlite_|libsql_|_litestream)')


def die(msg):
    print('✗ ' + msg, file=sys.stderr)
    sys.exit(1)


def read_env(path):
    if not os.path.exists(path):
        die('File env tidak ditemukan: ' + path)
    env = dict(re.findall(r'^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?\s*$', open(path).read(), re.M))
    if not env.get('TURSO_DATABASE_URL'):
        die('TURSO_DATABASE_URL kosong di ' + path)
    return env['TURSO_DATABASE_URL'].strip(), env.get('TURSO_AUTH_TOKEN', '').strip()


def db_label(url):
    return re.sub(r'^libsql://|^https://', '', url).split('.')[0]


# ---------- koneksi ----------
class Turso:
    def __init__(self, url, token):
        self.url = re.sub(r'^libsql://', 'https://', url).rstrip('/') + '/v2/pipeline'
        self.token = token

    def _post(self, requests):
        body = json.dumps({'requests': requests + [{'type': 'close'}]}).encode()
        req = urllib.request.Request(self.url, data=body, headers={
            'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'})
        try:
            res = json.load(urllib.request.urlopen(req, timeout=120))
        except urllib.error.HTTPError as e:
            die('Turso HTTP %s: %s' % (e.code, e.read().decode()[:300]))
        except urllib.error.URLError as e:
            die('Tidak bisa menghubungi Turso: %s' % e.reason)
        out = []
        for r in res['results'][:-1]:
            if r['type'] == 'error':
                die('Query gagal: ' + r['error']['message'])
            out.append(r['response'])
        return out

    def query(self, sql):
        r = self._post([{'type': 'execute', 'stmt': {'sql': sql}}])[0]['result']
        return [c['name'] for c in r['cols']], r['rows']  # nilai tetap dalam format bertipe Hrana

    def run_atomic(self, stmts):
        """BEGIN → semua stmt (tiap langkah hanya jalan kalau sebelumnya OK) → COMMIT, atau ROLLBACK."""
        steps = [{'stmt': {'sql': 'BEGIN'}}]
        for s in stmts:
            steps.append({'stmt': s, 'condition': {'type': 'ok', 'step': len(steps) - 1}})
        steps.append({'stmt': {'sql': 'COMMIT'}, 'condition': {'type': 'ok', 'step': len(steps) - 1}})
        commit = len(steps) - 1
        steps.append({'stmt': {'sql': 'ROLLBACK'}, 'condition': {'type': 'not', 'cond': {'type': 'ok', 'step': commit}}})
        res = self._post([{'type': 'batch', 'batch': {'steps': steps}}])[0]['result']
        errs = [(i, e) for i, e in enumerate(res['step_errors']) if e]
        if errs or res['step_results'][commit] is None:
            i, e = errs[0] if errs else (commit, {'message': 'COMMIT tidak jalan'})
            sql = steps[i]['stmt']['sql']
            die('Restore dibatalkan, database tujuan TIDAK berubah. Gagal di: %s… → %s' % (sql[:80], e['message']))


def py_value(v):
    t = v['type']
    if t == 'null': return None
    if t == 'integer': return int(v['value'])
    if t == 'float': return float(v['value'])
    if t == 'blob': return base64.b64decode(v.get('base64', ''))
    return v['value']


class LocalFile:
    """Target SQLite lokal (file:xxx.db) untuk uji coba restore."""
    def __init__(self, url):
        self.con = sqlite3.connect(url[5:], isolation_level=None)

    def query(self, sql):
        cur = self.con.execute(sql)
        cols = [d[0] for d in cur.description]
        def wrap(x):
            if x is None: return {'type': 'null'}
            if isinstance(x, int): return {'type': 'integer', 'value': str(x)}
            if isinstance(x, float): return {'type': 'float', 'value': x}
            if isinstance(x, bytes): return {'type': 'blob', 'base64': base64.b64encode(x).decode()}
            return {'type': 'text', 'value': x}
        return cols, [[wrap(x) for x in row] for row in cur.fetchall()]

    def run_atomic(self, stmts):
        try:
            self.con.execute('BEGIN')
            for s in stmts:
                self.con.execute(s['sql'], [py_value(a) for a in s.get('args', [])])
            self.con.execute('COMMIT')
        except sqlite3.Error as e:
            self.con.execute('ROLLBACK')
            die('Restore dibatalkan, database tujuan TIDAK berubah: %s' % e)


def connect(env_path):
    url, token = read_env(env_path)
    return (LocalFile(url) if url.startswith('file:') else Turso(url, token)), url


def schema_objects(db):
    _, rows = db.query("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid")
    objs = [dict(zip(('type', 'name', 'table', 'sql'), [py_value(v) for v in r])) for r in rows]
    return [o for o in objs if not SKIP.match(o['name']) and not SKIP.match(o['table'])]


def q(name):
    return '"' + name.replace('"', '""') + '"'


def count(db, table):
    return int(py_value(db.query('SELECT COUNT(*) FROM ' + q(table))[1][0][0]))


# ---------- perintah ----------
def cmd_dump(a):
    db, url = connect(a.env)
    schema = schema_objects(db)
    tables = []
    for o in [o for o in schema if o['type'] == 'table']:
        cols, rows = db.query('SELECT * FROM ' + q(o['name']))
        tables.append({'name': o['name'], 'columns': cols, 'rows': rows})
        print('  %-20s %6d baris' % (o['name'], len(rows)))
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    out = a.out or os.path.join('backups', '%s-%s.json' % (db_label(url), stamp))
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)  # berisi data pribadi & hash password
    with os.fdopen(fd, 'w') as f:
        json.dump({'format': 'mage-lms-dump/1', 'source': db_label(url), 'created_at': stamp,
                   'schema': schema, 'tables': tables}, f)
    print('✓ Dump %s → %s (%d tabel, %d baris)' % (db_label(url), out, len(tables), sum(len(t['rows']) for t in tables)))


def cmd_restore(a):
    dump = json.load(open(a.dump))
    if dump.get('format') != 'mage-lms-dump/1':
        die('Bukan file dump mage-lms: ' + a.dump)
    db, url = connect(a.env)
    if db_label(url) == dump['source'] and not url.startswith('file:'):
        die('Database tujuan sama dengan sumber dump (%s). Cek --env.' % dump['source'])
    print('Tujuan: %s  ←  dump dari %s (%s)' % (db_label(url), dump['source'], dump['created_at']))

    existing = {o['name'] for o in schema_objects(db)}
    stmts = []
    # 1) Skema: buat tabel/index yang belum ada (tabel dari db:migrate dibiarkan).
    for o in dump['schema']:
        if o['name'] not in existing:
            stmts.append({'sql': o['sql']})
    # 2) Database tujuan harus kosong, kecuali --wipe.
    names = [t['name'] for t in dump['tables']]
    filled = {n: count(db, n) for n in names if n in existing}
    filled = {n: c for n, c in filled.items() if c}
    if filled and not a.wipe:
        die('Database tujuan sudah berisi data: %s. Pakai --wipe untuk menghapus lalu menimpa.' %
            ', '.join('%s=%d' % kv for kv in filled.items()))
    if a.wipe:
        stmts += [{'sql': 'DELETE FROM ' + q(n)} for n in reversed(names) if n in existing]
    # 3) Data, urutan tabel sama dengan urutan pembuatan (aman untuk foreign key).
    for t in dump['tables']:
        cols = t['columns']
        per = max(1, min(200, 30000 // max(1, len(cols))))
        head = 'INSERT INTO %s (%s) VALUES ' % (q(t['name']), ', '.join(q(c) for c in cols))
        row_ph = '(' + ', '.join('?' * len(cols)) + ')'
        for i in range(0, len(t['rows']), per):
            chunk = t['rows'][i:i + per]
            stmts.append({'sql': head + ', '.join([row_ph] * len(chunk)), 'args': [v for r in chunk for v in r]})

    if a.dry_run:
        print('Dry run: %d statement siap, tidak ada yang ditulis.' % len(stmts))
        return
    db.run_atomic(stmts)

    # 4) Verifikasi jumlah baris.
    bad = []
    for t in dump['tables']:
        got = count(db, t['name'])
        print('  %-20s %6d / %6d %s' % (t['name'], got, len(t['rows']), '✓' if got == len(t['rows']) else '✗'))
        if got != len(t['rows']):
            bad.append(t['name'])
    if bad:
        die('Jumlah baris tidak cocok: ' + ', '.join(bad))
    print('✓ Restore selesai ke %s' % db_label(url))


p = argparse.ArgumentParser(description='Dump/restore database Mage LMS (Turso).')
sub = p.add_subparsers(dest='cmd', required=True)
d = sub.add_parser('dump', help='database (dari --env) → file JSON')
d.add_argument('--env', default='.env.local')
d.add_argument('--out')
d.set_defaults(fn=cmd_dump)
r = sub.add_parser('restore', help='file JSON → database (dari --env)')
r.add_argument('dump')
r.add_argument('--env', default='.env.target')
r.add_argument('--wipe', action='store_true', help='hapus data yang ada di database tujuan dulu')
r.add_argument('--dry-run', action='store_true')
r.set_defaults(fn=cmd_restore)
args = p.parse_args()
args.fn(args)
