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
- Repeat until ALL tests pass"

    Write-Host "Re-running tests after Claude..."

    npx playwright test
    $newExitCode = $LASTEXITCODE

    if ($newExitCode -eq 0) {
        Write-Host "All tests passed after fixes. Committing..."

        git add .
        git commit -m "Auto-fix: Claude resolved failing tests"
        git push
    } else {
        Write-Host "Tests still failing. No commit made."
    }

} else {
    Write-Host "All tests passed."
}