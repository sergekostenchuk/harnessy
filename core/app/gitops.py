"""Git-операции линии: worktree на место, проверка коммитов, слияние принятой вехи.
Всё через subprocess git; ошибки возвращаются словами, не трассировками."""
from __future__ import annotations

import re
import os
import subprocess
from pathlib import Path

SHA_RE = re.compile(r"^[0-9a-f]{7,40}$")


def run(args: list[str], cwd: str | Path, timeout: int = 60) -> tuple[int, str, str]:
    try:
        r = subprocess.run(["git", *args], cwd=str(cwd), capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout.strip(), r.stderr.strip()
    except (OSError, subprocess.TimeoutExpired) as e:
        return 1, "", str(e)


def is_repo(path: str | Path) -> bool:
    code, out, _ = run(["rev-parse", "--is-inside-work-tree"], path)
    return code == 0 and out == "true"


def own_repo(path: str | Path) -> bool:
    """Своя рабочая копия: корень репозитория — сама папка. Папка внутри чужого репозитория — не свой git
    (урок 08.10.2026: проект, созданный внутри ~/Harnessy, принял репозиторий харнесса за свой)."""
    root = repo_root(path)
    return bool(root) and os.path.realpath(root) == os.path.realpath(str(path))


def repo_root(path: str | Path) -> str | None:
    code, out, _ = run(["rev-parse", "--show-toplevel"], path)
    return out if code == 0 else None


def head(path: str | Path) -> str | None:
    code, out, _ = run(["rev-parse", "HEAD"], path)
    return out if code == 0 else None


def current_branch(path: str | Path) -> str | None:
    code, out, _ = run(["rev-parse", "--abbrev-ref", "HEAD"], path)
    return out if code == 0 else None


def branch_exists(root: str | Path, branch: str) -> bool:
    code, _, _ = run(["show-ref", "--verify", "--quiet", f"refs/heads/{branch}"], root)
    return code == 0


def commit_exists(root: str | Path, sha: str) -> bool:
    if not SHA_RE.match(sha or ""):
        return False
    code, _, _ = run(["cat-file", "-e", f"{sha}^{{commit}}"], root)
    return code == 0


def resolve_sha(root: str | Path, sha: str) -> str | None:
    code, out, _ = run(["rev-parse", "--verify", f"{sha}^{{commit}}"], root)
    return out if code == 0 else None


def ensure_exclude(root: str | Path, pattern: str) -> None:
    """Локальное исключение (.git/info/exclude), чтобы папки worktree не мозолили git status."""
    code, gitdir, _ = run(["rev-parse", "--git-common-dir"], root)
    if code != 0:
        return
    p = Path(root) / gitdir / "info" / "exclude" if not Path(gitdir).is_absolute() else Path(gitdir) / "info" / "exclude"
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        text = p.read_text("utf-8") if p.exists() else ""
        if pattern not in text.splitlines():
            p.write_text(text + ("" if text.endswith("\n") or not text else "\n") + pattern + "\n", "utf-8")
    except OSError:
        pass


def ensure_worktree(root: str | Path, seat: str, rel_path: str, base_branch: str) -> tuple[str | None, str | None]:
    """Worktree места на ветке seat/<seat>. -> (абсолютный путь | None, замечание | None)."""
    root = Path(root)
    path = (root / rel_path).resolve()
    branch = f"seat/{seat}"
    run(["worktree", "prune"], root)
    if path.exists():
        code, out, _ = run(["rev-parse", "--is-inside-work-tree"], path)
        if code == 0 and out == "true" and repo_root(path) == str(path):
            return str(path), None
        return None, f"{rel_path} существует, но это не worktree этого репозитория"
    if not branch_exists(root, base_branch):
        return None, f"нет ветки {base_branch}: сделай первый коммит, потом worktree появятся"
    path.parent.mkdir(parents=True, exist_ok=True)
    if branch_exists(root, branch):
        code, _, err = run(["worktree", "add", str(path), branch], root)
    else:
        code, _, err = run(["worktree", "add", "-b", branch, str(path), base_branch], root)
    if code != 0:
        return None, f"worktree {rel_path} не создан: {err.splitlines()[-1] if err else 'ошибка git'}"
    ensure_exclude(root, rel_path.split("/")[0] + "/" if "/" in rel_path else rel_path)
    return str(path), None


def merge_commit_for(root: str | Path, sha: str, branch: str) -> str | None:
    """Первый коммит слияния на пути от sha к вершине ветки — им веха попала в интеграцию; None, если её там нет."""
    code, out, _ = run(["merge-base", "--is-ancestor", sha, branch], root)
    if code != 0:
        return None
    code, out, _ = run(["rev-list", "--merges", "--ancestry-path", "--reverse", f"{sha}..{branch}"], root)
    first = out.split()[0] if code == 0 and out.split() else None
    return first or sha


def merge_into(root: str | Path, sha: str, integration_branch: str, message: str) -> dict:
    """Слить принятый коммит в интеграционную ветку в корне проекта. Только чистое дерево, только на нужной ветке."""
    br = current_branch(root)
    if br != integration_branch:
        return {"ok": False, "error": f"корень проекта на ветке {br}, а не {integration_branch}; переключи ветку и повтори"}
    code, out, _ = run(["status", "--porcelain", "--untracked-files=no"], root)
    if code != 0:
        return {"ok": False, "error": "git status не отвечает"}
    if out:
        return {"ok": False, "error": "в корне проекта есть незакоммиченные правки; сначала закоммить или убери их"}
    full = resolve_sha(root, sha)
    if not full:
        return {"ok": False, "error": f"коммита {sha} нет в репозитории"}
    code, _, err = run(["merge", "--no-ff", "--no-edit", "-m", message, full], root)
    if code != 0:
        run(["merge", "--abort"], root)
        return {"ok": False, "error": f"слияние не прошло, откачено: {err.splitlines()[-1] if err else 'конфликт'}"}
    return {"ok": True, "mergeSha": head(root), "sha": full}
