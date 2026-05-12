"""压测 save_db 的吞吐，验证 100 并发 OK

用法：
    cd backend
    python3 bench_save_db.py

跑完自动清理 tmp 目录；不修改真实 wx_data.json。
"""
import os, sys, time, threading, shutil, json, tempfile

# 把真实 wx_data.json 拷一份当测试样本
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(BACKEND_DIR, "wx_data.json")
workdir = tempfile.mkdtemp(prefix="dbbench_")
target = os.path.join(workdir, "wx_data.json")
shutil.copy(src, target)

# 原子写 + 节流备份（与 main.py 中实现保持一致）
BACKUP_MIN_INTERVAL = 30.0
_last_backup_ts = 0.0
db_lock = threading.Lock()


def _atomic_write_json(path, data):
    tmp = f"{path}.tmp.{os.getpid()}.{threading.get_ident()}"
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush()
        try:
            os.fsync(f.fileno())
        except OSError:
            pass
    os.replace(tmp, path)


def save_db(data):
    global _last_backup_ts
    now = time.time()
    if os.path.exists(target) and (now - _last_backup_ts) >= BACKUP_MIN_INTERVAL:
        try:
            shutil.copy(target, f"{target}.bak")
            _last_backup_ts = now
        except Exception:
            pass
    _atomic_write_json(target, data)


def load_db():
    with open(target) as f:
        return json.load(f)


def worker(n):
    for _ in range(n):
        with db_lock:
            db = load_db()
            user = db.setdefault("users", {}).setdefault("testuser", {"quota": 1_000_000})
            user["quota"] -= 1
            save_db(db)


def run(threads, ops_per_thread):
    ts = []
    start = time.time()
    for _ in range(threads):
        t = threading.Thread(target=worker, args=(ops_per_thread,))
        t.start()
        ts.append(t)
    for t in ts:
        t.join()
    dur = time.time() - start
    total = threads * ops_per_thread
    print(f"threads={threads:>4}  ops/thread={ops_per_thread:>4}  total={total:>5}  "
          f"time={dur:>5.2f}s  rate={total/dur:>6.0f} ops/s  "
          f"latency={dur*1000/total:>5.2f} ms/op")


print(f"workdir    = {workdir}")
print(f"file size  = {os.path.getsize(target)} bytes")
print()
run(10, 50)
run(100, 20)
run(200, 10)
shutil.rmtree(workdir, ignore_errors=True)
