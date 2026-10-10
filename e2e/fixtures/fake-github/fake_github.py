#!/usr/bin/env python3
"""A minimal GitHub (REST API + the ReqsAI GitHub App) for local end-to-end tests of the code-aware copilot.

Serves every folder under repos/<owner>/<name> as a repository on branch "main". A folder holding a
.fake-private file is private: only the token of installation 1001 (account "acme") reads it.

REST API:
  GET  /repos/{owner}/{name}                 metadata (default_branch, html_url, private)
  GET  /repos/{owner}/{name}/commits/{ref}   the head sha (Accept: application/vnd.github.sha)
  GET  /repos/{owner}/{name}/zipball/{ref}   302 to /codeload/... like GitHub
  GET  /codeload/{owner}/{name}/{ref}.zip    the zipball, built from the folder on each request
GitHub App:
  GET  /apps/{slug}/installations/new?state=  "installs" on acme and redirects to the setup URL with
                                              installation_id, setup_action, state and an OAuth code
  POST /login/oauth/access_token              exchanges that code for a user token
  GET  /user/installations                    the installations that user can access
  GET  /app/installations/1001                the installation (needs the App's JWT)
  POST /app/installations/1001/access_tokens  an installation token (needs the App's JWT)
  GET  /installation/repositories             what the installation shares (every repository of acme)
Test hook:
  POST /_fake/push/{owner}/{name}             {"files": {path: content}} overlays files (a new commit)
                                              and sends the signed push webhook to the API

The commit sha is a hash of the files, so a push is a new commit. JWT signatures are not verified here
(the API's integration tests do that); the JWT must only be well formed and issued for the client id.
Run: python3 fake_github.py [port] (default 4545). Settings, with their defaults:
  FAKE_GITHUB_CLIENT_ID=Iv1.reqsai-e2e  FAKE_GITHUB_CLIENT_SECRET=e2e-client-secret
  FAKE_GITHUB_WEBHOOK_SECRET=e2e-webhook-secret
  FAKE_GITHUB_SETUP_URL=http://localhost:4200/settings/integrations/github/callback
  FAKE_GITHUB_WEBHOOK_URL=http://127.0.0.1:8080/api/code/webhooks/github
"""
import base64
import hashlib
import hmac
import io
import json
import os
import sys
import threading
import time
import urllib.parse
import urllib.request
import uuid
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "repos")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4545
CLIENT_ID = os.environ.get("FAKE_GITHUB_CLIENT_ID", "Iv1.reqsai-e2e")
CLIENT_SECRET = os.environ.get("FAKE_GITHUB_CLIENT_SECRET", "e2e-client-secret")
WEBHOOK_SECRET = os.environ.get("FAKE_GITHUB_WEBHOOK_SECRET", "e2e-webhook-secret")
SETUP_URL = os.environ.get("FAKE_GITHUB_SETUP_URL", "http://localhost:4200/settings/integrations/github/callback")
WEBHOOK_URL = os.environ.get("FAKE_GITHUB_WEBHOOK_URL", "http://127.0.0.1:8080/api/code/webhooks/github")
INSTALLATION_ID = 1001
INSTALLATION_ACCOUNT = "acme"
INSTALLATION_TOKEN = "ghs_fake%d" % INSTALLATION_ID
OVERLAYS = {}
LOCK = threading.Lock()


def repo_dir(owner, name):
    path = os.path.join(ROOT, owner.lower(), name.lower())
    return path if os.path.isdir(path) else None


def is_private(path):
    return os.path.isfile(os.path.join(path, ".fake-private"))


def files_of(path):
    """(relative path, bytes) of the repository's files, with the pushed overlay applied."""
    out = {}
    for base, _, names in os.walk(path):
        for n in sorted(names):
            if n == ".fake-private":
                continue
            full = os.path.join(base, n)
            with open(full, "rb") as f:
                out[os.path.relpath(full, path).replace(os.sep, "/")] = f.read()
    with LOCK:
        out.update(OVERLAYS.get(path, {}))
    return sorted(out.items())


def sha_of(path):
    digest = hashlib.sha1()
    for rel, content in files_of(path):
        digest.update(rel.encode())
        digest.update(content)
    return digest.hexdigest()


def acme_repositories():
    base = os.path.join(ROOT, INSTALLATION_ACCOUNT)
    return sorted(n for n in os.listdir(base) if os.path.isdir(os.path.join(base, n))) if os.path.isdir(base) else []


def jwt_issuer(auth):
    """The iss of a well-formed Bearer JWT, else None (the signature is not checked here)."""
    if not auth or not auth.startswith("Bearer "):
        return None
    parts = auth[len("Bearer "):].split(".")
    if len(parts) != 3:
        return None
    try:
        payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)))
    except ValueError:
        return None
    return payload.get("iss") if payload.get("exp", 0) > time.time() else None


def send_push_webhook(owner, name, sha):
    body = json.dumps({
        "ref": "refs/heads/main", "after": sha, "deleted": False,
        "repository": {"name": name, "owner": {"login": owner, "name": owner}, "full_name": owner + "/" + name},
        "installation": {"id": INSTALLATION_ID},
    }).encode()
    signature = "sha256=" + hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
    request = urllib.request.Request(WEBHOOK_URL, data=body, method="POST", headers={
        "Content-Type": "application/json", "X-GitHub-Event": "push",
        "X-GitHub-Delivery": str(uuid.uuid4()), "X-Hub-Signature-256": signature, "User-Agent": "GitHub-Hookshot/fake",
    })
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.status


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("fake-github: " + (fmt % args) + "\n")

    def send(self, status, body=b"", content_type="application/json", headers=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def json(self, status, value):
        self.send(status, json.dumps(value).encode())

    def body(self):
        length = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(length) if length else b""

    def host(self):
        return "http://127.0.0.1:%d" % PORT

    def do_POST(self):
        path = self.path.split("?")[0].strip("/")
        parts = path.split("/")
        auth = self.headers.get("Authorization")
        if path == "login/oauth/access_token":
            data = json.loads(self.body() or b"{}")
            code = data.get("code", "")
            if data.get("client_id") == CLIENT_ID and data.get("client_secret") == CLIENT_SECRET \
                    and code.startswith("fake-code-"):
                return self.json(200, {"access_token": "ghu_" + code, "token_type": "bearer"})
            return self.json(200, {"error": "bad_verification_code"})
        if len(parts) == 4 and parts[:2] == ["app", "installations"] and parts[3] == "access_tokens":
            if jwt_issuer(auth) != CLIENT_ID:
                return self.json(401, {"message": "A JSON web token could not be decoded"})
            if parts[2] != str(INSTALLATION_ID):
                return self.json(404, {"message": "Not Found"})
            expires = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 3600))
            return self.json(201, {"token": INSTALLATION_TOKEN, "expires_at": expires})
        if len(parts) == 4 and parts[:2] == ["_fake", "push"]:
            repo = repo_dir(parts[2], parts[3])
            if not repo:
                return self.json(404, {"message": "Not Found"})
            files = json.loads(self.body() or b"{}").get("files", {})
            with LOCK:
                OVERLAYS.setdefault(repo, {}).update({k: v.encode() for k, v in files.items()})
            sha = sha_of(repo)
            status = send_push_webhook(parts[2], parts[3], sha)
            return self.json(200, {"sha": sha, "webhook": status})
        return self.json(404, {"message": "Not Found"})

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        parts = url.path.strip("/").split("/")
        query = urllib.parse.parse_qs(url.query)
        auth = self.headers.get("Authorization")
        host = self.host()
        if len(parts) == 4 and parts[0] == "apps" and parts[2:] == ["installations", "new"]:
            redirect = "%s?%s" % (SETUP_URL, urllib.parse.urlencode({
                "installation_id": INSTALLATION_ID, "setup_action": "install",
                "state": query.get("state", [""])[0], "code": "fake-code-%d" % INSTALLATION_ID,
            }))
            return self.send(302, b"", headers={"Location": redirect})
        if url.path == "/user/installations":
            if not (auth or "").startswith("Bearer ghu_fake-code-"):
                return self.json(401, {"message": "Bad credentials"})
            return self.json(200, {"total_count": 1, "installations": [
                {"id": INSTALLATION_ID, "account": {"login": INSTALLATION_ACCOUNT}}]})
        if len(parts) == 3 and parts[:2] == ["app", "installations"]:
            if jwt_issuer(auth) != CLIENT_ID:
                return self.json(401, {"message": "A JSON web token could not be decoded"})
            if parts[2] != str(INSTALLATION_ID):
                return self.json(404, {"message": "Not Found"})
            return self.json(200, {
                "id": INSTALLATION_ID, "account": {"login": INSTALLATION_ACCOUNT, "type": "Organization"},
                "repository_selection": "all", "suspended_at": None,
                "html_url": "https://github.com/organizations/%s/settings/installations/%d"
                            % (INSTALLATION_ACCOUNT, INSTALLATION_ID)})
        if url.path == "/installation/repositories":
            if auth != "Bearer " + INSTALLATION_TOKEN:
                return self.json(401, {"message": "Bad credentials"})
            repositories = []
            for name in acme_repositories():
                path = repo_dir(INSTALLATION_ACCOUNT, name)
                repositories.append({
                    "name": name, "owner": {"login": INSTALLATION_ACCOUNT}, "private": is_private(path),
                    "default_branch": "main", "html_url": "%s/%s/%s" % (host, INSTALLATION_ACCOUNT, name),
                    "description": None, "pushed_at": "2026-10-01T12:00:00Z"})
            return self.json(200, {"total_count": len(repositories), "repositories": repositories})
        if len(parts) >= 4 and parts[0] == "codeload":
            path = repo_dir(parts[1], parts[2])
            if not path:
                return self.send(404, b'{"message":"Not Found"}')
            buf = io.BytesIO()
            root = "%s-%s-%s/" % (parts[1], parts[2], sha_of(path)[:7])
            with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
                for rel, content in files_of(path):
                    z.writestr(root + rel, content)
            return self.send(200, buf.getvalue(), "application/zip")
        if len(parts) < 3 or parts[0] != "repos":
            return self.send(404, b'{"message":"Not Found"}')
        owner, name = parts[1], parts[2]
        path = repo_dir(owner, name)
        if not path or (is_private(path) and auth != "Bearer " + INSTALLATION_TOKEN):
            bad = auth is not None and not auth.startswith("Bearer ghs_")
            return self.json(401 if bad else 404, {"message": "Bad credentials" if bad else "Not Found"})
        if len(parts) == 3:
            return self.json(200, {"name": name, "owner": {"login": owner}, "default_branch": "main",
                                   "private": is_private(path), "html_url": "%s/%s/%s" % (host, owner, name)})
        if parts[3] == "commits":
            if "/".join(parts[4:]) not in ("main",) and len(parts[4]) < 7:
                return self.send(422, b'{"message":"No commit found"}')
            return self.send(200, sha_of(path).encode(), "text/plain")
        if parts[3] == "zipball":
            return self.send(302, b"", headers={"Location": "%s/codeload/%s/%s/%s.zip" % (host, owner, name, parts[4])})
        return self.send(404, b'{"message":"Not Found"}')


if __name__ == "__main__":
    print("fake-github serving %s on http://127.0.0.1:%d" % (ROOT, PORT), flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
