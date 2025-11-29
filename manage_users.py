import json
import os
import sys
from passlib.context import CryptContext

DB_FILE = "wx_data.json"
# [关键修改] 使用 pbkdf2_sha256
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
    print(f"正在创建用户: [{username}]")
    print(f"密码长度: {len(password)}") 
    
    db = load_db()
    if username in db["users"]:
        print(f"❌ 用户 '{username}' 已存在！")
        return

    try:
        hashed_pw = pwd_context.hash(password)
    except Exception as e:
        print(f"❌ 密码加密失败: {e}")
        return

    db["users"][username] = {
        "hash": hashed_pw, # 修正了这里的变量名
        "quota": int(quota),
        "role": "user"
    }
    save_db(db)
    print(f"✅ 用户创建成功: {username} (配额: {quota})")

def update_quota(username, quota):
    db = load_db()
    if username not in db["users"]:
        print(f"❌ 用户 '{username}' 不存在")
        return
    
    db["users"][username]["quota"] = int(quota)
    save_db(db)
    print(f"✅ 用户 {username} 配额已更新为: {quota}")

def list_users():
    db = load_db()
    print("\n--- 用户列表 ---")
    if not db["users"]:
        print("(暂无用户)")
    for user, data in db["users"].items():
        print(f"用户: {user: <15} | 配额: {data['quota']}")
    print("----------------\n")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("\n🛠️  WX Studio 用户管理工具")
        print("用法:")
        print("  python manage_users.py add <用户名> <密码> <次数>")
        print("  python manage_users.py quota <用户名> <新次数>")
        print("  python manage_users.py list")
        sys.exit(1)

    action = sys.argv[1]
    
    if action == "add" and len(sys.argv) == 5:
        add_user(sys.argv[2], sys.argv[3], sys.argv[4])
    elif action == "quota" and len(sys.argv) == 4:
        update_quota(sys.argv[2], sys.argv[3])
    elif action == "list":
        list_users()
    else:
        print("❌ 参数错误")