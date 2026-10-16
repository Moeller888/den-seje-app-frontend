Write-Host "Running Playwright tests..."

npx playwright test
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
    Write-Host "Tests failed. Running Claude auto-fix loop..."

    claude "Your task:
- Run Playwright tests
- Fix ALL failing tests by fixing root causes in the codebase
- NEVER modify tests unless absolutely necessary
- Do NOT use workarounds
- Re-run tests after each fix
- Repeat until ALL tests pass
- Do NOT stage, commit, push or open a PR - leave all changes in the working tree"

    Write-Host "Re-running tests after Claude..."

    npx playwright test
    $newExitCode = $LASTEXITCODE

    # This script never stages, commits, pushes or opens a PR (guarded by
    # tests/unit/fix-tests-no-git-mutation.test.mjs). Any fixes stay in the working tree; the Git
    # lifecycle is handled separately by Claude Code under the .claude/settings.json permission model.
    if ($newExitCode -eq 0) {
        Write-Host "All tests passed after fixes. Changes are left in the working tree - review, commit and push them separately."
    } else {
        Write-Host "Tests still failing. Any changes are left in the working tree for review."
    }

} else {
    Write-Host "All tests passed."
}