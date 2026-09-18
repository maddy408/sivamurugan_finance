#!/usr/bin/env python3
"""
Automated Remote Deployment Script for Siva Murugan Finance
Targets: Dev and Prod environments on remote server (45.199.139.18)
"""

import sys
import os
import tarfile
import tempfile
import argparse
import paramiko

# Server Credentials
SSH_HOST = "45.199.139.18"
SSH_PORT = 22
SSH_USER = "ajagency1"
SSH_PASS = "jI3!ziZ&fRc8"

REPO_URL = "https://github.com/pavieswar2025/sivamurugan-finance.git"
REPO_BRANCH = "backend"

BASE_DIR = "/var/www/6e8e3914-aa89-4bf4-80a7-3fdbd9b757a9"
REPO_DIR = f"{BASE_DIR}/sivamurugan-repo"

ENV_CONFIGS = {
    "dev": {
        "frontend_dir": f"{BASE_DIR}/dev-sivamurugan-fin.qynova.in",
        "api_dir": f"{BASE_DIR}/devapi-sivamurugan-fin.qynova.in",
        "frontend_domain": "https://dev-sivamurugan-fin.qynova.in",
        "api_domain": "https://devapi-sivamurugan-fin.qynova.in",
        "db_name": "ajagency1_siva_murugan_dev_db",
        "db_user": "ajagency1_siva_murugan_dev_db",
        "db_pass": "q!OJFJr60wfK",
        "app_env": "development",
        "app_debug": "true",
    },
    "prod": {
        "frontend_dir": f"{BASE_DIR}/sivamurugan-fin.qynova.in",
        "api_dir": f"{BASE_DIR}/api-sivamurugan-fin.qynova.in",
        "frontend_domain": "https://sivamurugan-fin.qynova.in",
        "api_domain": "https://api-sivamurugan-fin.qynova.in",
        "db_name": "ajagency1_siva_murugan_prod_db",
        "db_user": "ajagency1_siva_murugan_prod_db",
        "db_pass": "!#o7s#UxXos4",
        "app_env": "production",
        "app_debug": "false",
    }
}

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def run_ssh_command(client, cmd, ignore_error=False):
    print(f"--> Executing: {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    if out.strip():
        try:
            print(out.strip())
        except UnicodeEncodeError:
            print(out.strip().encode('ascii', errors='replace').decode('ascii'))
    if err.strip():
        try:
            print(f"[STDERR] {err.strip()}")
        except UnicodeEncodeError:
            print(f"[STDERR] {err.strip().encode('ascii', errors='replace').decode('ascii')}")
    exit_code = stdout.channel.recv_exit_status()
    if exit_code != 0 and not ignore_error:
        print(f"Error executing command: {cmd} (Exit Code: {exit_code})")
        sys.exit(exit_code)
    return out.strip()

def sync_repository(client):
    print("\n==========================================")
    print("STEP 1: Syncing Codebase to Remote Server via SFTP")
    print("==========================================")
    
    local_root = os.path.dirname(os.path.abspath(__file__))
    tar_path = os.path.join(tempfile.gettempdir(), "sivamurugan_deploy.tar.gz")
    if os.path.exists(tar_path):
        os.remove(tar_path)
        
    print("Packing local codebase...")
    ignore_dirs = {'.git', 'node_modules', '.env', 'dist', 'web', 'scratch', '__pycache__'}
    
    with tarfile.open(tar_path, "w:gz") as tar:
        for root, dirs, files in os.walk(local_root):
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            for file in files:
                if file.endswith('.pyc') or file.endswith('.tar.gz'):
                    continue
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, local_root)
                tar.add(full_path, arcname=rel_path)

    print(f"Archive created: {tar_path} ({os.path.getsize(tar_path)} bytes)")

    print(f"Uploading archive to remote {REPO_DIR}...")
    run_ssh_command(client, f"mkdir -p {REPO_DIR}")
    
    sftp = client.open_sftp()
    remote_tar = f"{REPO_DIR}/codebase.tar.gz"
    sftp.put(tar_path, remote_tar)
    sftp.close()
    
    if os.path.exists(tar_path):
        os.remove(tar_path)

    print("Extracting codebase archive on remote server...")
    run_ssh_command(client, f"tar -xzf {remote_tar} -C {REPO_DIR} && rm -f {remote_tar}")
    print("Codebase sync complete.")

def deploy_environment(client, target_env):
    cfg = ENV_CONFIGS[target_env]
    print("\n==========================================")
    print(f"DEPLOYING ENVIRONMENT: {target_env.upper()}")
    print("==========================================")

    # 1. Backend Setup
    print(f"\n--- 1. Setting up Backend for {target_env.upper()} ({cfg['api_dir']}) ---")
    run_ssh_command(client, f"mkdir -p {cfg['api_dir']}")
    run_ssh_command(client, f"rsync -av --delete --exclude='.env' --exclude='public' {REPO_DIR}/backend/ {cfg['api_dir']}/")
    run_ssh_command(client, f"rsync -av {REPO_DIR}/database {cfg['api_dir']}/")

    # Create backend .env
    env_content = f"""APP_ENV={cfg['app_env']}
APP_URL={cfg['api_domain']}
APP_DEBUG={cfg['app_debug']}
TIMEZONE=Asia/Kolkata

DB_HOST=localhost
DB_PORT=3306
DB_DATABASE={cfg['db_name']}
DB_USERNAME={cfg['db_user']}
DB_PASSWORD={cfg['db_pass']}

CORS_ALLOWED_ORIGINS={cfg['frontend_domain']}
TOKEN_TTL_HOURS=12
"""
    create_env_cmd = f"cat << 'EOF' > {cfg['api_dir']}/.env\n{env_content}\nEOF"
    run_ssh_command(client, create_env_cmd)

    # Create backend index.php
    index_php_content = """<?php
declare(strict_types=1);

use App\\Core\\App;
use App\\Core\\HttpException;
use App\\Core\\Request;
use App\\Core\\Response;
use App\\Core\\Router;

$backendDir = __DIR__;
require_once $backendDir . '/src/Core/App.php';
App::boot($backendDir);

$request = new Request();
App::applyCors($request);

set_error_handler(function ($severity, $message, $file, $line) {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});

$router = new Router();
require $backendDir . '/routes.php';

try {
    $router->dispatch($request);
} catch (HttpException $e) {
    Response::error($e->status, $e->getMessage(), $e->errorCode, $e->meta);
} catch (\\Throwable $e) {
    $debug = App::debug();
    error_log('[api] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    Response::error(
        500,
        $debug ? $e->getMessage() : 'An unexpected error occurred',
        'SERVER_ERROR',
        $debug ? ['trace' => explode("\\n", $e->getTraceAsString())] : []
    );
}
"""
    create_index_cmd = f"cat << 'EOF' > {cfg['api_dir']}/index.php\n{index_php_content}\nEOF"
    run_ssh_command(client, create_index_cmd)

    # Create backend .htaccess
    backend_htaccess = """<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^(.*)$ index.php [QSA,L]
</IfModule>

<IfModule mod_headers.c>
  SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1
</IfModule>
"""
    create_htaccess_cmd = f"cat << 'EOF' > {cfg['api_dir']}/.htaccess\n{backend_htaccess}\nEOF"
    run_ssh_command(client, create_htaccess_cmd)

    # 2. Database Initialization & User Seeding
    print(f"\n--- 2. Installing Composer Dependencies, Initializing Database & Seeding 5 Users for {target_env.upper()} ---")
    run_ssh_command(client, f"cd {cfg['api_dir']} && composer install --no-dev --optimize-autoloader")
    run_ssh_command(client, f"cd {cfg['api_dir']} && php setup.php install")
    run_ssh_command(client, f"cd {cfg['api_dir']} && php setup.php migrate-all")
    run_ssh_command(client, f"cd {cfg['api_dir']} && php setup.php seed-users {target_env}")

    # 3. Frontend Build & Deploy
    print(f"\n--- 3. Building & Deploying Frontend for {target_env.upper()} ({cfg['frontend_dir']}) ---")
    build_cmd = f"source ~/.nvm/nvm.sh && cd {REPO_DIR}/frontend && npm install && VITE_API_BASE_URL='{cfg['api_domain']}' npm run build"
    run_ssh_command(client, build_cmd)

    # Sync web/ to target frontend directory
    run_ssh_command(client, f"mkdir -p {cfg['frontend_dir']}")
    run_ssh_command(client, f"rsync -av --delete {REPO_DIR}/web/ {cfg['frontend_dir']}/")

    # Ensure frontend .htaccess for SPA routing
    frontend_htaccess = """<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
"""
    create_fe_htaccess = f"cat << 'EOF' > {cfg['frontend_dir']}/.htaccess\n{frontend_htaccess}\nEOF"
    run_ssh_command(client, create_fe_htaccess)

    print(f"\nSUCCESS: Environment {target_env.upper()} deployed successfully!")
    print(f"  Frontend: {cfg['frontend_domain']}")
    print(f"  API:      {cfg['api_domain']}")

def main():
    parser = argparse.ArgumentParser(description="Deploy Siva Murugan Finance Application")
    parser.add_argument("--env", choices=["dev", "prod", "all"], default="all", help="Target environment to deploy (dev, prod, or all)")
    args = parser.parse_args()

    print("Connecting to SSH server:", SSH_HOST)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        client.connect(SSH_HOST, port=SSH_PORT, username=SSH_USER, password=SSH_PASS, timeout=15)
        print("SSH Connection established.")

        sync_repository(client)

        if args.env in ["dev", "all"]:
            deploy_environment(client, "dev")

        if args.env in ["prod", "all"]:
            deploy_environment(client, "prod")

        print("\n==========================================")
        print("ALL DEPLOYMENT STEPS COMPLETED SUCCESSFULLY!")
        print("==========================================")

    except Exception as e:
        print("Deployment Failed with exception:", str(e))
        sys.exit(1)
    finally:
        client.close()

if __name__ == "__main__":
    main()
