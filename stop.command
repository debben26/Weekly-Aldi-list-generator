#!/bin/bash
# Double-click this in Finder to stop the Meal Planner.
PID=$(lsof -ti tcp:3000)
if [ -n "$PID" ]; then
  kill $PID
  echo "Meal Planner stopped."
else
  echo "Meal Planner wasn't running."
fi
sleep 1
