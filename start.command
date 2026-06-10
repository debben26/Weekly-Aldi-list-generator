#!/bin/bash
# Double-click this in Finder to start the Meal Planner.
cd "$(dirname "$0")"
echo "Checking for updates..."
git pull                # pull David's latest changes
npm install             # install any new dependencies the update added
npx prisma generate     # rebuild the database client in case the schema changed
echo "Starting the Meal Planner..."
npm run dev &
sleep 4
open http://localhost:3000
echo "Meal Planner is running. Closing this window (or running stop.command) stops it."
wait
