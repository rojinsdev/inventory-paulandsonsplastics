Daily Developer Workflow
Standard Day (Work on develop)
Work: Write code, fix bugs, or add features.
Save: git add .
Commit: git commit -m "Explain your work"
Backup: git push origin develop
Result: Your code is safe on GitHub, but the live site (main) is unchanged.
Launch Day (Move to main)
Only do this when a feature is 100% finished and tested:

Switch: git checkout main
Pull: git pull origin main (Ensure you have the latest)
Merge: git merge develop
Launch: git push origin main
Result: The CI/CD pipeline starts, and the live site updates.
Go Back: git checkout develop