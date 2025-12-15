import json
import os
import sys
from passlib.context import CryptContext

DB_FILE = "backend/wx_data.json"
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

def load_db():
    if not os.path.exists(DB_FILE):
        return {"users": {}, "history": {}}
    try:
        with open(DB_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return {"users": {}, "history": {}}

def save_db(data):
    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def add_user(username, password, quota):
    db = load_db()
    if username in db["users"]:
        print(f"❌ 用户 '{username}' 已存在！请使用 passwd 命令重置密码。")
        return

    try:
        hashed_pw = pwd_context.hash(password)
        db["users"][username] = {
            "hash": hashed_pw,
            "quota": int(quota),
            "role": "user"
        }
        save_db(db)
        print(f"✅ 用户创建成功: {username} (配额: {quota})")
    except Exception as e:
        print(f"❌ 创建失败: {e}")

def update_quota(username, quota):
    db = load_db()
    if username not in db["users"]:
        print(f"❌ 用户 '{username}' 不存在")
        return
    
    db["users"][username]["quota"] = int(quota)
    save_db(db)
    print(f"✅ 用户 {username} 配额已更新为: {quota}")

# [新增] 重置密码功能
def reset_password(username, new_password):
    db = load_db()
    if username not in db["users"]:
        print(f"❌ 用户 '{username}' 不存在")
        return
    
    try:
        hashed_pw = pwd_context.hash(new_password)
        db["users"][username]["hash"] = hashed_pw
        save_db(db)
        print(f"✅ 用户 {username} 的密码已成功重置！")
    except Exception as e:
        print(f"❌ 重置失败: {e}")

def list_users():
    db = load_db()
    print("\n--- 用户列表 ---")
    if not db.get("users"):
        print("(暂无用户)")
    else:
        print(f"{'用户名':<15} | {'配额':<10} | {'角色'}")
        print("-" * 35)
        for user, data in db["users"].items():
            role = data.get('role', 'user')
            print(f"{user:<15} | {data['quota']:<10} | {role}")
    print("-" * 35 + "\n")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("\n🛠️  WX Studio 用户管理工具")
        print("用法:")
        print("  python3 manage_users.py list")
        print("  python3 manage_users.py add <用户名> <密码> <次数>")
        print("  python3 manage_users.py quota <用户名> <新次数>")
        print("  python3 manage_users.py passwd <用户名> <新密码>  <-- 重置密码用这个")
        sys.exit(1)

    action = sys.argv[1]
    
    if action == "add" and len(sys.argv) == 5:
        add_user(sys.argv[2], sys.argv[3], sys.argv[4])
    elif action == "quota" and len(sys.argv) == 4:
        update_quota(sys.argv[2], sys.argv[3])
    elif action == "passwd" and len(sys.argv) == 4:
        reset_password(sys.argv[2], sys.argv[3])
    elif action == "list":
        list_users()
    else:
        print("❌ 参数错误")