# How to Use the Scorecard Feature

The scorecard feature evaluates services based on multiple pillars (Telemetry, Reliability, Ownership, Documentation) and calculates a readiness score.

## Quick Start

1. **Navigate to the Services Page**
   - Go to `/services` in your browser
   - Click on the **"Directory & Readiness"** tab (the last tab)

2. **View Your Services**
   - You'll see a table with all your services
   - Each service shows:
     - **Readiness Badge**: Gold/Silver/Bronze/Fail status
     - **Score**: Percentage score (0-100%) - appears after checks run
     - **Tier**: Critical/High/Medium/Low
     - **Last Seen**: When the service was last detected
     - **Owner**: Assigned owner

3. **Configure Scorecard Settings**
   - Click the **"Scorecard Settings"** button in the top right
   - Customize the pillars and their weights (defaults sum to 100%)
   - Default pillars:
     - Telemetry: 35%
     - Reliability: 35%
     - Ownership: 15%
     - Documentation: 15%

4. **View Readiness Details**
   - Click on the readiness badge/score for any service
   - See detailed breakdown of which checks passed/failed
   - View evidence for each check

## How Scores Are Calculated

The system runs readiness checks that evaluate:

- **Telemetry** (35% weight):
  - Has logs in the last 24 hours
  - Has traces in the last 24 hours

- **Reliability** (35% weight):
  - Has at least one SLO defined

- **Ownership** (15% weight):
  - Has an owner assigned

- **Documentation** (15% weight):
  - Has a runbook URL
  - Has a repository URL

## Running Readiness Checks Manually

If scores aren't appearing, you may need to trigger the readiness checks task:

### Option 1: Wait for Automatic Execution
- The task runs automatically every minute if `RUN_SCHEDULED_TASKS_EXTERNALLY=false`
- Check your API logs to see if the task is running

### Option 2: Run Manually via Script
```bash
cd packages/api
yarn dev-task run-readiness-checks
```

Or if using the built version:
```bash
cd packages/api
node build/tasks/index.js run-readiness-checks
```

## Troubleshooting

### No scores showing?
1. Make sure you're on the "Directory & Readiness" tab
2. Check if the readiness checks task has run (check API logs)
3. Manually trigger the task using the commands above
4. Refresh the page after the task completes

### Scores are 0%?
- This means no checks are passing
- Click on a service's readiness badge to see which checks are failing
- Add missing metadata (owner, runbook URL, repo URL) via the settings icon
- Ensure your services are sending logs/traces to ClickHouse
- Create SLOs for your services

### Task not running?
- Check if `RUN_SCHEDULED_TASKS_EXTERNALLY` is set to `true` in your environment
- If true, you need to run tasks externally (e.g., via a cron job or scheduler)
- If false, tasks should run automatically every minute

## Next Steps

1. **Add Service Metadata**: Click the settings icon next to each service to add:
   - Owner
   - Tier (Critical/High/Medium/Low)
   - Runbook URL
   - Repository URL

2. **Create SLOs**: Define SLOs for your services to improve reliability scores

3. **Customize Scorecard**: Adjust pillar weights in Scorecard Settings to match your priorities

