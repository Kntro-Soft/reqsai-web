#!/usr/bin/env python3
"""A minimal GitHub REST API for local end-to-end tests of the code-aware copilot.

Serves every folder under repos/<owner>/<name> as a public repository on branch "main":
  GET /repos/{owner}/{name}                 metadata (default_branch, html_url, private)
  GET /repos/{owner}/{name}/commits/{ref}   the head sha (Accept: application/vnd.github.sha)
  GET /repos/{owner}/{name}/zipball/{ref}   302 to /codeload/... like GitHub
  GET /codeload/{owner}/{name}/{ref}.zip    the zipball, built from the folder on each request
Run: python3 fake_github.py [port]  (default 4545). Point the API at it with CODEBASE_GITHUB_API_URL.
"""
import hashlib
import io
import json
import os
import sys
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "repos")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4545


def repo_dir(owner, name):
    path = os.path.join(ROOT, owner.lower(), name.lower())
    return path if os.path.isdir(path) else None


def files_of(path):
    for base, _, names in os.walk(path):
        for n in sorted(names):
            full = os.path.join(base, n)
            yield os.path.relpath(full, path).replace(os.sep, "/"), full


def sha_of(path):
    digest = hashlib.sha1()
    for rel, full in sorted(files_of(path)):
        digest.update(rel.encode())
        with open(full, "rb") as f:
            digest.update(f.read())
    return digest.hexdigest()


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

    def do_GET(self):
        parts = self.path.split("?")[0].strip("/").split("/")
        host = "http://127.0.0.1:%d" % PORT
        if len(parts) >= 4 and parts[0] == "codeload":
            path = repo_dir(parts[1], parts[2])
            if not path:
                return self.send(404, b'{"message":"Not Found"}')
            buf = io.BytesIO()
            root = "%s-%s-%s/" % (parts[1], parts[2], sha_of(path)[:7])
            with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
                for rel, full in files_of(path):
                    z.write(full, root + rel)
            return self.send(200, buf.getvalue(), "application/zip")
        if len(parts) < 3 or parts[0] != "repos":
            return self.send(404, b'{"message":"Not Found"}')
        owner, name = parts[1], parts[2]
        path = repo_dir(owner, name)
        if not path:
            return self.send(404, b'{"message":"Not Found"}')
        if len(parts) == 3:
            body = {"name": name, "owner": {"login": owner}, "default_branch": "main", "private": False,
                    "html_url": "%s/%s/%s" % (host, owner, name)}
            return self.send(200, json.dumps(body).encode())
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
