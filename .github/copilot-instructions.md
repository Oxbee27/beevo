# Beevo Git Workflow

- After completing a requested coding task and running its relevant checks, create one focused local Git commit for the changes made for that task. Do this automatically unless the user asks not to commit.
- Do not commit incomplete work, failed changes, or unrelated cleanup. If relevant checks cannot be run, explain why before deciding whether a commit is appropriate.
- Before staging, inspect `git status` and the diff. Stage only files changed for the current task; never use `git add -A` or include existing user changes.
- If a file needed for the task already contains unstaged user changes, preserve them. Do not stage or commit that file unless the task changes can be cleanly separated; otherwise ask the user before committing.
- Use a concise Conventional Commit message that describes the task, such as `fix: handle retry after unknown delivery`.
- Create commits locally only. Never push to `origin` unless the user explicitly asks to push.
- If the user explicitly asks to skip or amend a commit, follow that request.